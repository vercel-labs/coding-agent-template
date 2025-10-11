'use server'

import { db } from '@/lib/db/client'
import { connectors, insertConnectorSchema } from '@/lib/db/schema'
import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { eq, and } from 'drizzle-orm'
import { encrypt, decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'

type FormState = {
  success: boolean
  message: string
  errors: Record<string, string>
}

export async function createConnector(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
        errors: {},
      }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const type = (formData.get('type') as string) || 'remote'
    const baseUrl = formData.get('baseUrl') as string
    const oauthClientId = formData.get('oauthClientId') as string
    const oauthClientSecret = formData.get('oauthClientSecret') as string
    const command = formData.get('command') as string
    const envJson = formData.get('env') as string

    const connectorData = {
      id: nanoid(),
      userId: session.user.id,
      name,
      description: description?.trim() || undefined,
      type: type as 'local' | 'remote',
      baseUrl: baseUrl?.trim() || undefined,
      oauthClientId: oauthClientId?.trim() || undefined,
      oauthClientSecret: oauthClientSecret?.trim() || undefined,
      command: command?.trim() || undefined,
      env: envJson ? JSON.parse(envJson) : undefined,
      status: 'connected' as const,
    }

    const validatedData = insertConnectorSchema.parse(connectorData)

    await db.insert(connectors).values({
      id: validatedData.id!,
      userId: validatedData.userId,
      name: validatedData.name,
      description: validatedData.description || null,
      type: validatedData.type,
      baseUrl: validatedData.baseUrl || null,
      oauthClientId: validatedData.oauthClientId || null,
      oauthClientSecret: validatedData.oauthClientSecret ? encrypt(validatedData.oauthClientSecret) : null,
      command: validatedData.command || null,
      env: validatedData.env ? encrypt(JSON.stringify(validatedData.env)) : null,
      status: validatedData.status,
    })

    revalidatePath('/')

    return {
      success: true,
      message: 'Connector created successfully',
      errors: {},
    }
  } catch (error) {
    console.error('Error creating connector:', error)

    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          fieldErrors[issue.path[0] as string] = issue.message
        }
      })

      return {
        success: false,
        message: 'Validation failed',
        errors: fieldErrors,
      }
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create connector',
      errors: {},
    }
  }
}

export async function toggleConnectorStatus(id: string, status: 'connected' | 'disconnected') {
  'use server'

  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
      }
    }

    await db
      .update(connectors)
      .set({ status })
      .where(and(eq(connectors.id, id), eq(connectors.userId, session.user.id)))

    revalidatePath('/')

    return {
      success: true,
      message: `Connector ${status === 'connected' ? 'connected' : 'disconnected'} successfully`,
    }
  } catch (error) {
    console.error('Error toggling connector status:', error)

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update connector status',
    }
  }
}

export async function updateConnector(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
        errors: {},
      }
    }

    const id = formData.get('id') as string

    if (!id) {
      return {
        success: false,
        message: 'Connector ID is required',
        errors: {},
      }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const type = (formData.get('type') as string) || 'remote'
    const baseUrl = formData.get('baseUrl') as string
    const oauthClientId = formData.get('oauthClientId') as string
    const oauthClientSecret = formData.get('oauthClientSecret') as string
    const command = formData.get('command') as string
    const envJson = formData.get('env') as string

    const connectorData = {
      userId: session.user.id,
      name,
      description: description?.trim() || undefined,
      type: type as 'local' | 'remote',
      baseUrl: baseUrl?.trim() || undefined,
      oauthClientId: oauthClientId?.trim() || undefined,
      oauthClientSecret: oauthClientSecret?.trim() || undefined,
      command: command?.trim() || undefined,
      env: envJson ? JSON.parse(envJson) : undefined,
      status: 'connected' as const,
    }

    const validatedData = insertConnectorSchema.parse(connectorData)

    await db
      .update(connectors)
      .set({
        name: validatedData.name,
        description: validatedData.description || null,
        type: validatedData.type,
        baseUrl: validatedData.baseUrl || null,
        oauthClientId: validatedData.oauthClientId || null,
        oauthClientSecret: validatedData.oauthClientSecret ? encrypt(validatedData.oauthClientSecret) : null,
        command: validatedData.command || null,
        env: validatedData.env ? encrypt(JSON.stringify(validatedData.env)) : null,
        status: validatedData.status,
        updatedAt: new Date(),
      })
      .where(and(eq(connectors.id, id), eq(connectors.userId, session.user.id)))

    revalidatePath('/')

    return {
      success: true,
      message: 'Connector updated successfully',
      errors: {},
    }
  } catch (error) {
    console.error('Error updating connector:', error)

    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      error.issues.forEach((issue) => {
        if (issue.path.length > 0) {
          fieldErrors[issue.path[0] as string] = issue.message
        }
      })

      return {
        success: false,
        message: 'Validation failed',
        errors: fieldErrors,
      }
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update connector',
      errors: {},
    }
  }
}

export async function deleteConnector(id: string) {
  'use server'

  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        message: 'Unauthorized',
      }
    }

    await db.delete(connectors).where(and(eq(connectors.id, id), eq(connectors.userId, session.user.id)))

    revalidatePath('/')

    return {
      success: true,
      message: 'Connector deleted successfully',
    }
  } catch (error) {
    console.error('Error deleting connector:', error)

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete connector',
    }
  }
}

export async function getConnectors() {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
        data: [],
      }
    }

    const userConnectors = await db.select().from(connectors).where(eq(connectors.userId, session.user.id))

    // Decrypt sensitive fields
    const decryptedConnectors = userConnectors.map((connector) => ({
      ...connector,
      oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
      env: connector.env ? JSON.parse(decrypt(connector.env)) : null,
    }))

    return {
      success: true,
      data: decryptedConnectors,
    }
  } catch (error) {
    console.error('Error fetching connectors:', error)

    return {
      success: false,
      error: 'Failed to fetch connectors',
      data: [],
    }
  }
}
