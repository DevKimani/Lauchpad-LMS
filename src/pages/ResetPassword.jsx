import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell, Field, btnClass, PasswordInput } from './Signup'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)   // true once we've confirmed a recovery session
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the user arrives via the reset link.
    // If the session is already a recovery session (e.g. page refresh), getSession
    // returns it directly. We listen for both to be safe.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true)
      } else {
        // Wait for the auth state change triggered by the URL hash tokens.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
              setReady(true)
              subscription.unsubscribe()
            }
          },
        )
        // Give it 3 seconds; if no session arrives, the link is invalid/expired.
        const timer = setTimeout(() => {
          subscription.unsubscribe()
          setInvalid(true)
        }, 3000)
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
        title="Link expired"
        subtitle="This reset link is invalid or has expired."
      >
        <p className="mb-4 text-center text-sm text-ink/70">
          Request a new one and try again.
        </p>
        <Link
          to="/forgot-password"
          className="block w-full rounded-lg bg-orange px-4 py-2.5 text-center font-medium text-navy transition hover:bg-orange-dark"
        >
          Request a new link
        </Link>
      </AuthShell>
    )
  }

  if (!ready) {
    return (
      <AuthShell title="One moment…" subtitle="Verifying your reset link.">
        <p className="text-center text-sm text-ink/50">Please wait…</p>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You're all set.">
        <p className="text-center text-sm text-ink/70">
          Your password has been updated. Redirecting you to the dashboard…
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something strong and memorable."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="New password" id="password">
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </Field>
        <Field label="Confirm new password" id="confirm">
          <PasswordInput
            id="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
          />
        </Field>
        {error && <p className="text-sm text-clay">{error}</p>}
        <button type="submit" disabled={busy} className={btnClass}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  )
}
