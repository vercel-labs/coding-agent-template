#!/usr/bin/env tsx

/**
 * Script to list Vercel scopes (personal account + teams) that the authenticated user has access to.
 * 
 * Requires SANDBOX_VERCEL_TOKEN environment variable to be set.
 * 
 * Usage:
 *   SANDBOX_VERCEL_TOKEN=your_token pnpm tsx scripts/list-vercel-scopes.ts
 *   
 * Or if you have a .env.local file with SANDBOX_VERCEL_TOKEN, you can use:
 *   pnpm tsx scripts/list-vercel-scopes.ts
 */

import { fetchTeams } from '../lib/vercel-client/teams'
import { fetchUser } from '../lib/vercel-client/user'
import { config } from 'dotenv'
import { resolve } from 'path'

// Try to load .env.local file if it exists
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const accessToken = process.env.SANDBOX_VERCEL_TOKEN
  
  if (!accessToken) {
    console.error('Error: SANDBOX_VERCEL_TOKEN environment variable is required')
    console.error('\nUsage:')
    console.error('  SANDBOX_VERCEL_TOKEN=your_token pnpm tsx scripts/list-vercel-scopes.ts')
    console.error('\nOr create a .env.local file with:')
    console.error('  SANDBOX_VERCEL_TOKEN=your_token')
    process.exit(1)
  }

  try {
    console.log('Fetching Vercel user and teams...\n')
    
    // Fetch user info and teams
    const [user, teams] = await Promise.all([
      fetchUser(accessToken),
      fetchTeams(accessToken)
    ])

    if (!user) {
      console.error('Failed to fetch user information')
      process.exit(1)
    }

    // Build scopes list: personal account + teams
    const scopes = [
      {
        id: user.uid || user.id || '',
        slug: user.username,
        name: user.name || user.username,
        type: 'personal' as const,
      },
      ...(teams || []).map((team) => ({
        id: team.id,
        slug: team.slug,
        name: team.name,
        type: 'team' as const,
      })),
    ]

    if (scopes.length === 0) {
      console.log('No Vercel scopes found.')
      return
    }

    console.log('\n✓ Vercel Scopes:\n')
    console.log('─'.repeat(80))
    
    scopes.forEach((scope, index) => {
      console.log(`${index + 1}. ${scope.name}`)
      console.log(`   Type: ${scope.type}`)
      console.log(`   Slug: ${scope.slug}`)
      console.log(`   ID: ${scope.id}`)
      if (index < scopes.length - 1) {
        console.log('─'.repeat(80))
      }
    })
    
    console.log('─'.repeat(80))
    console.log(`\nTotal scopes: ${scopes.length}`)
    console.log(`  - Personal: ${scopes.filter((s) => s.type === 'personal').length}`)
    console.log(`  - Teams: ${scopes.filter((s) => s.type === 'team').length}`)
    console.log()
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}

main()
