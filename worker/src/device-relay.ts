import type { Env } from './types'
import { json, randomId } from './util'

type PendingRequest = {
  resolve: (response: Response) => void
  timer: ReturnType<typeof setTimeout>
}

type RelayStatus = {
  daemonOk: boolean
  status: unknown
  lastSeenAt: number | null
}

const EMPTY_STATUS: RelayStatus = { daemonOk: false, status: { active: [] }, lastSeenAt: null }
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

export class DeviceRelay implements DurableObject {
  private readonly state: DurableObjectState
  private readonly env: Env
  private readonly pending = new Map<string, PendingRequest>()
  private deviceId = ''

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/connect') return this.connectSocket(request)
    if (url.pathname === '/rpc' && request.method === 'POST') return this.rpc(request)
    if (url.pathname === '/status') return json(await this.getStatus())
    if (url.pathname === '/events') return this.events(request.signal)
    return json({ error: 'Not found' }, 404)
  }

  async webSocketMessage(_socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let payload: Record<string, unknown>
    try {
      const raw = typeof message === 'string' ? message : new TextDecoder().decode(message)
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }

    const now = Date.now()
    if (payload.type === 'hello' || payload.type === 'heartbeat') {
      const status: RelayStatus = {
        daemonOk: Boolean(payload.daemonOk),
        status: payload.status ?? { active: [] },
        lastSeenAt: now,
      }
      await this.state.storage.put('status', status)
      if (this.deviceId) {
        await this.env.DB.prepare('UPDATE devices SET daemon_ok = ?, last_seen_at = ? WHERE id = ?')
          .bind(status.daemonOk ? 1 : 0, now, this.deviceId)
          .run()
      }
      return
    }

    if (payload.type !== 'result' || typeof payload.id !== 'string') return
    const pending = this.pending.get(payload.id)
    if (!pending) return
    this.pending.delete(payload.id)
    clearTimeout(pending.timer)

    if (payload.error) {
      pending.resolve(json({ error: String(payload.error) }, 502))
      return
    }

    const headers = new Headers()
    const sourceHeaders = payload.responseHeaders
    if (sourceHeaders && typeof sourceHeaders === 'object') {
      for (const [key, value] of Object.entries(sourceHeaders as Record<string, unknown>)) {
        if (!HOP_BY_HOP.has(key.toLowerCase()) && typeof value === 'string') headers.set(key, value)
      }
    }
    if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8')
    pending.resolve(new Response(typeof payload.responseBody === 'string' ? payload.responseBody : '', {
      status: typeof payload.responseStatus === 'number' ? payload.responseStatus : 200,
      headers,
    }))
  }

  async webSocketClose(): Promise<void> {
    await this.markOffline()
  }

  async webSocketError(): Promise<void> {
    await this.markOffline()
  }

  private async connectSocket(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket upgrade required' }, 426)
    }
    this.deviceId = request.headers.get('X-Forge-Device-Id') || this.deviceId
    for (const existing of this.state.getWebSockets('laptop')) existing.close(4001, 'Replaced by a newer connection')

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.state.acceptWebSocket(server, ['laptop'])
    await this.state.storage.put('status', { ...EMPTY_STATUS, lastSeenAt: Date.now() })
    return new Response(null, { status: 101, webSocket: client })
  }

  private async rpc(request: Request): Promise<Response> {
    const sockets = this.state.getWebSockets('laptop')
    const socket = sockets.at(0)
    if (!socket) return json({ error: 'Laptop is offline' }, 503)

    const job = await request.json<Record<string, unknown>>()
    const id = typeof job.id === 'string' ? job.id : randomId('rpc_')
    const response = new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(json({ error: 'Laptop did not answer in time' }, 504))
      }, 28_000)
      this.pending.set(id, { resolve, timer })
    })

    try {
      socket.send(JSON.stringify({ ...job, id, type: 'rpc' }))
    } catch {
      const pending = this.pending.get(id)
      if (pending) clearTimeout(pending.timer)
      this.pending.delete(id)
      return json({ error: 'Laptop connection was lost' }, 503)
    }
    return response
  }

  private async getStatus(): Promise<RelayStatus & { online: boolean }> {
    const saved = (await this.state.storage.get<RelayStatus>('status')) || EMPTY_STATUS
    const online = this.state.getWebSockets('laptop').length > 0
    return { ...saved, online }
  }

  private events(signal: AbortSignal): Response {
    const encoder = new TextEncoder()
    let timer: ReturnType<typeof setInterval> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const push = async () => {
          const status = await this.getStatus()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(status.status)}\n\n`))
        }
        await push()
        timer = setInterval(() => void push().catch(() => {}), 2_500)
        setTimeout(() => {
          if (timer) clearInterval(timer)
          try { controller.close() } catch { /* already closed */ }
        }, 22_000)
        signal.addEventListener('abort', () => {
          if (timer) clearInterval(timer)
          try { controller.close() } catch { /* already closed */ }
        }, { once: true })
      },
      cancel: () => {
        if (timer) clearInterval(timer)
      },
    })
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
      },
    })
  }

  private async markOffline(): Promise<void> {
    const saved = (await this.state.storage.get<RelayStatus>('status')) || EMPTY_STATUS
    await this.state.storage.put('status', { ...saved, lastSeenAt: Date.now() })
  }
}
