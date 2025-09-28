'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '../ui/switch'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { createConnector, toggleConnectorStatus, deleteConnector } from '@/lib/actions/connectors'
import { useActionState } from 'react'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { useConnectors } from '@/components/connectors-provider'
import { Cable, Loader2, MoreHorizontal, Trash2 } from 'lucide-react'
import { Badge } from '../ui/badge'

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

export function ConnectorDialog({ open, onOpenChange }: ConnectorDialogProps) {
  const [state, formAction, pending] = useActionState(createConnector, initialState)
  const { connectors, refreshConnectors, isLoading } = useConnectors()
  const [loadingConnectors, setLoadingConnectors] = useState<Set<string>>(new Set())

  const handleToggleStatus = async (id: string, currentStatus: 'connected' | 'disconnected') => {
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected'

    setLoadingConnectors((prev) => new Set(prev).add(id))

    try {
      const result = await toggleConnectorStatus(id, newStatus)
      if (result.success) {
        toast.success(result.message)
        await refreshConnectors()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Failed to update connector status')
    } finally {
      setLoadingConnectors((prev) => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    setLoadingConnectors((prev) => new Set(prev).add(id))

    try {
      const result = await deleteConnector(id)
      if (result.success) {
        toast.success(result.message)
        await refreshConnectors()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Failed to delete connector')
    } finally {
      setLoadingConnectors((prev) => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  useEffect(() => {
    if (state.success) {
      toast.success(state.message)
      refreshConnectors() // Refresh after successful creation
    } else if (state.message && !state.success) {
      toast.error(state.message)
    }
  }, [state, refreshConnectors])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[800px] max-w-[90vw] max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Connectors
            <Cable className="inline mx-2" size={16} />
            <Badge>Beta (Claude only)</Badge>
          </DialogTitle>
          <DialogDescription>Allow Claude to reference other apps and services for more context.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="connectors" className="h-full">
          <TabsList className="grid w-full grid-cols-2 mb-2">
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
            <TabsTrigger value="add-custom">Add custom connector</TabsTrigger>
          </TabsList>

          <TabsContent value="connectors" className="space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="space-y-3">
              {isLoading ? (
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
              ) : (
                connectors.map((connector) => (
                  <Card key={connector.id} className="flex flex-row items-center justify-between p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-full">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold">{connector.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">{connector?.description ?? ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={connector.status === 'connected'}
                        disabled={loadingConnectors.has(connector.id)}
                        onCheckedChange={() => handleToggleStatus(connector.id, connector.status)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDelete(connector.id, connector.name)}
                            disabled={loadingConnectors.has(connector.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="add-custom" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add Custom Connector</CardTitle>
                <CardDescription>
                  Create a custom connector to integrate with your own services or APIs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form action={formAction} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" placeholder="Example MCP Server" required />
                    {state.errors?.name && <p className="text-sm text-red-600">{state.errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      name="description"
                      placeholder="Example description (optional)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="baseUrl">Base URL</Label>
                    <Input id="baseUrl" name="baseUrl" type="url" placeholder="https://api.example.com" required />
                    {state.errors?.baseUrl && <p className="text-sm text-red-600">{state.errors.baseUrl}</p>}
                  </div>

                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="advanced">
                      <AccordionTrigger>Advanced settings</AccordionTrigger>
                      <AccordionContent className="space-y-4">
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

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button type="submit" disabled={pending}>
                      {pending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Add Connector'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
