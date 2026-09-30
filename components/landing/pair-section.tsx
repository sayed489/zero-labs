'use client'

/** The minimal pairing surface: heading, platform tabs, command, status, console. */

import { PairPanel } from '@/components/pairing/pair-panel'
import type { Pairing } from '@/components/pairing/use-pairing'
import type { PairedMachine } from '@/lib/client/use-paired-machine'

export function PairSection({
  pairing,
  paired,
  onContinue,
}: {
  pairing: Pairing
  paired: PairedMachine
  onContinue(): void
}) {
  return (
    <section className="land-section" id="pair">
      <header className="land-section-head">
        <h2 className="land-h2">Pair a laptop</h2>
      </header>

      <div className="land-pair-grid">
        <div className="land-panel">
          <PairPanel
            pairing={pairing}
            machineOnline={paired.online}
            machineStatusKnown={paired.ready}
            machineHostname={paired.hostname}
            onContinue={onContinue}
          />
        </div>
      </div>
    </section>
  )
}
