import { proxyRelayRequest } from '@/lib/relay'

export const runtime = 'nodejs'
export const maxDuration = 30

async function handler(
  request: Request,
  context: { params: Promise<{ deviceId: string; path: string[] }> }
) {
  const { deviceId, path } = await context.params
  const safeDeviceId = encodeURIComponent(deviceId)
  const safePath = (path || []).map(encodeURIComponent).join('/')
  return proxyRelayRequest(request, `/v1/devices/${safeDeviceId}/rpc/${safePath}`)
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
