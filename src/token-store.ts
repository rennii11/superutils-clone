import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

type TokenEnvelope = { version: 1; algorithm: 'aes-256-gcm'; iv: string; tag: string; ciphertext: string }

function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY?.trim() || ''
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte hex value')
  return Buffer.from(value, 'hex')
}

function encoded(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Token decryption failed')
  const decoded = Buffer.from(value, 'base64')
  if (!decoded.length || decoded.toString('base64') !== value) throw new Error('Token decryption failed')
  return decoded
}

function envelope(value: unknown): value is TokenEnvelope {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    (value as TokenEnvelope).version === 1 && (value as TokenEnvelope).algorithm === 'aes-256-gcm' &&
    typeof (value as TokenEnvelope).iv === 'string' && typeof (value as TokenEnvelope).tag === 'string' && typeof (value as TokenEnvelope).ciphertext === 'string'
}

export function serializeToken(token: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const value: TokenEnvelope = { version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
  return JSON.stringify(value, null, 2)
}

function decryptToken(value: TokenEnvelope) {
  try {
    const iv = encoded(value.iv), tag = encoded(value.tag), ciphertext = encoded(value.ciphertext)
    if (iv.length !== 12 || tag.length !== 16) throw new Error('invalid envelope')
    const decipher = createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Token decryption failed')
  }
}

export function readStoredToken(raw: string) {
  const text = raw.trim()
  if (!text) return ''
  try {
    const value = JSON.parse(text) as unknown
    if (envelope(value)) return decryptToken(value)
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { token?: unknown }).token === 'string') return (value as { token: string }).token.trim()
  } catch (error) {
    if (error instanceof Error && error.message === 'Token decryption failed') throw error
  }
  return text
}
