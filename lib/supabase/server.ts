// Server-side Supabase client for route handlers and server components.
// Returns null when keys are not configured (device-only mode); callers must
// treat that as "no accounts, not an error".

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from '@/lib/supabase/config'

export async function supabaseServer(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return null
  try {
    const cookieStore = await cookies()
    return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server components cannot set cookies; middleware refreshes them.
          }
        },
      },
    })
  } catch {
    // Account setup is optional; invalid config/cookie state falls back to
    // local pairing instead of turning API routes into an import-time failure.
    return null
  }
}

/** The signed-in user, or null in device-only mode / signed-out. */
export async function currentUser(): Promise<User | null> {
  try {
    const supabase = await supabaseServer()
    if (!supabase) return null
    const { data, error } = await supabase.auth.getUser()
    return error ? null : data.user ?? null
  } catch {
    return null
  }
}
