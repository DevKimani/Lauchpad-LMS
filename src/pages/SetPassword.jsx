import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthShell, Field, btnClass, PasswordInput } from './Signup'
import { supabase } from '../lib/supabase'

export default function SetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase JS picks up the invite tokens from the URL hash and fires SIGNED_IN.
    // If the page is refreshed after the tokens were already exchanged, getSession
    // returns the live session directly.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true)
      } else {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
              setReady(true)
              subscription.unsubscribe()
            }
          },
        )
        const timer = setTimeout(() => {
          subscription.unsubscribe()
          setInvalid(true)
        }, 4000)
        return () => {
          clearTimeout(timer)
          subscription.unsubscribe()
        }
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    }
  }

  if (invalid) {
    return (
      <AuthShell
        title="Link invalid or expired"
        subtitle="This invite link is invalid or has already been used."
      >
        <p className="text-center text-sm text-ink/70">
          Ask your administrator to send a new invitation.
        </p>
      </AuthShell>
    )
  }

  if (!ready) {
    return (
      <AuthShell title="One moment…" subtitle="Verifying your invite link.">
        <p className="text-center text-sm text-ink/50">Please wait…</p>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell title="Password set!" subtitle="Welcome to Launchpad.">
        <p className="text-center text-sm text-ink/70">
          Redirecting you to the dashboard…
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Welcome to Launchpad"
      subtitle="Set your password to finish activating your account."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Password" id="sp-password">
          <PasswordInput
            id="sp-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </Field>
        <Field label="Confirm password" id="sp-confirm">
          <PasswordInput
            id="sp-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
          />
        </Field>
        {error && <p className="text-sm text-clay">{error}</p>}
        <button type="submit" disabled={busy} className={btnClass}>
          {busy ? 'Setting password…' : 'Set password'}
        </button>
      </form>
    </AuthShell>
  )
}
