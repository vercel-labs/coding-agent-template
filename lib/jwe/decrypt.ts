import { jwtDecrypt, base64url } from 'jose'

export async function decryptJWE<T extends string | object = any>(
  cyphertext: string,
  secret: string | undefined = process.env.JWE_SECRET,
): Promise<T | undefined> {
  if (!secret) {
    throw new Error('Missing JWE secret')
  }

  if (typeof cyphertext !== 'string') return

  try {
    const { payload } = await jwtDecrypt(cyphertext, base64url.decode(secret))
    const decoded = payload as T
    if (typeof decoded === 'object' && decoded !== null) {
      delete (decoded as Record<string, any>).iat
      delete (decoded as Record<string, any>).exp
    }
    return decoded
  } catch {
    // Do nothing
  }
}

