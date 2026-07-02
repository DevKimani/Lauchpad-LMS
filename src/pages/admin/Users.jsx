import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Check, AlertCircle, Users } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'

const ROLES = ['learner', 'instructor', 'admin']

const ROLE_CHIP = {
  learner: 'bg-teal-light text-teal border-transparent',
  instructor: 'bg-orange-light text-orange border-transparent',
  admin: 'bg-navy/10 text-navy border-transparent',
}

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

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, efac_id, role, created_at')
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

        {/* Search */}
        <div className="relative w-full sm:w-72">
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
      </div>

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
                      <p className="font-medium text-ink">
                        {profile.full_name || (
                          <span className="italic text-ink/30">No name</span>
                        )}
                      </p>
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
