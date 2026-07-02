import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell, Field, inputClass, btnClass } from './Signup'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })
    setBusy(false)
    setSent(true)
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-ink/80">
            If an account exists for that email, we've sent a reset link. Check your inbox.
          </p>
          <Link
            to="/login"
            className="block text-sm font-medium text-teal hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" id="email">
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <button type="submit" disabled={busy} className={btnClass}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-center text-sm text-ink/60">
            <Link to="/login" className="font-medium text-teal hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
