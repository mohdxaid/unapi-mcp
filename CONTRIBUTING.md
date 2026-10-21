# Contributing to `unapi-mcp`

Thank you for helping us unwrap the web's hidden APIs for developers and AI agents!

## Ways to Contribute

1. **Contribute a Site Catalog (`sites/`):** Captured a clean REST/GraphQL catalog for a popular public portal? Strip any personal auth tokens/cookies, verify it with `unapi-mcp audit`, and open a PR adding `<site>.json` to `sites/`.
2. **Improve Synthesis & Security Rules (`src/synthesizer.ts`):** Add smarter path parameter heuristics (e.g., ULIDs, base64 cursors, date slugs) or new OWASP API Security top-10 checks in `auditEndpointSecurity()`.
3. **New SDK Export Targets:** Add Go, Rust, cURL, or Postman collection exporters alongside OpenAPI 3.1, TypeScript, and Python.

## Pull Request Checklist

```bash
# 1. Build TypeScript cleanly
npm run build

# 2. Run the full test suite
npm test

# 3. Run the benchmark script
npm run bench
```

Please keep dependencies minimal and ensure all features work 100% locally offline.
