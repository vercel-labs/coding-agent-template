'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createConnector, updateConnector, deleteConnector, toggleConnectorStatus } from '@/lib/actions/connectors'
import type { Connector } from '@/lib/db/schema'
import { useActionState } from 'react'
import { toast } from 'sonner'
import { useEffect, useState, useRef } from 'react'
import { useConnectors } from '@/components/connectors-provider'
import { Loader2, Plus, X, ArrowLeft, Eye, EyeOff, Pencil, Server } from 'lucide-react'
import BrowserbaseIcon from '@/components/icons/browserbase-icon'
import Context7Icon from '@/components/icons/context7-icon'
import ConvexIcon from '@/components/icons/convex-icon'
import FigmaIcon from '@/components/icons/figma-icon'
import HuggingFaceIcon from '@/components/icons/huggingface-icon'
import LinearIcon from '@/components/icons/linear-icon'
import NotionIcon from '@/components/icons/notion-icon'
import PlaywrightIcon from '@/components/icons/playwright-icon'
import SupabaseIcon from '@/components/icons/supabase-icon'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  connectorDialogViewAtom,
  editingConnectorAtom,
  selectedPresetAtom,
  serverTypeAtom,
  envVarsAtom,
  visibleEnvVarsAtom,
  isEditingAtom,
  resetDialogStateAtom,
  setEditingConnectorActionAtom,
  startAddingConnectorAtom,
  selectPresetActionAtom,
  addCustomServerAtom,
  goBackFromFormAtom,
  goBackFromPresetsAtom,
  onSuccessActionAtom,
  clearPresetActionAtom,
  type PresetConfig,
} from '@/lib/atoms/connector-dialog'

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

const PRESETS: PresetConfig[] = [
  {
    name: 'Browserbase',
    type: 'local',
    command: 'npx @browserbasehq/mcp',
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
    command: 'npx -y convex@latest mcp start',
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
    command: 'npx -y @playwright/mcp@latest',
  },
  {
    name: 'Supabase',
    type: 'remote',
    url: 'https://mcp.supabase.com/mcp',
  },
]

export function ConnectorDialog({ open, onOpenChange }: ConnectorDialogProps) {
  const { connectors, refreshConnectors, isLoading: connectorsLoading } = useConnectors()
  const [loadingConnectors, setLoadingConnectors] = useState<Set<string>>(new Set())

  // Jotai atoms
  const [view, setView] = useAtom(connectorDialogViewAtom)
  const editingConnector = useAtomValue(editingConnectorAtom)
  const isEditing = useAtomValue(isEditingAtom)
  const [serverType, setServerType] = useAtom(serverTypeAtom)
  const [envVars, setEnvVars] = useAtom(envVarsAtom)
  const selectedPreset = useAtomValue(selectedPresetAtom)
  const [visibleEnvVars, setVisibleEnvVars] = useAtom(visibleEnvVarsAtom)
  const resetDialogState = useSetAtom(resetDialogStateAtom)
  const setEditingConnectorAction = useSetAtom(setEditingConnectorActionAtom)
  const startAddingConnector = useSetAtom(startAddingConnectorAtom)
  const selectPresetAction = useSetAtom(selectPresetActionAtom)
  const addCustomServer = useSetAtom(addCustomServerAtom)
  const goBackFromForm = useSetAtom(goBackFromFormAtom)
  const goBackFromPresets = useSetAtom(goBackFromPresetsAtom)
  const onSuccessAction = useSetAtom(onSuccessActionAtom)
  const clearPreset = useSetAtom(clearPresetActionAtom)

  // Use separate action states for create and update
  const [createState, createAction, createPending] = useActionState(createConnector, initialState)
  const [updateState, updateAction, updatePending] = useActionState(updateConnector, initialState)

  // Use the appropriate state and action based on whether we're editing
  const state = isEditing ? updateState : createState
  const formAction = isEditing ? updateAction : createAction
  const pending = isEditing ? updatePending : createPending

  const lastStateRef = useRef<{ success: boolean; message: string }>({ success: false, message: '' })
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Reset to list view when dialog opens
  useEffect(() => {
    if (open) {
      resetDialogState()
    }

    // Reset the state ref when dialog opens/closes
    if (!open) {
      lastStateRef.current = { success: false, message: '' }
    }
  }, [open, resetDialogState])

  useEffect(() => {
    // Only show toast if state has actually changed (not just reference)
    const stateChanged =
      state.success !== lastStateRef.current.success || state.message !== lastStateRef.current.message

    if (stateChanged && state.message) {
      if (state.success) {
        toast.success(state.message)
        refreshConnectors() // Refresh after successful creation/update
        // Go back to list view on success
        onSuccessAction()
      } else {
        toast.error(state.message)
      }

      // Update the ref to the current state
      lastStateRef.current = { success: state.success, message: state.message }
    }
  }, [state.success, state.message, refreshConnectors, onSuccessAction])

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
    // Update visible indices after removal
    const newVisible = new Set<number>()
    visibleEnvVars.forEach((i) => {
      if (i < index) {
        newVisible.add(i)
      } else if (i > index) {
        newVisible.add(i - 1)
      }
    })
    setVisibleEnvVars(newVisible)
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }

  const handleToggleConnectorStatus = async (id: string, currentStatus: 'connected' | 'disconnected') => {
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected'

    setLoadingConnectors((prev) => new Set(prev).add(id))

    try {
      const result = await toggleConnectorStatus(id, newStatus)

      if (result.success) {
        await refreshConnectors()
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Failed to update connector status')
    } finally {
      setLoadingConnectors((prev) => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  const handleDelete = async () => {
    if (!editingConnector) return

    setIsDeleting(true)
    try {
      const result = await deleteConnector(editingConnector.id)
      if (result.success) {
        toast.success(result.message)
        refreshConnectors()
        // Go back to list view
        onSuccessAction()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Failed to delete MCP server')
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const toggleEnvVarVisibility = (index: number) => {
    const newVisible = new Set(visibleEnvVars)
    if (newVisible.has(index)) {
      newVisible.delete(index)
    } else {
      newVisible.add(index)
    }
    setVisibleEnvVars(newVisible)
  }

  const getConnectorIcon = (connector: {
    name: string
    type: string
    baseUrl: string | null
    command: string | null
  }) => {
    const lowerName = connector.name.toLowerCase()
    const url = connector.baseUrl?.toLowerCase() || ''
    const cmd = connector.command?.toLowerCase() || ''

    if (lowerName.includes('browserbase') || cmd.includes('browserbasehq') || cmd.includes('@browserbasehq/mcp')) {
      return <BrowserbaseIcon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('context7') || url.includes('context7.com')) {
      return <Context7Icon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('convex') || cmd.includes('convex') || url.includes('convex')) {
      return <ConvexIcon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('figma') || url.includes('figma.com')) {
      return <FigmaIcon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('hugging') || lowerName.includes('huggingface') || url.includes('hf.co')) {
      return <HuggingFaceIcon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('linear') || url.includes('linear.app')) {
      return <LinearIcon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('notion') || url.includes('notion.com')) {
      return <NotionIcon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('playwright') || cmd.includes('playwright') || cmd.includes('@playwright/mcp')) {
      return <PlaywrightIcon className="h-8 w-8 flex-shrink-0" />
    }
    if (lowerName.includes('supabase') || url.includes('supabase.com')) {
      return <SupabaseIcon className="h-8 w-8 flex-shrink-0" />
    }

    return <Server className="h-8 w-8 flex-shrink-0 text-muted-foreground" />
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[800px] max-w-[90vw] max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {(view === 'form' || view === 'presets') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (view === 'form' ? goBackFromForm() : goBackFromPresets())}
                  className="mr-2 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {view === 'list' && 'MCP Servers'}
              {view === 'presets' && 'Add MCP Server'}
              {view === 'form' && (isEditing ? 'Edit MCP Server' : 'MCP Servers')}
            </DialogTitle>
            <DialogDescription>
              {view === 'list' && 'Manage your Model Context Protocol servers.'}
              {view === 'presets' && 'Choose a preset or add a custom server.'}
              {view === 'form' && 'Allow agents to reference other apps and services for more context.'}
            </DialogDescription>
          </DialogHeader>

          {view === 'list' ? (
            <div className="space-y-3 py-4 overflow-y-auto flex-1 max-h-[60vh]">
              {connectorsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="flex flex-row items-center justify-between p-4">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="w-full space-y-2">
                          <div className="h-4 bg-muted animate-pulse rounded w-1/4"></div>
                          <div className="h-3 bg-muted animate-pulse rounded w-3/4"></div>
                        </div>
                      </div>
                      <div className="w-12 h-6 bg-muted animate-pulse rounded-full"></div>
                    </Card>
                  ))}
                </div>
              ) : connectors.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No MCP servers configured yet.</p>
                </Card>
              ) : (
                connectors.map((connector) => (
                  <Card key={connector.id} className="flex flex-row items-center justify-between p-3">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {getConnectorIcon(connector)}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm">{connector.name}</h4>
                        {connector.description && (
                          <p className="text-xs text-muted-foreground truncate">{connector.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingConnectorAction(connector)}
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Switch
                        checked={connector.status === 'connected'}
                        disabled={loadingConnectors.has(connector.id)}
                        onCheckedChange={() => handleToggleConnectorStatus(connector.id, connector.status)}
                      />
                    </div>
                  </Card>
                ))
              )}
              <div className="flex justify-end pt-4">
                <Button type="button" variant="default" onClick={() => startAddingConnector()}>
                  Add MCP Server
                </Button>
              </div>
            </div>
          ) : view === 'presets' ? (
            <div className="space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-3 gap-6">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => selectPresetAction(preset)}
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
              <Button variant="outline" className="w-full" onClick={() => addCustomServer()}>
                Add Custom MCP Server
              </Button>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto max-h-[60vh]">
              <form
                action={(formData) => {
                  // Add ID field when editing
                  if (editingConnector) {
                    formData.append('id', editingConnector.id)
                  }

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
                    <Button type="button" variant="ghost" size="sm" onClick={() => clearPreset()}>
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
                    defaultValue={editingConnector?.name || selectedPreset?.name || ''}
                    required
                  />
                  {state.errors?.name && <p className="text-sm text-red-600">{state.errors.name}</p>}
                </div>

                {!selectedPreset && !isEditing && (
                  <div className="space-y-2">
                    <Label>Server Type</Label>
                    <RadioGroup
                      value={serverType}
                      onValueChange={(value) => setServerType(value as 'local' | 'remote')}
                    >
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
                        defaultValue={editingConnector?.baseUrl || selectedPreset?.url || ''}
                        required={serverType === 'remote'}
                        disabled={!!selectedPreset}
                      />
                      {state.errors?.baseUrl && <p className="text-sm text-red-600">{state.errors.baseUrl}</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="command">Command</Label>
                      <Input
                        id="command"
                        name="command"
                        placeholder="npx @browserbasehq/mcp"
                        defaultValue={editingConnector?.command || selectedPreset?.command || ''}
                        required={serverType === 'local'}
                        disabled={!!selectedPreset}
                      />
                      <p className="text-xs text-muted-foreground">Full command including all arguments</p>
                      {state.errors?.command && <p className="text-sm text-red-600">{state.errors.command}</p>}
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>
                      Environment Variables{' '}
                      {selectedPreset && selectedPreset.envKeys && selectedPreset.envKeys.length > 0
                        ? ''
                        : '(optional)'}
                    </Label>
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
                            className="flex-1"
                          />
                          <div className="relative flex-1">
                            <Input
                              placeholder="value"
                              type={visibleEnvVars.has(index) ? 'text' : 'password'}
                              value={envVar.value}
                              onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full hover:bg-transparent"
                              onClick={() => toggleEnvVarVisibility(index)}
                            >
                              {visibleEnvVars.has(index) ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                          {!selectedPreset?.envKeys?.includes(envVar.key) && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeEnvVar(index)}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {serverType === 'remote' && (
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
                )}

                <div className="flex justify-between items-center pt-4">
                  {isEditing && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setShowDeleteDialog(true)
                      }}
                      disabled={pending || isDeleting}
                    >
                      Delete
                    </Button>
                  )}
                  <div className={`flex space-x-2 ${isEditing ? 'ml-auto' : 'w-full justify-end'}`}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        goBackFromForm()
                      }}
                      disabled={pending || isDeleting}
                    >
                      Back
                    </Button>
                    <Button type="submit" disabled={pending || isDeleting}>
                      {pending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isEditing ? 'Saving...' : 'Creating...'}
                        </>
                      ) : isEditing ? (
                        'Save Changes'
                      ) : (
                        'Add MCP Server'
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{editingConnector?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
