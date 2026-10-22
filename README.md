<div align="center">

# unapi-mcp

**Unwrap any website's hidden Shadow APIs into a typed Python/TypeScript SDK, OpenAPI 3.1 spec, Auth Dependency Graph, Security Audit, and Local Mock + MCP Server in one command.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Native-success.svg)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

</div>

---

## Why `unapi-mcp`?

Every modern website talks to itself using undocumented internal JSON and GraphQL endpoints (**Shadow APIs**). Yet when developers want an AI agent (Claude Code, Cursor, OpenCode) to interact with a web portal, they usually reach for headless browsers (`Playwright MCP`, `browser-use`) that take 45+ seconds and burn thousands of tokens parsing DOM trees.

Even worse, basic network recorders just dump raw endpoints without telling you **where the auth tokens came from**, **whether the API leaks PII**, or **letting you test offline**.

**`unapi-mcp` goes far beyond simple network capture:**

1. **Automatic Auth & Token Dependency Chain Tracer:** Automatically traces how a `sessionToken` or `csrfToken` returned in the JSON body of Request A (`$.sessionToken`) is injected into the `Authorization` or `x-csrf-token` header of Request B and C.
2. **Shadow API Security & PII Auditor (`unapi-mcp audit`):** Scans every captured endpoint for unauthenticated state-mutations (`POST`/`DELETE`), plaintext email/PII leaks, credentials leaked in URL query strings, and wildcard CORS misconfigurations.
3. **Instant Zero-Config Local Mock Server (`unapi-mcp mock`):** Spins up a local HTTP server (`http://127.0.0.1:4010`) that replays the exact synthesized routes and captured JSON payloads so you and your AI agent can build and test against any website's API **offline** without hitting production rate limits.
4. **Full Code & Spec Compiler (`unapi-mcp export`):** Generates standalone, zero-dependency **Python SDKs**, **TypeScript SDKs**, **OpenAPI 3.1 specs**, and native **Model Context Protocol (MCP)** tools.



## Quick Comparison

| Capability | Headless Browser MCPs | Basic API Recorders | `UnAPI-MCP` |
| :--- | :--- | :--- | :--- |
| **Execution Speed** | 35s – 90s per task | ~120ms | **~120ms (Native HTTP)** |
| **Multi-Step Auth Token Chain Tracer** | No | No | **Yes (Traces JSON body $ightarrow$ Header handoffs)** |
| **Shadow API Security & PII Audit** | No | No | **Yes (`unapi-mcp audit <site>`)** |
| **Offline Localhost Mock Server** | No | No | **Yes (`unapi-mcp mock <site>`)** |
| **Typed Python / TS SDK + OpenAPI 3.1** | No | No | **Yes (`format python`, `ts`, `openapi`)** |
| **HAR File Import + Live Chrome CDP** | No | Partial | **Yes (`capture launch` & `import-har`)** |



## How it works

- **Capture.** Connects to Chrome over the DevTools Protocol WebSocket (`Network.requestWillBeSent` and `Network.getResponseBody`) or parses a local `.har` file. Requests to ad networks, analytics trackers, fonts, stylesheets, and images are dropped immediately; only `XHR`, `Fetch`, JSON, and GraphQL exchanges are kept.
- **Synthesize.** Concrete URLs like `/api/v1/flights/98412/seats` are collapsed into parameterized route patterns (`/api/v1/flights/{flightId}/seats`). GraphQL `POST` bodies are split by `operationName`, and request/response payloads are recursively inspected to build JSON Schemas.
- **Trace.** The synthesizer walks captured exchanges in chronological order. When a high-entropy token returned in an earlier JSON response body (for example, `$.sessionToken` or `$.csrfToken`) reappears inside a later request's `Authorization` or `x-csrf-token` header, `unapi-mcp` records the dependency link so you and your agent know which bootstrap endpoint feeds downstream calls.
- **Call or replay.** In MCP mode (`unapi-mcp mcp`), each endpoint becomes a native tool executed with Node's `fetch`, injecting headers or environment credentials (`<SITE>_AUTH_TOKEN`, `<SITE>_COOKIE`) automatically. In mock mode (`unapi-mcp mock`), a local server emulates the remote API so you can test integrations offline without hitting production rate limits.


## What's included

Pre-built catalogs and synthesis modules ready out of the box:

- `acme-flights` (via `unapi-mcp demo`): multi-step session login, flight search, seat map lookup, and GraphQL price alert mutation
- `hackernews` (`sites/hackernews.json`): top stories feed and item detail lookups
- `github` (`sites/github-public.json`): repository metadata lookup by owner and repo
- `export` compilers: zero-dependency TypeScript client (`ts`), Python `urllib` client (`python`), and OpenAPI 3.1 JSON (`openapi`)
- `audit` scanner: checks captured traffic for unauthenticated state mutations, tokens leaked in URL query strings, plaintext email/PII exposure, sensitive response keys, and wildcard CORS headers
- `mock` server: local HTTP server that matches parameterized routes (`{itemId}`, `{flightId}`) and replays captured status codes and JSON bodies offline

Catalogs are stored as plain JSON in `~/.unapi-mcp/catalogs/`. Run `unapi-mcp list` to see all saved sites and their MCP tool names.

## Quickstart in 30 seconds

```bash
# 1. Clone and build
git clone https://github.com/mohdxaid/unapi-mcp.git
cd unapi-mcp
npm install
npm run build

# 2. Run the self-contained demo (synthesizes endpoints + traces auth chain + runs security audit)
npx unapi-mcp demo

# 3. Inspect the Auth Dependency Graph & Shadow API Security Report
npx unapi-mcp audit acme-flights

# 4. Spin up a local offline Mock Server of the captured website API on port 4010
npx unapi-mcp mock acme-flights --port 4010

# 5. Export a standalone Python or TypeScript SDK, or OpenAPI 3.1 spec
npx unapi-mcp export acme-flights --format python
npx unapi-mcp export acme-flights --format ts
npx unapi-mcp export acme-flights --format openapi
```

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    1. Traffic Ingestion Layer                           │
│  • Live Chrome DevTools WebSocket (127.0.0.1:9222)  [`src/recorder.ts`] │
│  • Offline Browser HAR File Importer (`import-har`)                     │
│  • Telemetry, Ad-Domain & Static Asset Noise Filter (95% reduction)     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  2. Synthesis & Intelligence Engine                     │
│  • Dynamic Path Parameterizer (`/orders/8492` ➔ `/orders/{orderId}`)    │
│  • Recursive JSON Schema Inferrer & GraphQL Operation Unwrapper         │
│  • Multi-Step Auth Token Dependency Tracer (`traceTokenDependencies`)│
│  • Shadow API Security & PII Auditor (`auditEndpointSecurity`)       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌───────────────────┬─────────────────────────────────┬───────────────────┐
│ 3A. Native MCP    │ 3B. Offline Local Mock Server   │ 3C. SDK Compilers │
│ Stdio Server for  │ Replays routes & payloads on    │ • OpenAPI 3.1     │
│ Claude / Cursor   │ `http://127.0.0.1:4010`         │ • TypeScript SDK  │
│ (`mcp-server.ts`) │ (`src/mock-server.ts`)          │ • Python Client   │
└───────────────────┴─────────────────────────────────┴───────────────────┘
```

## Repository layout

- `.claude-plugin/` & `skills/unapi-mcp/` — Native Claude Code plugin manifest & agent skill definition.
- `.github/workflows/` — Automated CI matrix testing Node 20, 22, and 24 across Ubuntu and macOS.
- `bench/` — Latency & throughput benchmarks (`npm run bench`).
- `docs/` — Deep-dive architecture and Shadow API Security Auditor documentation.
- `examples/` - Sample generated TypeScript & Python SDK clients.
- `sites/` — Pre-built API catalogs (`hackernews.json`, `github-public.json`).
- `src/` — TypeScript source (`recorder.ts`, `synthesizer.ts`, `mock-server.ts`, `mcp-server.ts`, `cli.ts`).
- `test/` — Automated test suite (`npm test`).

## CLI reference

```text
unapi-mcp capture [url] [--launch] [--port 9222] [--duration 30] [--name <site>]
unapi-mcp import-har <file.har> [--name <site>]
unapi-mcp demo
unapi-mcp list
unapi-mcp audit <site>
unapi-mcp mock <site> [--port 4010]
unapi-mcp export <site> [--format openapi|ts|python] [--out <file>]
unapi-mcp setup [--client claude|cursor]
unapi-mcp doctor [--port 9222]
unapi-mcp mcp [--catalog <file.json>]
```

## Capture Any Live Website or `.har` Recording

```bash
# Auto-launch Chrome with remote debugging and capture 30 seconds of clicks
npx unapi-mcp capture https://news.ycombinator.com --launch --duration 30 --name hn

# Or import any network recording saved from Chrome DevTools ("Save all as HAR with content")
npx unapi-mcp import-har ./portal-recording.har --name my-portal
```

## Connect to Claude Code, Cursor, or OpenCode

```bash
npx unapi-mcp setup --client claude
npx unapi-mcp setup --client cursor
```


## License

MIT Licenced.
# unapi-mcp

