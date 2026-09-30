import { PUBLISHED_APP_ORIGIN } from '@/lib/server/app-origin'
import { allowedOrigins, proxySecret, relayUrl } from '@/lib/server/env'
import { json } from '@/lib/server/http'
import { hasTrustedOrigin } from '@/lib/server/origin-policy'

const PHONE_SECRET_HEADER = 'x-forge-phone-secret'

export function requireSameOrigin(request: Request) {
  if (hasTrustedOrigin(request, [PUBLISHED_APP_ORIGIN, ...allowedOrigins()])) return null
  return json({ error: 'Cross-origin request blocked' }, 403)
}

export function phoneSecret(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim()
  const headerToken = request.headers.get(PHONE_SECRET_HEADER) || request.headers.get('x-auth-token')
  if (headerToken) return headerToken.trim()
  return new URL(request.url).searchParams.get('token')?.trim() ?? ''
}

export async function relayFetch(path: string, init: RequestInit = {}) {
  const base = relayUrl()
  const secret = proxySecret()
  // A malformed URL used to reach fetch() as `function relayUrl(){…}/v1/pairs`
  // and surface as a 502 "relay unavailable", which sent one engineer looking at
  // the network instead of at the string. Fail here, with the value, instead.
  if (!base || !/^https?:\/\//.test(base) || !secret) {
    return json(
      {
        error: base
          ? `CLOUDFLARE_WORKER_URL must be an http(s) URL (got "${base}")`
          : 'Forge relay is not configured',
        code: 'RELAY_NOT_CONFIGURED',
      },
      503,
    )
  }

  const headers = new Headers(init.headers)
  headers.set('x-forge-proxy-secret', secret)
  headers.set('accept', headers.get('accept') ?? 'application/json')
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(20_000),
    })
    return relayResponse(response)
  } catch {
    return json({ error: 'Forge relay is unavailable', code: 'RELAY_UNAVAILABLE' }, 502)
  }
}

export async function relayResponse(response: Response) {
  const headers = new Headers()
  const contentType = response.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  headers.set('cache-control', 'no-store')
  headers.set('x-content-type-options', 'nosniff')
  return new Response(response.body, { status: response.status, headers })
}

export function relayPhoneHeaders(request: Request) {
  const headers = new Headers()
  const secret = phoneSecret(request)
  if (secret) headers.set(PHONE_SECRET_HEADER, secret)
  return headers
}
