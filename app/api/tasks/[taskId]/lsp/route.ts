import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/tasks/[taskId]/lsp
 * Handles LSP requests by executing TypeScript language service queries in the sandbox
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Verify task belongs to user
    const task = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
      .then((rows) => rows[0])

    if (!task || task.userId !== session.user.id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task has a sandbox
    if (!task.sandboxId) {
      return NextResponse.json({ error: 'Task does not have an active sandbox' }, { status: 400 })
    }

    // Try to get sandbox from registry first (keyed by taskId, not sandboxId)
    let sandbox = getSandbox(taskId)

    // If not in registry, try to reconnect using sandboxId from database
    if (!sandbox) {
      try {
        const sandboxToken = process.env.SANDBOX_VERCEL_TOKEN
        const teamId = process.env.SANDBOX_VERCEL_TEAM_ID
        const projectId = process.env.SANDBOX_VERCEL_PROJECT_ID

        if (!sandboxToken || !teamId || !projectId) {
          return NextResponse.json({ error: 'Sandbox credentials not configured' }, { status: 500 })
        }

        const { Sandbox } = await import('@vercel/sandbox')
        sandbox = await Sandbox.get({
          sandboxId: task.sandboxId,
          teamId,
          projectId,
          token: sandboxToken,
        })
      } catch (error) {
        console.error('Failed to reconnect to sandbox:', error)
        return NextResponse.json({ error: 'Failed to connect to sandbox' }, { status: 500 })
      }
    }

    if (!sandbox) {
      return NextResponse.json({ error: 'Sandbox not available' }, { status: 400 })
    }

    const body = await request.json()
    const { method, filename, position, textDocument } = body

    // Normalize filename to absolute path
    const absoluteFilename = filename.startsWith('/') ? filename : `/${filename}`

    switch (method) {
      case 'textDocument/definition': {
        // Execute TypeScript language service query in sandbox
        const scriptPath = '.lsp-helper.mjs'

        // Create LSP helper script in sandbox (pure JavaScript, no TypeScript syntax)
        const helperScript = `
import ts from 'typescript';
import fs from 'fs';
import path from 'path';

const filename = '${absoluteFilename.replace(/'/g, "\\'")}';
const line = ${position.line};
const character = ${position.character};

// Find tsconfig.json
let configPath = process.cwd();
while (configPath !== '/') {
  const tsconfigPath = path.join(configPath, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    break;
  }
  configPath = path.dirname(configPath);
}

const tsconfigPath = path.join(configPath, 'tsconfig.json');
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  configPath
);

// Create language service host
const files = new Map();
const host = {
  getScriptFileNames: () => parsedConfig.fileNames,
  getScriptVersion: (fileName) => {
    const file = files.get(fileName);
    return file && file.version ? file.version.toString() : '0';
  },
  getScriptSnapshot: (fileName) => {
    if (!fs.existsSync(fileName)) return undefined;
    const content = fs.readFileSync(fileName, 'utf8');
    return ts.ScriptSnapshot.fromString(content);
  },
  getCurrentDirectory: () => configPath,
  getCompilationSettings: () => parsedConfig.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};

// Create language service
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

// Get definitions
const fullPath = path.resolve(configPath, filename.replace(/^\\/*/g, ''));
const program = service.getProgram();
if (!program) {
  console.error(JSON.stringify({ error: 'Failed to get program' }));
  process.exit(1);
}

const sourceFile = program.getSourceFile(fullPath);
if (!sourceFile) {
  console.error(JSON.stringify({ error: 'File not found', filename: fullPath }));
  process.exit(1);
}

const offset = ts.getPositionOfLineAndCharacter(sourceFile, line, character);
const definitions = service.getDefinitionAtPosition(fullPath, offset);

if (definitions && definitions.length > 0) {
  const results = definitions.map(def => {
    const defSourceFile = program.getSourceFile(def.fileName);
    if (!defSourceFile) {
      return null;
    }
    
    const start = ts.getLineAndCharacterOfPosition(defSourceFile, def.textSpan.start);
    const end = ts.getLineAndCharacterOfPosition(defSourceFile, def.textSpan.start + def.textSpan.length);
    
    return {
      uri: 'file://' + def.fileName,
      range: {
        start: start,
        end: end,
      },
    };
  }).filter(def => def !== null);
  
  console.log(JSON.stringify({ definitions: results }));
} else {
  console.log(JSON.stringify({ definitions: [] }));
}
`

        // Write helper script to sandbox
        const writeCommand = `cat > '${scriptPath}' << 'EOF'\n${helperScript}\nEOF`
        await sandbox.runCommand('sh', ['-c', writeCommand])

        // Execute the script
        const result = await sandbox.runCommand('node', [scriptPath])

        // Read stdout and stderr
        let stdout = ''
        let stderr = ''
        try {
          stdout = await result.stdout()
        } catch (e) {
          console.error('Failed to read LSP stdout:', e)
        }
        try {
          stderr = await result.stderr()
        } catch (e) {
          console.error('Failed to read LSP stderr:', e)
        }

        // Clean up
        await sandbox.runCommand('rm', [scriptPath])

        // Parse the result
        if (result.exitCode !== 0) {
          console.error('LSP script failed:', stderr)
          return NextResponse.json({ definitions: [], error: stderr || 'Script execution failed' })
        }

        try {
          const parsed = JSON.parse(stdout.trim())
          return NextResponse.json(parsed)
        } catch (parseError) {
          console.error('Failed to parse LSP result:', parseError)
          return NextResponse.json({ definitions: [], error: 'Failed to parse TypeScript response' })
        }
      }

      case 'textDocument/hover': {
        // Similar implementation for hover
        return NextResponse.json({ hover: null })
      }

      case 'textDocument/completion': {
        // Similar implementation for completion
        return NextResponse.json({ completions: [] })
      }

      default:
        return NextResponse.json({ error: 'Unsupported LSP method' }, { status: 400 })
    }
  } catch (error) {
    console.error('LSP request error:', error)
    return NextResponse.json({ error: 'Failed to process LSP request' }, { status: 500 })
  }
}
