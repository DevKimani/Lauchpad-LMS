import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  CheckCircle2,
  Info,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── constants ─────────────────────────────────────────────────────────────────

const JOB_TYPES = [
  'Full-time', 'Part-time', 'Internship', 'Attachment', 'Volunteer', 'Gig',
]

const EMPTY_FORM = {
  title: '',
  organisation: '',
  location: '',
  job_type: '',
  category: '',
  description: '',
  apply_url: '',
  source: '',
  deadline: '',
  published: false,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function validate(form) {
  const errs = {}
  if (!form.title.trim()) errs.title = 'Title is required'
  if (!form.organisation.trim()) errs.organisation = 'Organisation is required'
  if (form.apply_url.trim() && !/^https?:\/\//.test(form.apply_url.trim())) {
    errs.apply_url = 'Must start with http:// or https://'
  }
  return errs
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function isPast(deadline) {
  return !!deadline && new Date(deadline) < new Date()
}

// ── small UI atoms ────────────────────────────────────────────────────────────

function FieldError({ msg }) {
  if (!msg) return null
  return <p className="mt-1 text-xs font-medium text-clay">{msg}</p>
}

function Lbl({ htmlFor, children, required }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink/70">
      {children}
      {required && <span className="ml-0.5 text-orange">*</span>}
    </label>
  )
}

// ── form panel ────────────────────────────────────────────────────────────────

function FormPanel({ editJob, form, errors, saving, setField, onSave, onCancel }) {
  return (
    <div>
      {/* Back */}
      <button
        type="button"
        onClick={onCancel}
        className="mb-6 flex items-center gap-1 text-xs font-semibold text-teal hover:underline"
      >
        <ChevronLeft size={13} aria-hidden="true" />
        Back to jobs
      </button>

      <div className="mb-5">
        <p className="efac-eyebrow text-orange">Career office</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
          {editJob ? 'Edit listing' : 'Post a new job'}
        </h1>
      </div>

      {/* Copyright / sourcing note */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-orange/30 bg-orange-tint px-4 py-3.5">
        <Info size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-orange" aria-hidden="true" />
        <p className="text-sm text-ink/75">
          <strong className="font-bold text-ink">
            Post a summary and link to the original posting
          </strong>
          {' '}— don&apos;t copy full job descriptions from other sites.
        </p>
      </div>

      <form onSubmit={onSave} noValidate>
        <div className="efac-card divide-y divide-line">

          {/* ── Section 1: Core details ─────────────────────────────────────── */}
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Lbl htmlFor="jb-title" required>Job title</Lbl>
              <input
                id="jb-title"
                type="text"
                placeholder="e.g. Finance Analyst Intern"
                value={form.title}
                onChange={setField('title')}
                className="efac-input"
              />
              <FieldError msg={errors.title} />
            </div>

            <div>
              <Lbl htmlFor="jb-org" required>Organisation</Lbl>
              <input
                id="jb-org"
                type="text"
                placeholder="e.g. KCB Bank"
                value={form.organisation}
                onChange={setField('organisation')}
                className="efac-input"
              />
              <FieldError msg={errors.organisation} />
            </div>

            <div>
              <Lbl htmlFor="jb-loc">Location</Lbl>
              <input
                id="jb-loc"
                type="text"
                placeholder="e.g. Nairobi, Kenya (or Remote)"
                value={form.location}
                onChange={setField('location')}
                className="efac-input"
              />
            </div>

            <div>
              <Lbl htmlFor="jb-type">Job type</Lbl>
              <select
                id="jb-type"
                value={form.job_type}
                onChange={setField('job_type')}
                className="efac-input"
              >
                <option value="">— Select type —</option>
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <Lbl htmlFor="jb-cat">Category</Lbl>
              <input
                id="jb-cat"
                type="text"
                placeholder="e.g. Finance, ICT, Health"
                value={form.category}
                onChange={setField('category')}
                className="efac-input"
              />
            </div>
          </div>

          {/* ── Section 2: Description ──────────────────────────────────────── */}
          <div className="p-6">
            <Lbl htmlFor="jb-desc">Career office notes</Lbl>
            <textarea
              id="jb-desc"
              rows={4}
              placeholder="Why this fits our scholars — key requirements, what makes it a good fit, application tips…"
              value={form.description}
              onChange={setField('description')}
              className="efac-input resize-none"
            />
            <p className="mt-1.5 text-xs text-muted">
              Shown to scholars on the jobs board. Keep it concise — 2–4 sentences.
            </p>
          </div>

          {/* ── Section 3: Sourcing / deadline ──────────────────────────────── */}
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <div>
              <Lbl htmlFor="jb-url">Apply URL</Lbl>
              <input
                id="jb-url"
                type="text"
                placeholder="https://brightermomday.com/jobs/…"
                value={form.apply_url}
                onChange={setField('apply_url')}
                className="efac-input"
              />
              <FieldError msg={errors.apply_url} />
            </div>

            <div>
              <Lbl htmlFor="jb-src">Source</Lbl>
              <input
                id="jb-src"
                type="text"
                placeholder="e.g. BrighterMonday, LinkedIn"
                value={form.source}
                onChange={setField('source')}
                className="efac-input"
              />
            </div>

            <div>
              <Lbl htmlFor="jb-deadline">Application deadline</Lbl>
              <input
                id="jb-deadline"
                type="date"
                value={form.deadline}
                onChange={setField('deadline')}
                className="efac-input"
              />
            </div>
          </div>

          {/* ── Section 4: Publish toggle ───────────────────────────────────── */}
          <div className="px-6 py-5">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                id="jb-pub"
                type="checkbox"
                checked={form.published}
                onChange={setField('published')}
                className="h-4 w-4 accent-teal"
              />
              <div>
                <span className="text-sm font-bold text-ink">Publish immediately</span>
                <p className="text-xs text-muted">
                  Unpublished listings are saved as drafts — only visible to staff.
                </p>
              </div>
            </label>
          </div>

          {/* ── Actions ────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onCancel}
              className="efac-btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="efac-btn"
            >
              {saving
                ? 'Saving…'
                : editJob
                ? 'Save changes'
                : form.published
                ? 'Publish job'
                : 'Save as draft'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── job row ───────────────────────────────────────────────────────────────────

function JobRow({ job, toggling, deleting, onEdit, onToggle, onDelete }) {
  const deadlinePast = isPast(job.deadline)

  return (
    <div className="efac-card px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-display text-[1rem] font-semibold text-navy">
              {job.title}
            </p>
            {job.job_type && (
              <span className="efac-tag">{job.job_type}</span>
            )}
            {job.published ? (
              <span className="rounded-full bg-teal-tint px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wide text-teal">
                Published
              </span>
            ) : (
              <span className="rounded-full bg-track px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wide text-muted">
                Draft
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {job.organisation}
            {job.location && (
              <><span className="mx-1.5 text-edge">·</span>{job.location}</>
            )}
            {job.deadline && (
              <>
                <span className="mx-1.5 text-edge">·</span>
                <span className={deadlinePast ? 'text-clay' : ''}>
                  Closes {fmtDate(job.deadline)}
                  {deadlinePast && ' (past)'}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggle}
            disabled={toggling}
            title={job.published ? 'Unpublish' : 'Publish'}
            className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
              job.published
                ? 'text-teal hover:bg-teal-tint'
                : 'text-muted hover:bg-paper hover:text-ink'
            }`}
          >
            {job.published
              ? <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
              : <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
            }
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Edit"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            title="Delete"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-red/8 hover:text-clay disabled:opacity-40"
          >
            <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ManageJobs() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  // View
  const [view, setView] = useState('list') // 'list' | 'form'
  const [editJob, setEditJob] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // List interactions
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [banner, setBanner] = useState(null) // 'published' | null

  // ── load ────────────────────────────────────────────────────────────────────

  async function loadJobs() {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
    setJobs(data ?? [])
  }

  useEffect(() => {
    loadJobs().then(() => setLoading(false))
  }, [])

  // ── form state helpers ───────────────────────────────────────────────────────

  function setField(field) {
    return (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => {
        const n = { ...prev }
        delete n[field]
        return n
      })
    }
  }

  function openNew() {
    setEditJob(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setBanner(null)
    setView('form')
  }

  function openEdit(job) {
    setEditJob(job)
    setForm({
      title: job.title ?? '',
      organisation: job.organisation ?? '',
      location: job.location ?? '',
      job_type: job.job_type ?? '',
      category: job.category ?? '',
      description: job.description ?? '',
      apply_url: job.apply_url ?? '',
      source: job.source ?? '',
      deadline: job.deadline ?? '',
      published: job.published ?? false,
    })
    setErrors({})
    setBanner(null)
    setView('form')
  }

  // ── save ─────────────────────────────────────────────────────────────────────

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSaving(true)

    const payload = {
      title: form.title.trim(),
      organisation: form.organisation.trim(),
      location: form.location.trim() || null,
      job_type: form.job_type || null,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      apply_url: form.apply_url.trim() || null,
      source: form.source.trim() || null,
      deadline: form.deadline || null,
      published: form.published,
    }

    if (editJob) {
      await supabase.from('jobs').update(payload).eq('id', editJob.id)
    } else {
      await supabase.from('jobs').insert({ ...payload, posted_by: userId })
    }

    await loadJobs()
    setSaving(false)

    const isNewPublish = !editJob && form.published
    setView('list')
    if (isNewPublish) setBanner('published')
  }

  // ── publish toggle ────────────────────────────────────────────────────────────

  async function togglePublish(job) {
    setToggling(job.id)
    await supabase.from('jobs').update({ published: !job.published }).eq('id', job.id)
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, published: !j.published } : j)),
    )
    setToggling(null)
  }

  // ── delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(job) {
    if (!window.confirm(`Delete "${job.title}"? This cannot be undone.`)) return
    setDeleting(job.id)
    await supabase.from('jobs').delete().eq('id', job.id)
    setJobs((prev) => prev.filter((j) => j.id !== job.id))
    setDeleting(null)
  }

  // ── render ────────────────────────────────────────────────────────────────────

  const publishedCount = jobs.filter((j) => j.published).length
  const draftCount = jobs.filter((j) => !j.published).length

  if (view === 'form') {
    return (
      <Layout>
        <FormPanel
          editJob={editJob}
          form={form}
          errors={errors}
          saving={saving}
          setField={setField}
          onSave={handleSave}
          onCancel={() => setView('list')}
        />
      </Layout>
    )
  }

  return (
    <Layout>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin" className="text-xs font-semibold text-teal hover:underline">
            ← Admin
          </Link>
          <p className="mt-3 efac-eyebrow text-orange">Career office</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
            Manage jobs
          </h1>
          {!loading && (
            <p className="mt-1 text-sm text-muted">
              {jobs.length} listing{jobs.length !== 1 ? 's' : ''} ·{' '}
              <span className="text-teal">{publishedCount} published</span>
              {draftCount > 0 && (
                <> · <span>{draftCount} draft{draftCount !== 1 ? 's' : ''}</span></>
              )}
            </p>
          )}
        </div>
        <button type="button" onClick={openNew} className="efac-btn">
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          New job
        </button>
      </div>

      {/* ── Published confirmation banner ────────────────────────────────────── */}
      {banner === 'published' && (
        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-teal/30 bg-teal-tint px-5 py-4">
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={18}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-teal"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold text-teal">Job published</p>
              <p className="mt-0.5 text-sm text-ink/60">
                Scholars have been notified automatically by the platform.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="shrink-0 text-xs font-semibold text-teal/60 hover:text-teal"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Job list ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-card bg-ink/5" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-card border border-line bg-card px-8 py-16 text-center">
          <p className="font-display text-xl font-semibold text-navy">
            No job listings yet
          </p>
          <p className="mt-2 text-sm text-muted">
            Post the first opportunity for EFAC scholars.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="efac-btn mt-6"
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            Post a job
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              toggling={toggling === job.id}
              deleting={deleting === job.id}
              onEdit={() => openEdit(job)}
              onToggle={() => togglePublish(job)}
              onDelete={() => handleDelete(job)}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}
