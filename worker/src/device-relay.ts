import type { Env } from './types'
import { json } from './util'

type Pending = {
  resolve: (response: Response) => void
  timer: ReturnType<typeof setTimeout>
}

type ActiveStream = {
  controller: ReadableStreamDefaultController<Uint8Array>
  idleTimer: ReturnType<typeof setTimeout>
  lifetimeTimer: ReturnType<typeof setTimeout>
}

type RpcPayload = {
  id: string
  method: string
  path: string
  query?: string
  headers?: Record<string, string>
  body?: string | null
}

type SocketMessage = {
  type?: string
  id?: string
  responseStatus?: number
  responseHeaders?: Record<string, string>
  responseBody?: string
  error?: string
  encoding?: string
  data?: string
  daemonOk?: boolean
  status?: unknown
}

const FIRST_BYTE_TIMEOUT_MS = 45_000
const STREAM_IDLE_TIMEOUT_MS = 60_000
const STREAM_MAX_LIFETIME_MS = 60 * 60_000
const HEARTBEAT_TIMEOUT_MS = 35_000
const ALLOWED_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-disposition',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
  'x-forge-binary',
])

export class DeviceRelay implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private socket: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private streams = new Map<string, ActiveStream>()
  private online = false
  private daemonOk = false
  private lastSeenAt: number | null = null
  private latestStatus: unknown = null
  private statusSubscribers = new Set<ReadableStreamDefaultController<Uint8Array>>()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/connect') return this.connectDevice(request)
    if (url.pathname === '/rpc' && request.method === 'POST') return this.rpc(request)
    if (url.pathname === '/status') return json(this.status())
    if (url.pathname === '/events') return this.events(request)
    return json({ error: 'Not found' }, 404)
  }

  private async connectDevice(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket required' }, 426)
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()
    this.closeSocket('Replaced by a new connection')
    this.socket = server
    this.online = true
    this.lastSeenAt = Date.now()
    server.addEventListener('message', (event) => this.onMessage(event))
    server.addEventListener('close', () => this.onDisconnect(server))
    server.addEventListener('error', () => this.onDisconnect(server))
    this.scheduleHeartbeatCheck(server)
    this.broadcastStatus()
    return new Response(null, { status: 101, webSocket: client })
  }

  private async rpc(request: Request): Promise<Response> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.online) {
      return json({ error: 'Device is offline' }, 503)
    }
    const payload = await request.json<RpcPayload>()
    if (!payload.id || !payload.path || !payload.method) return json({ error: 'Invalid RPC request' }, 400)

    const response = new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(payload.id)
        resolve(json({ error: 'Device did not begin responding in time' }, 504))
      }, FIRST_BYTE_TIMEOUT_MS)
      this.pending.set(payload.id, { resolve, timer })
    })
    try {
      this.socket.send(JSON.stringify({ type: 'rpc', ...payload }))
    } catch {
      const pending = this.pending.get(payload.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(payload.id)
        pending.resolve(json({ error: 'Device disconnected' }, 503))
      }
    }
    return response
  }

  private onMessage(event: MessageEvent) {
    if (typeof event.data !== 'string') return
    let message: SocketMessage
    try {
      message = JSON.parse(event.data) as SocketMessage
    } catch {
      return
    }
    this.lastSeenAt = Date.now()
    if (message.type === 'hello' || message.type === 'heartbeat') {
      this.daemonOk = Boolean(message.daemonOk)
      this.latestStatus = message.status ?? this.latestStatus
      this.online = true
      this.broadcastStatus()
      return
    }
    if (!message.id) return
    if (message.type === 'result') this.finishBuffered(message)
    else if (message.type === 'stream_start') this.startStream(message)
    else if (message.type === 'stream_chunk') this.pushStream(message)
    else if (message.type === 'stream_end') this.closeStream(message.id)
    else if (message.type === 'stream_error') this.errorStream(message.id, message.error || 'Device stream failed')
  }

  private finishBuffered(message: SocketMessage) {
    const pending = this.pending.get(message.id || '')
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id || '')
    const headers = this.safeHeaders(message.responseHeaders)
    pending.resolve(new Response(message.responseBody || '', {
      status: message.responseStatus || (message.error ? 502 : 200),
      headers,
    }))
  }

  private startStream(message: SocketMessage) {
    const id = message.id || ''
    const pending = this.pending.get(id)
    if (!pending || this.streams.has(id)) return
    clearTimeout(pending.timer)
    this.pending.delete(id)

    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value },
      cancel: () => this.dropStream(id),
    })
    const stream: ActiveStream = {
      controller,
      idleTimer: setTimeout(() => this.errorStream(id, 'Device stream became idle'), STREAM_IDLE_TIMEOUT_MS),
      lifetimeTimer: setTimeout(() => this.errorStream(id, 'Device stream exceeded one hour'), STREAM_MAX_LIFETIME_MS),
    }
    this.streams.set(id, stream)
    pending.resolve(new Response(body, {
      status: message.responseStatus || 200,
      headers: this.safeHeaders(message.responseHeaders),
    }))
  }

  private pushStream(message: SocketMessage) {
    const id = message.id || ''
    const stream = this.streams.get(id)
    if (!stream || typeof message.data !== 'string') return
    clearTimeout(stream.idleTimer)
    stream.idleTimer = setTimeout(() => this.errorStream(id, 'Device stream became idle'), STREAM_IDLE_TIMEOUT_MS)
    try {
      stream.controller.enqueue(message.encoding === 'base64'
        ? decodeBase64(message.data)
        : new TextEncoder().encode(message.data))
    } catch {
      this.dropStream(id)
    }
  }

  private closeStream(id: string) {
    const stream = this.streams.get(id)
    if (!stream) return
    this.clearStreamTimers(stream)
    this.streams.delete(id)
    try { stream.controller.close() } catch { /* client already disconnected */ }
  }

  private errorStream(id: string, message: string) {
    const stream = this.streams.get(id)
    if (!stream) return
    this.clearStreamTimers(stream)
    this.streams.delete(id)
    try { stream.controller.error(new Error(message)) } catch { /* client already disconnected */ }
  }

  private dropStream(id: string) {
    const stream = this.streams.get(id)
    if (!stream) return
    this.clearStreamTimers(stream)
    this.streams.delete(id)
  }

  private clearStreamTimers(stream: ActiveStream) {
    clearTimeout(stream.idleTimer)
    clearTimeout(stream.lifetimeTimer)
  }

  private safeHeaders(source?: Record<string, string>) {
    const headers = new Headers()
    for (const [key, value] of Object.entries(source || {})) {
      if (ALLOWED_RESPONSE_HEADERS.has(key.toLowerCase())) headers.set(key, value)
    }
    headers.set('cache-control', 'no-store')
    return headers
  }

  private events(request: Request): Response {
    const encoder = new TextEncoder()
    let controllerRef: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controllerRef = controller
        this.statusSubscribers.add(controller)
        controller.enqueue(encoder.encode(`event: status\ndata: ${JSON.stringify(this.status())}\n\n`))
      },
      cancel: () => { this.statusSubscribers.delete(controllerRef) },
    })
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    const lastEventId = request.headers.get('Last-Event-ID')
    if (lastEventId) headers.set('X-Forge-Resume', lastEventId)
    return new Response(stream, { headers })
  }

  private broadcastStatus() {
    const bytes = new TextEncoder().encode(`event: status\ndata: ${JSON.stringify(this.status())}\n\n`)
    for (const controller of [...this.statusSubscribers]) {
      try { controller.enqueue(bytes) } catch { this.statusSubscribers.delete(controller) }
    }
  }

  private status() {
    return {
      online: this.online,
      daemonOk: this.daemonOk,
      lastSeenAt: this.lastSeenAt,
      status: this.latestStatus,
    }
  }

  private scheduleHeartbeatCheck(socket: WebSocket) {
    setTimeout(() => {
      if (this.socket !== socket) return
      if (!this.lastSeenAt || Date.now() - this.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        this.closeSocket('Heartbeat timeout')
        return
      }
      this.scheduleHeartbeatCheck(socket)
    }, HEARTBEAT_TIMEOUT_MS)
  }

  private onDisconnect(socket: WebSocket) {
    if (this.socket !== socket) return
    this.closeSocket('Device disconnected')
  }

  private closeSocket(reason: string) {
    if (this.socket) {
      try { this.socket.close(1000, reason.slice(0, 120)) } catch { /* already closed */ }
    }
    this.socket = null
    this.online = false
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve(json({ error: reason }, 503))
      this.pending.delete(id)
    }
    for (const id of [...this.streams.keys()]) this.errorStream(id, reason)
    this.broadcastStatus()
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
