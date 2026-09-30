// One live terminal: ticket → WebSocket → E2E handshake → encrypted PTY I/O.
//
//   browser ──POST /api/devices/{id}/terminal-ticket──▶ Next.js ──▶ relay
//   browser ◀───────────── { url, ticket } ────────────┘
//   browser ══ WebSocket(url) ══▶ relay ══▶ laptop bridge ══▶ real PTY
//
// The class owns the socket, the crypto channel and reconnection. Everything
// the UI needs arrives through the callbacks; everything the user types goes
// through send(). Frames are sealed with TerminalChannel before they touch
// the wire, so the relay only ever routes ciphertext.

import { ChannelError, TerminalChannel, toBase64 } from './terminal-crypto.ts'
import { packTerminal, unpackTerminal } from './terminal-frames.ts'

const CLIENT_ID_KEY = 'forge.terminal.clientId'
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 15_000
const REQUEST_TIMEOUT_MS = 20_000
const SOCKET_TIMEOUT_MS = 15_000
const HANDSHAKE_TIMEOUT_MS = 20_000

export type TerminalStatus =
  | 'connecting' // ticket minted, socket dialing, handshake pending
  | 'ready' // PTY is live; keystrokes flow
  | 'reconnecting' // lost the socket; retrying with a fresh ticket
  | 'offline' // the laptop is not connected to the relay
  | 'closed' // shell exited or the user closed the session

export type TerminalCallbacks = {
  onOutput: (data: Uint8Array) => void
  onStatus: (status: TerminalStatus, detail?: string) => void
  onReady?: (info: { sessionId: string; shell: string; cwd: string; cols: number; rows: number }) => void
  onExit?: (exitCode: number | null) => void
}

export type TerminalOptions = {
  deviceId: string
  phoneSecret: string
  /** Distinguishes multiple terminal surfaces in the same browser tab. */
  clientKey?: string
  cols: number
  rows: number
  cwd?: string
  shell?: string
}

/** Stable per terminal surface in this tab — the laptop remembers it across reconnects. */
export function terminalClientId(surface = 'default'): string {
  const storageKey = `${CLIENT_ID_KEY}:${surface}`
  try {
    // sessionStorage keeps two tabs (and the landing page's two terminal
    // surfaces) from replacing one another on the relay.
    const existing = sessionStorage.getItem(storageKey)
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing
    const fresh = crypto.randomUUID()
    sessionStorage.setItem(storageKey, fresh)
    return fresh
  } catch {
    return crypto.randomUUID()
  }
}

export class TerminalConnection {
  private readonly options: TerminalOptions
  private readonly callbacks: TerminalCallbacks
  private readonly clientId: string
  private channel: TerminalChannel
  private socket: WebSocket | null = null
  private sessionId: string | null = null
  private attempts = 0
  private closedByUser = false
  private connecting = false
  private ticketController: AbortController | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private socketTimer: ReturnType<typeof setTimeout> | null = null
  private sendQueue: Promise<void> = Promise.resolve()

  constructor(options: TerminalOptions, callbacks: TerminalCallbacks) {
    this.options = options
    this.callbacks = callbacks
    this.clientId = terminalClientId(options.clientKey ?? crypto.randomUUID())
    this.channel = new TerminalChannel()
  }

  async connect(): Promise<void> {
    if (this.connecting || (this.socket && this.socket.readyState < WebSocket.CLOSING)) return
    this.closedByUser = false
    this.connecting = true
    this.callbacks.onStatus(this.attempts > 0 ? 'reconnecting' : 'connecting')
    let url: string
    try {
      url = await this.mintTicket()
    } catch (cause) {
      this.connecting = false
      if (!this.closedByUser) this.scheduleReconnect(errorMessage(cause, 'ticket request failed'))
      return
    }
    if (this.closedByUser) {
      this.connecting = false
      return
    }

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (cause) {
      this.connecting = false
      this.scheduleReconnect(errorMessage(cause, 'could not open terminal socket'))
      return
    }
    this.connecting = false
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    const channel = new TerminalChannel()
    this.channel = channel
    this.startSocketTimer(socket, SOCKET_TIMEOUT_MS, 'WebSocket connection timed out')

    socket.onopen = () => {
      if (this.socket !== socket || this.closedByUser) return
      this.startSocketTimer(socket, HANDSHAKE_TIMEOUT_MS, 'Laptop did not open a PTY in time')
      const open = {
        type: this.sessionId ? 'term_attach' : 'term_open',
        sessionId: this.sessionId ?? undefined,
        cols: this.options.cols,
        rows: this.options.rows,
        cwd: this.options.cwd,
        shell: this.options.shell,
        clientId: this.clientId,
        clientPub: toBase64(channel.publicKey),
        clientSalt: toBase64(channel.sendSalt),
      }
      try {
        socket.send(JSON.stringify(open))
      } catch (cause) {
        this.failSocket(socket, errorMessage(cause, 'could not open a PTY'))
      }
    }

    // WebSocket preserves message order, but each handler below performs async
    // crypto work. Serialize the handlers too: otherwise term_ready or the
    // first encrypted PTY output can overtake term_key's WebCrypto import.
    let receiveQueue: Promise<void> = Promise.resolve()
    socket.onmessage = (event) => {
      receiveQueue = receiveQueue
        .then(async () => {
          if (this.socket !== socket || this.closedByUser) return
          if (typeof event.data === 'string') await this.onControl(event.data, socket, channel)
          else await this.onBinary(event.data as ArrayBuffer, socket, channel)
        })
        .catch((cause) => {
          if (this.socket === socket) {
            this.failSocket(socket, errorMessage(cause, 'terminal handshake failed'))
          }
        })
    }

    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.clearSocketTimer()
      this.socket = null
      if (this.closedByUser) return
      if (event.code === 4012) {
        this.closedByUser = true
        this.callbacks.onStatus('closed', 'This terminal was opened somewhere else.')
        return
      }
      const reason = event.reason || `socket closed (${event.code})`
      if (event.code === 4004) {
        this.callbacks.onStatus('offline', 'The laptop is not connected.')
      }
      this.scheduleReconnect(reason)
    }
    socket.onerror = () => {
      // Some browsers follow an error with close; the timeout covers browsers
      // that leave a failed WebSocket in CONNECTING without either event.
      if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
        this.failSocket(socket, 'terminal WebSocket failed')
      }
    }
  }

  /** Encrypt and send raw keystrokes. */
  send(data: string): void {
    const socket = this.socket
    const channel = this.channel
    const sessionId = this.sessionId
    if (
      !sessionId ||
      !channel.ready ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return
    }
    // Seals are async; the queue keeps the nonce counter and the wire in order.
    this.sendQueue = this.sendQueue
      .then(async () => {
        if (
          this.socket !== socket ||
          this.channel !== channel ||
          this.sessionId !== sessionId ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return
        }
        const sealed = await channel.sealText(data)
        if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
          socket.send(packTerminal(sessionId, this.clientId, sealed))
        }
      })
      .catch((cause) => {
        if (this.socket === socket) this.failSocket(socket, errorMessage(cause, 'terminal send failed'))
      })
  }

  resize(cols: number, rows: number): void {
    this.options.cols = cols
    this.options.rows = rows
    if (
      this.sessionId &&
      this.channel.ready &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      this.socket.send(JSON.stringify({ type: 'term_resize', sessionId: this.sessionId, cols, rows }))
    }
  }

  /** Leave the session running on the laptop and drop the socket. */
  detach(): void {
    this.closedByUser = true
    this.connecting = false
    this.ticketController?.abort()
    this.ticketController = null
    this.clearSocketTimer()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.sessionId && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'term_detach', sessionId: this.sessionId }))
    }
    this.socket?.close(1000, 'detach')
    this.socket = null
  }

  /** Kill the shell on the laptop, then drop the socket. */
  close(): void {
    this.closedByUser = true
    this.connecting = false
    this.ticketController?.abort()
    this.ticketController = null
    this.clearSocketTimer()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.sessionId && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'term_close', sessionId: this.sessionId }))
    }
    this.socket?.close(1000, 'close')
    this.socket = null
    this.sessionId = null
  }

  // -- internals -------------------------------------------------------------

  private async mintTicket(): Promise<string> {
    const controller = new AbortController()
    this.ticketController = controller
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(this.options.deviceId)}/terminal-ticket`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.phoneSecret}`,
        },
        body: JSON.stringify({ clientId: this.clientId }),
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok || !data.url) {
        throw new Error(data.error || `ticket request failed (${response.status})`)
      }
      return data.url
    } finally {
      clearTimeout(timeout)
      if (this.ticketController === controller) this.ticketController = null
    }
  }

  private async onControl(raw: string, socket: WebSocket, channel: TerminalChannel): Promise<void> {
    let frame: Record<string, unknown>
    try {
      frame = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    const type = String(frame.type ?? '')

    if (type === 'term_key') {
      await channel.finish(
        this.options.deviceId,
        this.clientId,
        String(frame.devicePub ?? ''),
        String(frame.deviceSalt ?? ''),
      )
      return
    }
    if (type === 'term_ready') {
      const sessionId = String(frame.sessionId ?? '')
      if (!sessionId || !channel.ready) {
        throw new Error('The laptop did not complete terminal encryption.')
      }
      if (this.socket !== socket || this.closedByUser) return
      this.clearSocketTimer()
      this.attempts = 0
      this.sessionId = sessionId
      this.callbacks.onStatus('ready')
      this.callbacks.onReady?.({
        sessionId,
        shell: String(frame.shell ?? ''),
        cwd: String(frame.cwd ?? ''),
        cols: Number(frame.cols) || this.options.cols,
        rows: Number(frame.rows) || this.options.rows,
      })
      return
    }
    if (type === 'term_eof') {
      const exitCode = frame.exitCode == null ? null : Number(frame.exitCode)
      this.sessionId = null
      this.closedByUser = true
      this.clearSocketTimer()
      this.callbacks.onStatus('closed', exitCode == null ? 'Shell exited.' : `Shell exited (${exitCode}).`)
      this.callbacks.onExit?.(exitCode)
      return
    }
    if (type === 'term_error') {
      this.clearSocketTimer()
      this.callbacks.onStatus('offline', String(frame.message ?? 'terminal error'))
      return
    }
    if (type === 'status' && frame.online === false) {
      this.failSocket(socket, 'The laptop is not connected.')
      return
    }
    if (type === 'error') {
      const code = String(frame.code ?? '')
      if (code === 'SESSION_NOT_FOUND') this.sessionId = null
      this.failSocket(socket, String(frame.message ?? (code || 'relay rejected terminal connection')))
      return
    }
    if (type === 'bye') {
      this.failSocket(socket, String(frame.reason ?? 'The laptop disconnected.'))
    }
  }

  private async onBinary(data: ArrayBuffer, socket: WebSocket, channel: TerminalChannel): Promise<void> {
    const frame = unpackTerminal(data)
    if (!frame || frame.clientId !== this.clientId) return
    try {
      const plaintext = await channel.open(frame.sealed)
      if (this.socket === socket && !this.closedByUser) this.callbacks.onOutput(plaintext)
    } catch (cause) {
      if (cause instanceof ChannelError) throw cause
      throw new Error(errorMessage(cause, 'terminal output could not be decrypted'))
    }
  }

  private startSocketTimer(socket: WebSocket, timeoutMs: number, message: string): void {
    this.clearSocketTimer()
    this.socketTimer = setTimeout(() => {
      if (this.socket === socket) this.failSocket(socket, message)
    }, timeoutMs)
  }

  private clearSocketTimer(): void {
    if (this.socketTimer) clearTimeout(this.socketTimer)
    this.socketTimer = null
  }

  private failSocket(socket: WebSocket, reason: string): void {
    if (this.socket !== socket) return
    this.clearSocketTimer()
    this.socket = null
    try {
      socket.close(4000, reason.slice(0, 120))
    } catch {
      // The socket may already be closing.
    }
    this.scheduleReconnect(reason)
  }

  private scheduleReconnect(reason: string): void {
    if (this.closedByUser) return
    this.attempts += 1
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(this.attempts - 1, 4))
    this.callbacks.onStatus('reconnecting', reason)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}
