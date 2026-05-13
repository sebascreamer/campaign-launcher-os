// lib/crypto.ts
// AES-256-GCM encryption for Meta access tokens
// NEVER store tokens in plaintext

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY not set in environment variables')
  const buf = Buffer.from(key, 'base64')
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64 encoded)')
  return buf
}

export function encryptToken(plaintext: string): string {
  const KEY = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decryptToken(encryptedData: string): string {
  const KEY = getKey()
  const [ivHex, tagHex, encryptedHex] = encryptedData.split(':')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid encrypted token format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
