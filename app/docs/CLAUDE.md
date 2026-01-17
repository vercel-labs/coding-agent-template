# app/docs - Documentation Pages

Renders static markdown documentation as web pages. Converts `.md` files from `docs/` directory to interactive pages with syntax highlighting and table of contents.

## Domain Purpose
Serve platform documentation via web UI: MCP server setup, API integration guides, feature documentation. Markdown content sourced from `docs/` directory, rendered with React components.

## Pages

### MCP Server Documentation (`mcp-server/page.tsx`)
- **URL**: `/docs/mcp-server`
- **Source**: `docs/MCP_SERVER.md`
- **Content**: MCP authentication, tool reference, client setup (Claude Desktop, Cursor, Windsurf)
- **Features**: Markdown rendering, GitHub Flavored Markdown (GFM) support, raw HTML passthrough

## Implementation Pattern

```typescript
// Read markdown at build/request time
const markdownPath = join(process.cwd(), 'docs', 'MCP_SERVER.md')
const markdownContent = readFileSync(markdownPath, 'utf-8')

// Render with React Markdown
<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
  {markdownContent}
</ReactMarkdown>
```

## Rendering Plugins

### remarkGfm
- Enables GitHub Flavored Markdown: tables, strikethrough, task lists
- Syntax: `| col1 | col2 |`, `~~strikethrough~~`, `- [x] task`

### rehypeRaw
- Allows raw HTML in markdown (for custom HTML blocks)
- Use with caution (XSS risk mitigation via Content Security Policy)

## Styling

### Prose Classes (Tailwind)
```typescript
<article className="prose prose-slate dark:prose-invert max-w-none">
```

- `prose` - Tailwind typography styles
- `prose-slate` - Light mode color scheme
- `dark:prose-invert` - Dark mode inversion
- `max-w-none` - Full container width

### Container
```typescript
<div className="container mx-auto px-4 py-8 max-w-4xl">
```

- Centered container with responsive padding
- Max width 4xl (56rem) for readability

## Metadata

```typescript
export const metadata = {
  title: 'MCP Server Documentation',
  description: 'Model Context Protocol server documentation for the AA Coding Agent platform',
}
```

- Auto-generated page title and meta description
- Improves SEO and browser tab clarity

## Adding New Documentation Pages

### Step 1: Create Markdown File
Create `docs/NEW_FEATURE.md` with content.

### Step 2: Create Page Component
```typescript
// app/docs/new-feature/page.tsx
import { readFileSync } from 'fs'
import { join } from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

export const metadata = {
  title: 'New Feature Documentation',
  description: 'Documentation for new feature',
}

export default function NewFeaturePage() {
  const markdownPath = join(process.cwd(), 'docs', 'NEW_FEATURE.md')
  const markdownContent = readFileSync(markdownPath, 'utf-8')

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <article className="prose prose-slate dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {markdownContent}
        </ReactMarkdown>
      </article>
    </div>
  )
}
```

### Step 3: Index in Documentation
Add link to new page in navigation/index (if applicable).

## File Reading Behavior

- **Timing**: `readFileSync` executes at build time (production) or request time (development)
- **Caching**: Content cached by Next.js static generation if page is static
- **Updates**: Changes to `.md` files require rebuild in production

## Markdown Content Guidelines

- Use standard Markdown + GFM syntax
- Include headers (H1, H2, H3) for structure
- Code blocks with language spec: \`\`\`typescript
- Links: relative (`../path`) or absolute (http://)
- Tables: GFM format `| header |`

## Error Handling

- File not found: Next.js throws `ENOENT` error
- Handled gracefully with 500 error page in production
- Check file path in both dev and build environments

## Security Notes

- `readFileSync` is safe (reads from codebase only)
- `rehypeRaw` allows HTML - sanitize user-generated markdown if added
- No dynamic content injection (file paths hardcoded)

## Performance

- Static rendering: Markdown parsed once, cached by Next.js
- Build-time: Files must exist when building for production
- Development: Hot reload works but requires file changes

## Integration Points

- **Markdown files**: `docs/*.md` directory
- **React Markdown**: `react-markdown` npm package
- **Styling**: Tailwind prose classes
- **Navigation**: Link from main nav or docs index page

## Examples

### MCP Server Page
- Comprehensive guide: 200+ lines
- Includes code examples, authentication methods, client setup
- Rendered at `/docs/mcp-server`

### Adding Code Snippets
\`\`\`typescript
const example = 'code block with language'
\`\`\`

### Tables
| Feature | Status |
|---------|--------|
| MCP     | ✓      |

### Task Lists
- [x] Completed
- [ ] Pending
