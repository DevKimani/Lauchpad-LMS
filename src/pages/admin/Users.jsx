import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Check, AlertCircle, Users, UserPlus, X } from 'lucide-react'
import Layout from '../../components/Layout'
import Avatar from '../../components/Avatar'
import { supabase } from '../../lib/supabase'

const ROLES = ['learner', 'instructor', 'admin']
const INVITE_ROLES = ['instructor', 'admin']

const ROLE_CHIP = {
  learner: 'bg-teal-light text-teal border-transparent',
  instructor: 'bg-orange-light text-orange border-transparent',
  admin: 'bg-navy/10 text-navy border-transparent',
}

const EMPTY_INVITE = { email: '', full_name: '', role: 'instructor' }

export default function AdminUsers() {
  const [profiles, setProfiles] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})   // { [id]: 'saving' | 'saved' }
  const [errors, setErrors] = useState({})
  // EFAC ID inline editing
  const [efacEdits, setEfacEdits] = useState({})     // { [id]: string }
  const [savingEfac, setSavingEfac] = useState({})   // { [id]: 'saving' | 'saved' }
  const [efacErrors, setEfacErrors] = useState({})
  // Invite panel
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE)
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteError, setInviteError] = useState('')
  const emailRef = useRef(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, efac_id, role, created_at, avatar_url')
      .order('full_name', { ascending: true })
      .then(({ data }) => {
        setProfiles(data ?? [])
        setLoading(false)
      })
  }, [])

  // Search by name or EFAC ID
  const visible = query.trim()
    ? profiles.filter((p) => {
        const q = query.trim().toLowerCase()
        return (
          (p.full_name ?? '').toLowerCase().includes(q) ||
          (p.efac_id ?? '').toLowerCase().includes(q)
        )
      })
    : profiles

  async function handleRoleChange(profile, newRole) {
    if (newRole === profile.role) return
    const prevRole = profile.role

    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, role: newRole } : p)),
    )
    setSaving((s) => ({ ...s, [profile.id]: 'saving' }))
    setErrors((e) => { const n = { ...e }; delete n[profile.id]; return n })

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profile.id)

    if (error) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, role: prevRole } : p)),
      )
      setErrors((e) => ({ ...e, [profile.id]: 'Failed to save — try again.' }))
      setSaving((s) => { const n = { ...s }; delete n[profile.id]; return n })
    } else {
      setSaving((s) => ({ ...s, [profile.id]: 'saved' }))
      setTimeout(() => {
        setSaving((s) => { const n = { ...s }; delete n[profile.id]; return n })
      }, 2200)
    }
  }

  async function handleEfacIdSave(profile) {
    const edited = efacEdits[profile.id]
    if (edited === undefined) return          // nothing typed yet
    const newVal = edited.trim()
    if (newVal === (profile.efac_id ?? '')) { // unchanged
      setEfacEdits((v) => { const n = { ...v }; delete n[profile.id]; return n })
      return
    }

    setSavingEfac((s) => ({ ...s, [profile.id]: 'saving' }))
    setEfacErrors((e) => { const n = { ...e }; delete n[profile.id]; return n })

    const { error } = await supabase
      .from('profiles')
      .update({ efac_id: newVal || null })
      .eq('id', profile.id)

    if (error) {
      const isUnique = error.code === '23505' || error.message?.includes('efac_id')
      setEfacErrors((e) => ({
        ...e,
        [profile.id]: isUnique ? 'EFAC ID already in use' : 'Save failed — try again.',
      }))
      setSavingEfac((s) => { const n = { ...s }; delete n[profile.id]; return n })
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, efac_id: newVal || null } : p)),
      )
      setEfacEdits((v) => { const n = { ...v }; delete n[profile.id]; return n })
      setSavingEfac((s) => ({ ...s, [profile.id]: 'saved' }))
      setTimeout(() => {
        setSavingEfac((s) => { const n = { ...s }; delete n[profile.id]; return n })
      }, 2200)
    }
  }

  function openInvite() {
    setInviteForm(EMPTY_INVITE)
    setInviteSuccess('')
    setInviteError('')
    setShowInvite(true)
    setTimeout(() => emailRef.current?.focus(), 50)
  }

  function closeInvite() {
    setShowInvite(false)
    setInviteSuccess('')
    setInviteError('')
  }

  function setInviteField(key) {
    return (e) => {
      setInviteForm((prev) => ({ ...prev, [key]: e.target.value }))
      setInviteError('')
      setInviteSuccess('')
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    const email = inviteForm.email.trim()
    const full_name = inviteForm.full_name.trim()
    if (!email || !full_name) {
      setInviteError('Email and full name are required.')
      return
    }
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email, full_name, role: inviteForm.role },
    })
    setInviting(false)
    if (error) {
      setInviteError(error.message ?? 'Failed to send invitation — try again.')
    } else {
      setInviteSuccess(`Invitation sent to ${email}`)
      setInviteForm(EMPTY_INVITE)
      setTimeout(() => emailRef.current?.focus(), 50)
    }
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/admin"
            className="text-xs font-medium text-teal hover:underline"
          >
            ← Admin overview
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
            Users
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            {loading
              ? 'Loading…'
              : `${profiles.length} account${profiles.length !== 1 ? 's' : ''}`}
            {' '}— change a role to approve or revoke instructor access.
          </p>
        </div>

        {/* Search + Invite */}
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="relative flex-1 sm:w-72 sm:flex-none">
            <Search
              size={15}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or EFAC ID…"
              aria-label="Search users"
              className="w-full rounded-lg border border-ink/20 bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </div>
          <button
            type="button"
            onClick={showInvite ? closeInvite : openInvite}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-navy transition hover:bg-orange-dark"
          >
            <UserPlus size={15} strokeWidth={2.5} aria-hidden="true" />
            Invite user
          </button>
        </div>
      </div>

      {/* Invite panel */}
      {showInvite && (
        <div className="mb-6 overflow-hidden rounded-xl border border-orange/30 bg-white">
          <div className="flex items-center justify-between border-b border-ink/10 bg-orange-tint px-6 py-3.5">
            <p className="text-sm font-semibold text-navy">Invite a staff member</p>
            <button
              type="button"
              onClick={closeInvite}
              aria-label="Close invite panel"
              className="rounded-md p-1 text-ink/40 transition hover:bg-ink/10 hover:text-ink"
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={handleInvite} noValidate className="p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label htmlFor="inv-email" className="mb-1.5 block text-xs font-semibold text-ink/60">
                  Email <span className="text-orange">*</span>
                </label>
                <input
                  ref={emailRef}
                  id="inv-email"
                  type="email"
                  value={inviteForm.email}
                  onChange={setInviteField('email')}
                  placeholder="staff@example.com"
                  className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                />
              </div>
              <div className="sm:col-span-1">
                <label htmlFor="inv-name" className="mb-1.5 block text-xs font-semibold text-ink/60">
                  Full name <span className="text-orange">*</span>
                </label>
                <input
                  id="inv-name"
                  type="text"
                  value={inviteForm.full_name}
                  onChange={setInviteField('full_name')}
                  placeholder="Jane Mwangi"
                  className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                />
              </div>
              <div>
                <label htmlFor="inv-role" className="mb-1.5 block text-xs font-semibold text-ink/60">
                  Role
                </label>
                <select
                  id="inv-role"
                  value={inviteForm.role}
                  onChange={setInviteField('role')}
                  className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={inviting}
                className="flex items-center gap-2 rounded-lg bg-teal px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:opacity-60"
              >
                {inviting ? 'Sending…' : 'Send invitation'}
              </button>
              {inviteSuccess && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-teal">
                  <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                  {inviteSuccess}
                </p>
              )}
              {inviteError && (
                <p className="flex items-center gap-1.5 text-sm text-clay">
                  <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />
                  {inviteError}
                </p>
              )}
            </div>
            <p className="mt-3 text-xs text-ink/40">
              An email with a secure link will be sent. The recipient sets their own password on arrival.
            </p>
          </form>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-ink/5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
          <Users
            size={32}
            strokeWidth={1.25}
            className="mx-auto mb-2 text-ink/20"
            aria-hidden="true"
          />
          <p className="text-sm text-ink/50">
            {query ? 'No users match that search.' : 'No users found.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-sand text-left">
                <th className="px-5 py-3 font-semibold text-ink/60">Name</th>
                <th className="hidden px-5 py-3 font-semibold text-ink/60 md:table-cell">
                  EFAC ID
                </th>
                <th className="hidden px-5 py-3 font-semibold text-ink/60 sm:table-cell">
                  Joined
                </th>
                <th className="px-5 py-3 font-semibold text-ink/60">Role</th>
                <th className="w-20 px-4 py-3" aria-hidden="true" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {visible.map((profile) => {
                const state = saving[profile.id]
                const err = errors[profile.id]
                const efacState = savingEfac[profile.id]
                const efacErr = efacErrors[profile.id]
                const efacValue = efacEdits[profile.id] ?? profile.efac_id ?? ''
                return (
                  <tr key={profile.id}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          url={profile.avatar_url}
                          name={profile.full_name}
                          className="h-8 w-8 shrink-0 text-xs font-extrabold"
                        />
                        <p className="font-medium text-ink">
                          {profile.full_name || (
                            <span className="italic text-ink/30">No name</span>
                          )}
                        </p>
                      </div>
                    </td>

                    {/* EFAC ID — editable */}
                    <td className="hidden px-5 py-3.5 md:table-cell">
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="text"
                          value={efacValue}
                          onChange={(e) =>
                            setEfacEdits((v) => ({ ...v, [profile.id]: e.target.value }))
                          }
                          onBlur={() => handleEfacIdSave(profile)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          placeholder="—"
                          aria-label={`EFAC ID for ${profile.full_name}`}
                          className="w-36 rounded border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-xs text-ink/70 outline-none transition hover:bg-sand/60 focus:border-teal/40 focus:bg-white focus:ring-1 focus:ring-teal/20"
                        />
                        {efacErr && (
                          <p className="flex items-center gap-1 text-[11px] text-clay">
                            <AlertCircle size={10} strokeWidth={2} aria-hidden="true" />
                            {efacErr}
                          </p>
                        )}
                        {efacState === 'saving' && (
                          <span className="text-[11px] text-ink/40">Saving…</span>
                        )}
                        {efacState === 'saved' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal">
                            <Check size={10} strokeWidth={2.5} aria-hidden="true" />
                            Saved
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="hidden px-5 py-3.5 text-ink/50 sm:table-cell">
                      {profile.created_at
                        ? new Date(profile.created_at).toLocaleDateString(
                            'en-GB',
                            { day: 'numeric', month: 'short', year: 'numeric' },
                          )
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        <select
                          value={profile.role}
                          onChange={(e) => handleRoleChange(profile, e.target.value)}
                          disabled={state === 'saving'}
                          aria-label={`Role for ${profile.full_name}`}
                          className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-teal/20 disabled:cursor-wait disabled:opacity-70 ${
                            ROLE_CHIP[profile.role] ?? 'border-ink/20 bg-white text-ink'
                          }`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </option>
                          ))}
                        </select>
                        {err && (
                          <p className="flex items-center gap-1 text-xs text-clay">
                            <AlertCircle size={11} strokeWidth={2} aria-hidden="true" />
                            {err}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {state === 'saving' && (
                        <span className="text-xs text-ink/40">Saving…</span>
                      )}
                      {state === 'saved' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-teal">
                          <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                          Saved
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
