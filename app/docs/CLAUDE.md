# app/docs

Renders static markdown files from `docs/` directory as web pages using React Markdown with GFM support.

## Domain Purpose
- Serve platform documentation via web UI (setup guides, API references)
- Read markdown at build/request time via `readFileSync`
- Support GitHub Flavored Markdown (tables, strikethrough, task lists)

## Local Patterns
- **File-based routing**: `app/docs/[slug]/page.tsx` reads corresponding `docs/[SLUG].md`
- **Metadata template**: Export `metadata` object with title and description
- **Prose styling**: Container `max-w-4xl`, article with Tailwind `prose` classes and `dark:prose-invert`

## Rendering Plugins
- `remarkGfm` - GitHub Flavored Markdown (tables, strikethrough, task lists)
- `rehypeRaw` - Allow raw HTML (sanitized by CSP)

## Adding New Pages
1. Create `docs/NEW_FEATURE.md` with markdown content
2. Create `app/docs/new-feature/page.tsx` with:
   ```typescript
   const metadata = { title, description }
   const markdownPath = join(process.cwd(), 'docs', 'NEW_FEATURE.md')
   const content = readFileSync(markdownPath, 'utf-8')
   return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
   ```
3. Link from navigation

## Integration Points
- **Markdown files**: `docs/*.md` directory
- **React Markdown**: `react-markdown` npm package
- **Styling**: Tailwind `prose` + `prose-slate` + `dark:prose-invert`

## Performance
- Static rendering; cached by Next.js
- Build-time: Markdown files must exist when building
- Production: Changes require rebuild
