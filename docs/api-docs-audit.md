# API Documentation Audit Report

**Date**: January 20, 2026
**Status**: COMPREHENSIVE REVIEW COMPLETE
**Focus**: AI_MODELS_AND_KEYS.md, MCP_SERVER.md, API key handling, MCP implementation

---

## Executive Summary

The API documentation is **largely accurate** but contains **several critical inconsistencies** and **missing important details**. The implementation in the codebase generally aligns with documented behavior, but documentation needs updates in:

1. **MCP library version reference** - Docs reference v1.0.7 inconsistently
2. **API key retrieval function signatures** - Documentation shows outdated parameter handling
3. **GET endpoint response format** - API returns full encrypted values; docs don't reflect this clearly
4. **MiniMax model missing** from OpenCode in AI_MODELS_AND_KEYS.md
5. **Missing DeepSeek model** documentation in some sections
6. **Provider terminology inconsistency** - "Mi.com / Zhipu AI" vs "Z.ai / Zhipu AI"
7. **Session module path references** need verification

---

## Documentation Coverage Assessment

### Comprehensive (Well-Documented)
- ✅ Claude agent authentication (dual Anthropic API + AI Gateway)
- ✅ Available models for all 6 agents
- ✅ MCP server setup and client configuration
- ✅ MCP tool schemas and input/output formats
- ✅ Encryption at rest (AES-256-GCM)
- ✅ Rate limiting (20/day default, 100/day admin)
- ✅ External API token authentication
- ✅ User-scoped data access patterns

### Partially Documented (Needs Updates)
- ⚠️ API key retrieval flow (`getUserApiKey`, `getUserApiKeys`)
- ⚠️ API token hashing and lookup mechanism
- ⚠️ GET endpoint decryption behavior
- ⚠️ DeepSeek and MiniMax model support consistency

### Incomplete (Missing Details)
- ❌ No documentation of DELETE endpoint for API key removal
- ❌ Missing `GET /api/api-keys/check` endpoint details
- ❌ Dual-auth fallback priority not clearly explained (Bearer → Session)
- ❌ No error response examples for API key endpoints
- ❌ MCP tool handler signatures not fully documented

---

## Detailed Findings

### 1. AI_MODELS_AND_KEYS.md Issues

#### Issue 1.1: OpenCode Model List Incomplete
**Location**: Lines 378-409
**Finding**: Documentation lists available models but **missing MiniMax and DeepSeek**

**Code Reality** (components/task-form.tsx, lines 129-148):
```typescript
const opencode: [
  // Z.ai / Zhipu AI (New)
  { value: 'glm-4.7', label: 'GLM-4.7 (Coding Flagship)' },
  // MiniMax (updated 2026) ← MISSING FROM DOCS
  { value: 'minimax/minimax-m2.1', label: 'MiniMax-M2.1' },
  // DeepSeek (updated 2026) ← MISSING FROM DOCS
  { value: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek-V3.2' },
  // ... more models ...
]
```

**Severity**: Medium - Documentation incomplete for OpenCode agent

#### Issue 1.2: Provider Terminology Inconsistency
**Location**: Multiple lines (81, 88, 130, 186, etc.)
**Finding**: Documentation uses "Z.ai / Zhipu AI" inconsistently, and confuses with "Mi.com"

**Code Reality**:
- Line 87 in task-form.tsx: `// Z.ai / Xiaomi` (not Mi.com)
- AI_MODELS_AND_KEYS.md line 81: `// Mi.com / Zhipu AI` (incorrect)

**Severity**: Low - Cosmetic inconsistency but confusing

#### Issue 1.3: getUserApiKey() Function Signature Outdated
**Location**: Lines 69-103
**Finding**: Documentation shows old function signature without `userId` parameter support

**Code Reality** (lib/api-keys/user-keys.ts, lines 132-169):
```typescript
export async function getUserApiKey(provider: Provider, userId?: string): Promise<string | undefined> {
  // userId is optional parameter for API token auth
  // Falls back to session if not provided
  let effectiveUserId: string | undefined = userId
  if (!effectiveUserId) {
    const session = await getServerSession()
    effectiveUserId = session?.user?.id
  }
  // ...
}
```

**Documentation Shows** (lines 72-103):
```typescript
export async function getUserApiKey(provider: Provider): Promise<string | undefined> {
  const session = await getServerSession()
  // ...
}
```

**Severity**: High - Function signature is incorrect; dual-auth support missing

#### Issue 1.4: getUserApiKeys() Function Signature Outdated
**Location**: Lines 65-112
**Finding**: Documentation shows function without `userId` parameter

**Code Reality** (lib/api-keys/user-keys.ts, lines 85-113):
```typescript
export async function getUserApiKeys(userId?: string): Promise<{...}> {
  // userId parameter for API token auth
  if (userId) {
    return _fetchKeysFromDatabase(userId)
  }
  const session = await getServerSession()
  // ...
}
```

**Severity**: High - Dual-auth capability not documented

#### Issue 1.5: API Response Format Discrepancy - GET /api/api-keys
**Location**: Lines 440-466 in AI_MODELS_AND_KEYS.md
**Finding**: Documentation shows GET response without decrypted values

**Code Reality** (app/api/api-keys/route.ts, lines 19-37):
```typescript
const decryptedKeys = userKeys.map((key) => ({
  ...key,
  value: decrypt(key.value), // VALUES ARE DECRYPTED!
}))

return NextResponse.json({
  success: true,
  apiKeys: decryptedKeys, // Includes decrypted values
})
```

**Documentation Shows** (line 453):
```json
{
  "success": true,
  "apiKeys": [
    { "provider": "anthropic", "createdAt": "2024-01-15T10:30:00Z" },
    // No "value" field shown!
    { "provider": "openai", "createdAt": "2024-01-15T10:31:00Z" }
  ]
}
```

**Severity**: High - Response format is incorrect

**Important Note**: The GET endpoint DECRYPTS and returns full API key values. This is unusual from a security perspective but matches current implementation. Documentation should clarify this security implication.

#### Issue 1.6: Missing API Key Deletion Endpoint Documentation
**Location**: No documentation of DELETE endpoint
**Finding**: AI_MODELS_AND_KEYS.md doesn't document the DELETE route

**Code Reality** (app/api/api-keys/route.ts, lines 98-120):
```typescript
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const provider = searchParams.get('provider') as Provider
  // Deletes key for provider
  await db.delete(keys).where(and(eq(keys.userId, session.user.id), eq(keys.provider, provider)))
  return NextResponse.json({ success: true })
}
```

**Severity**: Medium - Feature exists but not documented

#### Issue 1.7: Session Module Path References
**Location**: Lines 71, 72 in AI_MODELS_AND_KEYS.md
**Finding**: References `lib/session/get-server-session.ts` - need to verify path

**Code Reality**: ✅ CORRECT - File exists at `lib/session/get-server-session.ts`

**Severity**: None - Path is correct

---

### 2. MCP_SERVER.md Issues

#### Issue 2.1: mcp-handler Version Reference Inconsistency
**Location**: Line 33
**Finding**: Documentation states "mcp-handler 1.0.7 with experimental auth middleware"

**Code Reality** (package.json, line 59):
```json
"mcp-handler": "^1.0.7"
```

**Documentation Claims** (MCP_SERVER.md, line 33):
```
Implementation: Uses `mcp-handler` package for MCP protocol support
```

**MCP_NEXTJS_INTEGRATION_RESEARCH.md** states (lines 39-40):
```
1. **mcp-handler** - A library for building custom MCP servers in Next.js/Nuxt applications
```

**Severity**: Low - Version is correct but documentation could be clearer

#### Issue 2.2: Authentication Flow Not Fully Clear
**Location**: Lines 64-87
**Finding**: Documentation shows two auth methods but doesn't explain priority/precedence

**Code Reality** (app/api/mcp/route.ts, lines 151-163):
```typescript
const handler = experimental_withMcpAuth(
  baseHandler,
  async (request, bearerToken) => {
    // Middleware has already transformed ?apikey=xxx to Authorization: Bearer xxx
    if (!bearerToken) {
      return undefined
    }
    const user = await getAuthFromRequest(request as NextRequest)
    // ...
  },
)
```

**Key Missing Detail**: Query param `?apikey=XXX` is automatically transformed to `Authorization: Bearer XXX` by the auth middleware. Documentation doesn't explain this.

**Severity**: Medium - Unclear how query param authentication works

#### Issue 2.3: MCP Tool Handler Implementations Not Fully Documented
**Location**: Sections on individual tools (lines 90-338)
**Finding**: Schemas are documented but handler logic not explained

**Missing Details**:
- `create-task` handler verifies GitHub connection (lib/mcp/tools/create-task.ts, lines 77-93)
- `create-task` handler checks rate limits (lines 56-75)
- `create-task` handler validates input via schema (lines 117-149)
- All handlers return MCP-compliant response format

**Severity**: Low - Implementation details; schema documentation is sufficient for users

#### Issue 2.4: Task Status Values Not Documented
**Location**: Lines 207-213
**Finding**: "pending" and "stopped" status values documented but creation flow suggests "pending" → "processing"

**Code Reality** (lib/mcp/tools/create-task.ts, lines 119-126):
```typescript
validatedData = insertTaskSchema.parse({
  ...input,
  status: 'pending', // Tasks start in pending status
  progress: 0,
  logs: [],
})
```

**Then** (after creation), task is triggered to process. Status becomes "processing" during execution.

**Documentation States** (line 150):
```
"status": "processing",
```

**Conflict**: Documentation shows task response with "processing" status but code shows "pending" at creation. This depends on when `get-task` is called.

**Severity**: Low - Behavior is correct but timing is unclear

#### Issue 2.5: Error Response Format Inconsistency
**Location**: Lines 443-452
**Finding**: Documentation shows error responses in different formats

**Examples from MCP_SERVER.md**:
- Lines 458-468: `{ "content": [{ "type": "text", "text": "..." }], "isError": true }`
- Lines 475-482: Nested JSON inside text field: `{ "error": "...", "message": "..." }`

**Code Reality** (lib/mcp/tools/create-task.ts, lines 22-34):
```typescript
return {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        error: 'Authentication required',
        message: '...',
        hint: '...',
      }),
    },
  ],
  isError: true,
}
```

**Pattern**: Error details are JSON-stringified inside the text field

**Severity**: Low - Documentation is accurate but could explain the double-JSON pattern

---

### 3. API Token Authentication Issues

#### Issue 3.1: Token Hashing and Lookup Documentation
**Location**: AI_MODELS_AND_KEYS.md has no section on API tokens
**Finding**: Token mechanism not documented in API_MODELS_AND_KEYS.md

**Code Reality** (lib/auth/api-token.ts):
- `generateApiToken()`: Creates random 32-byte hex, hashes immediately (SHA256)
- `hashToken()`: SHA256 hash of raw token
- `getAuthFromRequest()`: Hashes incoming token, compares with DB hash
- Raw token never stored; shown once at creation

**Severity**: Medium - Important security mechanism not documented in primary API docs

#### Issue 3.2: Dual-Auth Fallback Priority
**Location**: Not clearly documented in either file
**Finding**: Bearer token → Session cookie fallback not explicitly stated

**Code Reality** (lib/auth/api-token.ts, lines 19-60):
```typescript
export async function getAuthFromRequest(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    // Bearer token takes priority
    const token = authHeader.slice(7)
    const hash = hashToken(token)
    // ... lookup and validate ...
    return user
  }

  // Fallback to session
  const session = await getServerSession()
  // ...
}
```

**Documentation**: MCP_SERVER.md mentions both methods but doesn't explain precedence

**Severity**: Low - Users won't be affected but developers should know the priority

---

### 4. GET /api/api-keys/check Endpoint Missing Documentation

#### Issue 4.1: Check Endpoint Not Documented
**Location**: No documentation found
**Finding**: API has a check endpoint not documented

**Code Reality**: Route exists in git diff at `app/api/api-keys/check/route.ts` (in git status)

**Expected Behavior**: Likely checks if API keys are available for given provider

**Severity**: Medium - Feature exists but not documented

---

### 5. Consistency Issues Across Documentation

#### Issue 5.1: Provider Enum Consistency
**Locations**: Multiple files

**AI_MODELS_AND_KEYS.md** (line 35):
```
enum: ['anthropic', 'openai', 'cursor', 'gemini', 'aigateway']
```

**Code Reality** (lib/api-keys/user-keys.ts, line 9):
```typescript
type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'
```

**Code Reality** (app/api/api-keys/route.ts, line 9):
```typescript
type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway'
```

**All Match**: ✅ CORRECT

**Severity**: None

#### Issue 5.2: Model Lists Synchronization
**Status**: Claude, Codex, Copilot, Cursor, Gemini models documented match code ✅
**Status**: OpenCode models **INCOMPLETE** in docs ❌
**Status**: No mention of alternative models (MiniMax, DeepSeek) in other agent sections

**Severity**: Medium - OpenCode model list is incomplete

---

## Missing Critical Documentation

### 1. Error Handling Examples for API Key Endpoints
- Missing: Error responses for invalid provider, missing required fields, encryption failures
- Impact: Developers don't know how to handle failures

### 2. Rate Limiting Details for API Key Management
- Missing: Whether API key operations count against rate limit
- Code Evidence: `checkRateLimit()` called in task creation but no clear documentation of what operations are rate-limited

### 3. MCP Tool Handler Authorization Details
- Missing: How user scoping is enforced in MCP tools
- Code Evidence: Tools filter by `userId` from token context

### 4. API Key Encryption Key Management
- Missing: How `ENCRYPTION_KEY` environment variable is handled
- Impact: Important for security but not documented

### 5. Token Expiration and lastUsedAt Tracking
- Missing: Documentation of token expiration behavior
- Code Evidence: `expiresAt` and `lastUsedAt` fields in apiTokens table

---

## Verification Results

### Source of Truth Files Checked ✅
1. **lib/api-keys/user-keys.ts** - API key retrieval logic
   - getUserApiKeys() ✅ Signature verified
   - getUserApiKey() ✅ Signature verified
   - _fetchKeysFromDatabase() ✅ Private helper confirmed

2. **lib/auth/api-token.ts** - Token authentication
   - getAuthFromRequest() ✅ Dual-auth implementation confirmed
   - generateApiToken() ✅ 32-byte random + SHA256 hash confirmed
   - hashToken() ✅ SHA256 algorithm confirmed

3. **app/api/api-keys/route.ts** - API key endpoints
   - GET endpoint ✅ Decrypts values (critical finding)
   - POST endpoint ✅ Upsert pattern confirmed
   - DELETE endpoint ✅ Exists but not documented

4. **app/api/mcp/route.ts** - MCP server implementation
   - Authentication middleware ✅ experimental_withMcpAuth confirmed
   - Tool registration ✅ 5 tools confirmed
   - Transport ✅ HTTP with disableSse: true confirmed

5. **lib/mcp/schemas.ts** - Tool schemas
   - All 5 schemas ✅ Match documentation

6. **lib/mcp/tools/create-task.ts** - Create task handler
   - GitHub verification ✅ Confirmed (lines 77-93)
   - Rate limiting ✅ Confirmed (lines 56-75)
   - Input validation ✅ Confirmed (lines 117-149)

7. **components/task-form.tsx** - Model lists
   - Claude models ✅ All documented
   - Codex models ✅ All documented
   - OpenCode models ❌ Missing MiniMax and DeepSeek in docs
   - Copilot, Cursor, Gemini ✅ All documented

8. **package.json** - Dependencies
   - mcp-handler: ^1.0.7 ✅ Version confirmed

---

## Recommendations

### High Priority (Fix Immediately)

1. **Update getUserApiKey() and getUserApiKeys() function signatures**
   - Add userId parameter documentation
   - Document dual-auth (session + API token) behavior
   - Show examples for both modes

2. **Correct GET /api/api-keys response format**
   - Document that values ARE decrypted in response
   - Add security warning about returning plaintext keys
   - Clarify when keys are encrypted (at rest) vs decrypted (on retrieval)

3. **Document DELETE /api/api-keys endpoint**
   - Add full endpoint documentation
   - Include request/response examples
   - Explain query parameter format

4. **Complete OpenCode model list in AI_MODELS_AND_KEYS.md**
   - Add MiniMax-M2.1
   - Add DeepSeek-V3.2
   - Ensure consistency with task-form.tsx

### Medium Priority (Update Documentation)

5. **Clarify MCP authentication flow**
   - Document query param → Bearer token transformation
   - Explain auth middleware behavior
   - Show precedence order (Bearer → Session)

6. **Add GET /api/api-keys/check endpoint documentation**
   - Explain purpose and use case
   - Document request/response format
   - Add examples

7. **Document API key operation rate limiting**
   - Clarify what operations count toward rate limit
   - Explain if API key management endpoints are rate-limited

8. **Add error response examples for API key endpoints**
   - 401 Unauthorized
   - 400 Invalid Provider
   - 500 Encryption/Decryption Failures

### Low Priority (Enhancement)

9. **Standardize provider terminology**
   - Choose "Z.ai / Zhipu AI" or "Zhipu AI" consistently
   - Fix "Mi.com" → "Xiaomi" terminology
   - Update all references

10. **Add token security best practices section**
    - Document token lifecycle (creation, expiration, revocation)
    - Explain SHA256 hashing and why raw tokens aren't recoverable
    - Best practices for token rotation

11. **Document MCP handler signatures**
    - Add type definitions for McpToolContext, McpToolHandler
    - Document context.extra.authInfo structure
    - Show how to access userId in custom tools

---

## Summary Table

| Issue | File | Line(s) | Severity | Status |
|-------|------|---------|----------|--------|
| OpenCode models incomplete | AI_MODELS_AND_KEYS.md | 378-409 | Medium | INACCURATE |
| getUserApiKey() signature wrong | AI_MODELS_AND_KEYS.md | 72-103 | High | INACCURATE |
| getUserApiKeys() signature wrong | AI_MODELS_AND_KEYS.md | 69-112 | High | INACCURATE |
| GET response format wrong | AI_MODELS_AND_KEYS.md | 440-478 | High | INACCURATE |
| DELETE endpoint missing | AI_MODELS_AND_KEYS.md | N/A | Medium | MISSING |
| /api/api-keys/check missing | Both | N/A | Medium | MISSING |
| Auth priority not clear | MCP_SERVER.md | 64-87 | Medium | UNCLEAR |
| Provider terminology | AI_MODELS_AND_KEYS.md | Multiple | Low | INCONSISTENT |
| Token hashing not documented | Both | N/A | Medium | MISSING |
| Error responses not shown | Both | N/A | Low | INCOMPLETE |

---

## Code Quality Observations

### Strengths
- Encryption implementation is solid (AES-256-GCM)
- User-scoped access control is consistent
- Dual-auth implementation is well-structured
- Rate limiting integration is comprehensive
- MCP tool registration is clean and maintainable

### Areas for Documentation Improvement
- API contract clarity (function signatures, response formats)
- Security implications (plaintext key return vs encryption at rest)
- Authentication flow details (query param transformation, priority)
- Error handling patterns (what developers should expect)

---

## Conclusion

The API documentation is **functionally accurate for most scenarios** but has **critical inaccuracies in function signatures and API response formats**. The documentation needs immediate updates to:

1. Fix function signatures for dual-auth support
2. Correct API response format documentation
3. Document missing endpoints
4. Complete OpenCode model list
5. Clarify authentication flows

Once these are updated, the documentation will be a reliable source of truth for developers using this platform's APIs.
