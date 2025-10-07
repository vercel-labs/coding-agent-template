import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

const getEncryptionKey = (): Buffer | null => {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    return null
  }
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY must be a 32-byte hex string (64 characters). Generate one with: openssl rand -hex 32',
    )
  }
  return keyBuffer
}

export const encrypt = (text: string): string => {
  if (!text) return text

  const ENCRYPTION_KEY = getEncryptionKey()
  if (!ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required for MCP encryption. Generate one with: openssl rand -hex 32',
    )
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export const decrypt = (encryptedText: string): string => {
  if (!encryptedText) return encryptedText

  const ENCRYPTION_KEY = getEncryptionKey()
  if (!ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required for MCP decryption. Generate one with: openssl rand -hex 32',
    )
  }

  if (!encryptedText.includes(':')) {
    throw new Error('Invalid encrypted text format')
  }

  try {
    const [ivHex, encryptedHex] = encryptedText.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

    return decrypted.toString('utf8')
  } catch (error) {
    throw new Error('Failed to decrypt: ' + (error instanceof Error ? error.message : 'unknown error'))
  }
}
