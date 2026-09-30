'use client'

/**
 * Minimal pairing controls shared by the landing page and the hero's Connect
 * window. The page heading, platform tabs, install command/copy action, live
 * status, and console action stay in the same order wherever this is rendered.
 */

import { OsButton, OsPill } from '@/components/computer/os/os-ui'
import type { Pairing } from '@/components/pairing/use-pairing'

const STATUS_COPY: Record<Pairing['status'], { label: string; tone: 'idle' | 'good' | 'warn' | 'bad'; hint: string }> = {
  idle: { label: 'Not started', tone: 'idle', hint: 'Generate an install command to begin.' },
  loading: { label: 'Working', tone: 'warn', hint: 'Creating a one-time pairing code…' },
  waiting: { label: 'Waiting', tone: 'warn', hint: 'Run the command on your laptop.' },
  claimed: { label: 'Claimed', tone: 'warn', hint: 'Waiting for the laptop bridge to connect.' },
  online: { label: 'Online', tone: 'good', hint: 'Your laptop is live.' },
  error: { label: 'Error', tone: 'bad', hint: 'The relay could not be reached.' },
}

export function PairPanel({
  pairing,
  compact = false,
  machineOnline = false,
  machineStatusKnown = false,
  machineHostname = '',
  onContinue,
}: {
  pairing: Pairing
  compact?: boolean
  /** A machine restored from the signed-in account is online independently of pairing state. */
  machineOnline?: boolean
  machineStatusKnown?: boolean
  machineHostname?: string
  onContinue?: () => void
}) {
  const pairStatus = pairing.status === 'online' && machineStatusKnown && !machineOnline
    ? 'claimed'
    : pairing.status
  const connected = machineStatusKnown ? machineOnline : pairStatus === 'online'
  const status = STATUS_COPY[connected ? 'online' : pairStatus]
  const hostname = pairing.hostname || machineHostname
  const statusText = pairing.privateOrigin && !connected
    ? `This preview host is private; the laptop must reach ${pairing.appOrigin}.`
    : hostname
      ? `${hostname} · ${status.hint}`
      : status.hint

  return (
    <div className={`pair-pane${compact ? ' pair-pane-compact' : ''}`}>
      <div className="pair-platform" role="tablist" aria-label="Laptop platform">
        <button
          type="button"
          role="tab"
          aria-selected={pairing.platform === 'unix'}
          className="pair-platform-tab"
          onClick={() => pairing.setPlatform('unix')}
        >
          macOS / Linux
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pairing.platform === 'windows'}
          className="pair-platform-tab"
          onClick={() => pairing.setPlatform('windows')}
        >
          Windows
        </button>
      </div>

      <div className="pair-command-block">
        <span className="pair-kicker">Install command</span>
        <pre className="pair-command">
          {pairing.command || (pairing.status === 'loading' ? 'Creating your command…' : 'Generate a one-time command to pair a laptop.')}
        </pre>
        <div className="pair-actions">
          <OsButton
            variant="primary"
            onClick={() => void (pairing.code ? pairing.copy() : pairing.start())}
            disabled={pairing.status === 'loading'}
          >
            {pairing.status === 'loading'
              ? 'Generating…'
              : pairing.code
                ? pairing.copied
                  ? 'Copied ✓'
                  : 'Copy install command'
                : 'Get install command'}
          </OsButton>
        </div>
      </div>

      <div className="pair-status" role="status">
        <OsPill tone={status.tone}>{status.label}</OsPill>
        <span>{statusText}</span>
      </div>
      {pairing.error ? <p className="pair-error">{pairing.error}</p> : null}

      {connected && onContinue ? (
        <OsButton variant="primary" onClick={onContinue}>
          Open console →
        </OsButton>
      ) : null}
    </div>
  )
}
