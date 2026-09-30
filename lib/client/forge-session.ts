export const FORGE_SESSION_KEY = 'forge.v1'
export const FORGE_CONSOLE_KEY = 'forge.console.v1'

export type ForgeSession = {
  code: string
  phoneSecret: string
  expiresAt?: string
  deviceId?: string
  hostname?: string
  daemonOnline?: boolean
}

export type ConsolePrefs = {
  provider?: string
  cwd?: string
  sessionId?: string
}

/** Pair codes expire; a claimed device credential does not expire with its code. */
export function isUsableForgeSession(value: unknown, now = Date.now()): value is ForgeSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<ForgeSession>
  if (typeof session.phoneSecret !== 'string' || !session.phoneSecret.trim()) return false
  if (typeof session.deviceId === 'string' && session.deviceId.trim()) return true
  if (typeof session.code !== 'string' || !session.code.trim()) return false
  if (!session.expiresAt) return true
  const expiresAt = Date.parse(session.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now
}

export function readForgeSession(): ForgeSession | null {
  try {
    const raw = localStorage.getItem(FORGE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ForgeSession
    if (!isUsableForgeSession(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeForgeSession(session: ForgeSession) {
  localStorage.setItem(FORGE_SESSION_KEY, JSON.stringify(session))
}

export function clearForgeSession() {
  localStorage.removeItem(FORGE_SESSION_KEY)
}

export function readConsolePrefs(): ConsolePrefs {
  try {
    return JSON.parse(localStorage.getItem(FORGE_CONSOLE_KEY) || '{}') as ConsolePrefs
  } catch {
    return {}
  }
}

export function writeConsolePrefs(prefs: ConsolePrefs) {
  localStorage.setItem(FORGE_CONSOLE_KEY, JSON.stringify(prefs))
}
