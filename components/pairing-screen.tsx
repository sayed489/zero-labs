'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import {
  CheckIcon,
  CopyIcon,
  LaptopIcon,
  LogOutIcon,
  MonitorIcon,
  PlusIcon,
  ShieldCheckIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new ApiError(response.status, data.error || 'Request failed')
  return data
}

const fetcher = <T,>(url: string) => api<T>(url)

type SessionData = { user: { id: string; email: string } }
type Device = {
  id: string
  name: string | null
  platform: string | null
  online: boolean
  daemonOk: boolean
  lastSeenAt: number | null
}

type PairingScreenProps = { initialCode?: string }

export function PairingScreen({ initialCode = '' }: PairingScreenProps) {
  const { data: session, error: sessionError, isLoading } = useSWR<SessionData>(
    '/api/relay/auth/session',
    fetcher,
    { shouldRetryOnError: false }
  )

  if (isLoading) return <LoadingScreen />
  if (sessionError instanceof ApiError && sessionError.status === 503) return <SetupRequired />
  if (!session?.user) return <AuthScreen initialCode={initialCode} />
  return <DeviceDashboard user={session.user} initialCode={initialCode} />
}

function AuthScreen({ initialCode }: { initialCode: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api(`/api/relay/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      await mutate('/api/relay/auth/session')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not continue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-8 px-5 py-10">
      <BrandHeader
        title={initialCode ? 'Sign in to approve your laptop.' : 'Your agents, wherever you are.'}
        description="Securely control Claude Code, Codex, Cursor, and Antigravity sessions running on your own laptop. No inbound ports or public daemon."
      />
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Sign in' : 'Create your account'}</CardTitle>
          <CardDescription>
            {initialCode ? `Pairing code ${formatCode(initialCode)} is waiting.` : 'Your laptops stay private to this account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={12}
                maxLength={128}
                required
              />
              {mode === 'signup' ? <p className="text-xs text-muted-foreground">Use at least 12 characters.</p> : null}
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Spinner /> : null}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError('')
              }}
            >
              {mode === 'signin' ? 'New to Forge? Create an account' : 'Already have an account? Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon className="size-4" />
        Passwords are salted and hashed. Session cookies are HttpOnly.
      </p>
    </main>
  )
}

function DeviceDashboard({ user, initialCode }: { user: SessionData['user']; initialCode: string }) {
  const [showInstall, setShowInstall] = useState(Boolean(!initialCode))
  const [code, setCode] = useState(formatCode(initialCode))
  const [claimError, setClaimError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const { data, isLoading } = useSWR<{ devices: Device[] }>('/api/relay/devices', fetcher, {
    refreshInterval: 5_000,
  })

  async function claim(event: React.FormEvent) {
    event.preventDefault()
    setClaimError('')
    setClaiming(true)
    try {
      await api('/api/relay/pair/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userCode: code }),
      })
      setClaimed(true)
      setCode('')
      await mutate('/api/relay/devices')
    } catch (caught) {
      setClaimError(caught instanceof Error ? caught.message : 'Could not pair this laptop')
    } finally {
      setClaiming(false)
    }
  }

  async function signOut() {
    await api('/api/relay/auth/signout', { method: 'POST' })
    await mutate(() => true, undefined, { revalidate: false })
    window.location.assign('/')
  }

  async function removeDevice(deviceId: string) {
    if (!window.confirm('Remove this laptop from your account? The local bridge will stop connecting.')) return
    await api(`/api/relay/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
    await mutate('/api/relay/devices')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex items-start justify-between gap-4">
        <BrandHeader title="Your laptops" description={user.email} compact />
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOutIcon data-icon="inline-start" />
          Sign out
        </Button>
      </header>

      {initialCode || code ? (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LaptopIcon className="size-5" /> Approve this laptop</CardTitle>
            <CardDescription>Only approve a code currently shown on a laptop you control.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={claim}>
              <Input
                value={code}
                onChange={(event) => setCode(formatCode(event.target.value))}
                placeholder="ABCD-EFGH"
                aria-label="Laptop pairing code"
                className="font-mono tracking-[0.15em]"
                maxLength={9}
                autoFocus
                required
              />
              <Button type="submit" disabled={claiming || normalizeCode(code).length !== 8}>
                {claiming ? <Spinner /> : <CheckIcon data-icon="inline-start" />}
                Approve
              </Button>
            </form>
            {claimError ? <p role="alert" className="mt-3 text-sm text-destructive">{claimError}</p> : null}
            {claimed ? <p className="mt-3 text-sm text-primary">Approved. The laptop will appear below when it connects.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Devices</h2>
            <p className="text-sm text-muted-foreground">Each connection is isolated and can be revoked here.</p>
          </div>
          <Button onClick={() => setShowInstall(!showInstall)} variant={showInstall ? 'secondary' : 'default'}>
            <PlusIcon data-icon="inline-start" />
            Add laptop
          </Button>
        </div>

        {showInstall ? <InstallCard /> : null}

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Spinner /> Loading laptops…</div>
        ) : data?.devices.length ? (
          <div className="grid gap-3">
            {data.devices.map((device) => (
              <Card key={device.id}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><MonitorIcon className="size-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{device.name || 'Laptop'}</p>
                      <p className="truncate text-xs text-muted-foreground">{device.platform || 'Unknown system'}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={device.online ? 'default' : 'secondary'}>{device.online ? 'Online' : 'Offline'}</Badge>
                    {device.online ? (
                      <Link className={buttonVariants({ size: 'sm' })} href={`/console?device=${encodeURIComponent(device.id)}`}>Open</Link>
                    ) : (
                      <Button size="sm" disabled>Open</Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void removeDevice(device.id)}
                      aria-label={`Remove ${device.name || 'laptop'}`}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <TerminalIcon className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium">No laptops paired yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Run the installer on your laptop, then approve its code.</p>
          </div>
        )}
      </section>
    </main>
  )
}

function InstallCard() {
  const [copied, setCopied] = useState('')
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const commands = useMemo(() => ({
    unix: `curl -fsSL ${origin}/install | bash`,
    windows: `irm ${origin}/install.ps1 | iex`,
  }), [origin])

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1600)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install Forge on your laptop</CardTitle>
        <CardDescription>The installer opens this site with a one-time code. Review it here, then approve.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="unix">
          <TabsList>
            <TabsTrigger value="unix">macOS / Linux</TabsTrigger>
            <TabsTrigger value="windows">Windows</TabsTrigger>
          </TabsList>
          {Object.entries(commands).map(([key, command]) => (
            <TabsContent key={key} value={key} className="mt-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted p-2 pl-3">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{command}</code>
                <Button size="sm" variant="outline" onClick={() => void copy(command, key)}>
                  {copied === key ? <CheckIcon /> : <CopyIcon />}
                  <span className="sr-only">Copy installer command</span>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {key === 'windows' ? 'Run in PowerShell as your normal user.' : 'Run in Terminal as your normal user. Do not use sudo.'}
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-6 px-5 py-10">
      <BrandHeader title="Relay setup required" description="The app is built, but its Cloudflare Worker URL and proxy secret have not been added yet." />
      <Alert>
        <ShieldCheckIcon />
        <AlertTitle>No unsafe fallback is running</AlertTitle>
        <AlertDescription>After the Worker is deployed, add CLOUDFLARE_WORKER_URL and WORKER_PROXY_SECRET in Vars. Account and laptop features will then turn on automatically.</AlertDescription>
      </Alert>
    </main>
  )
}

function LoadingScreen() {
  return <main className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading Forge…</main>
}

function BrandHeader({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] tracking-[0.28em] text-primary">FORGE</p>
      <h1 className={compact ? 'text-2xl font-medium tracking-tight' : 'text-3xl font-medium tracking-tight text-pretty'}>{title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function formatCode(value: string) {
  const clean = normalizeCode(value)
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}
