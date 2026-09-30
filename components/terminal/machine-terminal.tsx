'use client'

// The real terminal: xterm.js in the browser, a live PTY on the laptop.
//
//   keystrokes → TerminalConnection.seal → relay (ciphertext only) → bridge → PTY
//   PTY output → bridge.seal → relay → TerminalConnection.open → xterm.js
//
// xterm.js is imported lazily inside the effect because it touches `window`
// at module scope and must never run during server rendering.

import { useEffect, useId, useRef, useState } from 'react'
import type { Terminal as XtermTerminal } from '@xterm/xterm'

import {
  TerminalConnection,
  type TerminalStatus,
} from '@/lib/client/terminal-connection'

import '@xterm/xterm/css/xterm.css'

const THEME = {
  background: '#071e28',
  foreground: '#d8ecd8',
  cursor: '#7dd87d',
  cursorAccent: '#071e28',
  selectionBackground: '#2d5b46',
}

const STATUS_LABEL: Record<TerminalStatus, string> = {
  connecting: 'Connecting to your machine…',
  ready: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Laptop offline',
  closed: 'Session ended',
}

export function MachineTerminal({
  deviceId,
  phoneSecret,
  cwd,
  hostname,
}: {
  deviceId: string
  phoneSecret: string
  cwd?: string
  hostname?: string
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const clientKey = useId()
  const [status, setStatus] = useState<TerminalStatus>('connecting')
  const [detail, setDetail] = useState('')
  const [title, setTitle] = useState('')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    let connection: TerminalConnection | null = null
    let terminal: XtermTerminal | null = null
    let onData: { dispose(): void } | null = null
    let onResize: { dispose(): void } | null = null
    let observer: ResizeObserver | null = null
    let resizeFallback: (() => void) | null = null

    const cleanup = () => {
      observer?.disconnect()
      if (resizeFallback) window.removeEventListener('resize', resizeFallback)
      onData?.dispose()
      onResize?.dispose()
      connection?.detach()
      terminal?.dispose()
    }

    void (async () => {
      try {
        const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-web-links'),
        ])
        if (disposed) return

        terminal = new Terminal({
          cursorBlink: true,
          fontFamily: 'var(--font-ibm), ui-monospace, monospace',
          fontSize: 13,
          lineHeight: 1.2,
          scrollback: 5_000,
          theme: THEME,
        })
        const fit = new FitAddon()
        terminal.loadAddon(fit)
        terminal.loadAddon(new WebLinksAddon())
        terminal.open(mount)
        fit.fit()

        connection = new TerminalConnection(
          {
            deviceId,
            phoneSecret,
            clientKey,
            cols: terminal.cols,
            rows: terminal.rows,
            cwd: cwd || undefined,
          },
          {
            onOutput: (data) => terminal?.write(data),
            onStatus: (next, message) => {
              setStatus(next)
              setDetail(message ?? '')
            },
            onReady: (info) => {
              setTitle(`${info.shell} — ${info.cwd}`)
              terminal?.focus()
            },
            onExit: () => {
              terminal?.write('\r\n\x1b[2m[shell exited — close this window to finish]\x1b[0m\r\n')
            },
          },
        )

        onData = terminal.onData((data) => connection?.send(data))
        onResize = terminal.onResize(({ cols, rows }) => connection?.resize(cols, rows))
        const resize = () => {
          try {
            fit.fit()
          } catch {
            // The pane can be zero-sized mid-transition; the next tick fits fine.
          }
        }
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(resize)
          observer.observe(mount)
        } else {
          resizeFallback = resize
          window.addEventListener('resize', resizeFallback)
        }

        void connection.connect()
      } catch (cause) {
        cleanup()
        if (!disposed) {
          setStatus('offline')
          setDetail(cause instanceof Error ? cause.message : 'Terminal could not be initialized')
        }
      }
    })()

    return () => {
      disposed = true
      cleanup()
    }
    // The terminal binds to one device pairing for its whole life; cwd is
    // only the starting directory and must not restart the shell on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, phoneSecret])

  return (
    <section className="machine-term">
      <header className="machine-term-bar">
        <span className={`machine-term-dot machine-term-dot--${status}`} aria-hidden />
        <span>{STATUS_LABEL[status]}</span>
        <span className="machine-term-title">{detail || title || hostname || ''}</span>
      </header>
      <div ref={mountRef} className="machine-term-screen" />
    </section>
  )
}
