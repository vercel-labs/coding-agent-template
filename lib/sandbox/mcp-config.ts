import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from './commands'

// Keep ownership outside the host's configuration schema. A user-edited entry
// takes precedence over our last written value, including enabled:false.
const mergeConfiguration = `
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { isDeepStrictEqual } = require('node:util');
async function read(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}
async function main() {
  const [location, field, serialized] = process.argv.slice(1);
  const file = location.startsWith('~/') ? path.join(os.homedir(), location.slice(2)) : location;
  const marker = file + '.coding-agent-template.json';
  const current = JSON.parse(serialized);
  const previous = (await read(marker)).servers || {};
  if (!Object.keys(current[field]).length && !Object.keys(previous).length) return;
  const existing = await read(file);
  if (existing[field] !== undefined && (!existing[field] || typeof existing[field] !== 'object' || Array.isArray(existing[field]))) throw new Error();
  const servers = { ...existing[field] };
  const owned = {};
  for (const [name, snapshots] of Object.entries(previous)) {
    if (snapshots.some(value => isDeepStrictEqual(servers[name], value))) delete servers[name];
  }
  for (const [name, value] of Object.entries(current[field])) {
    if (!Object.hasOwn(servers, name)) {
      servers[name] = value;
      owned[name] = [value];
    }
  }
  const merged = { ...current, ...existing, [field]: servers };
  await fs.mkdir(path.dirname(file), { recursive: true });
  async function write(destination, value) {
    const temporary = destination + '.' + process.pid + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await fs.rename(temporary, destination);
  }
  const pending = { ...previous };
  for (const [name, snapshots] of Object.entries(owned)) pending[name] = [...(previous[name] || []), ...snapshots];
  // Retain both snapshots across an interrupted write, so a later disconnect
  // can still remove an unchanged entry whichever file was last committed.
  await write(marker, { servers: pending });
  await write(file, merged);
  await write(marker, { servers: owned });
}
main().catch(() => { process.exitCode = 1; });
`

export async function writeMcpConfiguration(
  sandbox: Sandbox,
  location: string,
  config: object,
  field: 'mcp' | 'mcpServers' = 'mcpServers',
) {
  return runCommandInSandbox(sandbox, 'node', ['-e', mergeConfiguration, location, field, JSON.stringify(config)])
}
