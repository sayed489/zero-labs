'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

const PROFILE_KEY = 'agentremote.profiles'

type Device = {
  id: string
  name: string | null
  platform: string | null
  online: boolean
  daemonOk: boolean
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status })
  return data
}

export function ConsoleFrame({ requestedDeviceId }: { requestedDeviceId: string }) {
  const router = useRouter()
  const { data, error, isLoading } = useSWR<{ devices: Device[] }>('/api/relay/devices', fetcher)
  const device = useMemo(
    () => data?.devices.find((item) => item.id === requestedDeviceId) || data?.devices[0],
    [data, requestedDeviceId]
  )
  const { data: status } = useSWR<Device>(
    device ? `/api/relay/devices/${encodeURIComponent(device.id)}` : null,
    fetcher,
    { refreshInterval: 4_000 }
  )

  useEffect(() => {
    if (error && (error as { status?: number }).status === 401) router.replace('/')
  }, [error, router])

  useEffect(() => {
    if (!device) return
    const origin = window.location.origin
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      profiles: [{
        id: device.id,
        name: device.name || 'Laptop',
        baseUrl: `${origin}/d/${device.id}`,
        token: 'account-session',
        enabled: true,
      }],
      settings: {},
    }))
  }, [device])

  if (isLoading) {
    return <main className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading console…</main>
  }
  if (!device) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="font-medium">No laptop is paired with this account.</p>
        <Link className={buttonVariants()} href="/">Pair a laptop</Link>
      </main>
    )
  }

  const current = status || device
  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-foreground/10 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/" className="font-mono text-[11px] tracking-[0.2em] text-primary sm:tracking-[0.28em]">FORGE</Link>
          <span className="max-w-32 truncate text-sm sm:max-w-none">{current.name || 'Laptop'}</span>
          <Badge variant={current.online ? 'default' : 'secondary'}>{current.online ? 'Online' : 'Offline'}</Badge>
          <Badge className="hidden sm:inline-flex" variant={current.daemonOk ? 'secondary' : 'outline'}>
            {current.daemonOk ? 'Daemon ready' : 'Daemon starting'}
          </Badge>
        </div>
        <Link href="/" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">Devices</Link>
      </header>
      {current.online ? (
        <iframe key={device.id} title="Agent Remote" src="/ar/index.html" className="size-full border-0 bg-background" />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <p className="font-medium">Laptop is offline</p>
          <p className="max-w-sm text-sm text-muted-foreground">Start the Forge service on the laptop, then this console will reconnect automatically.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
        </main>
      )}
    </div>
  )
}
