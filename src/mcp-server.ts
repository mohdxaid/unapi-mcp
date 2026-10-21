import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SiteCatalog, SynthesizedEndpoint } from "./types.js";

export function getCatalogDir(): string {
  const dir = path.join(os.homedir(), ".unapi-mcp", "catalogs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadAllCatalogs(customCatalogPath?: string): SiteCatalog[] {
  if (customCatalogPath) {
    const raw = fs.readFileSync(customCatalogPath, "utf8");
    return [JSON.parse(raw) as SiteCatalog];
  }
  const dir = getCatalogDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    return JSON.parse(raw) as SiteCatalog;
  });
}

export async function startMcpServer(customCatalogPath?: string): Promise<void> {
  const server = new Server(
    {
      name: "unapi-mcp",
      version: "0.2.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  const resolveToolMap = (): Map<string, { catalog: SiteCatalog; endpoint: SynthesizedEndpoint }> => {
    const catalogs = loadAllCatalogs(customCatalogPath);
    const map = new Map<string, { catalog: SiteCatalog; endpoint: SynthesizedEndpoint }>();
    for (const catalog of catalogs) {
      for (const ep of catalog.endpoints) {
        const fullToolName = `${catalog.siteName}_${ep.toolName}`.replace(/[^a-zA-Z0-9_]/g, "_");
        map.set(fullToolName, { catalog, endpoint: ep });
      }
    }
    return map;
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolMap = resolveToolMap();
    const tools = Array.from(toolMap.entries()).map(([name, { endpoint }]) => {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      if (endpoint.pathParams.length > 0) {
        const pathProps: Record<string, unknown> = {};
        for (const p of endpoint.pathParams) {
          pathProps[p] = { type: "string", description: `Path parameter {${p}}` };
        }
        properties.pathParams = {
          type: "object",
          properties: pathProps,
          required: endpoint.pathParams
        };
        required.push("pathParams");
      }

      if (Object.keys(endpoint.queryParams).length > 0) {
        properties.queryParams = {
          type: "object",
          properties: endpoint.queryParams,
          description: "Optional URL query parameters"
        };
      }

      if (["POST", "PUT", "PATCH"].includes(endpoint.method)) {
        properties.body = endpoint.requestSchema || {
          type: "object",
          description: "JSON request body"
        };
      }

      properties.headers = {
        type: "object",
        description: "Optional additional HTTP headers (e.g. Authorization or Cookie override)"
      };

      return {
        name,
        description: `${endpoint.description} [${endpoint.method} ${endpoint.origin}${endpoint.pathPattern}]`,
        inputSchema: {
          type: "object",
          properties,
          required
        }
      };
    });

    tools.push({
      name: "unapi_list_sites",
      description: "List all reverse-engineered website APIs, auth token chains, and security findings loaded in UnAPI-MCP",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    });

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    if (name === "unapi_list_sites") {
      const catalogs = loadAllCatalogs(customCatalogPath);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              catalogs.map((c) => ({
                siteName: c.siteName,
                origin: c.origin,
                capturedAt: c.capturedAt,
                endpointCount: c.endpoints.length,
                tokenChainCount: c.tokenChain?.length || 0,
                securityFindingsCount: c.securityFindings?.length || 0
              })),
              null,
              2
            )
          }
        ]
      };
    }

    const toolMap = resolveToolMap();
    const entry = toolMap.get(name);
    if (!entry) {
      throw new Error(`Unknown UnAPI-MCP tool: ${name}`);
    }

    const { catalog, endpoint } = entry;
    const typedArgs = args as {
      pathParams?: Record<string, string | number>;
      queryParams?: Record<string, string | number | boolean>;
      body?: unknown;
      headers?: Record<string, string>;
    };

    let urlPath = endpoint.pathPattern;
    if (typedArgs.pathParams) {
      for (const [k, v] of Object.entries(typedArgs.pathParams)) {
        urlPath = urlPath.replace(`{${k}}`, encodeURIComponent(String(v)));
      }
    }

    const targetUrl = new URL(urlPath, endpoint.origin);
    if (typedArgs.queryParams) {
      for (const [k, v] of Object.entries(typedArgs.queryParams)) {
        if (v !== undefined && v !== null) {
          targetUrl.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      ...endpoint.requestHeaders,
      ...(catalog.authHints?.headers || {}),
      ...(typedArgs.headers || {})
    };

    if (endpoint.auth.envVarName && process.env[endpoint.auth.envVarName]) {
      const envVal = process.env[endpoint.auth.envVarName]!;
      if (endpoint.auth.type === "bearer") {
        headers["authorization"] = envVal.startsWith("Bearer ") ? envVal : `Bearer ${envVal}`;
      } else if (endpoint.auth.headerName) {
        headers[endpoint.auth.headerName] = envVal;
      } else if (endpoint.auth.type === "cookie") {
        headers["cookie"] = envVal;
      }
    }

    const startTime = performance.now();
    const response = await fetch(targetUrl.toString(), {
      method: endpoint.method,
      headers,
      body:
        typedArgs.body !== undefined && ["POST", "PUT", "PATCH"].includes(endpoint.method)
          ? JSON.stringify(typedArgs.body)
          : undefined
    });
    const elapsedMs = Math.round(performance.now() - startTime);
    const rawText = await response.text();

    let formattedBody: unknown = rawText;
    try {
      formattedBody = JSON.parse(rawText);
    } catch {
      // Leave as text
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: response.status,
              elapsedMs,
              url: targetUrl.toString(),
              data: formattedBody
            },
            null,
            2
          )
        }
      ]
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
