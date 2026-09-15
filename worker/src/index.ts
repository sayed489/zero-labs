import { DeviceRelay } from './device-relay'
import type { DeviceRow, Env, PairingRow, UserRow } from './types'
import {
  generateUserCode,
  hashPassword,
  hmacHex,
  isValidEmail,
  json,
  normalizeUserCode,
  randomId,
  randomToken,
  readJson,
  sha256Hex,
  timingSafeEqual,
  verifyPassword,
  withCors,
} from './util'

export { DeviceRelay }

const SESSION_COOKIE = 'forge_session'
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000
const PAIR_TTL = 10 * 60 * 1000
const MAX_BODY_BYTES = 1_000_000
const SAFE_RPC_HEADERS = new Set(['accept', 'content-type', 'if-none-match', 'if-modified-since', 'range'])

type Session = { user: Pick<UserRow, 'id' | 'email'>; token: string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return withCors(request, new Response(null, { status: 204 }), env)

    let response: Response
    try {
      if (url.pathname === '/health') response = json({ ok: true, service: 'forge-relay' })
      else if (url.pathname === '/v1/auth/signup' && request.method === 'POST') response = await signUp(request, env)
      else if (url.pathname === '/v1/auth/signin' && request.method === 'POST') response = await signIn(request, env)
      else if (url.pathname === '/v1/auth/signout' && request.method === 'POST') response = await signOut(request, env)
      else if (url.pathname === '/v1/auth/session' && request.method === 'GET') response = await getSessionResponse(request, env)
      else if (url.pathname === '/v1/pair/start' && request.method === 'POST') response = await startPairing(request, env)
      else if (url.pathname === '/v1/pair/poll' && request.method === 'POST') response = await pollPairing(request, env)
      else if (url.pathname === '/v1/pair/claim' && request.method === 'POST') response = await claimPairing(request, env)
      else if (url.pathname === '/v1/devices' && request.method === 'GET') response = await listDevices(request, env)
      else if (/^\/v1\/devices\/[^/]+$/.test(url.pathname) && request.method === 'GET') response = await getDevice(request, env)
      else if (/^\/v1\/devices\/[^/]+$/.test(url.pathname) && request.method === 'DELETE') response = await deleteDevice(request, env)
      else if (/^\/v1\/devices\/[^/]+\/rpc(?:\/.*)?$/.test(url.pathname)) response = await relayRpc(request, env)
      else if (/^\/v1\/devices\/[^/]+\/events$/.test(url.pathname) && request.method === 'GET') response = await deviceEvents(request, env)
      else if (url.pathname === '/v1/device/connect' && request.method === 'GET') response = await connectDevice(request, env)
      else response = json({ error: 'Not found' }, 404)
    } catch (error) {
      console.error('Forge Worker request failed', error)
      response = json({ error: 'Internal server error' }, 500)
    }
    if (response.status === 101) return response
    return withCors(request, response, env)
  },
} satisfies ExportedHandler<Env>

async function signUp(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  if (!(await rateLimit(env, `signup:${clientIdentity(request)}`, 5, 60 * 60 * 1000))) {
    return json({ error: 'Too many account attempts. Try again later.' }, 429)
  }
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = body?.email?.trim().toLowerCase() || ''
  const password = body?.password || ''
  if (!isValidEmail(email) || password.length < 12 || password.length > 128) {
    return json({ error: 'Use a valid email and a password between 12 and 128 characters' }, 400)
  }
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return json({ error: 'An account with this email already exists' }, 409)

  const userId = randomId('usr_')
  const now = Date.now()
  const passwordHash = await hashPassword(password)
  await env.DB.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, email, passwordHash, now)
    .run()
  return createSession(env, { id: userId, email }, 201)
}

async function signIn(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  if (!(await rateLimit(env, `signin:${clientIdentity(request)}`, 20, 10 * 60 * 1000))) {
    return json({ error: 'Too many sign-in attempts. Try again later.' }, 429)
  }
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = body?.email?.trim().toLowerCase() || ''
  const password = body?.password || ''
  const user = await env.DB.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>()
  if (!user) {
    await hashPassword(password)
    return json({ error: 'Email or password is incorrect' }, 401)
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Email or password is incorrect' }, 401)
  }
  return createSession(env, { id: user.id, email: user.email })
}

async function signOut(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const token = cookie(request, SESSION_COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() })
}

async function getSessionResponse(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const session = await authenticate(request, env)
  return session ? json({ user: session.user }) : json({ user: null }, 401)
}

async function createSession(env: Env, user: Pick<UserRow, 'id' | 'email'>, status = 200): Promise<Response> {
  const token = randomToken(32)
  const now = Date.now()
  await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(randomId('ses_'), user.id, await sha256Hex(token), now + SESSION_TTL, now)
    .run()
  return json({ user }, status, { 'set-cookie': sessionCookie(token) })
}

async function startPairing(request: Request, env: Env): Promise<Response> {
  if (!(await rateLimit(env, `pair:${clientIdentity(request)}`, 20, 60 * 60 * 1000))) {
    return json({ error: 'Too many pairing attempts. Try again later.' }, 429)
  }
  const body = await readJson<{ name?: string; platform?: string }>(request)
  const name = cleanLabel(body?.name, 100)
  const platform = cleanLabel(body?.platform, 40)
  const deviceCode = randomToken(32)
  const now = Date.now()
  let userCode = generateUserCode()
  for (let tries = 0; tries < 4; tries += 1) {
    const exists = await env.DB.prepare('SELECT id FROM pairing_codes WHERE user_code = ?').bind(userCode).first()
    if (!exists) break
    userCode = generateUserCode()
  }
  await env.DB.prepare(`INSERT INTO pairing_codes
    (id, device_code_hash, user_code, device_name, platform, device_token_hash, status, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, '', 'pending', ?, ?)`) 
    .bind(randomId('pair_'), await sha256Hex(deviceCode), userCode, name, platform, now + PAIR_TTL, now)
    .run()
  return json({
    deviceCode,
    userCode,
    verificationUri: `${env.APP_URL.replace(/\/$/, '')}/pair`,
    verificationUriComplete: `${env.APP_URL.replace(/\/$/, '')}/pair?code=${encodeURIComponent(userCode)}`,
    expiresIn: PAIR_TTL / 1000,
    interval: 3,
  }, 201)
}

async function pollPairing(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ deviceCode?: string }>(request)
  if (!body?.deviceCode) return json({ error: 'deviceCode is required' }, 400)
  const row = await env.DB.prepare('SELECT * FROM pairing_codes WHERE device_code_hash = ?')
    .bind(await sha256Hex(body.deviceCode))
    .first<PairingRow>()
  if (!row || row.expires_at < Date.now()) return json({ status: 'expired' }, 410)
  if (row.status !== 'approved' || !row.device_id) return json({ status: 'pending' }, 202)

  const token = await deriveDeviceToken(await sha256Hex(body.deviceCode), row.device_id, env.BETTER_AUTH_SECRET)
  return json({
    status: 'approved',
    deviceId: row.device_id,
    deviceToken: token,
    websocketUrl: `${new URL(request.url).origin}/v1/device/connect?deviceId=${encodeURIComponent(row.device_id)}`,
  })
}

async function claimPairing(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const session = await authenticate(request, env)
  if (!session) return json({ error: 'Sign in required' }, 401)
  const body = await readJson<{ userCode?: string }>(request)
  const userCode = normalizeUserCode(body?.userCode || '')
  if (userCode.length !== 8) return json({ error: 'Enter the 8-character pairing code' }, 400)
  const formatted = `${userCode.slice(0, 4)}-${userCode.slice(4)}`
  const pair = await env.DB.prepare('SELECT * FROM pairing_codes WHERE user_code = ?').bind(formatted).first<PairingRow>()
  if (!pair || pair.expires_at < Date.now()) return json({ error: 'This pairing code is invalid or expired' }, 404)
  if (pair.status !== 'pending') return json({ error: 'This pairing code was already used' }, 409)

  const deviceId = randomId('dev_')
  const derivedToken = await deriveDeviceTokenHashFromPair(pair, deviceId, env)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO devices
      (id, user_id, name, platform, device_token_hash, daemon_ok, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)`).bind(deviceId, session.user.id, pair.device_name, pair.platform, derivedToken, now),
    env.DB.prepare(`UPDATE pairing_codes SET status = 'approved', user_id = ?, device_id = ?
      WHERE id = ? AND status = 'pending'`).bind(session.user.id, deviceId, pair.id),
  ])
  return json({ ok: true, deviceId })
}

async function listDevices(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const session = await authenticate(request, env)
  if (!session) return json({ error: 'Sign in required' }, 401)
  const result = await env.DB.prepare(`SELECT id, name, platform, daemon_ok, last_seen_at, created_at
    FROM devices WHERE user_id = ? ORDER BY created_at DESC`).bind(session.user.id).all()
  const devices = await Promise.all(result.results.map(async (row) => {
    const status = await deviceStub(env, String(row.id)).fetch('https://device/status')
    const live = await status.json<Record<string, unknown>>()
    return { ...row, online: Boolean(live.online), daemonOk: Boolean(live.daemonOk), lastSeenAt: live.lastSeenAt || row.last_seen_at }
  }))
  return json({ devices })
}

async function getDevice(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const session = await authenticate(request, env)
  if (!session) return json({ error: 'Sign in required' }, 401)
  const deviceId = pathPart(request, 3)
  const device = await ownedDevice(env, deviceId, session.user.id)
  if (!device) return json({ error: 'Device not found' }, 404)
  const liveResponse = await deviceStub(env, deviceId).fetch('https://device/status')
  const live = await liveResponse.json<Record<string, unknown>>()
  return json({ ...publicDevice(device), ...live })
}

async function deleteDevice(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const session = await authenticate(request, env)
  if (!session) return json({ error: 'Sign in required' }, 401)
  const deviceId = pathPart(request, 3)
  const result = await env.DB.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, session.user.id).run()
  return result.meta.changes ? json({ ok: true }) : json({ error: 'Device not found' }, 404)
}

async function connectDevice(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const deviceId = url.searchParams.get('deviceId') || ''
  const token = bearer(request)
  if (!deviceId || !token) return json({ error: 'Device credentials required' }, 401)
  const device = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(deviceId).first<DeviceRow>()
  if (!device || !timingSafeEqual(await sha256Hex(token), device.device_token_hash)) return json({ error: 'Invalid device credentials' }, 401)
  const headers = new Headers(request.headers)
  headers.set('X-Forge-Device-Id', deviceId)
  return deviceStub(env, deviceId).fetch(new Request('https://device/connect', { headers }))
}

async function relayRpc(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const session = await authenticate(request, env)
  if (!session) return json({ error: 'Sign in required' }, 401)
  const url = new URL(request.url)
  const deviceId = pathPart(request, 3)
  if (!(await ownedDevice(env, deviceId, session.user.id))) return json({ error: 'Device not found' }, 404)
  const prefix = `/v1/devices/${deviceId}/rpc`
  const rpcPath = url.pathname.slice(prefix.length) || '/'
  if (rpcPath.startsWith('/internal')) return json({ error: 'Forbidden' }, 403)
  if (rpcPath === '/sse/status' && request.method === 'GET') {
    return deviceStub(env, deviceId).fetch('https://device/events')
  }
  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413)
  const requestBody = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text()
  if (requestBody && new TextEncoder().encode(requestBody).byteLength > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413)
  const headers: Record<string, string> = {}
  for (const [key, value] of request.headers) if (SAFE_RPC_HEADERS.has(key.toLowerCase())) headers[key] = value
  return deviceStub(env, deviceId).fetch('https://device/rpc', {
    method: 'POST',
    body: JSON.stringify({
      id: randomId('rpc_'),
      method: request.method,
      path: rpcPath,
      query: url.searchParams.toString(),
      headers,
      body: requestBody,
    }),
    headers: { 'content-type': 'application/json' },
  })
}

async function deviceEvents(request: Request, env: Env): Promise<Response> {
  if (!isTrustedProxy(request, env)) return json({ error: 'Forbidden' }, 403)
  const session = await authenticate(request, env)
  if (!session) return json({ error: 'Sign in required' }, 401)
  const deviceId = pathPart(request, 3)
  if (!(await ownedDevice(env, deviceId, session.user.id))) return json({ error: 'Device not found' }, 404)
  return deviceStub(env, deviceId).fetch('https://device/events')
}

async function authenticate(request: Request, env: Env): Promise<Session | null> {
  const token = cookie(request, SESSION_COOKIE)
  if (!token) return null
  const now = Date.now()
  const row = await env.DB.prepare(`SELECT users.id, users.email, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(await sha256Hex(token), now)
    .first<{ id: string; email: string; expires_at: number }>()
  if (!row) return null
  return { user: { id: row.id, email: row.email }, token }
}

async function ownedDevice(env: Env, deviceId: string, userId: string): Promise<DeviceRow | null> {
  return env.DB.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').bind(deviceId, userId).first<DeviceRow>()
}

function publicDevice(device: DeviceRow) {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    daemonOk: Boolean(device.daemon_ok),
    lastSeenAt: device.last_seen_at,
    createdAt: device.created_at,
  }
}

function deviceStub(env: Env, deviceId: string): DurableObjectStub {
  return env.DEVICE.get(env.DEVICE.idFromName(deviceId))
}

async function deriveDeviceToken(deviceCodeHash: string, deviceId: string, secret: string): Promise<string> {
  return `${deviceId}.${await hmacHex(`${deviceCodeHash}.${deviceId}`, secret)}`
}

async function deriveDeviceTokenHashFromPair(pair: PairingRow, deviceId: string, env: Env): Promise<string> {
  const token = await deriveDeviceToken(pair.device_code_hash, deviceId, env.BETTER_AUTH_SECRET)
  return sha256Hex(token)
}

async function rateLimit(env: Env, rawKey: string, limit: number, windowMs: number): Promise<boolean> {
  const key = await sha256Hex(rawKey)
  const now = Date.now()
  const resetAt = now + windowMs
  await env.DB.prepare(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.reset_at END`)
    .bind(key, resetAt, now, now, resetAt)
    .run()
  const row = await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?').bind(key).first<{ count: number }>()
  return Boolean(row && row.count <= limit)
}

function clientIdentity(request: Request): string {
  return request.headers.get('X-Forge-Client-IP')
    || request.headers.get('CF-Connecting-IP')
    || 'unknown-client'
}

function isTrustedProxy(request: Request, env: Env): boolean {
  const provided = request.headers.get('X-Forge-Proxy') || ''
  return Boolean(env.WORKER_PROXY_SECRET) && timingSafeEqual(provided, env.WORKER_PROXY_SECRET)
}

function cookie(request: Request, name: string): string {
  const source = request.headers.get('Cookie') || ''
  for (const item of source.split(';')) {
    const [key, ...value] = item.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

function bearer(request: Request): string {
  const header = request.headers.get('Authorization') || ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function pathPart(request: Request, index: number): string {
  return new URL(request.url).pathname.split('/').filter(Boolean)[index - 1] || ''
}

function cleanLabel(value: string | undefined, max: number): string | null {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
  return cleaned || null
}
