import http from "node:http";
import { SiteCatalog, SynthesizedEndpoint } from "./types.js";

function matchPathPattern(pattern: string, actualPathname: string): boolean {
  const patternSegs = pattern.split("/").filter(Boolean);
  const actualSegs = actualPathname.split("/").filter(Boolean);
  if (patternSegs.length !== actualSegs.length) return false;

  for (let i = 0; i < patternSegs.length; i++) {
    const p = patternSegs[i];
    if (p.startsWith("{") && p.endsWith("}")) continue;
    if (p !== actualSegs[i]) return false;
  }
  return true;
}

export function startMockServer(catalog: SiteCatalog, port = 4010): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const method = (req.method || "GET").toUpperCase();
      const parsedUrl = new URL(req.url || "/", `http://localhost:${port}`);

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token");

      if (method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      let matched: SynthesizedEndpoint | undefined;
      for (const ep of catalog.endpoints) {
        if (ep.method === method && matchPathPattern(ep.pathPattern, parsedUrl.pathname)) {
          matched = ep;
          break;
        }
      }

      if (!matched) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Mock endpoint not found in catalog",
            method,
            path: parsedUrl.pathname,
            availableEndpoints: catalog.endpoints.map((e) => `${e.method} ${e.pathPattern}`)
          })
        );
        return;
      }

      res.statusCode = matched.sampleStatus || 200;
      res.setHeader("Content-Type", "application/json");
      const payload =
        matched.sampleResponseBody !== undefined
          ? matched.sampleResponseBody
          : { ok: true, mockedBy: "unapi-mcp", endpoint: matched.toolName };

      res.end(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
    });

    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    });
  });
}
