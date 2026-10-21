#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  importFromHarFile,
  launchChromeWithDebugging,
  recordFromCDP
} from "./recorder.js";
import {
  generateOpenApiSpec,
  generatePythonSdk,
  generateTypeScriptSdk,
  synthesizeCatalog
} from "./synthesizer.js";
import { getCatalogDir, loadAllCatalogs, startMcpServer } from "./mcp-server.js";
import { startMockServer } from "./mock-server.js";
import { CapturedExchange, SiteCatalog } from "./types.js";

const program = new Command();

program
  .name("unapi-mcp")
  .description(
    "Unwrap any website's hidden Shadow APIs into a typed SDK, OpenAPI 3.1 spec, Auth Dependency Chain, Security Audit, and Mock/MCP server."
  )
  .version("0.3.0");

program
  .command("capture [url]")
  .description("Capture live XHR/Fetch/GraphQL traffic from Chrome via DevTools Protocol")
  .option("-p, --port <number>", "Chrome remote debugging port", "9222")
  .option("-d, --duration <seconds>", "Recording duration in seconds", "30")
  .option("-n, --name <siteName>", "Custom name for the captured catalog")
  .option("--launch", "Automatically launch Chrome with --remote-debugging-port enabled")
  .action(async (url: string | undefined, opts) => {
    const port = Number(opts.port);
    const durationSec = Number(opts.duration);

    if (opts.launch) {
      console.log(`[*] Launching Chrome with remote debugging on port ${port}...`);
      launchChromeWithDebugging(url || "https://news.ycombinator.com", port);
      await new Promise((r) => setTimeout(r, 2500));
    }

    console.log(
      `[*] Listening to Chrome on 127.0.0.1:${port} for ${durationSec}s (press Ctrl+C to stop early)...`
    );

    const exchanges = await recordFromCDP({
      port,
      durationSec,
      urlFilter: url ? new URL(url).hostname : undefined,
      onCapture: (ex) => {
        console.log(`  [+] ${ex.method.padEnd(6)} ${ex.status} ${ex.url.slice(0, 90)}`);
      }
    });

    if (exchanges.length === 0) {
      console.log("[!] No API calls captured. Interact with the page or pass --launch <url>.");
      return;
    }

    saveAndSummarize(exchanges, opts.name);
  });

program
  .command("import-har <harFile>")
  .description("Synthesize an API catalog, SDK, Auth Chain, and MCP tools from an exported .har file")
  .option("-n, --name <siteName>", "Custom name for the captured catalog")
  .action((harFile: string, opts) => {
    const resolved = path.resolve(harFile);
    if (!fs.existsSync(resolved)) {
      console.error(`[!] HAR file not found: ${resolved}`);
      process.exit(1);
    }
    const exchanges = importFromHarFile(resolved);
    if (exchanges.length === 0) {
      console.error("[!] No JSON/API exchanges found in the provided HAR file.");
      process.exit(1);
    }
    saveAndSummarize(exchanges, opts.name);
  });

program
  .command("demo")
  .description("Run a self-contained demo capture showcasing Auth Chain Tracing, Security Audit, Mock Server & SDKs")
  .action(() => {
    console.log("[*] Running UnAPI-MCP synthesis on sample multi-step flight portal traffic...");
    const sampleToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.unapi_live_session_99481";
    const sampleCsrf = "csrf_unapi_token_8841209481";

    const sampleExchanges: CapturedExchange[] = [
      {
        id: "demo-auth",
        timestamp: Date.now() - 3000,
        method: "POST",
        url: "https://api.acme-flights.example/api/v1/auth/session",
        requestHeaders: {
          accept: "application/json",
          "content-type": "application/json"
        },
        requestBody: JSON.stringify({ clientKey: "web-portal-v4" }),
        status: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: JSON.stringify({
          sessionToken: sampleToken,
          csrfToken: sampleCsrf,
          userEmail: "traveler@example.com"
        }),
        mimeType: "application/json",
        resourceType: "Fetch"
      },
      {
        id: "demo-search",
        timestamp: Date.now() - 2000,
        method: "GET",
        url: "https://api.acme-flights.example/api/v1/flights/search?origin=DEL&destination=SFO&date=2026-11-15",
        requestHeaders: {
          accept: "application/json",
          authorization: `Bearer ${sampleToken}`
        },
        status: 200,
        responseHeaders: {
          "content-type": "application/json",
          "access-control-allow-origin": "*"
        },
        responseBody: JSON.stringify({
          flights: [
            { id: "FL-902", carrier: "Air India", priceUsd: 742, durationMinutes: 930 },
            { id: "FL-104", carrier: "United", priceUsd: 815, durationMinutes: 955 }
          ]
        }),
        mimeType: "application/json",
        resourceType: "Fetch"
      },
      {
        id: "demo-seats",
        timestamp: Date.now() - 1000,
        method: "GET",
        url: "https://api.acme-flights.example/api/v1/flights/98412/seats",
        requestHeaders: {
          accept: "application/json",
          authorization: `Bearer ${sampleToken}`
        },
        status: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: JSON.stringify({
          flightId: 98412,
          availableSeats: ["12A", "14C", "21F"]
        }),
        mimeType: "application/json",
        resourceType: "Fetch"
      },
      {
        id: "demo-gql",
        timestamp: Date.now(),
        method: "POST",
        url: "https://api.acme-flights.example/graphql",
        requestHeaders: {
          accept: "application/json",
          "content-type": "application/json",
          "x-csrf-token": sampleCsrf
        },
        requestBody: JSON.stringify({
          operationName: "CreatePriceAlert",
          query: "mutation CreatePriceAlert($route: String!, $maxUsd: Int!) { createAlert(route: $route, maxUsd: $maxUsd) { id active } }",
          variables: { route: "DEL-SFO", maxUsd: 700 }
        }),
        status: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: JSON.stringify({
          data: { createAlert: { id: "alert_77", active: true } }
        }),
        mimeType: "application/json",
        resourceType: "Fetch"
      }
    ];

    saveAndSummarize(sampleExchanges, "acme-flights");
  });

program
  .command("audit <siteName>")
  .description("Run a Shadow API Security & Auth Dependency Chain audit on a captured site")
  .action((siteName: string) => {
    const catalog = loadCatalogByName(siteName);
    console.log(`\n=== 🔒 UnAPI-MCP Security & Auth Chain Report: ${catalog.siteName} ===`);

    console.log(`\n[1] Auth & Token Dependency Graph (${catalog.tokenChain.length} links traced):`);
    if (catalog.tokenChain.length === 0) {
      console.log("  No multi-step dynamic token handoffs detected.");
    } else {
      for (const link of catalog.tokenChain) {
        console.log(
          `  🔗 ${link.sourceToolName} (${link.sourceJsonPath}) ──[feeds ${link.tokenPreview}]──> ${link.targetToolName} (${link.targetLocation})`
        );
      }
    }

    console.log(`\n[2] Shadow API Security & PII Findings (${catalog.securityFindings.length} issues):`);
    if (catalog.securityFindings.length === 0) {
      console.log("  ✓ No obvious PII leaks or unauthenticated mutations detected.");
    } else {
      for (const f of catalog.securityFindings) {
        console.log(`  [${f.severity}] ${f.category} on '${f.toolName}': ${f.detail}`);
      }
    }
  });

program
  .command("mock <siteName>")
  .description("Spin up an instant zero-config localhost Mock Server replaying captured API schemas & payloads")
  .option("-p, --port <number>", "Local port to listen on", "4010")
  .action(async (siteName: string, opts) => {
    const catalog = loadCatalogByName(siteName);
    const port = Number(opts.port);
    await startMockServer(catalog, port);
    console.log(`\n[⚡] UnAPI-MCP Local Mock Server running at http://127.0.0.1:${port}`);
    console.log(`[*] Replaying ${catalog.endpoints.length} endpoints for '${catalog.siteName}':`);
    for (const ep of catalog.endpoints) {
      console.log(`  • curl -X ${ep.method} http://127.0.0.1:${port}${ep.pathPattern.replace(/\{[^}]+\}/g, "123")}`);
    }
    console.log(`\nPress Ctrl+C to stop the mock server.`);
  });

program
  .command("list")
  .description("List all reverse-engineered sites and MCP tools in ~/.unapi-mcp/catalogs")
  .action(() => {
    const catalogs = loadAllCatalogs();
    if (catalogs.length === 0) {
      console.log("No catalogs found. Run `unapi-mcp demo` or `unapi-mcp capture --launch <url>`.");
      return;
    }
    for (const c of catalogs) {
      console.log(
        `\n=== ${c.siteName} (${c.origin}) — ${c.endpoints.length} endpoints | ${c.tokenChain?.length || 0} auth links | ${c.securityFindings?.length || 0} security alerts ===`
      );
      for (const ep of c.endpoints) {
        console.log(`  • [MCP: ${c.siteName}_${ep.toolName}] ${ep.method.padEnd(6)} ${ep.pathPattern}`);
      }
    }
  });

program
  .command("export <siteName>")
  .description("Export a captured site catalog to OpenAPI 3.1 JSON, TypeScript SDK, or Python SDK")
  .option("-f, --format <fmt>", "Output format: openapi | ts | python", "openapi")
  .option("-o, --out <file>", "Output file path")
  .action((siteName: string, opts) => {
    const catalog = loadCatalogByName(siteName);
    let output = "";
    if (opts.format === "openapi") {
      output = JSON.stringify(generateOpenApiSpec(catalog), null, 2);
    } else if (opts.format === "ts") {
      output = generateTypeScriptSdk(catalog);
    } else if (opts.format === "python") {
      output = generatePythonSdk(catalog);
    } else {
      console.error(`[!] Unknown format '${opts.format}'. Choose openapi, ts, or python.`);
      process.exit(1);
    }

    if (opts.out) {
      fs.writeFileSync(path.resolve(opts.out), output, "utf8");
      console.log(`[+] Exported ${opts.format} to ${path.resolve(opts.out)}`);
    } else {
      console.log(output);
    }
  });

program
  .command("setup")
  .description("Auto-register the UnAPI-MCP server in Claude Code, Cursor, or Claude Desktop")
  .option("-c, --client <client>", "Target client: claude | cursor", "claude")
  .action((opts) => {
    const home = os.homedir();
    const configPath =
      opts.client === "cursor"
        ? path.join(home, ".cursor", "mcp.json")
        : path.join(home, ".claude.json");

    let existing: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch {
        existing = {};
      }
    }

    if (!existing.mcpServers) existing.mcpServers = {};
    existing.mcpServers["unapi-mcp"] = {
      command: "npx",
      args: ["-y", "unapi-mcp", "mcp"]
    };

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf8");
    console.log(`[+] Registered 'unapi-mcp' MCP server in ${configPath}`);
  });

program
  .command("doctor")
  .description("Check Node version, Chrome debugging status, and saved API catalogs")
  .option("-p, --port <number>", "Chrome remote debugging port", "9222")
  .action(async (opts) => {
    console.log("=== UnAPI-MCP Doctor ===");
    console.log(`[✓] Node.js runtime: ${process.version}`);
    const catalogs = loadAllCatalogs();
    console.log(`[✓] Catalog directory: ${getCatalogDir()} (${catalogs.length} site catalogs loaded)`);
    try {
      const res = await fetch(`http://127.0.0.1:${opts.port}/json/version`);
      if (res.ok) {
        const info = (await res.json()) as { Browser?: string };
        console.log(`[✓] Chrome DevTools Protocol reachable on port ${opts.port} (${info.Browser || "Chrome"})`);
      } else {
        console.log(`[!] Chrome DevTools responded with HTTP ${res.status} on port ${opts.port}`);
      }
    } catch {
      console.log(
        `[i] Chrome not currently listening on port ${opts.port} (use \`unapi-mcp capture --launch <url>\` to auto-start)`
      );
    }
  });

program
  .command("mcp")
  .description("Start the Model Context Protocol (MCP) server over stdio")
  .option("-c, --catalog <path>", "Optional path to a specific catalog JSON file")
  .action(async (opts) => {
    await startMcpServer(opts.catalog);
  });

function loadCatalogByName(siteName: string): SiteCatalog {
  const catalogPath = path.join(getCatalogDir(), `${siteName}.json`);
  if (!fs.existsSync(catalogPath)) {
    console.error(`[!] Catalog '${siteName}' not found at ${catalogPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(catalogPath, "utf8")) as SiteCatalog;
}

function saveAndSummarize(exchanges: CapturedExchange[], customName?: string): void {
  const catalog = synthesizeCatalog(exchanges, customName);
  const outPath = path.join(getCatalogDir(), `${catalog.siteName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2), "utf8");

  console.log(`\n[+] Synthesized ${catalog.endpoints.length} clean endpoints for '${catalog.siteName}'`);
  console.log(`[+] Saved catalog to: ${outPath}\n`);
  for (const ep of catalog.endpoints) {
    console.log(
      `  • MCP Tool: ${catalog.siteName}_${ep.toolName.padEnd(28)} -> ${ep.method.padEnd(5)} ${ep.pathPattern}`
    );
  }

  if (catalog.tokenChain.length > 0) {
    console.log(`\n[🔗] Auto-Traced ${catalog.tokenChain.length} Dynamic Auth Token Handoff(s):`);
    for (const link of catalog.tokenChain) {
      console.log(
        `  • ${link.sourceToolName} (${link.sourceJsonPath}) ──> ${link.targetToolName} (${link.targetLocation})`
      );
    }
  }

  if (catalog.securityFindings.length > 0) {
    console.log(`\n[🔒] Detected ${catalog.securityFindings.length} Shadow API Security Alert(s):`);
    for (const f of catalog.securityFindings) {
      console.log(`  • [${f.severity}] ${f.category} on ${f.toolName}: ${f.detail}`);
    }
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Audit Auth & Security: npx unapi-mcp audit ${catalog.siteName}`);
  console.log(`  2. Launch Mock Server:    npx unapi-mcp mock ${catalog.siteName} --port 4010`);
  console.log(`  3. Export TypeScript SDK: npx unapi-mcp export ${catalog.siteName} --format ts`);
  console.log(`  4. Export Python SDK:     npx unapi-mcp export ${catalog.siteName} --format python`);
  console.log(`  5. Wire to Claude/Cursor: npx unapi-mcp setup --client claude`);
}

program.parseAsync(process.argv);
