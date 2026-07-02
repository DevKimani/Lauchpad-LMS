import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AuthShell, Field, btnClass, PasswordInput } from './Signup'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await signIn({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else navigate('/dashboard')
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue learning.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email" id="email">
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
        </Field>
        <div>
          <Field label="Password" id="password">
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </Field>
          <div className="mt-1 text-right">
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-teal hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        {error && <p className="text-sm text-clay">{error}</p>}
        <button type="submit" disabled={busy} className={btnClass}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink/60">
        New here?{' '}
        <Link to="/signup" className="font-medium text-teal hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}
