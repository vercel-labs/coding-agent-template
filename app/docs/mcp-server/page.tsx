import { readFileSync } from 'fs'
import { join } from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

export const metadata = {
  title: 'MCP Server Documentation',
  description: 'Model Context Protocol server documentation for the AA Coding Agent platform',
}

export default function McpServerDocsPage() {
  // Read markdown content from docs folder
  const markdownPath = join(process.cwd(), 'docs', 'MCP_SERVER.md')
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
