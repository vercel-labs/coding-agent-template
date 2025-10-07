import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    if (!_db) {
      if (!process.env.POSTGRES_URL) {
        throw new Error('POSTGRES_URL environment variable is required')
      }
      const client = postgres(process.env.POSTGRES_URL)
      _db = drizzle(client, { schema })
    }
    return Reflect.get(_db, prop)
  },
})
