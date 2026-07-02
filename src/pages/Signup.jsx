import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [efacId, setEfacId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    const { error } = await signUp({ email, password, fullName, efacId: efacId.trim() })
    setBusy(false)
    if (error) {
      const isUnique = error.code === '23505' || error.message?.includes('efac_id')
      setError(isUnique ? 'This EFAC ID is already registered' : error.message)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start learning in minutes.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" id="fullName">
          <input
            id="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="EFAC ID" id="efacId">
          <input
            id="efacId"
            type="text"
            required
            placeholder="EFAC-2026-0123"
            value={efacId}
            onChange={(e) => setEfacId(e.target.value)}
            className={inputClass}
          />
        </Field>
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
        <Field label="Password" id="password">
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </Field>
        <Field label="Confirm password" id="confirm">
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
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink/60">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-teal hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

// --- small shared bits, kept here so the file is self-contained ---
export const inputClass =
  'w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20'
export const btnClass =
  'w-full rounded-lg bg-orange px-4 py-2.5 font-medium text-navy transition hover:bg-orange-dark disabled:opacity-60'

export function Field({ label, id, children }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-ink/80">{label}</span>
      {children}
    </label>
  )
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/efac-logo.svg" alt="EFAC" className="mx-auto mb-5 h-14" />
          <h1 className="font-display text-2xl font-semibold text-navy">{title}</h1>
          <p className="mt-1 text-sm text-ink/60">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  )
}

export function PasswordInput({ id, value, onChange, show, onToggle, required = true }) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        required={required}
        value={value}
        onChange={onChange}
        className={`${inputClass} pr-10`}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink/40 hover:text-ink/70"
      >
        {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  )
}
