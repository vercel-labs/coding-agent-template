import type { OrchestratorProvider } from './types'
import type { OrchestratorType } from '../types'
import { InngestOrchestrator } from './inngest'
import { AgentuityOrchestrator } from './agentuity'

const providers = new Map<OrchestratorType, OrchestratorProvider>()

providers.set('inngest', new InngestOrchestrator())
providers.set('agentuity', new AgentuityOrchestrator())

export function getOrchestrator(type: OrchestratorType = 'inngest'): OrchestratorProvider {
  const provider = providers.get(type)
  if (!provider) {
    throw new Error(`Orchestrator "${type}" not found. Available: ${Array.from(providers.keys()).join(', ')}`)
  }
  return provider
}

export * from './types'
export * from './inngest'
export * from './agentuity'
