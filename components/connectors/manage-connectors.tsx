'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { createConnector } from '@/lib/actions/connectors'
import { useActionState } from 'react'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { useConnectors } from '@/components/connectors-provider'
import { Loader2, Plus, X, ArrowLeft } from 'lucide-react'
import BrowserbaseIcon from '@/components/icons/browserbase-icon'
import Context7Icon from '@/components/icons/context7-icon'
import ConvexIcon from '@/components/icons/convex-icon'
import FigmaIcon from '@/components/icons/figma-icon'
import HuggingFaceIcon from '@/components/icons/huggingface-icon'
import LinearIcon from '@/components/icons/linear-icon'
import NotionIcon from '@/components/icons/notion-icon'
import PlaywrightIcon from '@/components/icons/playwright-icon'
import SupabaseIcon from '@/components/icons/supabase-icon'

interface ConnectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormState = {
  success: boolean
  message: string
  errors: Record<string, string>
}

const initialState: FormState = {
  success: false,
  message: '',
  errors: {},
}

type PresetConfig = {
  name: string
  type: 'local' | 'remote'
  command?: string
  args?: string[]
  url?: string
  envKeys?: string[]
}

const PRESETS: PresetConfig[] = [
  {
    name: 'Browserbase',
    type: 'local',
    command: 'npx',
    args: ['@browserbasehq/mcp'],
    envKeys: ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'],
  },
  {
    name: 'Context7',
    type: 'remote',
    url: 'https://mcp.context7.com/mcp',
  },
  {
    name: 'Convex',
    type: 'local',
    command: 'npx',
    args: ['-y', 'convex@latest', 'mcp', 'start'],
  },
  {
    name: 'Figma',
    type: 'remote',
    url: 'https://mcp.figma.com/mcp',
  },
  {
    name: 'Hugging Face',
    type: 'remote',
    url: 'https://hf.co/mcp',
  },
  {
    name: 'Linear',
    type: 'remote',
    url: 'https://mcp.linear.app/sse',
  },
  {
    name: 'Notion',
    type: 'remote',
    url: 'https://mcp.notion.com/mcp',
  },
  {
    name: 'Playwright',
    type: 'local',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
  },
  {
    name: 'Supabase',
    type: 'remote',
    url: 'https://mcp.supabase.com/mcp',
  },
]

export function ConnectorDialog({ open, onOpenChange }: ConnectorDialogProps) {
  const [state, formAction, pending] = useActionState(createConnector, initialState)
  const { refreshConnectors } = useConnectors()
  const [serverType, setServerType] = useState<'local' | 'remote'>('remote')
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [args, setArgs] = useState<string[]>([''])
  const [selectedPreset, setSelectedPreset] = useState<PresetConfig | null>(null)
  const [view, setView] = useState<'presets' | 'form'>('presets')

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      refreshConnectors() // Refresh after successful creation
      // Reset form
      setServerType('remote')
      setEnvVars([])
      setArgs([''])
      setSelectedPreset(null)
      setView('presets')
    } else if (state.message && !state.success) {
      toast.error(state.message)
    }
  }, [state, refreshConnectors])

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }

  const addArg = () => {
    setArgs([...args, ''])
  }

  const removeArg = (index: number) => {
    setArgs(args.filter((_, i) => i !== index))
  }

  const updateArg = (index: number, value: string) => {
    const newArgs = [...args]
    newArgs[index] = value
    setArgs(newArgs)
  }

  const handleSelectPreset = (preset: PresetConfig) => {
    setSelectedPreset(preset)
    setServerType(preset.type)
    
    // Set env vars based on preset's envKeys
    if (preset.envKeys && preset.envKeys.length > 0) {
      setEnvVars(preset.envKeys.map(key => ({ key, value: '' })))
    } else {
      setEnvVars([])
    }
    
    // Set args for local presets
    if (preset.type === 'local' && preset.args) {
      setArgs(preset.args)
    } else {
      setArgs([''])
    }
    
    // Switch to form view
    setView('form')
  }

  const handleAddCustom = () => {
    setSelectedPreset(null)
    setServerType('remote')
    setEnvVars([])
    setArgs([''])
    setView('form')
  }

  const handleBack = () => {
    setSelectedPreset(null)
    setServerType('remote')
    setEnvVars([])
    setArgs([''])
    setView('presets')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[800px] max-w-[90vw] max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {view === 'form' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="mr-2 -ml-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            MCP Servers
          </DialogTitle>
          <DialogDescription>Allow agents to reference other apps and services for more context.</DialogDescription>
        </DialogHeader>

        {view === 'presets' ? (
          <div className="space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-3 gap-6">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => handleSelectPreset(preset)}
                  type="button"
                >
                  {preset.name === 'Browserbase' ? (
                    <BrowserbaseIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Context7' ? (
                    <Context7Icon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Convex' ? (
                    <ConvexIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Figma' ? (
                    <FigmaIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Hugging Face' ? (
                    <HuggingFaceIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Linear' ? (
                    <LinearIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Notion' ? (
                    <NotionIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Playwright' ? (
                    <PlaywrightIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : preset.name === 'Supabase' ? (
                    <SupabaseIcon style={{ width: 48, height: 48 }} className="flex-shrink-0" />
                  ) : null}
                  <span className="text-sm font-medium text-center">{preset.name}</span>
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleAddCustom}
            >
              Add Custom MCP Server
            </Button>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto max-h-[60vh]">
            <form
              action={(formData) => {
                // Add type field
                formData.append('type', serverType)
                
                // For presets, ensure command/baseUrl are added even if disabled
                if (selectedPreset) {
                  if (selectedPreset.type === 'local' && selectedPreset.command) {
                    formData.set('command', selectedPreset.command)
                  } else if (selectedPreset.type === 'remote' && selectedPreset.url) {
                    formData.set('baseUrl', selectedPreset.url)
                  }
                }
                
                // Add env vars as JSON
                const envObj = envVars.reduce(
                  (acc, { key, value }) => {
                    if (key && value) acc[key] = value
                    return acc
                  },
                  {} as Record<string, string>,
                )
                if (Object.keys(envObj).length > 0) {
                  formData.append('env', JSON.stringify(envObj))
                }
                
                // Add args as JSON for local servers
                if (serverType === 'local') {
                  const filteredArgs = args.filter((arg) => arg.trim() !== '')
                  if (filteredArgs.length > 0) {
                    formData.append('args', JSON.stringify(filteredArgs))
                  }
                }
                
                formAction(formData)
              }}
              className="space-y-4"
            >
              {selectedPreset && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  {selectedPreset.name === 'Browserbase' ? (
                    <BrowserbaseIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Context7' ? (
                    <Context7Icon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Convex' ? (
                    <ConvexIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Figma' ? (
                    <FigmaIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Hugging Face' ? (
                    <HuggingFaceIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Linear' ? (
                    <LinearIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Notion' ? (
                    <NotionIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Playwright' ? (
                    <PlaywrightIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : selectedPreset.name === 'Supabase' ? (
                    <SupabaseIcon style={{ width: 32, height: 32 }} className="flex-shrink-0" />
                  ) : null}
                  <div className="flex-1">
                    <p className="text-sm font-medium">Configuring {selectedPreset.name}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedPreset(null)
                      setEnvVars([])
                      setArgs([''])
                      setServerType('remote')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Example MCP Server"
                  defaultValue={selectedPreset?.name || ''}
                  required
                />
                {state.errors?.name && <p className="text-sm text-red-600">{state.errors.name}</p>}
              </div>

              {!selectedPreset && (
                <div className="space-y-2">
                  <Label>Server Type</Label>
                  <RadioGroup value={serverType} onValueChange={(value) => setServerType(value as 'local' | 'remote')}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="remote" id="remote" />
                      <Label htmlFor="remote" className="font-normal cursor-pointer">
                        Remote (HTTP/SSE)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="local" id="local" />
                      <Label htmlFor="local" className="font-normal cursor-pointer">
                        Local (STDIO)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {serverType === 'remote' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="baseUrl">Base URL</Label>
                    <Input
                      id="baseUrl"
                      name="baseUrl"
                      type="url"
                      placeholder="https://api.example.com"
                      defaultValue={selectedPreset?.url || ''}
                      required={serverType === 'remote'}
                      disabled={!!selectedPreset}
                    />
                    {state.errors?.baseUrl && <p className="text-sm text-red-600">{state.errors.baseUrl}</p>}
                  </div>

                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="advanced" className="border-none">
                      <AccordionTrigger className="text-sm py-2">Advanced Settings</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="oauthClientId">OAuth Client ID (optional)</Label>
                          <Input id="oauthClientId" name="oauthClientId" placeholder="OAuth Client ID (optional)" />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="oauthClientSecret">OAuth Client Secret (optional)</Label>
                          <Input
                            id="oauthClientSecret"
                            name="oauthClientSecret"
                            type="password"
                            placeholder="OAuth Client Secret (optional)"
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                    </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="command">Command</Label>
                    <Input
                      id="command"
                      name="command"
                      placeholder="npx"
                      defaultValue={selectedPreset?.command || ''}
                      required={serverType === 'local'}
                      disabled={!!selectedPreset}
                    />
                    {state.errors?.command && <p className="text-sm text-red-600">{state.errors.command}</p>}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Arguments</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addArg}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Argument
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {args.map((arg, index) => {
                        const isPresetArg = selectedPreset?.args && index < selectedPreset.args.length
                        return (
                          <div key={index} className="flex gap-2">
                            <Input
                              placeholder={`Argument ${index + 1}`}
                              value={arg}
                              onChange={(e) => updateArg(index, e.target.value)}
                              disabled={isPresetArg}
                            />
                            {args.length > 1 && !isPresetArg && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeArg(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Environment Variables {selectedPreset && selectedPreset.envKeys && selectedPreset.envKeys.length > 0 ? '' : '(optional)'}</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addEnvVar}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Variable
                  </Button>
                </div>
                {envVars.length > 0 && (
                  <div className="space-y-2">
                    {envVars.map((envVar, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder="KEY"
                          value={envVar.key}
                          onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                          disabled={selectedPreset?.envKeys?.includes(envVar.key)}
                        />
                        <Input
                          placeholder="value"
                          type="password"
                          value={envVar.value}
                          onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                        />
                        {!(selectedPreset?.envKeys?.includes(envVar.key)) && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeEnvVar(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Add MCP Server'
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
