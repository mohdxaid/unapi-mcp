import test from "node:test";
import assert from "node:assert/strict";
import {
  parameterizePath,
  inferJsonSchema,
  synthesizeCatalog
} from "../src/synthesizer.js";
import { CapturedExchange } from "../src/types.js";

test("parameterizePath replaces numeric IDs and UUIDs with named parameters", () => {
  const res1 = parameterizePath("/api/v1/flights/98412/seats");
  assert.equal(res1.pattern, "/api/v1/flights/{flightId}/seats");
  assert.deepEqual(res1.paramNames, ["flightId"]);

  const res2 = parameterizePath("/users/550e8400-e29b-41d4-a716-446655440000/orders/42");
  assert.equal(res2.pattern, "/users/{userId}/orders/{orderId}");
  assert.deepEqual(res2.paramNames, ["userId", "orderId"]);
});

test("inferJsonSchema infers nested objects, arrays, numbers, and booleans", () => {
  const sample = {
    id: 101,
    active: true,
    tags: ["fast", "mcp"],
    meta: { price: 49.99 }
  };
  const schema = inferJsonSchema(sample);
  assert.equal(schema.type, "object");
  assert.equal(schema.properties?.id.type, "integer");
  assert.equal(schema.properties?.active.type, "boolean");
  assert.equal(schema.properties?.tags.type, "array");
  assert.equal(schema.properties?.meta.properties?.price.type, "number");
});

test("synthesizeCatalog traces multi-step auth token chains and audits security findings", () => {
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_token_value_12345";
  const exchanges: CapturedExchange[] = [
    {
      id: "ex-1",
      timestamp: 1000,
      method: "POST",
      url: "https://portal.example.com/api/auth/login",
      requestHeaders: { "content-type": "application/json" },
      requestBody: JSON.stringify({ username: "admin" }),
      status: 200,
      responseHeaders: { "content-type": "application/json" },
      responseBody: JSON.stringify({
        accessToken: token,
        email: "admin@example.com"
      }),
      mimeType: "application/json"
    },
    {
      id: "ex-2",
      timestamp: 2000,
      method: "GET",
      url: "https://portal.example.com/api/orders/7712",
      requestHeaders: {
        accept: "application/json",
        authorization: `Bearer ${token}`
      },
      status: 200,
      responseHeaders: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      responseBody: JSON.stringify({ orderId: 7712, total: 99 }),
      mimeType: "application/json"
    }
  ];

  const catalog = synthesizeCatalog(exchanges, "portal");
  assert.equal(catalog.siteName, "portal");
  assert.equal(catalog.endpoints.length, 2);

  // Verify Auth Token Chain was traced from ex-1 body to ex-2 Authorization header
  assert.equal(catalog.tokenChain.length, 1);
  assert.equal(catalog.tokenChain[0].sourceJsonPath, "$.accessToken");
  assert.equal(catalog.tokenChain[0].targetLocation, "Header 'authorization'");

  // Verify Security Auditor caught unauthenticated login POST, PII email exposure, and wildcard CORS
  const categories = catalog.securityFindings.map((f) => f.category);
  assert.ok(categories.includes("PII_EXPOSURE"));
  assert.ok(categories.includes("CORS_WILDCARD"));
});
