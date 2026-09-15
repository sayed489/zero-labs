import 'server-only'

const FORWARDED_HEADERS = new Set([
  'accept',
  'content-type',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'range',
])

export function relayConfigured() {
  return Boolean(process.env.CLOUDFLARE_WORKER_URL && process.env.WORKER_PROXY_SECRET)
}

export async function proxyRelayRequest(request: Request, pathname: string): Promise<Response> {
  const relayUrl = process.env.CLOUDFLARE_WORKER_URL?.replace(/\/$/, '')
  const proxySecret = process.env.WORKER_PROXY_SECRET
  if (!relayUrl || !proxySecret) {
    return Response.json(
      { error: 'Forge relay is not configured yet. Add CLOUDFLARE_WORKER_URL and WORKER_PROXY_SECRET.' },
      { status: 503 }
    )
  }

  if (!isSafeRequestOrigin(request)) {
    return Response.json({ error: 'Request origin is not allowed' }, { status: 403 })
  }

  const sourceUrl = new URL(request.url)
  const target = new URL(pathname, `${relayUrl}/`)
  target.search = sourceUrl.search
  const headers = new Headers()
  for (const [key, value] of request.headers) {
    if (FORWARDED_HEADERS.has(key.toLowerCase())) headers.set(key, value)
  }
  headers.set('X-Forge-Proxy', proxySecret)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (clientIp) headers.set('X-Forge-Client-IP', clientIp)

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer()
  if (body && body.byteLength > 2_000_000) {
    return Response.json({ error: 'Payload too large' }, { status: 413 })
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    })
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Cache-Control', 'no-store')
    responseHeaders.delete('access-control-allow-origin')
    responseHeaders.delete('access-control-allow-credentials')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch {
    return Response.json({ error: 'Forge relay is unavailable' }, { status: 502 })
  }
}

function isSafeRequestOrigin(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true
  const origin = request.headers.get('origin')
  if (!origin) return true
  const allowed = new Set<string>()
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')
  if (forwardedHost) allowed.add(`${protocol}://${forwardedHost}`)
  allowed.add(new URL(request.url).origin)
  for (const key of ['V0_RUNTIME_URL', 'V0_DEV_APP_URL', 'V0_BUILD_URL', 'V0_SANDBOX_URL']) {
    const value = process.env[key]
    if (value) {
      try { allowed.add(new URL(value.startsWith('http') ? value : `https://${value}`).origin) } catch { /* invalid environment value */ }
    }
  }
  return allowed.has(origin)
}
