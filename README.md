<div align="center">

# ⚡ UnAPI-MCP (`unapi-mcp`)

**Unwrap any website's hidden Shadow APIs into a typed Python/TypeScript SDK, OpenAPI 3.1 spec, Auth Dependency Graph, Security Audit, and Local Mock + MCP Server in one command.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Native-success.svg)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

</div>

---

## Why `UnAPI-MCP`?

Every modern website talks to itself using undocumented internal JSON and GraphQL endpoints (**Shadow APIs**). Yet when developers want an AI agent (Claude Code, Cursor, OpenCode) to interact with a web portal, they usually reach for headless browsers (`Playwright MCP`, `browser-use`) that take 45+ seconds and burn thousands of tokens parsing DOM trees.

Even worse, basic network recorders just dump raw endpoints without telling you **where the auth tokens came from**, **whether the API leaks PII**, or **letting you test offline**.

**`UnAPI-MCP` goes far beyond simple network capture:**

1. **Automatic Auth & Token Dependency Chain Tracer:** Automatically traces how a `sessionToken` or `csrfToken` returned in the JSON body of Request A (`$.sessionToken`) is injected into the `Authorization` or `x-csrf-token` header of Request B and C.
2. **Shadow API Security & PII Auditor (`unapi-mcp audit`):** Scans every captured endpoint for unauthenticated state-mutations (`POST`/`DELETE`), plaintext email/PII leaks, credentials leaked in URL query strings, and wildcard CORS misconfigurations.
3. **Instant Zero-Config Local Mock Server (`unapi-mcp mock`):** Spins up a local HTTP server (`http://127.0.0.1:4010`) that replays the exact synthesized routes and captured JSON payloads so you and your AI agent can build and test against any website's API **offline** without hitting production rate limits.
4. **Full Code & Spec Compiler (`unapi-mcp export`):** Generates standalone, zero-dependency **Python SDKs**, **TypeScript SDKs**, **OpenAPI 3.1 specs**, and native **Model Context Protocol (MCP)** tools.

---

## Quick Comparison

| Capability | Headless Browser MCPs | Basic API Recorders | `UnAPI-MCP` |
| :--- | :--- | :--- | :--- |
| **Execution Speed** | 35s – 90s per task | ~120ms | **~120ms (Native HTTP)** |
| **Multi-Step Auth Token Chain Tracer** | ❌ No | ❌ No | **✅ Yes (Traces JSON body $
ightarrow$ Header handoffs)** |
| **Shadow API Security & PII Audit** | ❌ No | ❌ No | **✅ Yes (`unapi-mcp audit <site>`)** |
| **Offline Localhost Mock Server** | ❌ No | ❌ No | **✅ Yes (`unapi-mcp mock <site>`)** |
| **Typed Python / TS SDK + OpenAPI 3.1** | ❌ No | ❌ No | **✅ Yes (`--format python`, `ts`, `openapi`)** |
| **HAR File Import + Live Chrome CDP** | ❌ No | Partial | **✅ Yes (`capture --launch` & `import-har`)** |

---

## Quickstart (30 Seconds)

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

## License

MIT © Contributors
# unapi-mcp
