#!/usr/bin/env node

/**
 * Production Database Migration Script
 *
 * This script runs database migrations using Drizzle Kit CLI.
 * It only executes in Vercel's production environment to ensure
 * that schema changes are applied when deploying to production.
 *
 * Environment Detection:
 * - VERCEL_ENV=production -> Runs migrations
 * - Any other environment -> Skips migrations
 */

import { execSync } from 'child_process'

// Only run migrations in Vercel production environment
if (process.env.VERCEL_ENV !== 'production') {
  console.log('✓ Skipping database migrations - not in production environment')
  console.log(`  Current environment: ${process.env.VERCEL_ENV || 'local'}`)
  process.exit(0)
}

console.log('→ Running database migrations in production environment...')

try {
  // Verify required environment variable
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required')
  }

  // Run migrations using Drizzle Kit CLI
  // Using 'inherit' to show migration output in build logs
  execSync('npx drizzle-kit migrate', {
    stdio: 'inherit',
    env: process.env,
  })

  console.log('✓ Database migrations completed successfully')
  process.exit(0)
} catch (error) {
  console.error('✗ Migration failed:', error)
  process.exit(1)
}
