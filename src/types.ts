export interface CapturedExchange {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody?: string;
  mimeType: string;
  resourceType?: string;
}

export interface InferredSchema {
  type: string;
  properties?: Record<string, InferredSchema>;
  items?: InferredSchema;
  required?: string[];
  example?: unknown;
}

export interface AuthRequirement {
  type: "bearer" | "header" | "cookie" | "none";
  headerName?: string;
  cookieNames?: string[];
  envVarName: string;
}

export interface TokenDependencyLink {
  tokenPreview: string;
  sourceEndpointId: string;
  sourceToolName: string;
  sourceJsonPath: string;
  targetEndpointId: string;
  targetToolName: string;
  targetLocation: string;
}

export interface SecurityFinding {
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: "PII_EXPOSURE" | "UNAUTHENTICATED_MUTATION" | "TOKEN_IN_URL" | "EXCESSIVE_DATA" | "CORS_WILDCARD";
  endpointId: string;
  toolName: string;
  detail: string;
}

export interface SynthesizedEndpoint {
  id: string;
  toolName: string;
  method: string;
  origin: string;
  pathPattern: string;
  sampleUrl: string;
  description: string;
  pathParams: string[];
  queryParams: Record<string, InferredSchema>;
  requestHeaders: Record<string, string>;
  auth: AuthRequirement;
  isGraphQL: boolean;
  graphqlOperationName?: string;
  requestSchema?: InferredSchema;
  responseSchema?: InferredSchema;
  sampleStatus: number;
  sampleResponseBody?: unknown;
}

export interface SiteCatalog {
  siteName: string;
  origin: string;
  capturedAt: string;
  endpoints: SynthesizedEndpoint[];
  tokenChain: TokenDependencyLink[];
  securityFindings: SecurityFinding[];
  authHints: {
    headers: Record<string, string>;
    cookies: string[];
  };
}
