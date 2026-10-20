import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { writeMcpConfiguration } from '../lib/sandbox/mcp-config'
import { writeCodexConfiguration } from '../lib/sandbox/codex-config'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { Writable } from 'node:stream'
import type { Sandbox } from '@vercel/sandbox'
import type { Connector } from '../lib/db/schema'
import type { TaskLogger } from '../lib/utils/task-logger'
import { PARALLEL_SEARCH_URL, parallelSearchHeaders } from '../lib/connectors/parallel-search'
import { executeCodexInSandbox } from '../lib/sandbox/agents/codex'
import { executeClaudeInSandbox, installClaudeCLI } from '../lib/sandbox/agents/claude'
import { executeCopilotInSandbox } from '../lib/sandbox/agents/copilot'
import { executeCursorInSandbox } from '../lib/sandbox/agents/cursor'
import { executeGeminiInSandbox } from '../lib/sandbox/agents/gemini'
import { executeOpenCodeInSandbox } from '../lib/sandbox/agents/opencode'
import { executeAgentInSandbox } from '../lib/sandbox/agents'

const keys = [
  'AI_GATEWAY_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'CURSOR_API_KEY',
  'GH_TOKEN',
]
const previousKeys = keys.map((key) => process.env[key])
for (const key of keys) process.env[key] = 'sk-fixture-only'
after(() =>
  keys.forEach((key, index) => {
    if (previousKeys[index] === undefined) delete process.env[key]
    else process.env[key] = previousKeys[index]
  }),
)

export const connector: Connector = {
  id: 'parallel-fixture',
  userId: 'user-fixture',
  name: 'Parallel Search',
  description: null,
  type: 'remote',
  baseUrl: PARALLEL_SEARCH_URL,
  oauthClientId: null,
  oauthClientSecret: null,
  command: null,
  env: null,
  status: 'connected',
  createdAt: new Date(),
  updatedAt: new Date(),
}

interface Command {
  cmd: string
  args?: string[]
  stdout?: Writable
}

export function sandboxFixture(
  onExecution?: (
    command: string,
    raw: { cmd: string; args: string[] },
  ) => Promise<{ code: number; output: string; error: string }>,
) {
  const commands: string[] = []
  const configs: string[] = []
  const writes: string[][] = []
  const runCommand = async (input: string | Command, args: string[] = []) => {
    const command =
      typeof input === 'string' ? [input, ...args].join(' ') : [input.cmd, ...(input.args || [])].join(' ')
    commands.push(command)
    const config = command.match(/<< 'EOF'\n([\s\S]*?)\n?EOF/)
    if (config) configs.push(config[1])
    if (typeof input === 'string' && input === 'node' && args[0] === '-e') {
      if (args[1].includes('const [config,pending,owned]')) configs.push(args[2])
      else if (!args[1].includes('read(file),read(marker)')) {
        configs.push(args.at(-1)!)
        writes.push(args)
      }
    }
    let code = 0
    let output = command.includes('which') ? 'claude codex copilot cursor-agent gemini opencode' : ''
    let error = ''
    if (typeof input === 'string' && input === 'node' && args[1]?.includes('read(file),read(marker)'))
      output = JSON.stringify({ config: null, ownership: null })
    if (command.includes('codex exec') || command.includes('codex resume')) {
      if (onExecution)
        ({ code, output, error } = await onExecution(
          command,
          typeof input === 'string' ? { cmd: input, args } : { cmd: input.cmd, args: input.args || [] },
        ))
      else output = 'Documentation found at https://example.org/docs'
    }
    if (typeof input !== 'string' && input.stdout) {
      if (command.includes('claude')) throw new Error('Fixture stopped after command dispatch')
      input.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 'fixture' }))
    }
    return { exitCode: code, stdout: async () => output, stderr: async () => error }
  }
  return { sandbox: { runCommand } as unknown as Sandbox, commands, configs, writes }
}

export function loggerFixture() {
  const logs: string[] = []
  const record = async (message: string) => {
    logs.push(message)
  }
  return { logger: { info: record, command: record, error: record, success: record } as unknown as TaskLogger, logs }
}

test('project headers identify only the official HTTPS MCP endpoint', () => {
  assert.deepEqual(parallelSearchHeaders(PARALLEL_SEARCH_URL), { 'User-Agent': 'coding-agent-template/2.0.0' })
  assert.deepEqual(parallelSearchHeaders(`${PARALLEL_SEARCH_URL}/`), parallelSearchHeaders(PARALLEL_SEARCH_URL))
  for (const url of [
    null,
    '',
    'invalid',
    'http://search.parallel.ai/mcp',
    'https://search.parallel.ai.evil/mcp',
    'https://example.org/mcp',
    'https://search.parallel.ai/other',
  ]) {
    assert.deepEqual(parallelSearchHeaders(url), {})
  }
})

test('each adapter dispatches its configured endpoint and project User-Agent', async () => {
  for (const execute of [
    executeCodexInSandbox,
    executeCopilotInSandbox,
    executeCursorInSandbox,
    executeGeminiInSandbox,
    executeOpenCodeInSandbox,
  ]) {
    const fixture = sandboxFixture()
    const { logger } = loggerFixture()
    const result = await execute(fixture.sandbox, 'Read the documentation', logger, undefined, [connector])
    assert.equal(result.success, true, `${execute.name}: ${result.error}`)
    const config = fixture.configs.join('\n')
    assert.ok(config.includes(PARALLEL_SEARCH_URL), execute.name)
    assert.ok(config.includes('User-Agent'), execute.name)
    assert.ok(config.includes('coding-agent-template/2.0.0'), execute.name)
    assert.ok(!config.includes('Authorization'), execute.name)
    fixture.configs.length = 0
    await execute(fixture.sandbox, 'Continue without search', logger, undefined, [], true)
    assert.ok(fixture.configs.length > 0, `${execute.name} refreshes an empty selection`)
    assert.ok(!fixture.configs.join('\n').includes(PARALLEL_SEARCH_URL), execute.name)
  }
})

test('Claude scopes Parallel to each execution and does not persist its credentials or log them', async () => {
  const fixture = sandboxFixture()
  const { logger, logs } = loggerFixture()
  const custom = { ...connector, name: 'Custom Search', oauthClientSecret: 'fixture-connector-secret' }
  await installClaudeCLI(fixture.sandbox, logger, undefined, [custom])
  assert.ok(!fixture.commands.some((command) => command.includes('claude mcp add')))
  await executeClaudeInSandbox(fixture.sandbox, 'Find documentation', logger, undefined, [custom])
  const dispatch = fixture.commands.find((command) => command.includes('--mcp-config'))
  assert.ok(dispatch?.includes(PARALLEL_SEARCH_URL))
  assert.ok(dispatch?.includes('coding-agent-template/2.0.0'))
  assert.ok(dispatch?.includes('fixture-connector-secret'))
  assert.ok(logs.every((message) => !message.includes('fixture-connector-secret')))
  fixture.commands.length = 0
  await executeClaudeInSandbox(fixture.sandbox, 'Continue without search', logger, undefined, [], true)
  assert.ok(!fixture.commands.some((command) => command.includes('--mcp-config')))
})

test('custom servers, credentials and explicit empty selections are preserved without fallback', async () => {
  const fixture = sandboxFixture()
  const { logger } = loggerFixture()
  const custom = {
    ...connector,
    name: 'My Search',
    baseUrl: 'https://example.org/mcp',
    oauthClientSecret: 'fixture-secret',
  }
  await executeCodexInSandbox(fixture.sandbox, 'Find docs', logger, undefined, [custom])
  assert.ok(fixture.configs[0].includes(custom.baseUrl))
  assert.ok(fixture.configs[0].includes(custom.oauthClientSecret))
  assert.ok(!fixture.configs[0].includes(PARALLEL_SEARCH_URL))
  assert.ok(!fixture.configs[0].includes('User-Agent'))
  const failure = sandboxFixture(async () => ({ code: 1, output: '', error: 'MCP request failed' }))
  const result = await executeCodexInSandbox(failure.sandbox, 'Find docs', logger, undefined, [custom])
  assert.equal(result.success, false)
  assert.ok(!failure.configs.join('\n').includes(PARALLEL_SEARCH_URL))
  const cancelled = sandboxFixture()
  const cancellation = await executeAgentInSandbox(
    cancelled.sandbox,
    'Find docs',
    'codex',
    logger,
    undefined,
    [connector],
    async () => true,
  )
  assert.equal(cancellation.success, false)
  assert.equal(cancelled.commands.length, 0)
})

test(
  'new-user default, current-user resolver, disable/delete, repeat login and linked accounts',
  { skip: !process.env.PARALLEL_TEST_DATABASE_URL },
  async () => {
    process.env.POSTGRES_URL = process.env.PARALLEL_TEST_DATABASE_URL
    const { db } = await import('../lib/db/client')
    const { users, connectors, accounts } = await import('../lib/db/schema')
    const { upsertUser } = await import('../lib/db/users')
    const { getConnectedConnectors } = await import('../lib/db/connectors')
    const { eq } = await import('drizzle-orm')
    const identity = randomUUID()
    const data = {
      provider: 'vercel' as const,
      externalId: identity,
      username: 'fixture',
      accessToken: 'encrypted-fixture',
    }
    let userId: string | undefined
    let secondId: string | undefined
    try {
      userId = await upsertUser(data)
      const selected = await getConnectedConnectors(userId)
      assert.equal(selected.length, 1)
      assert.equal(selected[0].baseUrl, PARALLEL_SEARCH_URL)
      assert.equal(selected[0].oauthClientSecret, null)
      secondId = await upsertUser({ ...data, externalId: randomUUID() })
      assert.notEqual((await getConnectedConnectors(secondId))[0].id, selected[0].id)
      await db.update(connectors).set({ status: 'disconnected' }).where(eq(connectors.id, selected[0].id))
      assert.equal((await getConnectedConnectors(userId)).length, 0)
      assert.equal(await upsertUser(data), userId)
      assert.equal((await getConnectedConnectors(userId)).length, 0)
      await db.delete(connectors).where(eq(connectors.id, selected[0].id))
      assert.equal(await upsertUser(data), userId)
      assert.equal((await getConnectedConnectors(userId)).length, 0)
      await db.insert(accounts).values({
        id: randomUUID(),
        userId,
        provider: 'github',
        externalUserId: identity,
        accessToken: 'encrypted-fixture',
        username: 'fixture',
      })
      assert.equal(await upsertUser({ ...data, provider: 'github' }), userId)
      assert.equal((await getConnectedConnectors(userId)).length, 0)
    } finally {
      if (userId) await db.delete(users).where(eq(users.id, userId))
      if (secondId) await db.delete(users).where(eq(users.id, secondId))
      await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end()
    }
  },
)

test(
  'real Codex consumes search/fetch, surfaces errors/timeouts, and honors disable/cancellation',
  { skip: !process.env.CODEX_BIN, timeout: 120000 },
  async () => {
    const { runCodexMcp } = await import('./fixtures/codex-mcp')
    for (const mode of ['normal', 'normal', 'error', 'timeout', 'cancel', 'disabled'] as const) {
      process.env.AI_GATEWAY_API_KEY =
        mode === 'normal' && process.env.AI_GATEWAY_API_KEY?.startsWith('sk-') ? 'vck_fixture' : 'sk-fixture-only'
      let receipt: Awaited<ReturnType<typeof runCodexMcp>> | undefined
      const fixture = sandboxFixture(async (_command, raw) => {
        const config = fixture.configs.at(-1)!
        assert.ok(config.includes(`url = "${PARALLEL_SEARCH_URL}"`))
        receipt = await runCodexMcp(config, raw, mode)
        return receipt
      })
      const { logger } = loggerFixture()
      const result = await executeCodexInSandbox(
        fixture.sandbox,
        'Find current configuration documentation',
        logger,
        'gpt-5',
        [connector],
      )
      assert.ok(receipt, mode)
      if (mode === 'cancel') {
        assert.equal(result.success, false)
        continue
      }
      assert.equal(result.success, true, `${mode}: ${receipt.error}`)
      if (mode === 'disabled') {
        assert.equal(receipt.mcpRequests.length, 0)
        continue
      }
      assert.ok(receipt.mcpRequests.some((request) => request.method === 'initialize'))
      assert.ok(receipt.mcpRequests.some((request) => request.method === 'tools/list'))
      const calls = receipt.mcpRequests.filter((request) => request.method === 'tools/call')
      assert.deepEqual(
        calls.map((request) => request.params?.name),
        mode === 'normal' ? ['web_search', 'web_fetch', 'web_search'] : ['web_search'],
      )
      assert.ok(
        receipt.mcpRequests.every(
          (request) => request.userAgent === 'coding-agent-template/2.0.0' && request.url === '/mcp',
        ),
      )
      const consumed = JSON.stringify(receipt.modelRequests.at(-1)?.input)
      assert.ok(
        consumed.includes(
          mode === 'normal' ? 'configure()' : mode === 'error' ? 'Fixture search unavailable' : 'timed out',
        ),
        consumed,
      )
      if (mode === 'normal') assert.ok(result.agentResponse?.includes('https://example.org/docs'))
    }
  },
)

test('MCP refresh preserves native settings, manual disable choices and invalid existing files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-settings-'))
  const location = join(directory, 'settings.json')
  const native = { url: 'https://native.example/mcp', headers: { Authorization: 'fixture-native-secret' } }
  const defaultServer = { url: PARALLEL_SEARCH_URL, headers: parallelSearchHeaders(PARALLEL_SEARCH_URL) }
  const execute = promisify(execFile)
  const localSandbox = {
    runCommand: async (cmd: string, args: string[]) => {
      try {
        const result = await execute(cmd, args)
        return { exitCode: 0, stdout: async () => result.stdout, stderr: async () => result.stderr }
      } catch {
        return { exitCode: 1, stdout: async () => '', stderr: async () => '' }
      }
    },
  } as unknown as Sandbox
  try {
    for (const field of ['mcpServers', 'mcp'] as const) {
      const original = { permissions: { network: 'ask' }, model: 'saved-model', [field]: { native } }
      await writeFile(location, JSON.stringify(original))
      await rm(`${location}.coding-agent-template.json`, { force: true })
      const config = { [field]: { 'parallel-search': defaultServer } }
      assert.equal((await writeMcpConfiguration(localSandbox, location, config, field)).success, true)
      let saved = JSON.parse(await readFile(location, 'utf8'))
      assert.deepEqual(saved.permissions, original.permissions)
      assert.deepEqual(saved[field].native, native)
      assert.equal(saved[field]['parallel-search'].url, PARALLEL_SEARCH_URL)
      assert.equal((await writeMcpConfiguration(localSandbox, location, { [field]: {} }, field)).success, true)
      saved = JSON.parse(await readFile(location, 'utf8'))
      assert.deepEqual(saved, original)
      await writeMcpConfiguration(localSandbox, location, config, field)
      saved = JSON.parse(await readFile(location, 'utf8'))
      saved[field]['parallel-search'].enabled = false
      await writeFile(location, JSON.stringify(saved))
      await writeMcpConfiguration(localSandbox, location, { [field]: {} }, field)
      await writeMcpConfiguration(localSandbox, location, config, field)
      assert.deepEqual(JSON.parse(await readFile(location, 'utf8')), saved)
    }
    await writeFile(location, 'invalid existing configuration')
    assert.equal(
      (await writeMcpConfiguration(localSandbox, location, { mcpServers: { 'parallel-search': defaultServer } }))
        .success,
      false,
    )
    assert.equal(await readFile(location, 'utf8'), 'invalid existing configuration')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a local Claude connector can retain a remote URL without losing its command', async () => {
  const fixture = sandboxFixture()
  const { logger } = loggerFixture()
  await installClaudeCLI(fixture.sandbox, logger, undefined, [
    { ...connector, type: 'local', command: 'npx fixture-mcp' },
  ])
  assert.ok(
    fixture.commands.some((command) => command.includes('claude mcp add') && command.includes('npx fixture-mcp')),
  )
})

test(
  'OpenCode discovers MCP from the adapter global path and respects a manual disable',
  { skip: !process.env.OPENCODE_BIN, timeout: 60000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-mcp-'))
    const requests: Array<{ method: string; userAgent?: string }> = []
    const server = createServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.writeHead(405).end()
        return
      }
      let raw = ''
      for await (const chunk of request) raw += chunk
      const body = JSON.parse(raw)
      requests.push({ method: body.method, userAgent: request.headers['user-agent'] })
      if (body.id === undefined) {
        response.writeHead(202).end()
        return
      }
      const result =
        body.method === 'initialize'
          ? {
              protocolVersion: body.params.protocolVersion,
              capabilities: { tools: {} },
              serverInfo: { name: 'fixture', version: '1' },
            }
          : { tools: [] }
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const fixture = sandboxFixture()
    const { logger } = loggerFixture()
    await executeOpenCodeInSandbox(fixture.sandbox, 'Read docs', logger, undefined, [connector])
    const write = fixture.writes[0]
    assert.equal(write[2], '~/.config/opencode/opencode.json')
    assert.ok(write[4].includes(PARALLEL_SEARCH_URL))
    const args = [...write]
    args[4] = args[4].replace(PARALLEL_SEARCH_URL, `http://127.0.0.1:${address.port}/mcp`)
    const env = {
      PATH: process.env.PATH,
      HOME: home,
      NODE_ENV: 'test' as const,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_DATA_HOME: join(home, '.local/share'),
      XDG_CACHE_HOME: join(home, '.cache'),
      OPENCODE_DISABLE_MODELS_FETCH: 'true',
      OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
    }
    const execute = promisify(execFile)
    try {
      await execute('node', args, { env })
      const result = await execute(process.env.OPENCODE_BIN!, ['mcp', 'list'], { env, cwd: home, timeout: 20000 })
      assert.ok(/connected/i.test(result.stdout), result.stdout + result.stderr)
      assert.ok(requests.some((request) => request.method === 'initialize'))
      assert.ok(requests.every((request) => request.userAgent === 'coding-agent-template/2.0.0'))
      const location = join(home, '.config/opencode/opencode.json')
      const config = JSON.parse(await readFile(location, 'utf8'))
      config.mcp['parallel-search'].enabled = false
      await writeFile(location, JSON.stringify(config))
      const count = requests.length
      await execute('node', args, { env })
      await execute(process.env.OPENCODE_BIN!, ['mcp', 'list'], { env, cwd: home, timeout: 20000 })
      assert.equal(requests.length, count)
      assert.equal(JSON.parse(await readFile(location, 'utf8')).mcp['parallel-search'].enabled, false)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    }
  },
)

test('Codex adapter refresh preserves native disables, MCP entries and unrelated TOML settings', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-settings-'))
  let fixture = sandboxFixture()
  const execute = promisify(execFile)
  const runCommand = async (input: string | { cmd: string; args: string[] }, args: string[] = []) => {
    if (input === 'node') {
      try {
        const result = await execute('node', args, { env: { PATH: process.env.PATH, HOME: home, NODE_ENV: 'test' } })
        return { exitCode: 0, stdout: async () => result.stdout, stderr: async () => result.stderr }
      } catch {
        return { exitCode: 1, stdout: async () => '', stderr: async () => '' }
      }
    }
    return typeof input === 'string' ? fixture.sandbox.runCommand(input, args) : fixture.sandbox.runCommand(input)
  }
  const sandbox = { runCommand } as unknown as Sandbox
  const { logger } = loggerFixture()
  const secondary = { ...connector, name: 'Secondary Search' }
  try {
    const first = await executeCodexInSandbox(sandbox, 'Find docs', logger, 'gpt-5', [connector, secondary])
    assert.equal(first.success, true)
    const location = join(home, '.codex/config.toml')
    const saved = parseToml(await readFile(location, 'utf8'))
    const servers = saved.mcp_servers as Record<string, Record<string, unknown>>
    servers['parallel-search'].enabled = false
    servers.native = { url: 'https://native.example/mcp', enabled: false }
    saved.web_search = 'disabled'
    saved.approval_policy = 'untrusted'
    await writeFile(location, stringifyToml(saved))
    await executeCodexInSandbox(sandbox, 'Continue', logger, 'gpt-5', [connector, secondary], true)
    assert.deepEqual(parseToml(await readFile(location, 'utf8')), parseToml(stringifyToml(saved)))
    await executeCodexInSandbox(sandbox, 'Continue without app connectors', logger, 'gpt-5', [], true)
    const disconnected = parseToml(await readFile(location, 'utf8'))
    delete servers['secondary-search']
    delete saved.experimental_use_rmcp_client
    assert.deepEqual(disconnected, parseToml(stringifyToml(saved)))
    const nativeModel = { ...disconnected, model: 'saved-model' }
    await writeFile(location, stringifyToml(nativeModel))
    await rm(`${location}.coding-agent-template.json`, { force: true })
    const bin = join(home, 'bin')
    await mkdir(bin)
    const argumentsFile = join(home, 'arguments.json')
    const sentinel = join(home, 'unexpected-shell-effect')
    await writeFile(
      join(bin, 'codex'),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(argumentsFile)},JSON.stringify(process.argv.slice(2)))`,
      { mode: 0o755 },
    )
    fixture = sandboxFixture(async (_command, raw) => {
      const result = await execute(
        raw.cmd,
        raw.args.map((arg) => arg.replaceAll('/vercel/sandbox/project', home)),
        {
          env: { PATH: `${bin}:${process.env.PATH}`, NODE_ENV: 'test' },
        },
      )
      return { code: 0, output: result.stdout, error: result.stderr }
    })
    const selected = `gpt-5'$(touch ${sentinel})`
    assert.equal((await executeCodexInSandbox(sandbox, 'Select a model', logger, selected, [])).success, true)
    const argumentsList = JSON.parse(await readFile(argumentsFile, 'utf8')) as string[]
    assert.equal(argumentsList[argumentsList.indexOf('--model') + 1], selected)
    assert.equal(parseToml(await readFile(location, 'utf8')).model, 'saved-model')
    await assert.rejects(readFile(sentinel), { code: 'ENOENT' })
    await writeFile(location, 'invalid = [')
    assert.equal((await writeCodexConfiguration(sandbox, 'model = "gpt-5"')).success, false)
    assert.equal(await readFile(location, 'utf8'), 'invalid = [')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
