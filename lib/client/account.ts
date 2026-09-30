'use client'

// Account state for the browser: who is signed in, and the machines saved to
// that account. When Supabase is missing or unreachable, account features stay
// inert and the app continues with localStorage pairing.

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

import { supabaseBrowser } from '@/lib/supabase/client'

export type Machine = {
  id: string
  device_id: string
  phone_secret: string
  name: string
  platform: string
  created_at: string
  last_seen_at: string | null
}

export function useAccount() {
  const supabase = supabaseBrowser()
  const enabled = supabase !== null
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!supabase) {
      setUser(null)
      setLoading(false)
      return
    }

    let cancelled = false
    let authEventVersion = 0
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventVersion += 1
      setUser(session?.user ?? null)
      setLoading(false)
    })

    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled || authEventVersion > 0) return
        setUser(error ? null : data.user ?? null)
      })
      .catch(() => {
        if (!cancelled && authEventVersion === 0) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [supabase])

  const signInWithEmail = useCallback(
    async (email: string) => {
      if (!supabase) throw new Error('Accounts are not configured')
      const address = email.trim()
      if (!address) throw new Error('Enter your email address first.')
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw new Error(error.message)
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
  }, [supabase])

  return { enabled, loading, user, signInWithEmail, signOut }
}

/** Save the current pairing to the signed-in account (no-op when signed out). */
export async function saveMachineToAccount(machine: {
  deviceId: string
  phoneSecret: string
  name?: string
  platform?: string
}): Promise<boolean> {
  try {
    const response = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(machine),
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

/** Machines saved to the account, oldest first. */
export async function loadAccountMachines(): Promise<Machine[]> {
  try {
    const response = await fetch('/api/machines', { cache: 'no-store' })
    if (!response.ok) return []
    const data = (await response.json().catch(() => ({}))) as { machines?: Machine[] }
    return data.machines ?? []
  } catch {
    // Network/auth/schema failures only disable cross-browser sync; the local
    // pairing remains usable and the landing page still renders.
    return []
  }
}
