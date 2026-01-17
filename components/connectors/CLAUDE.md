# Connectors Components

## Domain Purpose
UI for MCP connector management: CRUD operations, preset server selection, environment variable configuration, OAuth credential handling.

## Module Boundaries
- **Owns**: Connector dialog UI, form validation, accordion state, icon display
- **Delegates to**: `lib/actions/connectors.ts` for mutations, `lib/db/schema.ts` for Connector type, icon components for rendering

## Local Patterns
- **Dialog States**: View (add/edit/list), state tracking via Jotai atom
- **Accordion**: Preset servers collapsed/expanded for selection (Browserbase, Context7, Convex, Figma, HuggingFace, Linear, Notion, Orbis, Playwright, Supabase)
- **Env Vars**: Two-column input: key/value pairs, encrypted before storage
- **OAuth Flow**: Separate view for services requiring OAuth token configuration
- **Icon Mapping**: Icon component selected based on `connector.type` string

## Integration Points
- `app/api/connectors/route.ts` - POST/PUT/DELETE mutations
- `components/connectors-provider.tsx` - Context for managing connector list state
- `components/task-form.tsx` - Shows "Configure MCP Servers" button to open dialog
- Jotai atoms: `connectorDialogViewAtom`, `selectedConnectorIdAtom`

## Key Files
- `manage-connectors.tsx` - Main dialog with 400+ lines covering all CRUD views
- Dialog flow: Add → Select Preset → Configure Env/OAuth → Submit
- Real-time form validation for required fields
