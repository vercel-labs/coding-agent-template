import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { PARALLEL_SEARCH_URL } from '../../lib/connectors/parallel-search'

type Mode = 'normal' | 'error' | 'timeout' | 'cancel' | 'disabled'
interface Tool {
  type: string
  name: string
  tools?: Tool[]
}
interface ModelRequest {
  tools: Tool[]
  input: unknown[]
}
interface McpRequest {
  method: string
  params?: { name?: string; arguments?: Record<string, unknown> }
  id?: number
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture has no TCP address')
  return `http://127.0.0.1:${address.port}`
}

// Real Codex process, deterministic model/MCP HTTP fixtures. The application's
// generated configuration and command are captured before substituting fixture URLs.
export async function runCodexMcp(config: string, command: { cmd: string; args: string[] }, mode: Mode, live = false) {
  const root = await mkdtemp(join(tmpdir(), 'coding-agent-mcp-'))
  const home = join(root, 'home')
  const project = join(root, 'project')
  const mcpRequests: Array<McpRequest & { userAgent?: string; url?: string }> = []
  const modelRequests: ModelRequest[] = []
  let cancel: (() => void) | undefined
  const mcp = createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405).end()
      return
    }
    let raw = ''
    for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw) as McpRequest
    mcpRequests.push({ ...body, userAgent: request.headers['user-agent'], url: request.url })
    if (body.id === undefined) {
      response.writeHead(202).end()
      return
    }
    if (body.method === 'tools/call' && mode === 'cancel') {
      cancel?.()
      return
    }
    if (body.method === 'tools/call' && mode === 'timeout') return
    const result =
      body.method === 'initialize'
        ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
        : body.method === 'tools/list'
          ? {
              tools: [
                {
                  name: 'web_search',
                  description: 'Search docs',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      objective: { type: 'string' },
                      search_queries: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['objective', 'search_queries'],
                  },
                },
                {
                  name: 'web_fetch',
                  description: 'Fetch docs',
                  inputSchema: {
                    type: 'object',
                    properties: { urls: { type: 'array', items: { type: 'string' } } },
                    required: ['urls'],
                  },
                },
              ],
            }
          : {
              isError: mode === 'error',
              content: [
                {
                  type: 'text',
                  text:
                    mode === 'error'
                      ? 'Fixture search unavailable'
                      : 'Fixture documentation https://example.org/docs: call configure() to initialize.',
                },
              ],
            }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
  })
  const mcpUrl = await listen(mcp)
  let turn = 0
  const sessionId = live && process.env.PARALLEL_TEST_SESSION_ID ? process.env.PARALLEL_TEST_SESSION_ID : randomUUID()
  const model = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw) as ModelRequest
    modelRequests.push(body)
    const namespace = body.tools.find((tool) => tool.type === 'namespace' && tool.name.includes('parallel'))
    const flat = body.tools.find((tool) => tool.name?.includes('web_search'))
    const quota = live && /quota|rate.limit|usage.limit/i.test(JSON.stringify(body.input))
    const shouldCall = !quota && mode !== 'disabled' && turn < (mode === 'normal' ? 3 : 1)
    const name = turn === 1 && mode === 'normal' ? 'web_fetch' : 'web_search'
    const item = shouldCall
      ? {
          id: `fc_${turn}`,
          type: 'function_call',
          namespace: namespace?.name,
          name: namespace ? name : flat?.name,
          call_id: `call_${turn}`,
          arguments: JSON.stringify({
            ...(name === 'web_fetch'
              ? { urls: [live ? 'https://vercel.com/docs/vercel-sandbox' : 'https://example.org/docs'] }
              : {
                  objective: 'Find official Vercel Sandbox documentation',
                  search_queries: ['Vercel Sandbox documentation'],
                }),
            ...(live ? { session_id: sessionId } : {}),
          }),
          status: 'completed',
        }
      : {
          id: 'msg_final',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: live
                ? `Received Parallel tool output: ${JSON.stringify(body.input).slice(-1200)}`
                : mode === 'normal'
                  ? 'Use configure() per https://example.org/docs'
                  : 'Search unavailable; no alternate provider was used.',
              annotations: [],
            },
          ],
        }
    turn++
    const result = {
      id: `resp_${turn}`,
      object: 'response',
      status: 'completed',
      output: [item],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const event of [
      { type: 'response.created', response: { ...result, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: result },
    ])
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    response.end()
  })
  const modelUrl = await listen(model)
  try {
    await mkdir(join(home, '.codex'), { recursive: true })
    await mkdir(project)
    execFileSync('git', ['init', '-q', project])
    // Inference and search are separate. A dummy model key is never sent to MCP.
    const fixtureConfig = parseToml(
      config
        .replace('https://api.openai.com/v1', modelUrl)
        .replace('https://ai-gateway.vercel.sh/codex/v1', modelUrl)
        .replace(PARALLEL_SEARCH_URL, live ? PARALLEL_SEARCH_URL : `${mcpUrl}/mcp`),
    )
    const servers = fixtureConfig.mcp_servers as Record<string, Record<string, unknown>>
    servers['parallel-search'].tool_timeout_sec = live ? 30 : 1
    if (mode === 'disabled') servers['parallel-search'].enabled = false
    await writeFile(join(home, '.codex/config.toml'), stringifyToml(fixtureConfig))
    const binary = process.env.CODEX_BIN!
    const args = command.args.map((arg) =>
      arg.replaceAll('/vercel/sandbox/project', project).replaceAll('/home/vercel-sandbox', home),
    )
    const result = await new Promise<{ code: number; output: string; error: string }>((resolve, reject) => {
      const child = spawn(command.cmd, args, {
        cwd: project,
        detached: true,
        env: {
          PATH: `${dirname(binary)}:${process.env.PATH}`,
          HOME: home,
          CODEX_HOME: join(home, '.codex'),
          CI: 'true',
          NODE_ENV: 'test',
          ...(live
            ? {
                HTTPS_PROXY: process.env.HTTPS_PROXY,
                HTTP_PROXY: process.env.HTTP_PROXY,
                ALL_PROXY: process.env.ALL_PROXY,
                NO_PROXY: '127.0.0.1,localhost',
              }
            : {}),
        },
      })
      let output = ''
      let error = ''
      const stop = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch {
            /* Process group already exited. */
          }
        }
      }
      cancel = stop
      const timer = setTimeout(stop, live ? 45000 : 20000)
      child.stdin.end()
      child.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        error += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        clearTimeout(timer)
        stop()
        resolve({ code: code ?? 1, output, error })
      })
    })
    if (live && process.env.PARALLEL_TEST_EVIDENCE)
      await writeFile(
        process.env.PARALLEL_TEST_EVIDENCE,
        JSON.stringify({ ...result, sessionId, mcpRequests, modelRequests }, null, 2),
      )
    return { ...result, mcpRequests, modelRequests }
  } finally {
    model.closeAllConnections()
    mcp.closeAllConnections()
    await Promise.all([
      new Promise<void>((resolve) => model.close(() => resolve())),
      new Promise<void>((resolve) => mcp.close(() => resolve())),
    ])
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
