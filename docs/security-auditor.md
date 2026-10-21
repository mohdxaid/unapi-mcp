# Shadow API Security & PII Auditor (`unapi-mcp audit`)

Frontend web applications frequently rely on undocumented internal APIs (**Shadow APIs**) that bypass the stricter reviews applied to public developer APIs.

When you run `npx unapi-mcp audit <siteName>`, `unapi-mcp` checks every captured exchange against five high-impact vulnerability classes:

| Category | Severity | What It Detects |
| :--- | :--- | :--- |
| `UNAUTHENTICATED_MUTATION` | **HIGH** | State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) that execute without any detected `Authorization`, `x-csrf-token`, API key, or session cookie. |
| `TOKEN_IN_URL` | **HIGH** | JWTs (`eyJ...`), session IDs, or API keys passed inside URL query parameters where they leak into proxy logs, browser history, and `Referer` headers. |
| `EXCESSIVE_DATA` | **HIGH** | Response JSON payloads exposing sensitive keys such as `password`, `secret`, `private_key`, `ssn`, `credit_card`, or `refresh_token`. |
| `PII_EXPOSURE` | **MEDIUM** | Unmasked plaintext email addresses or personal identifiers returned in API responses. |
| `CORS_WILDCARD` | **MEDIUM** | Authenticated endpoints returning `Access-Control-Allow-Origin: *`. |
