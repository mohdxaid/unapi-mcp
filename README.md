<div align="center">

# ⚡ UnAPI-MCP (`unapi-mcp`)

**Stop burning tokens on slow headless browsers.**  
**Unwrap any website's hidden Shadow APIs into a typed Python/TypeScript SDK, OpenAPI 3.1 spec, Auth Dependency Graph, Security Audit, and Local Mock + MCP Server in one command.**

[![CI](https://github.com/mohdxaid/unapi-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/mohdxaid/unapi-mcp/actions)
[![npm version](https://img.shields.io/npm/v/unapi-mcp.svg)](https://www.npmjs.com/package/unapi-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Native-success.svg)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

</div>

---

## Why `UnAPI-MCP`?

Every modern website talks to itself using undocumented internal JSON and GraphQL endpoints (**Shadow APIs**). Yet when developers want an AI agent (Claude Code, Cursor, OpenCode) to interact with a web portal, they usually reach for headless browsers (`Playwright MCP`, `browser-use`) that take 45+ seconds and burn thousands of tokens parsing DOM trees.

Even worse, basic network recorders just dump raw endpoints without telling you **where the auth tokens came from**, **whether the API leaks PII**, or **letting you test offline**.

**`UnAPI-MCP` is a complete Shadow API synthesis & security engine:**

1. **🔗 Automatic Auth & Token Dependency Chain Tracer:** Automatically traces how a `sessionToken` or `csrfToken` returned in the JSON body of Request A (`$.sessionToken`) is injected into the `Authorization` or `x-csrf-token` header of Request B and C.
2. **🔒 Shadow API Security & PII Auditor (`unapi-mcp audit`):** Scans every captured endpoint for unauthenticated state-mutations (`POST`/`DELETE`), plaintext email/PII leaks, credentials leaked in URL query strings, and wildcard CORS misconfigurations.
3. **⚡ Instant Zero-Config Local Mock Server (`unapi-mcp mock`):** Spins up a local HTTP server (`http://127.0.0.1:4010`) that replays the exact synthesized routes and captured JSON payloads so you and your AI agent can build and test against any website's API **offline** without hitting production rate limits.
4. **📦 Full Code & Spec Compiler (`unapi-mcp export`):** Generates standalone, zero-dependency **Python SDKs**, **TypeScript SDKs**, **OpenAPI 3.1 specs**, and native **Model Context Protocol (MCP)** tools.

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
│  • 🔗 Multi-Step Auth Token Dependency Tracer (`traceTokenDependencies`)│
│  • 🔒 Shadow API Security & PII Auditor (`auditEndpointSecurity`)       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌───────────────────┬─────────────────────────────────┬───────────────────┐
│ 3A. Native MCP    │ 3B. Offline Local Mock Server   │ 3C. SDK Compilers │
│ Stdio Server for  │ Replays routes & payloads on    │ • OpenAPI 3.1     │
│ Claude / Cursor   │ `http://127.0.0.1:4010`         │ • TypeScript SDK  │
│ (`mcp-server.ts`) │ (`src/mock-server.ts`)          │ • Python Client   │
└───────────────────┴─────────────────────────────────┴───────────────────┘
```

---

## Comparison

| Capability | Headless Browser MCPs | Basic API Recorders | `UnAPI-MCP` |
| :--- | :--- | :--- | :--- |
| **Execution Speed** | 35s – 90s per task | ~120ms | **~120ms (Native HTTP)** |
| **Multi-Step Auth Token Chain Tracer** | ❌ No | ❌ No | **✅ Yes (Traces JSON body ➔ Header handoffs)** |
| **Shadow API Security & PII Audit** | ❌ No | ❌ No | **✅ Yes (`unapi-mcp audit <site>`)** |
| **Offline Localhost Mock Server** | ❌ No | ❌ No | **✅ Yes (`unapi-mcp mock <site>`)** |
| **Typed Python / TS SDK + OpenAPI 3.1** | ❌ No | ❌ No | **✅ Yes (`--format python`, `ts`, `openapi`)** |
| **HAR File Import + Live Chrome CDP** | ❌ No | Partial | **✅ Yes (`capture --launch` & `import-har`)** |

---

## Quickstart (Run in 10 Seconds via `npx`)

```bash
# 1. Run the self-contained demo (synthesizes endpoints + traces auth chain + runs security audit)
npx unapi-mcp demo

# 2. Inspect the Auth Dependency Graph & Shadow API Security Report
npx unapi-mcp audit acme-flights

# 3. Spin up a local offline Mock Server of the captured website API on port 4010
npx unapi-mcp mock acme-flights --port 4010

# 4. Export a standalone Python or TypeScript SDK, or OpenAPI 3.1 spec
npx unapi-mcp export acme-flights --format python
npx unapi-mcp export acme-flights --format ts
npx unapi-mcp export acme-flights --format openapi
```

---

## Capture Any Live Website or `.har` Recording

```bash
# Auto-launch Chrome with remote debugging and capture 30 seconds of clicks
npx unapi-mcp capture https://news.ycombinator.com --launch --duration 30 --name hn

# Or import any network recording saved from Chrome DevTools ("Save all as HAR with content")
npx unapi-mcp import-har ./portal-recording.har --name my-portal
```

---

## Connect to Claude Code, Cursor, or OpenCode

```bash
npx unapi-mcp setup --client claude
npx unapi-mcp setup --client cursor
```

---

## Repository Layout

- `.claude-plugin/` & `skills/unapi-mcp/` — Native Claude Code plugin manifest & agent skill definition.
- `.github/workflows/` — Automated CI matrix testing Node 20, 22, and 24 across Ubuntu and macOS.
- `bench/` — Latency & throughput benchmarks (`npm run bench`).
- `docs/` — Deep-dive architecture and Shadow API Security Auditor documentation.
- `examples/` — Sample generated TypeScript & Python SDK clients.
- `sites/` — Pre-built API catalogs (`hackernews.json`, `github-public.json`).
- `src/` — TypeScript source (`recorder.ts`, `synthesizer.ts`, `mock-server.ts`, `mcp-server.ts`, `cli.ts`).
- `test/` — Automated test suite (`npm test`).

---

## License

MIT © [mohdxaid](https://github.com/mohdxaid)
