# Agent Logos

## Domain Purpose
SVG logo components for AI agents: Claude, Codex, Copilot, Cursor, Gemini, OpenCode.

## Module Boundaries
- **Owns**: Agent brand logos as reusable SVG components
- **Delegates to**: Nothing (pure presentation layer)
- **Parent handles**: Agent selection UI via task-form.tsx

## Local Patterns
- **File Structure**: One logo per agent (claude.tsx, codex.tsx, cursor.tsx, etc.)
- **Export Style**: `export default` unnamed SVG component
- **Props**: Accept `className` for size/styling (h-5 w-5, h-6 w-6, etc.)
- **SVG Format**: Hardcoded brand colors and viewBox from official brand assets
- **Index Export**: index.ts re-exports all 6 logos for centralized import

## Integration Points
- `components/task-form.tsx` - Renders in agent selector dropdown and button displays
- `CODING_AGENTS` constant maps logo to agent selection
- Responsive sizing: mobile (smaller) vs desktop (larger)

## Key Files
- `claude.tsx`, `codex.tsx`, `copilot.tsx`, `cursor.tsx`, `gemini.tsx`, `opencode.tsx`
- `index.ts` - Central export: `export { default as Claude } from './claude'` etc.
- Each logo is 5-20 lines of pure SVG
