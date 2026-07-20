import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import ConsoleLayout from '../../components/ConsoleLayout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function daysDiff(from, to) {
  if (!from || !to) return null
  const d = (new Date(to) - new Date(from)) / 86_400_000
  return d >= 0 ? d : null
}

function buildCsv(rows, moduleMap, assignmentMap) {
  const headers = [
    'Learner name', 'EFAC ID', 'Module', 'Assignment',
    'Status', 'Submitted', 'Reviewed',
  ]
  const data = rows.map((sub) => {
    const asgn = assignmentMap[sub.assignment_id]
    const mod = asgn ? moduleMap[asgn.module_id] : null
    return [
      sub.profiles?.full_name ?? '',
      sub.profiles?.efac_id ?? '',
      mod?.title ?? '',
      asgn?.title ?? '',
      sub.status,
      fmtDate(sub.submitted_at),
      fmtDate(sub.reviewed_at),
    ]
  })
  return [headers, ...data]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

// ── stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ value, label, sub, accent = 'text-navy' }) {
  return (
    <div className="efac-card p-5">
      <p className={`font-display text-4xl font-semibold tabular-nums leading-none ${accent}`}>
        {value ?? <span className="text-ink/20">—</span>}
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink/70">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/40">{sub}</p>}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function SubmissionsReport() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const isAdmin = profile?.role === 'admin'

  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [loading, setLoading] = useState(false)

  const [modules, setModules] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [enrollmentCount, setEnrollmentCount] = useState(null)

  const [filterModule, setFilterModule] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Load courses filtered by role
  useEffect(() => {
    if (!userId) return
    const base = supabase.from('courses').select('id, title').order('title')
    const q = isAdmin ? base : base.eq('instructor_id', userId)
    q.then(({ data }) => {
      const list = data ?? []
      setCourses(list)
      if (list.length > 0) {
        const wezesha = list.find((c) => c.title.toLowerCase().includes('wezesha'))
        setSelectedCourseId((wezesha ?? list[0]).id)
      }
    })
  }, [userId, isAdmin])

  useEffect(() => {
    if (!selectedCourseId) return

    async function load() {
      setLoading(true)
      setModules([])
      setSubmissions([])
      setEnrollmentCount(null)
      setFilterModule('all')
      setFilterStatus('all')

      const [modRes, enrollRes] = await Promise.all([
        supabase
          .from('modules')
          .select('id, title, order_index, assignments ( id, title )')
          .eq('course_id', selectedCourseId)
          .order('order_index'),
        supabase
          .from('enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('course_id', selectedCourseId),
      ])

      setEnrollmentCount(enrollRes.count ?? 0)

      const mods = (modRes.data ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        order_index: m.order_index,
        assignments: (m.assignments ?? []).map((a) => ({ id: a.id, title: a.title, module_id: m.id })),
      }))
      setModules(mods)

      const assignmentIds = mods.flatMap((m) => m.assignments.map((a) => a.id))
      if (assignmentIds.length > 0) {
        const { data } = await supabase
          .from('submissions')
          .select('id, assignment_id, learner_id, status, submitted_at, reviewed_at, profiles ( full_name, efac_id )')
          .in('assignment_id', assignmentIds)
          .order('submitted_at', { ascending: false })
        setSubmissions(data ?? [])
      }

      setLoading(false)
    }

    load()
  }, [selectedCourseId])

  // ── lookup maps ───────────────────────────────────────────────────────────

  const assignmentMap = useMemo(() => {
    const m = {}
    for (const mod of modules)
      for (const a of mod.assignments) m[a.id] = a
    return m
  }, [modules])

  const moduleMap = useMemo(() => {
    const m = {}
    for (const mod of modules) m[mod.id] = mod
    return m
  }, [modules])

  // ── stat values ───────────────────────────────────────────────────────────

  const total = submissions.length
  const awaiting = submissions.filter((s) => s.status === 'submitted').length
  const reviewedCount = submissions.filter((s) => s.status === 'reviewed').length

  const turnarounds = submissions
    .filter((s) => s.status === 'reviewed' && s.submitted_at && s.reviewed_at)
    .map((s) => daysDiff(s.submitted_at, s.reviewed_at))
    .filter((d) => d != null)
  const avgTurnaround =
    turnarounds.length > 0
      ? (turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length).toFixed(1)
      : null

  // ── module table rows ─────────────────────────────────────────────────────

  const moduleRows = useMemo(
    () =>
      modules
        .filter((mod) => mod.assignments.length > 0)
        .map((mod) => {
          const modSubs = submissions.filter((s) =>
            mod.assignments.some((a) => a.id === s.assignment_id),
          )
          const uniqueSubmitted = new Set(modSubs.map((s) => s.learner_id)).size
          const reviewed = modSubs.filter((s) => s.status === 'reviewed').length
          const enc = enrollmentCount ?? 0
          return {
            id: mod.id,
            title: mod.title,
            submitted: uniqueSubmitted,
            reviewed,
            enrolled: enc,
            pct: enc ? Math.round((uniqueSubmitted / enc) * 100) : 0,
          }
        }),
    [modules, submissions, enrollmentCount],
  )

  // ── filtered list ─────────────────────────────────────────────────────────

  const filteredSubs = useMemo(() => {
    return submissions.filter((sub) => {
      if (filterStatus !== 'all' && sub.status !== filterStatus) return false
      if (filterModule !== 'all') {
        const asgn = assignmentMap[sub.assignment_id]
        if (!asgn || asgn.module_id !== filterModule) return false
      }
      return true
    })
  }, [submissions, filterModule, filterStatus, assignmentMap])

  function handleExport() {
    const csv = buildCsv(filteredSubs, moduleMap, assignmentMap)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `submissions-${selectedCourseId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const hasData = submissions.length > 0

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <ConsoleLayout title="Submissions">
      {hasData && (
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:border-teal hover:text-teal"
          >
            <Download size={15} strokeWidth={2} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      )}

      {/* Course selector */}
      <div className="mb-8">
        <label htmlFor="course-sub" className="mb-1.5 block text-sm font-medium text-ink/60">
          Course
        </label>
        <select
          id="course-sub"
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="min-w-[280px] rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-ink/5" />
          ))}
        </div>
      ) : (
        <div className="space-y-10">

          {/* ── STAT TILES ──────────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 efac-eyebrow text-ink/40">Overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile value={total} label="Total submissions" accent="text-navy" />
              <StatTile value={awaiting} label="Awaiting feedback" accent="text-clay" />
              <StatTile value={reviewedCount} label="Reviewed" accent="text-teal" />
              <StatTile
                value={avgTurnaround != null ? `${avgTurnaround}d` : '—'}
                label="Avg. turnaround"
                sub={
                  turnarounds.length > 0
                    ? `based on ${turnarounds.length} reviewed`
                    : 'no reviewed data yet'
                }
                accent="text-orange"
              />
            </div>
          </section>

          {/* ── MODULE TABLE ────────────────────────────────────────────────── */}
          {moduleRows.length > 0 && (
            <section>
              <h2 className="mb-3 efac-eyebrow text-ink/40">By module</h2>
              <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
                <div className="min-w-[480px]">
                  <div className="grid grid-cols-[1fr_5rem_5rem_10rem] gap-4 border-b border-ink/10 bg-sand/30 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
                    <span>Module</span>
                    <span className="text-right">Submitted</span>
                    <span className="text-right">Reviewed</span>
                    <span>Completion</span>
                  </div>
                  <ul className="divide-y divide-ink/5">
                    {moduleRows.map((row) => (
                      <li
                        key={row.id}
                        className="grid grid-cols-[1fr_5rem_5rem_10rem] items-center gap-4 px-5 py-3.5"
                      >
                        <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                        <p className="text-right text-sm tabular-nums text-ink/70">
                          {row.submitted}
                          <span className="text-ink/35">/{row.enrolled}</span>
                        </p>
                        <p className="text-right text-sm tabular-nums text-ink/70">
                          {row.reviewed}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/8">
                            <div
                              className="h-full rounded-full bg-orange transition-all duration-500"
                              style={{ width: `${row.pct}%` }}
                            />
                          </div>
                          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink/40">
                            {row.pct}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* ── FILTERABLE LIST ─────────────────────────────────────────────── */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="efac-eyebrow text-ink/40">All submissions</h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterModule}
                  onChange={(e) => setFilterModule(e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs text-ink outline-none focus:border-teal"
                >
                  <option value="all">All modules</option>
                  {modules
                    .filter((m) => m.assignments.length > 0)
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs text-ink outline-none focus:border-teal"
                >
                  <option value="all">All statuses</option>
                  <option value="submitted">Awaiting feedback</option>
                  <option value="reviewed">Reviewed</option>
                </select>
              </div>
            </div>

            {filteredSubs.length === 0 ? (
              <div className="rounded-xl border border-ink/10 bg-white px-6 py-12 text-center">
                <p className="font-display text-xl font-semibold text-navy">
                  No submissions
                </p>
                <p className="mt-2 text-sm text-ink/60">
                  {total === 0
                    ? 'No assignments have been submitted for this course yet.'
                    : 'No submissions match the current filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-[1fr_7rem_1fr_6rem_8rem_3.5rem] gap-4 border-b border-ink/10 bg-sand/30 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink/40">
                    <span>Learner</span>
                    <span>EFAC ID</span>
                    <span>Assignment</span>
                    <span>Status</span>
                    <span>Submitted</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-ink/5">
                    {filteredSubs.map((sub) => {
                      const asgn = assignmentMap[sub.assignment_id]
                      const mod = asgn ? moduleMap[asgn.module_id] : null
                      const isReviewed = sub.status === 'reviewed'
                      return (
                        <li
                          key={sub.id}
                          className="grid grid-cols-[1fr_7rem_1fr_6rem_8rem_3.5rem] items-center gap-4 px-5 py-3.5"
                        >
                          <p className="truncate text-sm font-medium text-ink">
                            {sub.profiles?.full_name ?? 'Unknown'}
                          </p>
                          <p className="truncate font-mono text-xs text-ink/45">
                            {sub.profiles?.efac_id || '—'}
                          </p>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-ink/70">
                              {asgn?.title ?? '—'}
                            </p>
                            {mod && (
                              <p className="truncate text-xs text-ink/35">{mod.title}</p>
                            )}
                          </div>
                          <span
                            className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isReviewed
                                ? 'bg-teal-tint text-teal'
                                : 'bg-orange-tint text-orange'
                            }`}
                          >
                            {isReviewed ? 'Reviewed' : 'Awaiting'}
                          </span>
                          <p className="text-xs tabular-nums text-ink/50">
                            {fmtDate(sub.submitted_at)}
                          </p>
                          <Link
                            to="/instructor/feedback"
                            className="text-xs font-medium text-teal hover:underline"
                          >
                            View
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="border-t border-ink/10 px-5 py-2.5 text-xs text-ink/40">
                    {filteredSubs.length} submission
                    {filteredSubs.length !== 1 ? 's' : ''}
                    {filterModule !== 'all' || filterStatus !== 'all' ? ' (filtered)' : ''}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </ConsoleLayout>
  )
}
