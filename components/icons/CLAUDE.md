# Icons (MCP Servers)

## Domain Purpose
SVG icon components for MCP server types: Browserbase, Context7, Convex, Figma, GitHub, HuggingFace, Linear, Notion, Orbis, Playwright, Supabase, Vercel.

## Module Boundaries
- **Owns**: Icon SVG definitions, color/size props, named exports
- **Delegates to**: Nothing (pure presentation layer)
- **Parent handles**: Layout and context via manage-connectors.tsx

## Local Patterns
- **File Structure**: One icon per file (kebab-case.tsx)
- **Export Style**: `export default` unnamed SVG component
- **Props**: Accept `className` for Tailwind styling (size, color via utility classes)
- **SVG Attributes**: Hardcoded `viewBox`, `fill`, `stroke` from original logos
- **Naming Convention**: `[Service]Icon` export default; imported as `import XyzIcon from '@/components/icons/xyz-icon'`

## Integration Points
- `components/connectors/manage-connectors.tsx` - Renders icon based on connector type
- `lib/db/schema.ts` - Connector types map to icon components
- Jotai atoms for connector dialog state

## Key Files
- 12 icon component files (5-15 lines each)
- Used in manage-connectors dropdown for visual connector identification
- All use SVG `viewBox="0 0 32 32"` or similar (consistent sizing)
