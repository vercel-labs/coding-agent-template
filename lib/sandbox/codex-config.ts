import { Sandbox } from '@vercel/sandbox'
import { parse, stringify, type TomlTable } from 'smol-toml'
import { runCommandInSandbox } from './commands'

type Table = Record<string, unknown>
const table = (value: unknown): value is Table => !!value && typeof value === 'object' && !Array.isArray(value)

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof Date || b instanceof Date)
    return a instanceof Date && b instanceof Date && a.valueOf() === b.valueOf()
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, index) => same(value, b[index]))
  if (table(a) && table(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
  }
  return false
}

// Preserve manual/native values; only replace values matching an owned snapshot.
// MCP server entries are atomic so a manual disable preserves the whole entry.
function merge(
  current: unknown,
  existing: unknown,
  snapshots: unknown[],
  servers = false,
): { value: unknown; owned?: unknown } {
  if (existing === undefined || snapshots.some((value) => same(value, existing))) {
    return { value: current, ...(current === undefined ? {} : { owned: current }) }
  }
  if (table(existing) && !servers && (table(current) || snapshots.some(table))) {
    const value: Table = {}
    const owned: Table = {}
    const requested = table(current) ? current : {}
    const previous = snapshots.filter(table)
    for (const key of new Set([
      ...Object.keys(existing),
      ...Object.keys(requested),
      ...previous.flatMap(Object.keys),
    ])) {
      if (key === 'mcp_servers' && table(existing[key])) {
        const selected = table(requested[key]) ? requested[key] : {}
        const oldServers = previous.map((entry) => entry[key]).filter(table)
        const entries: Table = {}
        const managed: Table = {}
        for (const name of new Set([
          ...Object.keys(existing[key]),
          ...Object.keys(selected),
          ...oldServers.flatMap(Object.keys),
        ])) {
          const server = merge(
            selected[name],
            existing[key][name],
            oldServers.map((entry) => entry[name]),
            true,
          )
          if (server.value !== undefined) entries[name] = server.value
          if (server.owned !== undefined) managed[name] = server.owned
        }
        value[key] = entries
        if (Object.keys(managed).length) owned[key] = managed
      } else {
        const result = merge(
          requested[key],
          existing[key],
          previous.map((entry) => entry[key]),
        )
        if (result.value !== undefined) value[key] = result.value
        if (result.owned !== undefined) owned[key] = result.owned
      }
    }
    return { value, ...(Object.keys(owned).length ? { owned } : {}) }
  }
  return { value: existing }
}

const location = `const fs=require('node:fs/promises');const path=require('node:path');const file=path.join(require('node:os').homedir(),'.codex/config.toml');const marker=file+'.coding-agent-template.json';`
const readConfiguration = `${location}
async function read(p){try{return await fs.readFile(p,'utf8')}catch(e){if(e.code==='ENOENT')return null;throw e}}
Promise.all([read(file),read(marker)]).then(([config,ownership])=>process.stdout.write(JSON.stringify({config,ownership}))).catch(()=>{process.exitCode=1});`
const writeConfiguration = `${location}
async function main(){const [config,pending,owned]=process.argv.slice(1);await fs.mkdir(path.dirname(file),{recursive:true});
for(const [destination,value] of [[marker,pending],[file,config],[marker,owned]]){const temporary=destination+'.'+process.pid+'.tmp';await fs.writeFile(temporary,value,{mode:0o600});await fs.rename(temporary,destination)}}
main().catch(()=>{process.exitCode=1});`

export async function writeCodexConfiguration(sandbox: Sandbox, configToml: string) {
  try {
    // Structured IPC only; never send configuration contents to a logger.
    const read = await runCommandInSandbox(sandbox, 'node', ['-e', readConfiguration])
    if (!read.success) return { success: false }
    const saved = JSON.parse(read.output || '{}') as { config?: string; ownership?: string }
    const current = parse(configToml)
    const previous = saved.ownership ? (JSON.parse(saved.ownership) as { snapshots: Table[] }) : { snapshots: [] }
    const merged = merge(current, saved.config ? parse(saved.config) : undefined, previous.snapshots)
    const owned = merged.owned || {}
    return runCommandInSandbox(sandbox, 'node', [
      '-e',
      writeConfiguration,
      stringify(merged.value as TomlTable),
      JSON.stringify({ snapshots: [...previous.snapshots, owned] }),
      JSON.stringify({ snapshots: [owned] }),
    ])
  } catch {
    return { success: false }
  }
}
