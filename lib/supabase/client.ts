// Browser-side Supabase client. One instance per tab, or null when the
// configuration is missing or invalid (device-only mode).

'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from '@/lib/supabase/config'

let client: SupabaseClient | null = null
let initialized = false

export function supabaseBrowser(): SupabaseClient | null {
  if (initialized) return client
  initialized = true
  if (!supabaseConfigured) return null

  try {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
  } catch {
    // Auth is an optional enhancement. A bad key or URL must not crash the
    // browser app or make device-only pairing inaccessible.
    client = null
  }
  return client
}
