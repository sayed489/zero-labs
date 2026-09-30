// Supabase account configuration. Accounts are optional: an invalid or missing
// configuration must leave Forge in local, device-only mode instead of taking
// down pairing, the terminal, or the landing page.
//
// Supabase accepts the newer publishable key and the legacy anon JWT. Prefer
// the publishable key when both are configured, while keeping older Vercel
// projects working without a migration window.

const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

export const SUPABASE_URL = rawUrl.replace(/\/+$/, '')
export const SUPABASE_KEY = publishableKey || anonKey

function validProjectUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export const supabaseConfigured = Boolean(SUPABASE_KEY && validProjectUrl(SUPABASE_URL))
