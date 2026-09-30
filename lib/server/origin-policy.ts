/** Exact-origin checks: sharing a hosting provider does not confer trust. */
export function hasTrustedOrigin(request: Request, configuredOrigins: Iterable<string> = []): boolean {
  const origin = request.headers.get('origin')
  if (!origin) {
    const site = request.headers.get('sec-fetch-site')
    return !site || site === 'same-origin' || site === 'none'
  }
  if (origin === 'null') return false
  const origins = new Set([new URL(request.url).origin, ...configuredOrigins])
  // Deployment proxies set these to the actual externally-facing request host.
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https'
  if (host && (proto === 'https' || proto === 'http')) origins.add(`${proto}://${host}`)
  return origins.has(origin)
}
