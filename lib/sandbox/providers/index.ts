import { SandboxProvider, SandboxType } from './types'
import { VercelSandboxProvider } from './vercel'
import { DockerSandboxProvider } from './docker'
import { E2BSandboxProvider } from './e2b'
import { DaytonaSandboxProvider } from './daytona'

const providers = new Map<SandboxType, SandboxProvider>()

providers.set('vercel', new VercelSandboxProvider())
providers.set('docker', new DockerSandboxProvider())
providers.set('e2b', new E2BSandboxProvider())
providers.set('daytona', new DaytonaSandboxProvider())

export function getSandboxProvider(type: SandboxType = 'vercel'): SandboxProvider {
  const provider = providers.get(type)
  if (!provider) {
    throw new Error(
      `Sandbox provider "${type}" not found. Available providers: ${Array.from(providers.keys()).join(', ')}`,
    )
  }
  return provider
}

export function registerSandboxProvider(type: SandboxType, provider: SandboxProvider): void {
  providers.set(type, provider)
}

export * from './types'
export * from './vercel'
export * from './docker'
export * from './e2b'
export * from './daytona'
