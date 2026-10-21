import {
  AuthRequirement,
  CapturedExchange,
  InferredSchema,
  SecurityFinding,
  SiteCatalog,
  SynthesizedEndpoint,
  TokenDependencyLink
} from "./types.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_REGEX = /^\d+$/;
const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const AUTH_HEADER_CANDIDATES = [
  "authorization",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
  "x-xsrf-token",
  "api-key"
];

const SENSITIVE_KEY_NAMES = [
  "password",
  "secret",
  "ssn",
  "credit_card",
  "card_number",
  "cvv",
  "private_key",
  "access_token",
  "refresh_token",
  "api_key"
];

export function parameterizePath(pathname: string): {
  pattern: string;
  paramNames: string[];
} {
  const segments = pathname.split("/").filter(Boolean);
  const paramNames: string[] = [];
  let paramCounter = 1;

  const normalized = segments.map((seg, idx) => {
    const prev = idx > 0 ? segments[idx - 1].replace(/s$/, "") : "item";
    const cleanPrev = prev.replace(/[^a-zA-Z0-9]/g, "") || `param${paramCounter}`;

    if (NUMERIC_ID_REGEX.test(seg) || UUID_REGEX.test(seg) || OBJECT_ID_REGEX.test(seg)) {
      const paramName = `${cleanPrev}Id`;
      paramNames.push(paramName);
      paramCounter++;
      return `{${paramName}}`;
    }
    return seg;
  });

  return {
    pattern: "/" + normalized.join("/"),
    paramNames
  };
}

export function inferJsonSchema(value: unknown, depth = 0): InferredSchema {
  if (depth > 5) return { type: "object" };
  if (value === null || value === undefined) {
    return { type: "string", example: null };
  }
  if (Array.isArray(value)) {
    const first = value.length > 0 ? inferJsonSchema(value[0], depth + 1) : { type: "string" };
    return { type: "array", items: first };
  }
  if (typeof value === "object") {
    const properties: Record<string, InferredSchema> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = inferJsonSchema(v, depth + 1);
      if (v !== null && v !== undefined) required.push(k);
    }
    return { type: "object", properties, required };
  }
  if (typeof value === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number", example: value };
  }
  if (typeof value === "boolean") {
    return { type: "boolean", example: value };
  }
  return { type: "string", example: String(value).slice(0, 120) };
}

function detectAuth(headers: Record<string, string>, sitePrefix: string): AuthRequirement {
  const envPrefix = sitePrefix.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  if (headers["authorization"]) {
    const isBearer = headers["authorization"].toLowerCase().startsWith("bearer ");
    return {
      type: isBearer ? "bearer" : "header",
      headerName: "authorization",
      envVarName: `${envPrefix}_AUTH_TOKEN`
    };
  }
  for (const candidate of AUTH_HEADER_CANDIDATES) {
    if (headers[candidate]) {
      return {
        type: "header",
        headerName: candidate,
        envVarName: `${envPrefix}_${candidate.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
      };
    }
  }
  if (headers["cookie"]) {
    const cookieNames = headers["cookie"]
      .split(";")
      .map((pair) => pair.split("=")[0]?.trim())
      .filter(Boolean);
    return {
      type: "cookie",
      cookieNames,
      envVarName: `${envPrefix}_COOKIE`
    };
  }
  return {
    type: "none",
    envVarName: `${envPrefix}_AUTH`
  };
}

function makeToolName(
  method: string,
  pathPattern: string,
  graphqlOperationName?: string
): string {
  if (graphqlOperationName) {
    return `gql_${graphqlOperationName}`
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
  }
  const cleanSegments = pathPattern
    .split("/")
    .filter(Boolean)
    .filter((s) => s !== "api" && !/^v\d+$/i.test(s))
    .map((s) => (s.startsWith("{") && s.endsWith("}") ? `by_${s.slice(1, -1)}` : s));

  const suffix = cleanSegments.length > 0 ? cleanSegments.join("_") : "root";
  return `${method.toLowerCase()}_${suffix}`
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function extractScalarStrings(
  obj: unknown,
  prefix = "$",
  out: Array<{ path: string; value: string }> = []
): Array<{ path: string; value: string }> {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    obj.slice(0, 5).forEach((item, idx) => extractScalarStrings(item, `${prefix}[${idx}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nextPath = `${prefix}.${k}`;
    if (typeof v === "string" && v.length >= 12 && v.length <= 512 && !v.includes(" ")) {
      out.push({ path: nextPath, value: v });
    } else if (v && typeof v === "object") {
      extractScalarStrings(v, nextPath, out);
    }
  }
  return out;
}

export function traceTokenDependencies(
  exchanges: CapturedExchange[],
  endpointByExchangeId: Map<string, SynthesizedEndpoint>
): TokenDependencyLink[] {
  const producedValues: Array<{
    value: string;
    jsonPath: string;
    endpoint: SynthesizedEndpoint;
  }> = [];

  const links: TokenDependencyLink[] = [];
  const seenKeys = new Set<string>();

  for (const ex of exchanges) {
    const ep = endpointByExchangeId.get(ex.id);
    if (!ep) continue;

    for (const prod of producedValues) {
      if (prod.endpoint.id === ep.id) continue;

      for (const [hName, hVal] of Object.entries(ex.requestHeaders)) {
        if (hVal && hVal.includes(prod.value)) {
          const dedupe = `${prod.endpoint.id}->${ep.id}:header:${hName}`;
          if (!seenKeys.has(dedupe)) {
            seenKeys.add(dedupe);
            links.push({
              tokenPreview: prod.value.slice(0, 16) + "...",
              sourceEndpointId: prod.endpoint.id,
              sourceToolName: prod.endpoint.toolName,
              sourceJsonPath: prod.jsonPath,
              targetEndpointId: ep.id,
              targetToolName: ep.toolName,
              targetLocation: `Header '${hName}'`
            });
          }
        }
      }

      if (ex.url.includes(encodeURIComponent(prod.value)) || ex.url.includes(prod.value)) {
        const dedupe = `${prod.endpoint.id}->${ep.id}:url`;
        if (!seenKeys.has(dedupe)) {
          seenKeys.add(dedupe);
          links.push({
            tokenPreview: prod.value.slice(0, 16) + "...",
            sourceEndpointId: prod.endpoint.id,
            sourceToolName: prod.endpoint.toolName,
            sourceJsonPath: prod.jsonPath,
            targetEndpointId: ep.id,
            targetToolName: ep.toolName,
            targetLocation: `URL / Query Parameter`
          });
        }
      }
    }

    if (ex.responseBody) {
      try {
        const parsed = JSON.parse(ex.responseBody);
        const scalars = extractScalarStrings(parsed);
        for (const s of scalars) {
          producedValues.push({
            value: s.value,
            jsonPath: s.path,
            endpoint: ep
          });
        }
      } catch {
        // Ignore non-JSON
      }
    }
  }

  return links;
}

export function auditEndpointSecurity(
  exchanges: CapturedExchange[],
  endpointByExchangeId: Map<string, SynthesizedEndpoint>
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();

  const addFinding = (f: SecurityFinding) => {
    const key = `${f.category}:${f.endpointId}:${f.detail}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push(f);
    }
  };

  for (const ex of exchanges) {
    const ep = endpointByExchangeId.get(ex.id);
    if (!ep) continue;

    if (["POST", "PUT", "DELETE", "PATCH"].includes(ep.method) && ep.auth.type === "none") {
      addFinding({
        severity: "HIGH",
        category: "UNAUTHENTICATED_MUTATION",
        endpointId: ep.id,
        toolName: ep.toolName,
        detail: `${ep.method} ${ep.pathPattern} mutates state without any detected Auth header or session cookie.`
      });
    }

    try {
      const parsedUrl = new URL(ex.url);
      for (const [qk, qv] of parsedUrl.searchParams.entries()) {
        if (
          /token|key|secret|auth|jwt|session/i.test(qk) ||
          qv.startsWith("eyJ")
        ) {
          addFinding({
            severity: "HIGH",
            category: "TOKEN_IN_URL",
            endpointId: ep.id,
            toolName: ep.toolName,
            detail: `Sensitive credential/token passed in URL query parameter '${qk}' (leaks in logs & referrers).`
          });
        }
      }
    } catch {
      // Ignore URL parse error
    }

    if (
      ex.responseHeaders["access-control-allow-origin"] === "*" &&
      ep.auth.type !== "none"
    ) {
      addFinding({
        severity: "MEDIUM",
        category: "CORS_WILDCARD",
        endpointId: ep.id,
        toolName: ep.toolName,
        detail: `Authenticated endpoint returns 'Access-Control-Allow-Origin: *'.`
      });
    }

    if (ex.responseBody) {
      if (EMAIL_REGEX.test(ex.responseBody)) {
        addFinding({
          severity: "MEDIUM",
          category: "PII_EXPOSURE",
          endpointId: ep.id,
          toolName: ep.toolName,
          detail: `Response payload exposes plaintext email address(es) (PII).`
        });
      }
      try {
        const parsed = JSON.parse(ex.responseBody);
        const rawKeys = JSON.stringify(parsed).toLowerCase();
        for (const sensitiveKey of SENSITIVE_KEY_NAMES) {
          if (rawKeys.includes(`"${sensitiveKey}"`)) {
            addFinding({
              severity: "HIGH",
              category: "EXCESSIVE_DATA",
              endpointId: ep.id,
              toolName: ep.toolName,
              detail: `Response JSON contains sensitive field '${sensitiveKey}'.`
            });
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  return findings;
}

export function synthesizeCatalog(
  exchanges: CapturedExchange[],
  customSiteName?: string
): SiteCatalog {
  if (exchanges.length === 0) {
    throw new Error("No API exchanges captured to synthesize.");
  }

  const firstUrl = new URL(exchanges[0].url);
  const origin = firstUrl.origin;
  const siteName =
    customSiteName ||
    firstUrl.hostname
      .replace(/^www\./, "")
      .replace(/^api\./, "")
      .split(".")[0] ||
    "captured-site";

  const endpointMap = new Map<string, SynthesizedEndpoint>();
  const endpointByExchangeId = new Map<string, SynthesizedEndpoint>();
  const authHeaders: Record<string, string> = {};
  const cookieSet = new Set<string>();

  for (const ex of exchanges) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(ex.url);
    } catch {
      continue;
    }

    const { pattern, paramNames } = parameterizePath(parsedUrl.pathname);

    let isGraphQL = pattern.toLowerCase().includes("graphql");
    let graphqlOperationName: string | undefined;
    let parsedReqJson: any;
    let parsedResJson: any;

    if (ex.requestBody) {
      try {
        parsedReqJson = JSON.parse(ex.requestBody);
        if (parsedReqJson && (parsedReqJson.query || parsedReqJson.operationName)) {
          isGraphQL = true;
          graphqlOperationName = parsedReqJson.operationName || "query";
        }
      } catch {
        // Non-JSON body
      }
    }

    if (ex.responseBody) {
      try {
        parsedResJson = JSON.parse(ex.responseBody);
      } catch {
        // Non-JSON response body
      }
    }

    const key = isGraphQL
      ? `${ex.method}:${parsedUrl.origin}${pattern}:${graphqlOperationName || "default"}`
      : `${ex.method}:${parsedUrl.origin}${pattern}`;

    const queryParams: Record<string, InferredSchema> = {};
    for (const [qk, qv] of parsedUrl.searchParams.entries()) {
      const asNum = Number(qv);
      queryParams[qk] =
        !Number.isNaN(asNum) && qv.trim() !== ""
          ? { type: "number", example: asNum }
          : { type: "string", example: qv };
    }

    const auth = detectAuth(ex.requestHeaders, siteName);
    for (const candidate of AUTH_HEADER_CANDIDATES) {
      if (ex.requestHeaders[candidate]) {
        authHeaders[candidate] = ex.requestHeaders[candidate];
      }
    }
    if (auth.cookieNames) {
      auth.cookieNames.forEach((c) => cookieSet.add(c));
    }

    const toolName = makeToolName(ex.method, pattern, graphqlOperationName);

    let ep = endpointMap.get(key);
    if (!ep) {
      ep = {
        id: key,
        toolName,
        method: ex.method.toUpperCase(),
        origin: parsedUrl.origin,
        pathPattern: pattern,
        sampleUrl: ex.url,
        description: isGraphQL
          ? `Execute GraphQL operation '${graphqlOperationName || "query"}' on ${parsedUrl.hostname}`
          : `${ex.method.toUpperCase()} ${pattern} on ${parsedUrl.hostname}`,
        pathParams: paramNames,
        queryParams,
        requestHeaders: {
          accept: ex.requestHeaders["accept"] || "application/json",
          ...(ex.requestHeaders["content-type"]
            ? { "content-type": ex.requestHeaders["content-type"] }
            : {})
        },
        auth,
        isGraphQL,
        graphqlOperationName,
        requestSchema: parsedReqJson ? inferJsonSchema(parsedReqJson) : undefined,
        responseSchema: parsedResJson ? inferJsonSchema(parsedResJson) : undefined,
        sampleStatus: ex.status,
        sampleResponseBody: parsedResJson ?? ex.responseBody
      };
      endpointMap.set(key, ep);
    } else {
      Object.assign(ep.queryParams, queryParams);
      if (!ep.responseSchema && parsedResJson) {
        ep.responseSchema = inferJsonSchema(parsedResJson);
      }
      if (ep.sampleResponseBody === undefined && parsedResJson !== undefined) {
        ep.sampleResponseBody = parsedResJson;
      }
    }

    endpointByExchangeId.set(ex.id, ep);
  }

  const tokenChain = traceTokenDependencies(exchanges, endpointByExchangeId);
  const securityFindings = auditEndpointSecurity(exchanges, endpointByExchangeId);

  return {
    siteName,
    origin,
    capturedAt: new Date().toISOString(),
    endpoints: Array.from(endpointMap.values()),
    tokenChain,
    securityFindings,
    authHints: {
      headers: authHeaders,
      cookies: Array.from(cookieSet)
    }
  };
}

export function generateOpenApiSpec(catalog: SiteCatalog): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of catalog.endpoints) {
    const pathKey =
      ep.isGraphQL && ep.graphqlOperationName
        ? `${ep.pathPattern}#${ep.graphqlOperationName}`
        : ep.pathPattern;

    if (!paths[pathKey]) paths[pathKey] = {};

    const parameters: Record<string, unknown>[] = [];
    for (const p of ep.pathParams) {
      parameters.push({
        name: p,
        in: "path",
        required: true,
        schema: { type: "string" }
      });
    }
    for (const [qk, qSchema] of Object.entries(ep.queryParams)) {
      parameters.push({
        name: qk,
        in: "query",
        required: false,
        schema: qSchema
      });
    }

    const operation: Record<string, unknown> = {
      operationId: ep.toolName,
      summary: ep.description,
      parameters,
      responses: {
        [String(ep.sampleStatus || 200)]: {
          description: "Captured API response",
          content: ep.responseSchema
            ? { "application/json": { schema: ep.responseSchema } }
            : undefined
        }
      }
    };

    if (ep.requestSchema && ["POST", "PUT", "PATCH"].includes(ep.method)) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: ep.requestSchema
          }
        }
      };
    }

    paths[pathKey][ep.method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: `${catalog.siteName} Reverse-Engineered Shadow API`,
      version: "1.0.0",
      description: `Automatically synthesized by UnAPI-MCP at ${catalog.capturedAt}`
    },
    servers: [{ url: catalog.origin }],
    paths
  };
}

export function generateTypeScriptSdk(catalog: SiteCatalog): string {
  const className =
    catalog.siteName
      .split(/[^a-zA-Z0-9]/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("") + "Client";

  const methods = catalog.endpoints
    .map((ep) => {
      const hasBody = ["POST", "PUT", "PATCH"].includes(ep.method);
      return `  /**
   * ${ep.description}
   */
  async ${ep.toolName}(params: {
    path?: Record<string, string | number>;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {}): Promise<any> {
    let urlPath = "${ep.pathPattern}";
    if (params.path) {
      for (const [k, v] of Object.entries(params.path)) {
        urlPath = urlPath.replace(\`{\${k}}\`, encodeURIComponent(String(v)));
      }
    }
    const url = new URL(urlPath, this.baseUrl);
    if (params.query) {
      for (const [k, v] of Object.entries(params.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      method: "${ep.method}",
      headers: {
        "accept": "application/json",
        ${hasBody ? '"content-type": "application/json",' : ""}
        ...this.defaultHeaders
      },
      ${hasBody ? "body: params.body !== undefined ? JSON.stringify(params.body) : undefined" : ""}
    });
    if (!res.ok) {
      throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
    }
    return res.json();
  }`;
    })
    .join("\n\n");

  return `// Auto-generated by UnAPI-MCP (${catalog.capturedAt})
export class ${className} {
  constructor(
    private readonly baseUrl: string = "${catalog.origin}",
    private readonly defaultHeaders: Record<string, string> = {}
  ) {}

${methods}
}
`;
}

export function generatePythonSdk(catalog: SiteCatalog): string {
  const className =
    catalog.siteName
      .split(/[^a-zA-Z0-9]/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("") + "Client";

  const methods = catalog.endpoints
    .map((ep) => {
      const hasBody = ["POST", "PUT", "PATCH"].includes(ep.method);
      return `    def ${ep.toolName}(self, path: dict | None = None, query: dict | None = None, body: dict | None = None) -> Any:
        """${ep.description}"""
        url_path = "${ep.pathPattern}"
        if path:
            for k, v in path.items():
                url_path = url_path.replace(f"{{{k}}}", urllib.parse.quote(str(v)))
        url = f"{self.base_url.rstrip('/')}{url_path}"
        if query:
            clean_q = {k: v for k, v in query.items() if v is not None}
            if clean_q:
                url += "?" + urllib.parse.urlencode(clean_q)
        data = json.dumps(body).encode("utf-8") if (${hasBody ? "True" : "False"} and body is not None) else None
        headers = {"Accept": "application/json", **self.headers}
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method="${ep.method}")
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))`;
    })
    .join("\n\n");

  return `# Auto-generated by UnAPI-MCP (${catalog.capturedAt})
import json
import urllib.parse
import urllib.request
from typing import Any


class ${className}:
    def __init__(self, base_url: str = "${catalog.origin}", headers: dict[str, str] | None = None):
        self.base_url = base_url
        self.headers = headers or {}

${methods}
`;
}
