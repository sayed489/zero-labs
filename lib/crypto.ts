export function publicOrigin(request: Request) {
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    || request.headers.get('host')
    || new URL(request.url).host
  return `${proto}://${host}`
}
