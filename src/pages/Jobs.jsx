import { useEffect, useState, useMemo } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import TopNav from '../components/TopNav'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── deadline helpers ──────────────────────────────────────────────────────────

function deadlineInfo(deadline) {
  if (!deadline) return null
  const daysUntil = Math.ceil((new Date(deadline) - new Date()) / 86_400_000)
  return { daysUntil, isPast: daysUntil < 0, isSoon: daysUntil >= 0 && daysUntil <= 7 }
}

function DeadlinePill({ deadline }) {
  const info = deadlineInfo(deadline)
  if (!info) return null

  if (info.isPast) {
    return (
      <span className="rounded-full bg-red/10 px-3 py-1 text-xs font-extrabold text-clay uppercase tracking-wide">
        Deadline passed
      </span>
    )
  }
  if (info.isSoon) {
    return (
      <span className="rounded-full bg-orange-tint px-3 py-1 text-xs font-extrabold text-orange uppercase tracking-wide">
        Closes in {info.daysUntil} day{info.daysUntil !== 1 ? 's' : ''}
      </span>
    )
  }
  return (
    <span className="rounded-full bg-track px-3 py-1 text-xs font-semibold text-muted">
      Closes{' '}
      {new Date(deadline).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}
    </span>
  )
}

// ── job card ──────────────────────────────────────────────────────────────────

function JobCard({ job, isSaved, isSaving, onToggleSave, onApply, dimmed }) {
  return (
    <article
      className={`efac-card p-6 transition-all hover:shadow-sm ${
        dimmed ? 'opacity-55' : ''
      }`}
    >
      {/* Top row: title / meta / bookmark */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
            <h2 className="font-display text-[1.1rem] font-semibold leading-snug text-navy">
              {job.title}
            </h2>
            {jobTypeLabel(job.job_type) && (
              <span className="efac-tag shrink-0">{jobTypeLabel(job.job_type)}</span>
            )}
            {job.category && (
              <span className="shrink-0 rounded-[7px] border border-line bg-sand px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wide text-muted">
                {job.category}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {job.organisation}
            {job.location && (
              <>
                <span className="mx-1.5 text-line">·</span>
                {job.location}
              </>
            )}
          </p>
        </div>

        {/* Bookmark toggle */}
        <button
          type="button"
          onClick={onToggleSave}
          disabled={isSaving}
          aria-label={isSaved ? 'Remove bookmark' : 'Save this job'}
          className={`-mt-0.5 shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
            isSaved
              ? 'text-orange hover:text-orange-dark'
              : 'text-line hover:text-muted'
          }`}
        >
          {isSaved ? (
            <BookmarkCheck size={20} strokeWidth={1.75} />
          ) : (
            <Bookmark size={20} strokeWidth={1.75} />
          )}
        </button>
      </div>

      {/* Description */}
      {job.description && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink/70">
          {job.description}
        </p>
      )}

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {job.deadline && <DeadlinePill deadline={job.deadline} />}
        {job.source && (
          <span className="text-xs text-muted">
            via <span className="font-semibold text-ink/60">{job.source}</span>
          </span>
        )}
        {job.apply_url && (
          <button
            type="button"
            onClick={onApply}
            className="efac-btn efac-btn-sm ml-auto"
          >
            Apply →
          </button>
        )}
      </div>
    </article>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

const JOB_TYPE_PAIRS = [
  { value: 'full_time',  label: 'Full-time'  },
  { value: 'part_time',  label: 'Part-time'  },
  { value: 'internship', label: 'Internship' },
  { value: 'attachment', label: 'Attachment' },
  { value: 'volunteer',  label: 'Volunteer'  },
  { value: 'gig',        label: 'Gig'        },
]
const JOB_TYPE_LABEL = Object.fromEntries(JOB_TYPE_PAIRS.map(({ value, label }) => [value, label]))
const TYPE_ORDER = JOB_TYPE_PAIRS.map((t) => t.value)

// Normalise stored value ("Full-time", "full_time", "Part-time", etc.) → machine value.
// Returns the original string unchanged when unrecognised.
function normalizeJobType(raw) {
  if (!raw) return ''
  const n = raw.toLowerCase().replace(/[\s-]/g, '_')
  return n in JOB_TYPE_LABEL ? n : raw
}

// Display label for a job type, or null when unknown/missing — never hides the job.
function jobTypeLabel(raw) {
  return JOB_TYPE_LABEL[normalizeJobType(raw)] ?? null
}

export default function Jobs() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [jobs, setJobs] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  // View state
  const [tab, setTab] = useState('all') // 'all' | 'saved'
  const [filterType, setFilterType] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  // ── load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return
    async function load() {
      setLoading(true)
      const [jobsRes, savedRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('saved_jobs')
          .select('job_id')
          .eq('learner_id', userId),
      ])
      setJobs(jobsRes.data ?? [])
      setSavedIds(new Set((savedRes.data ?? []).map((r) => r.job_id)))
      setLoading(false)
    }
    load()
  }, [userId])

  // ── bookmark toggle ───────────────────────────────────────────────────────

  async function toggleSave(jobId) {
    if (!userId || savingId) return
    setSavingId(jobId)
    const isSaved = savedIds.has(jobId)
    if (isSaved) {
      await supabase.from('saved_jobs').delete().eq('job_id', jobId).eq('learner_id', userId)
      setSavedIds((prev) => {
        const s = new Set(prev)
        s.delete(jobId)
        return s
      })
    } else {
      await supabase.from('saved_jobs').insert({ job_id: jobId, learner_id: userId })
      setSavedIds((prev) => new Set([...prev, jobId]))
    }
    setSavingId(null)
  }

  // ── apply click tracking ──────────────────────────────────────────────────

  function handleApply(jobId, applyUrl) {
    // Insert and navigate concurrently — tracking must never block the link.
    supabase
      .from('job_clicks')
      .insert({ job_id: jobId, learner_id: userId })
      .catch(() => {})
    window.open(applyUrl, '_blank', 'noopener,noreferrer')
  }

  // ── derived: filter options ───────────────────────────────────────────────

  const jobTypes = useMemo(() => {
    const presentNorm = new Set(jobs.map((j) => normalizeJobType(j.job_type)).filter(Boolean))
    return TYPE_ORDER.filter((v) => presentNorm.has(v)).concat(
      [...presentNorm].filter((v) => !TYPE_ORDER.includes(v)).sort(),
    )
  }, [jobs])

  const categories = useMemo(
    () => [...new Set(jobs.map((j) => j.category).filter(Boolean))].sort(),
    [jobs],
  )

  // ── derived: filtered + partitioned ──────────────────────────────────────

  const { activeJobs, pastJobs } = useMemo(() => {
    let list = jobs
    if (tab === 'saved') list = list.filter((j) => savedIds.has(j.id))
    if (filterType !== 'all') list = list.filter((j) => normalizeJobType(j.job_type) === filterType)
    if (filterCategory !== 'all') list = list.filter((j) => j.category === filterCategory)

    const now = new Date()
    const active = []
    const past = []
    for (const job of list) {
      if (job.deadline && new Date(job.deadline) < now) {
        past.push(job)
      } else {
        active.push(job)
      }
    }
    return { activeJobs: active, pastJobs: past }
  }, [jobs, savedIds, tab, filterType, filterCategory])

  const savedCount = savedIds.size
  const isEmpty = activeJobs.length === 0 && pastJobs.length === 0

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-paper">
      <TopNav />
      <main className="mx-auto max-w-[960px] px-6 py-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="efac-eyebrow text-orange">Opportunities</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
          Jobs &amp; opportunities
        </h1>
        <p className="mt-1 text-sm text-muted">
          Curated by the EFAC career office. New roles added regularly — bookmark
          anything you want to revisit.
        </p>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-extrabold transition-colors ${
            tab === 'all'
              ? 'bg-ink text-white'
              : 'bg-card border border-line text-ink hover:border-ink/30'
          }`}
        >
          All jobs
        </button>
        <button
          type="button"
          onClick={() => setTab('saved')}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-extrabold transition-colors ${
            tab === 'saved'
              ? 'bg-ink text-white'
              : 'bg-card border border-line text-ink hover:border-ink/30'
          }`}
        >
          <BookmarkCheck size={13} strokeWidth={2.5} aria-hidden="true" />
          Saved
          {savedCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                tab === 'saved'
                  ? 'bg-white/25 text-white'
                  : 'bg-orange-tint text-orange'
              }`}
            >
              {savedCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Filter chips ───────────────────────────────────────────────────── */}
      {(jobTypes.length > 0 || categories.length > 0) && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {/* Type chips */}
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`efac-chip ${filterType === 'all' && filterCategory === 'all' ? 'efac-chip-on' : ''}`}
          >
            All
          </button>
          {jobTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(filterType === t ? 'all' : t)}
              className={`efac-chip ${filterType === t ? 'efac-chip-on' : ''}`}
            >
              {JOB_TYPE_LABEL[t] ?? t}
            </button>
          ))}

          {/* Category chips — separated by a faint rule */}
          {categories.length > 0 && (
            <>
              <span className="mx-1 text-line" aria-hidden="true">|</span>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterCategory(filterCategory === c ? 'all' : c)}
                  className={`efac-chip ${filterCategory === c ? 'efac-chip-on' : ''}`}
                >
                  {c}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-card bg-ink/5" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="rounded-card border border-line bg-card px-8 py-16 text-center">
          {tab === 'saved' ? (
            <>
              <Bookmark
                size={36}
                strokeWidth={1.25}
                className="mx-auto mb-3 text-line"
                aria-hidden="true"
              />
              <p className="font-display text-xl font-semibold text-navy">
                No saved jobs yet
              </p>
              <p className="mt-2 text-sm text-muted">
                Hit the bookmark icon on any listing to save it here.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-semibold text-navy">
                No opportunities right now
              </p>
              <p className="mt-2 text-sm text-muted">
                Check back soon — the career office adds new roles regularly.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active listings */}
          {activeJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isSaved={savedIds.has(job.id)}
              isSaving={savingId === job.id}
              onToggleSave={() => toggleSave(job.id)}
              onApply={() => handleApply(job.id, job.apply_url)}
              dimmed={false}
            />
          ))}

          {/* Past-deadline section */}
          {pastJobs.length > 0 && (
            <>
              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-line" />
                <span className="text-xs font-extrabold uppercase tracking-widest text-muted/50">
                  Past deadline
                </span>
                <div className="h-px flex-1 bg-line" />
              </div>
              {pastJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isSaved={savedIds.has(job.id)}
                  isSaving={savingId === job.id}
                  onToggleSave={() => toggleSave(job.id)}
                  onApply={() => handleApply(job.id, job.apply_url)}
                  dimmed
                />
              ))}
            </>
          )}
        </div>
      )}
      </main>
    </div>
  )
}
