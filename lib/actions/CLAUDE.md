# Actions Module

## Domain Purpose
Next.js Server Actions: form-based CRUD operations with session validation, Zod validation, encryption, and cache revalidation.

## Module Boundaries
- **Owns**: Form data parsing, validation, DB mutations, encrypted storage, response formatting
- **Delegates to**: `lib/crypto.ts` for encryption, `lib/db/` for mutations, `lib/session/` for auth, `revalidatePath()` for cache busting

## Local Patterns
- **FormState Pattern**: `{ success, message, errors }` returned to client for form state management
- **Encryption**: OAuth secrets, environment variables stored encrypted before DB insertion
- **Validation Chain**: Session check → Form data extraction → Zod parse → Encrypt → DB insert
- **JSON Parsing**: Handle optional JSON fields (env vars); wrap in try/catch
- **User Scoping**: All mutations filter by `session.user.id`
- **Cache Revalidation**: Call `revalidatePath()` after mutations to clear Next.js cache

## Integration Points
- `components/` forms call Server Actions via `<form action={}>`
- `lib/db/schema.ts` - Connector/key table mutations
- `app/` routes - Cache revalidation targets

## Key Files
- `connectors.ts` - MCP connector CRUD with encrypted env vars and OAuth secrets
