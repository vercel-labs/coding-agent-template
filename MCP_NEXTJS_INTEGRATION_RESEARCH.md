# MCP Integration with Next.js - Research Report

**Research Date:** January 17, 2026
**Focus:** Vercel MCP Template Analysis & Integration Patterns

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Integration Steps for Next.js](#integration-steps-for-nextjs)
4. [Tool Registration Patterns](#tool-registration-patterns)
5. [Transport Mechanisms](#transport-mechanisms)
6. [Authentication & Authorization](#authentication--authorization)
7. [Query Parameter Authentication](#query-parameter-authentication)
8. [Configuration Options](#configuration-options)
9. [Best Practices for January 2026](#best-practices-for-january-2026)
10. [Production Deployment](#production-deployment)
11. [Sources](#sources)

---

## Architecture Overview

### What is MCP?

The **Model Context Protocol (MCP)** is an open standard that enables AI agents and coding assistants to interact with applications through a standardized interface. It provides:

- Real-time communication between AI models and applications
- Standardized tool registration and execution
- Multiple transport options (HTTP, SSE)
- OAuth-based authentication for secure access

### Vercel's MCP Ecosystem

Vercel provides two main MCP offerings:

1. **mcp-handler** - A library for building custom MCP servers in Next.js/Nuxt applications
2. **Vercel MCP** - Vercel's official remote MCP server at `https://mcp.vercel.com`

### Integration Models

**Built-in Development MCP (Next.js 16+)**
- Automatic endpoint at `/_next/mcp` in dev server
- No configuration required
- Provides development tools (errors, logs, routes, metadata)
- Uses `next-devtools-mcp` for agent connectivity

**Custom MCP Server (Any Next.js Version)**
- Uses `mcp-handler` package
- Deploy as Next.js API routes
- Full control over tools, authentication, and configuration
- Supports production deployment on Vercel

---

## Core Components

### Package Requirements

```bash
npm install mcp-handler @modelcontextprotocol/sdk@1.25.2 zod@^3
```

**Security Critical:** Versions of `@modelcontextprotocol/sdk` prior to 1.25.1 have a security vulnerability. Always use 1.25.2 or later.

**Node.js Requirement:** Version 18 or higher
**Framework Support:** Next.js 13+, Nuxt 3+

### File Structure

**Recommended Route Structure:**
```
app/
├── api/
│   └── [transport]/
│       └── route.ts          # Main MCP handler
├── .well-known/
│   ├── oauth-authorization-server/
│   │   └── route.ts          # OAuth metadata (optional)
│   └── oauth-protected-resource/
│       └── route.ts          # Resource metadata (optional)
```

**Alternative Structure:**
```
app/
├── mcp/
│   └── route.ts              # Simplified single endpoint
```

---

## Integration Steps for Next.js

### Step 1: Create Route Handler

Create `app/api/[transport]/route.ts`:

```typescript
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler(
  async (server) => {
    // Step 2: Register tools here (see Tool Registration section)
    server.registerTool(
      "example_tool",
      {
        title: "Example Tool",
        description: "A sample tool that echoes input",
        inputSchema: z.object({
          message: z.string().min(1).max(100),
        }),
      },
      async ({ message }) => ({
        content: [{ type: "text", text: `Echo: ${message}` }]
      })
    );
  },
  {}, // Capabilities object (optional)
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
    disableSse: false,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
```

### Step 2: Configure Environment Variables

Add to `.env.local`:

```bash
# Optional: For SSE transport with session persistence
REDIS_URL=redis://localhost:6379

# Optional: For production deployments on Vercel
VERCEL_TOKEN=your_vercel_token
```

### Step 3: Test Locally

```bash
# Start development server
npm run dev

# Test with MCP client
node scripts/test-client.mjs http://localhost:3000/api/mcp
```

### Step 4: Deploy to Vercel

**Requirements:**
- Enable **Fluid Compute** in Vercel project settings
- Set `maxDuration: 800` for Pro/Enterprise accounts
- Attach Redis for SSE transport (optional)

```bash
git add .
git commit -m "Add MCP server"
git push origin main
```

---

## Tool Registration Patterns

### Basic Tool Registration

```typescript
server.registerTool(
  "tool_name",           // Unique identifier
  {
    title: "Tool Title",
    description: "What this tool does",
    inputSchema: z.object({
      param1: z.string(),
      param2: z.number().optional(),
    }),
  },
  async (input) => {
    // Tool implementation
    return {
      content: [
        { type: "text", text: "Result text" }
      ]
    };
  }
);
```

### Tool with Multiple Content Types

```typescript
server.registerTool(
  "rich_response_tool",
  {
    title: "Rich Response Tool",
    description: "Returns multiple content types",
    inputSchema: z.object({
      query: z.string(),
    }),
  },
  async ({ query }) => {
    return {
      content: [
        { type: "text", text: `Query: ${query}` },
        { type: "text", text: "Additional context..." },
        // Future: Support for images, files, etc.
      ]
    };
  }
);
```

### Tool with Error Handling

```typescript
server.registerTool(
  "safe_tool",
  {
    title: "Safe Tool",
    description: "Tool with proper error handling",
    inputSchema: z.object({
      value: z.number().min(0),
    }),
  },
  async ({ value }) => {
    try {
      const result = await performOperation(value);
      return {
        content: [{ type: "text", text: `Success: ${result}` }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }
);
```

### Tool with User Context (Authenticated)

```typescript
server.registerTool(
  "user_specific_tool",
  {
    title: "User Specific Tool",
    description: "Access user-specific data",
    inputSchema: z.object({
      action: z.enum(["list", "create", "delete"]),
    }),
  },
  async ({ action }, { extra }) => {
    // Access auth info passed from middleware
    const authInfo = extra?.authInfo;
    const userId = authInfo?.clientId;

    if (!userId) {
      return {
        content: [{ type: "text", text: "Authentication required" }],
        isError: true
      };
    }

    // Perform user-specific operation
    const data = await getUserData(userId, action);
    return {
      content: [{ type: "text", text: JSON.stringify(data) }]
    };
  }
);
```

### Resource Registration (Alternative Pattern)

```typescript
server.registerResource(
  "resource_name",
  {
    uri: "resource://example/data",
    name: "Example Resource",
    description: "A static or dynamic resource",
    mimeType: "application/json",
  },
  async () => {
    return {
      contents: [
        {
          uri: "resource://example/data",
          mimeType: "application/json",
          text: JSON.stringify({ key: "value" })
        }
      ]
    };
  }
);
```

### Prompt Registration (Alternative Pattern)

```typescript
server.registerPrompt(
  "analysis_prompt",
  {
    name: "Code Analysis",
    description: "Analyze code quality and suggest improvements",
    arguments: [
      {
        name: "code",
        description: "Code to analyze",
        required: true
      }
    ]
  },
  async ({ code }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please analyze this code:\n\n${code}`
          }
        }
      ]
    };
  }
);
```

---

## Transport Mechanisms

### Streamable HTTP

**Default transport.** Direct connection for clients supporting the MCP protocol.

**Configuration:**
```typescript
{
  disableSse: true,  // Use HTTP only
  basePath: "/api",
}
```

**Client Connection (Claude Desktop):**
```json
{
  "mcpServers": {
    "my-server": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

**Benefits:**
- Simple setup
- No Redis dependency
- Works with most modern MCP clients
- Lower latency

**Limitations:**
- No session persistence
- No streaming updates

### Server-Sent Events (SSE)

**Advanced transport** with session persistence and real-time updates.

**Configuration:**
```typescript
{
  disableSse: false,           // Enable SSE
  redisUrl: process.env.REDIS_URL,  // Required for SSE
  maxDuration: 300,            // Session timeout (seconds)
  basePath: "/api",
}
```

**Requirements:**
- Redis database (local or cloud)
- Vercel Pro/Enterprise for production (higher `maxDuration`)

**Client Connection (stdio clients via mcp-remote):**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp"]
    }
  }
}
```

**Benefits:**
- Session persistence across disconnects
- Real-time streaming updates
- Better for long-running operations
- Supports stdio-only clients

**Limitations:**
- Requires Redis infrastructure
- More complex setup
- Higher resource usage

### Choosing a Transport

| Use Case | Recommended Transport |
|----------|----------------------|
| Simple tools, quick responses | Streamable HTTP |
| Long-running operations | SSE with Redis |
| Development/testing | Streamable HTTP |
| Production with high availability | SSE with Redis |
| stdio-only clients (older tools) | SSE + mcp-remote wrapper |
| Modern MCP clients (Claude, Cursor) | Streamable HTTP |

---

## Authentication & Authorization

### OAuth Authentication (Recommended)

**Why OAuth?** Eliminates plaintext credentials in config files and provides secure, standardized authentication.

#### Implementation with `withMcpAuth`

```typescript
import { createMcpHandler, withMcpAuth } from "mcp-handler";

const baseHandler = createMcpHandler(
  async (server) => {
    // Register tools
  },
  {},
  { basePath: "/api" }
);

// Wrap with authentication
const handler = withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    if (!bearerToken) {
      return undefined; // Unauthenticated
    }

    // Verify token (example: JWT)
    const { payload } = await jwtVerify(bearerToken, SECRET);
    const user = await getUserById(payload.sub);

    return {
      token: bearerToken,
      clientId: user.id,
      scopes: user.permissions || [],
      extra: { user }
    };
  },
  {
    required: true,              // Enforce authentication
    requiredScopes: ["read"],    // Optional scope requirements
  }
);

export { handler as GET, handler as POST, handler as DELETE };
```

#### OAuth Metadata Endpoints

Create `.well-known/oauth-authorization-server/route.ts`:

```typescript
import { protectedResourceHandler } from "mcp-handler";

export const GET = protectedResourceHandler({
  resource: process.env.NEXT_PUBLIC_MCP_URL || "http://localhost:3000/api/mcp",
  authorization_servers: [
    process.env.AUTH_ISSUER_URL || "https://auth.example.com"
  ]
});
```

Create `.well-known/oauth-protected-resource/route.ts`:

```typescript
import { metadataCorsOptionsRequestHandler } from "mcp-handler";

export const OPTIONS = metadataCorsOptionsRequestHandler();
```

### API Key Authentication (Simple)

**Use Case:** Simple authentication without OAuth complexity.

```typescript
import { experimental_withMcpAuth } from "mcp-handler";

const handler = experimental_withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    if (!bearerToken) {
      throw new Error("No API key provided");
    }

    // Validate API key against database
    const user = await getUserByApiKey(bearerToken);
    if (!user) {
      throw new Error("Invalid API key");
    }

    return {
      token: bearerToken,
      clientId: user.id,
      scopes: [],
      extra: { user }
    };
  },
  { required: true }
);
```

### Session-Based Authentication (Better Auth Example)

**Integration with Better Auth:**

```typescript
import { auth } from "@/lib/auth"; // Better Auth instance

const handler = experimental_withMcpAuth(
  baseHandler,
  async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session) {
      return undefined; // Unauthenticated
    }

    return {
      token: session.session.token,
      clientId: session.user.id,
      scopes: [],
      extra: {
        user: session.user,
        session: session.session
      }
    };
  },
  { required: true }
);
```

### Clerk Authentication Example

```typescript
import { auth } from "@clerk/nextjs";
import { verifyClerkToken } from "@clerk/mcp-tools";

const handler = withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    if (!bearerToken) {
      return undefined;
    }

    const tokenMetadata = await verifyClerkToken(bearerToken);
    const { userId } = await auth();

    if (!userId) {
      throw new Error("Unauthorized");
    }

    return {
      token: bearerToken,
      clientId: userId,
      scopes: tokenMetadata.scopes || [],
    };
  },
  { required: true }
);
```

### Optional Authentication Pattern

**Allow both authenticated and unauthenticated access:**

```typescript
const handler = experimental_withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    if (!bearerToken) {
      return undefined; // Allow unauthenticated
    }

    // Validate if token provided
    const user = await validateToken(bearerToken);
    if (!user) {
      return undefined;
    }

    return {
      token: bearerToken,
      clientId: user.id,
      scopes: user.permissions,
      extra: { user }
    };
  },
  { required: false } // Don't enforce authentication
);

// Tools check authentication individually
server.registerTool(
  "private_tool",
  { /* config */ },
  async (input, { extra }) => {
    if (!extra?.authInfo) {
      return {
        content: [{ type: "text", text: "Authentication required" }],
        isError: true
      };
    }
    // Proceed with authenticated logic
  }
);
```

---

## Query Parameter Authentication

### The Problem

MCP doesn't natively support query parameter authentication (e.g., `?apikey=123`). However, many APIs like Alpha Vantage use this pattern.

### Solution: Query Parameter to Header Transformation

#### Using API Gateway (Zuplo Pattern)

**Step 1: Configure API Gateway Policy**

Create a policy to transform query parameters to headers:

```json
{
  "policies": {
    "inbound": [
      {
        "name": "query-param-to-header",
        "policy-type": "@zuplo/query-param-to-header",
        "handler": {
          "export": "QueryParamToHeaderPolicy",
          "module": "$import(@zuplo/query-param-to-header)",
          "options": {
            "queryParam": "apikey",
            "headerName": "Authorization",
            "headerValue": "Bearer {value}"
          }
        }
      }
    ]
  }
}
```

**Step 2: Client Configuration**

```json
{
  "mcpServers": {
    "alpha-vantage-proxy": {
      "url": "https://my-gateway.zuplo.com/mcp?apikey=YOUR_API_KEY"
    }
  }
}
```

#### Using Next.js Middleware

**Create middleware to transform query params:**

Create `middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only apply to MCP routes
  if (!request.nextUrl.pathname.startsWith('/api/mcp')) {
    return NextResponse.next();
  }

  const apiKey = request.nextUrl.searchParams.get('apikey');

  if (apiKey) {
    // Clone request with new header
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('Authorization', `Bearer ${apiKey}`);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/mcp/:path*',
};
```

**Client Configuration:**

```json
{
  "mcpServers": {
    "my-server": {
      "url": "http://localhost:3000/api/mcp?apikey=YOUR_API_KEY"
    }
  }
}
```

#### Using Route Handler Parameter Extraction

**Direct query parameter validation:**

```typescript
import { createMcpHandler } from "mcp-handler";

const handler = async (req: Request) => {
  const url = new URL(req.url);
  const apiKey = url.searchParams.get('apikey');

  if (!apiKey) {
    return new Response('API key required', { status: 401 });
  }

  // Validate API key
  const user = await validateApiKey(apiKey);
  if (!user) {
    return new Response('Invalid API key', { status: 403 });
  }

  // Store user context for tools
  (req as any).mcpUser = user;

  return createMcpHandler(
    async (server) => {
      server.registerTool(
        "example",
        { /* config */ },
        async (input) => {
          const user = (req as any).mcpUser;
          // Use user context
        }
      );
    },
    {},
    { basePath: "/api" }
  )(req);
};

export { handler as GET, handler as POST, handler as DELETE };
```

### Best Practices for Query Parameter Auth

**Security Considerations:**
- Query parameters appear in logs - use HTTPS
- Prefer header-based auth for production
- Implement rate limiting
- Rotate keys regularly
- Use short-lived tokens when possible

**When to Use:**
- Integrating with legacy APIs
- Client doesn't support custom headers
- Rapid prototyping
- Internal tools with controlled access

**When to Avoid:**
- Production user-facing applications
- High-security requirements
- Compliance-regulated environments

---

## Configuration Options

### createMcpHandler Options

```typescript
interface McpHandlerConfig {
  // Redis connection for SSE transport
  redisUrl?: string;

  // Base path for MCP endpoints (must match route location)
  basePath?: string;

  // Maximum session duration in seconds
  // Default: 60, Vercel Pro/Enterprise: up to 800
  maxDuration?: number;

  // Enable verbose debug logging
  verboseLogs?: boolean;

  // Disable SSE transport (use HTTP only)
  disableSse?: boolean;
}
```

### Example Configurations

**Development:**
```typescript
{
  basePath: "/api",
  verboseLogs: true,
  disableSse: true,
  maxDuration: 60,
}
```

**Production (HTTP):**
```typescript
{
  basePath: "/api",
  verboseLogs: false,
  disableSse: true,
  maxDuration: 300,
}
```

**Production (SSE with Redis):**
```typescript
{
  redisUrl: process.env.REDIS_URL,
  basePath: "/api",
  verboseLogs: false,
  disableSse: false,
  maxDuration: 800, // Requires Vercel Pro/Enterprise
}
```

**Multi-tenant (Dynamic Paths):**
```typescript
// app/tenant/[tenantId]/[transport]/route.ts
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;

  return createMcpHandler(
    async (server) => {
      // Tenant-specific tools
    },
    {},
    {
      basePath: `/tenant/${tenantId}`,
      verboseLogs: process.env.NODE_ENV === 'development',
    }
  )(req);
}
```

---

## Best Practices for January 2026

### 1. Security

**Always Use Latest SDK Version:**
```bash
npm install @modelcontextprotocol/sdk@1.25.2
```
Earlier versions have known vulnerabilities.

**Implement Authentication:**
- Use OAuth for production applications
- Never store credentials in plaintext config files
- Implement proper token validation
- Use HTTPS in production

**Prevent Confused Deputy Attacks:**
- Require explicit user consent per client
- Validate client origins
- Implement CORS policies
- Use state parameters in OAuth flows

**Enable Human Confirmation:**
- For destructive operations, require user approval
- Implement audit logging
- Use read-only modes for untrusted clients

### 2. Performance

**Optimize Tool Execution:**
```typescript
server.registerTool(
  "fast_tool",
  { /* config */ },
  async (input) => {
    // Use caching
    const cached = await cache.get(input.key);
    if (cached) return cached;

    // Implement timeouts
    const result = await Promise.race([
      performOperation(input),
      timeout(5000)
    ]);

    await cache.set(input.key, result);
    return result;
  }
);
```

**Use Appropriate Transport:**
- HTTP for simple, fast tools
- SSE for long-running operations
- Configure `maxDuration` based on actual needs

**Enable Fluid Compute (Vercel):**
Required for production deployments to handle variable load.

### 3. Error Handling

**Return Structured Errors:**
```typescript
async (input) => {
  try {
    const result = await operation(input);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  } catch (error) {
    console.error('Operation failed:', error);
    return {
      content: [{
        type: "text",
        text: `Operation failed. Please try again.`
      }],
      isError: true
    };
  }
}
```

**Avoid Exposing Internal Details:**
- Log full errors server-side
- Return sanitized messages to clients
- Implement proper error codes

### 4. Input Validation

**Always Use Zod Schemas:**
```typescript
inputSchema: z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  role: z.enum(['admin', 'user', 'guest']),
  metadata: z.record(z.string()).optional(),
})
```

**Validate Against Business Logic:**
```typescript
async ({ userId, action }) => {
  // Schema validation (automatic via Zod)

  // Business logic validation
  const user = await getUser(userId);
  if (!user.canPerform(action)) {
    return {
      content: [{ type: "text", text: "Permission denied" }],
      isError: true
    };
  }

  // Proceed
}
```

### 5. Documentation

**Document Each Tool:**
```typescript
server.registerTool(
  "search_users",
  {
    title: "Search Users",
    description: "Search for users by name, email, or role. Returns up to 50 results. Requires 'read:users' permission.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Search query (name, email, or role)"),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum results to return"),
    }),
  },
  async ({ query, limit }) => {
    // Implementation
  }
);
```

### 6. Testing

**Local Testing Script:**
```javascript
// scripts/test-mcp.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHttpClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHttpClientTransport(
  new URL("http://localhost:3000/api/mcp")
);

const client = new Client(
  { name: "test-client", version: "1.0.0" },
  { capabilities: {} }
);

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log("Available tools:", tools);

// Call a tool
const result = await client.callTool({
  name: "example_tool",
  arguments: { message: "Hello, MCP!" }
});
console.log("Result:", result);

await client.close();
```

**Run Tests:**
```bash
node scripts/test-mcp.mjs
```

### 7. Monitoring

**Implement Logging:**
```typescript
import { logger } from '@/lib/logger';

server.registerTool(
  "monitored_tool",
  { /* config */ },
  async (input, { extra }) => {
    const startTime = Date.now();

    try {
      logger.info('Tool execution started', {
        tool: 'monitored_tool',
        userId: extra?.authInfo?.clientId
      });

      const result = await operation(input);

      logger.info('Tool execution succeeded', {
        tool: 'monitored_tool',
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('Tool execution failed', {
        tool: 'monitored_tool',
        error: error.message,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }
);
```

### 8. Deployment Checklist

- [ ] Update to SDK 1.25.2+
- [ ] Implement authentication (OAuth or API keys)
- [ ] Enable HTTPS
- [ ] Configure CORS policies
- [ ] Set appropriate `maxDuration`
- [ ] Enable Fluid Compute (Vercel)
- [ ] Attach Redis (if using SSE)
- [ ] Test with actual MCP clients
- [ ] Implement rate limiting
- [ ] Set up monitoring and logging
- [ ] Document available tools
- [ ] Configure error handling
- [ ] Review security settings

---

## Production Deployment

### Vercel Deployment

**Step 1: Configure Project**

Enable in Vercel dashboard:
- **Fluid Compute** (Project Settings → Functions)
- **Redis** (if using SSE) via Vercel Storage

**Step 2: Set Environment Variables**

```bash
# Vercel CLI
vercel env add REDIS_URL production
vercel env add AUTH_SECRET production
vercel env add NEXT_PUBLIC_MCP_URL production
```

Or via Vercel Dashboard → Settings → Environment Variables

**Step 3: Update Configuration**

```typescript
// app/api/[transport]/route.ts
const handler = createMcpHandler(
  async (server) => {
    // Register tools
  },
  {},
  {
    redisUrl: process.env.REDIS_URL,
    basePath: "/api",
    maxDuration: 800, // Pro/Enterprise only
    verboseLogs: false,
    disableSse: !process.env.REDIS_URL, // Auto-detect
  }
);
```

**Step 4: Deploy**

```bash
git push origin main
# or
vercel --prod
```

### Custom Domain Setup

**Add to client configuration:**
```json
{
  "mcpServers": {
    "production-server": {
      "url": "https://mcp.example.com/api/mcp"
    }
  }
}
```

### Monitoring Production

**Vercel Dashboard:**
- Functions → View execution logs
- Analytics → Track usage patterns
- Logs → Real-time request monitoring

**Custom Monitoring:**
```typescript
import { track } from '@vercel/analytics';

server.registerTool(
  "tracked_tool",
  { /* config */ },
  async (input, { extra }) => {
    track('mcp_tool_execution', {
      tool: 'tracked_tool',
      userId: extra?.authInfo?.clientId,
    });

    // Implementation
  }
);
```

---

## Sources

### Official Documentation
- [Next.js MCP Server Guide](https://nextjs.org/docs/app/guides/mcp)
- [Vercel MCP Documentation](https://vercel.com/docs/mcp/vercel-mcp)
- [GitHub: vercel/mcp-handler](https://github.com/vercel/mcp-handler)
- [GitHub: vercel-labs/mcp-for-next.js](https://github.com/vercel-labs/mcp-for-next.js)
- [npm: mcp-handler](https://www.npmjs.com/package/mcp-handler)

### Templates & Examples
- [Vercel MCP Template](https://vercel.com/templates/next.js/model-context-protocol-mcp-with-next-js)
- [MCP with Next.js and Descope](https://vercel.com/templates/authentication/mcp-with-next-js-and-descope)
- [GitHub: run-llama/mcp-nextjs](https://github.com/run-llama/mcp-nextjs)
- [GitHub: workos/vercel-mcp-example](https://github.com/workos/vercel-mcp-example)

### Authentication Guides
- [Clerk: Build MCP Server with Next.js](https://clerk.com/docs/nextjs/guides/development/mcp/build-mcp-server)
- [Neon: Solving MCP Authentication with Vercel & Better Auth](https://neon.com/blog/solving-mcp-with-vercel-and-better-auth)
- [Stytch: MCP Authentication and Authorization Guide](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)
- [Auth0: Introduction to MCP and Authorization](https://auth0.com/blog/an-introduction-to-mcp-and-authorization/)
- [WorkOS: Vercel MCP + WorkOS AuthKit Template](https://workos.com/blog/vercel-mcp-workos-authkit-template)

### Advanced Topics
- [Zuplo: MCP Server Handler Documentation](https://zuplo.com/docs/handlers/mcp-server)
- [AI SDK: MCP Tools Cookbook](https://ai-sdk.dev/cookbook/next/mcp-tools)
- [MintMCP: Build Enterprise AI Agents with Next.js](https://www.mintmcp.com/blog/mcp-build-enterprise-ai-agents)

### Development Tools
- [GitHub: vercel/next-devtools-mcp](https://github.com/vercel/next-devtools-mcp)
- [Clerk MCP Server Guide](https://skywork.ai/skypage/en/ultimate-guide-official-clerk-mcp-server/1977614154253930496)

---

## Appendix: Complete Working Example

```typescript
// app/api/[transport]/route.ts
import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUserByApiKey } from "@/lib/auth";

// Base handler with tools
const baseHandler = createMcpHandler(
  async (server) => {
    // Tool 1: Simple echo
    server.registerTool(
      "echo",
      {
        title: "Echo",
        description: "Echo a message back",
        inputSchema: z.object({
          message: z.string().min(1).max(500),
        }),
      },
      async ({ message }) => ({
        content: [{ type: "text", text: `Echo: ${message}` }]
      })
    );

    // Tool 2: Database query (authenticated)
    server.registerTool(
      "get_user_profile",
      {
        title: "Get User Profile",
        description: "Retrieve authenticated user's profile",
        inputSchema: z.object({
          includeStats: z.boolean().optional(),
        }),
      },
      async ({ includeStats }, { extra }) => {
        const userId = extra?.authInfo?.clientId;
        if (!userId) {
          return {
            content: [{ type: "text", text: "Authentication required" }],
            isError: true
          };
        }

        const profile = await db.users.findUnique({
          where: { id: userId },
          include: { stats: includeStats }
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(profile, null, 2)
          }]
        };
      }
    );
  },
  {},
  {
    redisUrl: process.env.REDIS_URL,
    basePath: "/api",
    maxDuration: process.env.NODE_ENV === 'production' ? 300 : 60,
    verboseLogs: process.env.NODE_ENV === 'development',
    disableSse: !process.env.REDIS_URL,
  }
);

// Wrap with authentication
const handler = experimental_withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    if (!bearerToken) {
      return undefined; // Allow unauthenticated for some tools
    }

    const user = await getUserByApiKey(bearerToken);
    if (!user) {
      throw new Error("Invalid API key");
    }

    return {
      token: bearerToken,
      clientId: user.id,
      scopes: user.permissions || [],
      extra: { user }
    };
  },
  { required: false } // Some tools allow unauthenticated access
);

export { handler as GET, handler as POST, handler as DELETE };
```

---

**End of Report**
