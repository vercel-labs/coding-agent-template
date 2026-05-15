import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app', 'lib']
const LOGGER_METHODS = ['info', 'error', 'success', 'command', 'updateStatus', 'updateProgress']

function walk(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walk(fullPath))
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      files.push(fullPath)
    }
  }

  return files
}

function callArguments(source: string, start: number): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null

  for (let i = start; i < source.length; i++) {
    const char = source[i]
    const previous = source[i - 1]

    if (quote) {
      if (char === quote && previous !== '\\') quote = null
      current += char
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      current += char
      continue
    }

    if (char === '(') {
      depth++
      current += char
      continue
    }
    if (char === ')') {
      if (depth === 0) {
        if (current.trim()) args.push(current.trim())
        return args
      }
      depth--
      current += char
      continue
    }
    if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) args.push(current.trim())
  return args
}

function isStringLiteral(argument: string | undefined): boolean {
  return !!argument && (argument.startsWith("'") || argument.startsWith('"'))
}

const violations: string[] = []

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8')
    for (const method of LOGGER_METHODS) {
      const pattern = new RegExp(`logger\\.${method}\\(`, 'g')
      for (const match of source.matchAll(pattern)) {
        const args = callArguments(source, (match.index ?? 0) + match[0].length)
        const messageArg = method === 'updateProgress' ? args[1] : args[0]
        if (!isStringLiteral(messageArg)) {
          violations.push(`${file}: logger.${method} uses a non-literal message argument`)
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  process.exit(1)
}
