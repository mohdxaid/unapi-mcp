---
name: unapi-mcp
description: Use this skill whenever the user wants to reverse-engineer a website's hidden REST/GraphQL APIs, avoid slow headless browser automation, analyze HAR files, trace multi-step authentication token chains, audit API security/PII leaks, spin up an offline API mock server, or generate typed Python/TypeScript SDKs and OpenAPI 3.1 specs.
---

# UnAPI-MCP Agent Skill (`unapi-mcp`)

## When to Invoke
- The user wants to scrape, automate, or integrate with a website that has no official public API.
- Headless browser tools (`Playwright`, `Puppeteer`, `browser-use`) are too slow, flaky, or token-expensive.
- The user has a `.har` network capture file and wants an SDK, OpenAPI spec, security audit, or local mock server.
- The user wants to audit a web application's backend APIs for unauthenticated mutations, PII leaks, or wildcard CORS.

## Core CLI Commands

1. **Capture Live Traffic from Chrome (Port 9222):**
   ```bash
   npx unapi-mcp capture https://example.com --launch --duration 30 --name example
   ```

2. **Import an Existing Browser `.har` Recording:**
   ```bash
   npx unapi-mcp import-har ./recording.har --name my-portal
   ```

3. **Run Multi-Step Auth Dependency & Shadow API Security Audit:**
   ```bash
   npx unapi-mcp audit <siteName>
   ```

4. **Spin Up an Offline Localhost Mock Server:**
   ```bash
   npx unapi-mcp mock <siteName> --port 4010
   ```

5. **Compile Typed SDKs & OpenAPI 3.1 Specs:**
   ```bash
   npx unapi-mcp export <siteName> --format python --out client.py
   npx unapi-mcp export <siteName> --format ts --out client.ts
   npx unapi-mcp export <siteName> --format openapi --out openapi.json
   ```

## MCP Tools Exposed
When running `unapi-mcp mcp`, every captured endpoint is automatically registered as `<siteName>_<method>_<path>` alongside `unapi_list_sites`. Always call `unapi_list_sites` first to inspect available catalogs, auth chains, and security findings.
