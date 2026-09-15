import { proxyRelayRequest } from '@/lib/relay'

export const runtime = 'nodejs'
export const maxDuration = 30

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const safePath = (path || []).filter((part) => part && part !== '.' && part !== '..')
  return proxyRelayRequest(request, `/v1/${safePath.join('/')}`)
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
