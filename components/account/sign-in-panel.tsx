'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { OsButton, OsNote, OsPill } from '@/components/computer/os/os-ui'
import { useAccount } from '@/lib/client/account'

export function SignInPanel() {
  const router = useRouter()
  const account = useAccount()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSent(false)
    setSending(true)
    try {
      await account.signInWithEmail(email)
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send a sign-in link.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="account-card land-panel" aria-labelledby="account-title">
      <OsPill tone={account.enabled ? 'good' : 'warn'}>
        {account.enabled ? 'Forge account' : 'Device-only mode'}
      </OsPill>
      <h1 className="land-h2" id="account-title">
        Sign in with email
      </h1>

      {!account.enabled ? (
        <>
          <OsNote>
            Accounts are unavailable in this deployment. You can still pair and use a laptop in this browser;
            cross-browser sync is off.
          </OsNote>
          <OsButton variant="primary" onClick={() => router.push('/')}>
            Back to Forge
          </OsButton>
        </>
      ) : account.loading ? (
        <OsNote>Checking your account…</OsNote>
      ) : account.user ? (
        <>
          <p className="account-email-label">Signed in as</p>
          <p className="account-email-value">{account.user.email || 'your email address'}</p>
          <OsNote>
            Laptops paired in this browser are saved to this account and can be restored on your other devices.
          </OsNote>
          {error ? <p className="account-error" role="alert">{error}</p> : null}
          <div className="os-actions">
            <OsButton variant="primary" onClick={() => router.push('/')}>
              Back to Forge
            </OsButton>
            <OsButton
              onClick={() => {
                setError('')
                void account.signOut().catch((cause: unknown) =>
                  setError(cause instanceof Error ? cause.message : 'Could not sign out.'),
                )
              }}
            >
              Sign out
            </OsButton>
          </div>
        </>
      ) : (
        <>
          <OsNote>We’ll email you a secure, one-time sign-in link. Your paired laptop will follow this account.</OsNote>
          <form className="account-signin-form" onSubmit={(event) => void requestLink(event)}>
            <label className="cli-field-label" htmlFor="forge-account-email">
              Email address
            </label>
            <input
              id="forge-account-email"
              className="account-email-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={sending}
            />
            <OsButton variant="primary" type="submit" disabled={sending || !email.trim()}>
              {sending ? 'Sending link…' : 'Email me a sign-in link'}
            </OsButton>
          </form>
          {sent ? <p className="account-success" role="status">Check your inbox for the sign-in link.</p> : null}
          {error ? <p className="account-error" role="alert">{error}</p> : null}
        </>
      )}
    </section>
  )
}
