'use server'

import { db } from '@/lib/db/client'
import { connectors, insertConnectorSchema } from '@/lib/db/schema'
import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { eq } from 'drizzle-orm'
import { encrypt } from '@/lib/crypto'

type FormState = {
  success: boolean
  message: string
  errors: Record<string, string>
}

export async function createConnector(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const baseUrl = formData.get('baseUrl') as string
    const oauthClientId = formData.get('oauthClientId') as string
    const oauthClientSecret = formData.get('oauthClientSecret') as string

    const connectorData = {
      id: nanoid(),
      name,
      description: description?.trim() || undefined,
      baseUrl,
      oauthClientId: oauthClientId?.trim() || undefined,
      oauthClientSecret: oauthClientSecret?.trim() || undefined,
      status: 'connected' as const,
    }

    const validatedData = insertConnectorSchema.parse(connectorData)

    await db.insert(connectors).values({
      id: validatedData.id!,
      name: validatedData.name,
      description: validatedData.description || null,
      baseUrl: validatedData.baseUrl,
      oauthClientId: validatedData.oauthClientId || null,
      oauthClientSecret: validatedData.oauthClientSecret ? encrypt(validatedData.oauthClientSecret) : null,
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
    await db.update(connectors).set({ status }).where(eq(connectors.id, id))

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

export async function deleteConnector(id: string) {
  'use server'

  try {
    await db.delete(connectors).where(eq(connectors.id, id))

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
    const allConnectors = await db.select().from(connectors)

    return {
      success: true,
      data: allConnectors,
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
