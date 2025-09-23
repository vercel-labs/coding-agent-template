import { nanoid } from 'nanoid'

export function generateId(length: number = 12): string {
  return nanoid(length)
}
