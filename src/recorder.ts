import WebSocket from "ws";
import fs from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { CapturedExchange } from "./types.js";

interface CDPTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

const IGNORED_EXTENSIONS = [
  ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".mp3", ".map"
];

const NOISE_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "facebook.net",
  "hotjar.com",
  "sentry.io",
  "segment.io",
  "mixpanel.com",
  "intercom.io",
  "clarity.ms",
  "datadoghq.com",
  "newrelic.com"
];

export function isNoiseRequest(urlStr: string, mimeType = "", resourceType = ""): boolean {
  try {
    const parsed = new URL(urlStr);
    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    if (NOISE_DOMAINS.some((d) => parsed.hostname.includes(d))) return true;
    const lowerPath = parsed.pathname.toLowerCase();
    if (IGNORED_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) return true;
    if (resourceType && !["XHR", "Fetch", "Document"].includes(resourceType)) {
      if (!mimeType.includes("json") && !mimeType.includes("graphql")) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

export function launchChromeWithDebugging(targetUrl: string, port = 9222): void {
  const platform = os.platform();
  let candidates: string[] = [];

  if (platform === "darwin") {
    candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    ];
  } else if (platform === "win32") {
    candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ];
  } else {
    candidates = [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/brave-browser"
    ];
  }

  const binary = candidates.find((c) => fs.existsSync(c));
  if (!binary) {
    throw new Error(
      `Could not auto-detect Chrome binary. Please start Chrome manually with: chrome --remote-debugging-port=${port}`
    );
  }

  const profileDir = path.join(os.tmpdir(), `unapi-mcp-chrome-${port}`);
  const child = spawn(
    binary,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      targetUrl
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
}

async function getActivePageTarget(host: string, port: number, urlFilter?: string): Promise<CDPTarget> {
  const res = await fetch(`http://${host}:${port}/json`);
  if (!res.ok) {
    throw new Error(`Failed to query CDP at http://${host}:${port}/json (status ${res.status})`);
  }
  const targets = (await res.json()) as CDPTarget[];
  const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (pages.length === 0) {
    throw new Error("No debuggable page targets found in Chrome.");
  }
  if (urlFilter) {
    const matched = pages.find((p) => p.url.includes(urlFilter));
    if (matched) return matched;
  }
  return pages[0];
}

export async function recordFromCDP(options: {
  host?: string;
  port?: number;
  durationSec?: number;
  urlFilter?: string;
  onCapture?: (exchange: CapturedExchange) => void;
}): Promise<CapturedExchange[]> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 9222;
  const durationSec = options.durationSec ?? 30;

  const target = await getActivePageTarget(host, port, options.urlFilter);
  const wsUrl = target.webSocketDebuggerUrl!;

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pendingRpc = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  const sendCommand = (method: string, params: Record<string, unknown> = {}): Promise<any> => {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pendingRpc.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const partialRequests = new Map<
    string,
    {
      method: string;
      url: string;
      requestHeaders: Record<string, string>;
      requestBody?: string;
      resourceType?: string;
      timestamp: number;
    }
  >();

  const partialResponses = new Map<
    string,
    {
      status: number;
      responseHeaders: Record<string, string>;
      mimeType: string;
    }
  >();

  const exchanges: CapturedExchange[] = [];

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pendingRpc.has(msg.id)) {
        const handler = pendingRpc.get(msg.id)!;
        pendingRpc.delete(msg.id);
        if (msg.error) handler.reject(new Error(msg.error.message));
        else handler.resolve(msg.result);
        return;
      }

      if (msg.method === "Network.requestWillBeSent") {
        const { requestId, request, type } = msg.params;
        if (isNoiseRequest(request.url, "", type)) return;

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(request.headers || {})) {
          headers[k.toLowerCase()] = String(v);
        }

        partialRequests.set(requestId, {
          method: request.method,
          url: request.url,
          requestHeaders: headers,
          requestBody: request.postData,
          resourceType: type,
          timestamp: Date.now()
        });
      } else if (msg.method === "Network.responseReceived") {
        const { requestId, response, type } = msg.params;
        if (!partialRequests.has(requestId)) return;
        const mimeType = response.mimeType || "";
        if (isNoiseRequest(response.url, mimeType, type)) {
          partialRequests.delete(requestId);
          return;
        }

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(response.headers || {})) {
          headers[k.toLowerCase()] = String(v);
        }

        partialResponses.set(requestId, {
          status: response.status,
          responseHeaders: headers,
          mimeType
        });
      } else if (msg.method === "Network.loadingFinished") {
        const { requestId } = msg.params;
        const req = partialRequests.get(requestId);
        const res = partialResponses.get(requestId);
        if (!req || !res) return;

        let responseBody: string | undefined;
        try {
          const bodyResult = await sendCommand("Network.getResponseBody", { requestId });
          if (bodyResult && bodyResult.body) {
            responseBody = bodyResult.base64Encoded
              ? Buffer.from(bodyResult.body, "base64").toString("utf8")
              : bodyResult.body;
          }
        } catch {
          // Body may be unavailable for redirects or empty responses
        }

        const looksLikeApi =
          res.mimeType.includes("json") ||
          req.url.includes("/api/") ||
          req.url.includes("/graphql") ||
          req.resourceType === "XHR" ||
          req.resourceType === "Fetch";

        if (looksLikeApi) {
          const exchange: CapturedExchange = {
            id: requestId,
            timestamp: req.timestamp,
            method: req.method,
            url: req.url,
            requestHeaders: req.requestHeaders,
            requestBody: req.requestBody,
            status: res.status,
            responseHeaders: res.responseHeaders,
            responseBody,
            mimeType: res.mimeType,
            resourceType: req.resourceType
          };
          exchanges.push(exchange);
          options.onCapture?.(exchange);
        }

        partialRequests.delete(requestId);
        partialResponses.delete(requestId);
      }
    } catch {
      // Ignore malformed CDP events
    }
  });

  await sendCommand("Network.enable", { maxPostDataSize: 65536 });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), durationSec * 1000);
    process.once("SIGINT", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  ws.close();
  return exchanges;
}

export function importFromHarFile(harFilePath: string): CapturedExchange[] {
  const raw = fs.readFileSync(harFilePath, "utf8");
  const har = JSON.parse(raw);
  const entries = har?.log?.entries ?? [];
  const exchanges: CapturedExchange[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const req = entry.request;
    const res = entry.response;
    if (!req || !res) continue;

    const mimeType = res.content?.mimeType || "";
    const resourceType = entry._resourceType || "";
    if (isNoiseRequest(req.url, mimeType, resourceType)) continue;

    const looksLikeApi =
      mimeType.includes("json") ||
      req.url.includes("/api/") ||
      req.url.includes("/graphql") ||
      resourceType === "xhr" ||
      resourceType === "fetch";

    if (!looksLikeApi) continue;

    const reqHeaders: Record<string, string> = {};
    for (const h of req.headers || []) {
      reqHeaders[String(h.name).toLowerCase()] = String(h.value);
    }

    const resHeaders: Record<string, string> = {};
    for (const h of res.headers || []) {
      resHeaders[String(h.name).toLowerCase()] = String(h.value);
    }

    exchanges.push({
      id: `har-${i + 1}`,
      timestamp: entry.startedDateTime ? new Date(entry.startedDateTime).getTime() : Date.now(),
      method: req.method,
      url: req.url,
      requestHeaders: reqHeaders,
      requestBody: req.postData?.text,
      status: res.status,
      responseHeaders: resHeaders,
      responseBody: res.content?.text,
      mimeType,
      resourceType
    });
  }

  return exchanges;
}
