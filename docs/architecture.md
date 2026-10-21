# UnAPI-MCP Architecture Deep Dive

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

## How the Multi-Step Auth Token Dependency Tracer Works

Unlike basic HAR-to-OpenAPI scripts that look at each HTTP request in isolation, `traceTokenDependencies()` in `src/synthesizer.ts` inspects the chronological sequence of network exchanges:

1. **Token Extraction:** For every JSON response body in exchange $E_i$, `extractScalarStrings()` walks the JSON tree and indexes high-entropy scalar strings (length 12–512, no whitespace) along with their exact JSONPath (e.g., `$.sessionToken` or `$.data.csrf`).
2. **Downstream Consumption Matching:** For every subsequent exchange $E_j$ ($j > i$), the tracer checks whether any header (`Authorization`, `x-csrf-token`, `x-api-key`) or URL query parameter contains a token produced by $E_i$.
3. **Causal Link Graph:** Each match is emitted as a `TokenDependencyLink`, telling both humans and AI agents exactly which login/bootstrap endpoint must be called first to populate downstream headers.
