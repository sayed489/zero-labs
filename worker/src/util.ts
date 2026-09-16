import type { Env } from './types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export function withCors(request: Request, response: Response, env: Env): Response {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Forge-Proxy')
  headers.set('Access-Control-Max-Age', '86400')

  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Vary', 'Origin')
  }

  return new Response(response.body, { status: response.status, headers })
}

export function b64url(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomId(prefix = ''): string {
  return prefix + b64url(crypto.getRandomValues(new Uint8Array(16)))
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return b64url(bytes)
}

export async function hmacHex(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input))
  return b64url(signature)
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Cloudflare Workers rejects PBKDF2 above 100,000 iterations with a
// NotSupportedError, so this is the strongest value the runtime allows.
// The count is stored in each hash, so verifyPassword still accepts hashes
// written with a different iteration count.
const PBKDF2_ITERATIONS = 100_000

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations <= 0) return false
  const salt = fromB64url(parts[2])
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  )
  return timingSafeEqual(b64url(bits), parts[3])
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return b64url(signature)
}

export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)))
  return `${body}.${await hmac(body, secret)}`
}

export async function verifyToken<T extends Record<string, unknown>>(
  token: string,
  secret: string
): Promise<(T & { exp?: number }) | null> {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  if (!timingSafeEqual(signature, await hmac(body, secret))) return null
  try {
    const payload = JSON.parse(decoder.decode(fromB64url(body))) as T & { exp?: number }
    if (typeof payload.exp === 'number' && payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export function normalizeUserCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateUserCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = [...bytes].map((byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`
}
