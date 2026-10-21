# AGENTS.md — AI Coding Agent Guidelines for `unapi-mcp`

This repository implements **UnAPI-MCP** (`unapi-mcp`), a zero-bloat CLI and Model Context Protocol (MCP) server that unwraps hidden website Shadow APIs (REST, XHR, Fetch, and GraphQL) into typed SDKs, OpenAPI 3.1 specs, multi-step auth token dependency graphs, security audits, and local offline mock servers.

## Repository Architecture

- `src/types.ts` — Core TypeScript interfaces (`CapturedExchange`, `SynthesizedEndpoint`, `TokenDependencyLink`, `SecurityFinding`, `SiteCatalog`).
- `src/recorder.ts` — Chrome DevTools Protocol (CDP) WebSocket sniffer (`127.0.0.1:9222`), browser auto-launcher, noise/telemetry filter, and `.har` file parser.
- `src/synthesizer.ts` — Path parameterizer (`/users/9812` -> `/users/{userId}`), JSON Schema inferrer, GraphQL operation extractor, **Multi-Step Auth Token Dependency Tracer** (`traceTokenDependencies`), **Shadow API Security & PII Auditor** (`auditEndpointSecurity`), and OpenAPI 3.1 / TypeScript / Python SDK compilers.
- `src/mock-server.ts` — Zero-dependency Node HTTP server that replays synthesized route patterns (`{param}`) and captured JSON payloads locally.
- `src/mcp-server.ts` — Stdio Model Context Protocol server exposing every synthesized endpoint as an individual callable MCP tool plus `unapi_list_sites`.
- `src/cli.ts` — Commander CLI entry point (`capture`, `import-har`, `demo`, `audit`, `mock`, `list`, `export`, `setup`, `doctor`, `mcp`).
- `sites/` — Pre-captured reference catalogs (`hackernews.json`, `github-public.json`) for instant testing.
- `test/` — Node native test runner suite (`npm test`).
- `bench/` — Latency & token-efficiency benchmark comparing native HTTP synthesis vs. headless DOM scraping (`npm run bench`).

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to ./dist
npm test             # Run unit & synthesis tests
npm run bench        # Run latency & token efficiency benchmark
node dist/cli.js ... # Run CLI locally
```

## Engineering Rules for Agents
1. **Zero Heavy Browser Dependencies:** Keep CDP capture pure WebSocket (`ws`) + native `fetch`. Never require a 400MB Chromium download to install.
2. **Strict ESM Imports:** Always use `.js` extensions in relative TypeScript imports (`import { ... } from "./types.js"`).
3. **Deterministic Synthesis:** Core endpoint synthesis, token chain tracing, and security auditing must run 100% locally and offline without requiring external LLM API keys.
