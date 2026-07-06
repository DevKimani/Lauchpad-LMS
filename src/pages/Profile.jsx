import { useEffect, useRef, useState } from 'react'
import TopNav from '../components/TopNav'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── canvas resize / compress ──────────────────────────────────────────────────

const MAX_PX = 512
const MAX_BIO = 300

async function resizeToJpeg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        'image/jpeg',
        0.85,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read image file'))
    }
    img.src = objectUrl
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Field({ id, label, required, children, error }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink/70">
        {label}
        {required && <span className="ml-0.5 text-orange">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-clay">{error}</p>}
    </div>
  )
}

function ReadOnlyField({ label, value, mono }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-20 shrink-0 text-sm font-semibold text-ink/50">{label}</dt>
      <dd className={`text-sm text-ink ${mono ? 'font-mono' : ''}`}>{value || '—'}</dd>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const { session, profile: authProfile, refreshProfile } = useAuth()
  const userId = session?.user?.id
  const email = session?.user?.email ?? ''

  const [form, setForm] = useState({ full_name: '', phone: '', bio: '', linkedin_url: '' })
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [efacId, setEfacId] = useState('—')
  const [role, setRole] = useState('—')
  const [loaded, setLoaded] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [formErrors, setFormErrors] = useState({})

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef(null)

  // ── load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('full_name, phone, bio, linkedin_url, efac_id, role, avatar_url')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setForm({
            full_name: data.full_name ?? '',
            phone: data.phone ?? '',
            bio: data.bio ?? '',
            linkedin_url: data.linkedin_url ?? '',
          })
          setAvatarUrl(data.avatar_url ?? null)
          setEfacId(data.efac_id ?? '—')
          setRole(data.role ?? '—')
        }
        setLoaded(true)
      })
  }, [userId])

  // ── form ──────────────────────────────────────────────────────────────────

  function setField(key) {
    return (e) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      setFormErrors((prev) => { const n = { ...prev }; delete n[key]; return n })
      setSaved(false)
    }
  }

  function validate() {
    const errs = {}
    if (!form.full_name.trim()) errs.full_name = 'Name is required'
    if (form.linkedin_url.trim() && !/^https?:\/\//.test(form.linkedin_url.trim())) {
      errs.linkedin_url = 'Must start with http:// or https://'
    }
    return errs
  }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return }
    setSaving(true)
    setSaveError('')
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
      })
      .eq('id', userId)
    if (error) {
      setSaveError(error.message)
    } else {
      setSaved(true)
      await refreshProfile()
    }
    setSaving(false)
  }

  // ── avatar upload ─────────────────────────────────────────────────────────

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // allow re-selecting same file

    setUploading(true)
    setUploadError('')
    try {
      const blob = await resizeToJpeg(file)
      const path = `${userId}/avatar-${Date.now()}.jpg`

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = data.publicUrl

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
      if (profErr) throw profErr

      setAvatarUrl(publicUrl)
      await refreshProfile()
    } catch (err) {
      setUploadError(err.message ?? 'Upload failed — please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="min-h-screen bg-paper">
        <TopNav />
        <div className="flex justify-center py-20">
          <p className="animate-pulse text-muted">Loading…</p>
        </div>
      </div>
    )
  }

  const bioOver = form.bio.length > MAX_BIO

  return (
    <div className="min-h-screen bg-paper">
      <TopNav />
      <main className="mx-auto max-w-[640px] px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="efac-eyebrow text-orange">Account</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-navy">Your profile</h1>
          <p className="mt-1 text-sm text-ink/60">
            Keep your details up to date for instructors and the EFAC team.
          </p>
        </div>

        <form onSubmit={handleSave} noValidate>

          {/* ── Avatar ───────────────────────────────────────────────────────── */}
          <div className="efac-card mb-5 p-6">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              {/* Preview */}
              <div className="relative shrink-0">
                <Avatar
                  url={avatarUrl}
                  name={form.full_name || authProfile?.full_name}
                  className="h-24 w-24 text-2xl"
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40">
                    <span className="text-[10px] font-bold text-white">Uploading…</span>
                  </div>
                )}
              </div>

              {/* Control */}
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-sm font-semibold text-ink">Profile photo</p>
                <p className="mt-0.5 text-xs text-muted">
                  JPG, PNG or GIF · automatically resized to {MAX_PX}&thinsp;px
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleAvatarChange}
                  aria-label="Upload profile photo"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="mt-3 rounded-[10px] border border-line bg-card px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-ink/30 disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : 'Upload photo'}
                </button>
                {uploadError && (
                  <p className="mt-2 text-xs text-clay">{uploadError}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Editable fields ──────────────────────────────────────────────── */}
          <div className="efac-card mb-5 divide-y divide-line">
            <div className="grid gap-5 p-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="pf-name" label="Full name" required error={formErrors.full_name}>
                  <input
                    id="pf-name"
                    type="text"
                    value={form.full_name}
                    onChange={setField('full_name')}
                    placeholder="Your full name"
                    className="efac-input"
                  />
                </Field>
              </div>

              <Field id="pf-phone" label="Phone">
                <input
                  id="pf-phone"
                  type="tel"
                  value={form.phone}
                  onChange={setField('phone')}
                  placeholder="+254 700 000 000"
                  className="efac-input"
                />
              </Field>

              <Field id="pf-li" label="LinkedIn URL" error={formErrors.linkedin_url}>
                <input
                  id="pf-li"
                  type="url"
                  value={form.linkedin_url}
                  onChange={setField('linkedin_url')}
                  placeholder="https://linkedin.com/in/…"
                  className="efac-input"
                />
              </Field>
            </div>

            <div className="p-6">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="pf-bio" className="text-sm font-semibold text-ink/70">
                  Bio
                </label>
                <span className={`text-xs tabular-nums ${bioOver ? 'font-bold text-clay' : 'text-muted'}`}>
                  {form.bio.length} / {MAX_BIO}
                </span>
              </div>
              <textarea
                id="pf-bio"
                rows={4}
                value={form.bio}
                onChange={setField('bio')}
                placeholder="A short introduction — your background, interests, and what you hope to gain from the programme."
                className="efac-input resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4">
              {saved && !saveError && (
                <span className="text-[13px] font-semibold text-teal">✓ Saved</span>
              )}
              {saveError && (
                <span className="max-w-xs truncate text-[13px] text-clay">{saveError}</span>
              )}
              <button
                type="submit"
                disabled={saving || bioOver}
                className="efac-btn"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>

        {/* ── Read-only account info ────────────────────────────────────────── */}
        <div className="efac-card p-6">
          <p className="efac-eyebrow mb-4 text-muted">Account — read only</p>
          <dl className="space-y-4">
            <ReadOnlyField label="Email" value={email} />
            <ReadOnlyField label="EFAC ID" value={efacId} mono />
            <ReadOnlyField label="Role" value={role} />
          </dl>
          <p className="mt-5 rounded-lg bg-sand px-3 py-2.5 text-xs leading-relaxed text-muted">
            To correct your EFAC ID, contact the EFAC team.
          </p>
        </div>

      </main>
    </div>
  )
}
