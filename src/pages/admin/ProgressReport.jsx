import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Download, ChevronUp, ChevronDown } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── helpers ───────────────────────────────────────────────────────────────────

const MS_14_DAYS = 14 * 24 * 60 * 60 * 1000

function isStaleActivity(lastActivity) {
  if (!lastActivity) return true
  return Date.now() - new Date(lastActivity).getTime() > MS_14_DAYS
}

function fmtShortDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function buildCsv(rows, totalModules, totalLessons) {
  const headers = [
    'Learner name', 'EFAC ID',
    `Modules done (/${totalModules})`,
    `Lessons done (/${totalLessons})`,
    'Last activity', 'Pre-survey', 'Post-survey', 'Certificate',
  ]
  const data = rows.map((r) => [
    r.name,
    r.efacId,
    r.modulesDone,
    r.lessonsDone,
    r.lastActivity
      ? new Date(r.lastActivity).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
        })
      : 'No activity',
    r.preSurveyDone === null ? 'N/A' : r.preSurveyDone ? 'Yes' : 'No',
    r.postSurveyDone === null ? 'N/A' : r.postSurveyDone ? 'Yes' : 'No',
    r.cert ? r.cert.status.charAt(0).toUpperCase() + r.cert.status.slice(1) : 'None',
  ])
  return [headers, ...data]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

// ── stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ value, label, accent = 'text-navy' }) {
  return (
    <div className="efac-card p-5">
      <p className={`font-display text-4xl font-semibold tabular-nums leading-none ${accent}`}>
        {value ?? <span className="text-ink/20">—</span>}
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink/70">{label}</p>
    </div>
  )
}

// ── sortable column header ────────────────────────────────────────────────────

function SortHeader({ col, sort, onSort, children, className = '' }) {
  const active = sort.col === col
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
        active ? 'text-teal' : 'text-ink/40 hover:text-ink/70'
      } ${className}`}
    >
      {children}
      {active ? (
        sort.dir === 'asc' ? (
          <ChevronUp size={11} aria-hidden="true" />
        ) : (
          <ChevronDown size={11} aria-hidden="true" />
        )
      ) : (
        <ChevronDown size={11} className="text-ink/20" aria-hidden="true" />
      )}
    </button>
  )
}

// ── cert badge ────────────────────────────────────────────────────────────────

function CertBadge({ cert }) {
  if (!cert) return <span className="text-xs italic text-ink/25">—</span>
  if (cert.status === 'issued')
    return (
      <span className="rounded-full bg-teal-tint px-2 py-0.5 text-xs font-semibold text-teal">
        Issued
      </span>
    )
  return (
    <span className="rounded-full bg-orange-tint px-2 py-0.5 text-xs font-semibold text-orange">
      Pending
    </span>
  )
}

// ── yes/no dot ────────────────────────────────────────────────────────────────

function YesNoDot({ done }) {
  if (done === null) return <span className="text-xs text-ink/25">—</span>
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${done ? 'bg-teal' : 'bg-ink/15'}`}
      title={done ? 'Completed' : 'Not submitted'}
    />
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function ProgressReport() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const isAdmin = profile?.role === 'admin'

  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [loading, setLoading] = useState(false)

  const [courseModules, setCourseModules] = useState([])
  const [allLessonIds, setAllLessonIds] = useState([])
  const [preSurvey, setPreSurvey] = useState(null)
  const [postSurvey, setPostSurvey] = useState(null)
  const [learnerRows, setLearnerRows] = useState([])

  const [sort, setSort] = useState({ col: 'progress', dir: 'desc' })

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
      setCourseModules([])
      setAllLessonIds([])
      setPreSurvey(null)
      setPostSurvey(null)
      setLearnerRows([])

      // 1. Course structure + enrollments + surveys in parallel
      const [modRes, enrollRes, surveyRes] = await Promise.all([
        supabase
          .from('modules')
          .select('id, title, order_index, lessons ( id ), assignments ( id )')
          .eq('course_id', selectedCourseId)
          .order('order_index'),
        supabase
          .from('enrollments')
          .select('learner_id')
          .eq('course_id', selectedCourseId),
        supabase
          .from('surveys')
          .select('id, kind')
          .eq('course_id', selectedCourseId),
      ])

      const mods = (modRes.data ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        order_index: m.order_index,
        lessonIds: (m.lessons ?? []).map((l) => l.id),
        assignmentId: (m.assignments ?? [])[0]?.id ?? null,
      }))
      setCourseModules(mods)

      const lessonIds = mods.flatMap((m) => m.lessonIds)
      setAllLessonIds(lessonIds)

      const surveyList = surveyRes.data ?? []
      const pre = surveyList.find((s) => s.kind === 'pre') ?? null
      const post = surveyList.find((s) => s.kind === 'post') ?? null
      setPreSurvey(pre)
      setPostSurvey(post)

      const learnerIds = (enrollRes.data ?? []).map((e) => e.learner_id)
      if (learnerIds.length === 0) {
        setLoading(false)
        return
      }

      // 2. Fetch all per-learner data in parallel
      const surveyIds = [pre?.id, post?.id].filter(Boolean)
      const assignmentIds = mods.map((m) => m.assignmentId).filter(Boolean)

      const [profilesRes, progressRes, subRes, surveyRespRes, certRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, efac_id')
          .in('id', learnerIds),
        lessonIds.length > 0
          ? supabase
              .from('lesson_progress')
              .select('lesson_id, learner_id, completed, completed_at')
              .in('lesson_id', lessonIds)
              .in('learner_id', learnerIds)
          : Promise.resolve({ data: [] }),
        assignmentIds.length > 0
          ? supabase
              .from('submissions')
              .select('assignment_id, learner_id, status')
              .in('assignment_id', assignmentIds)
              .in('learner_id', learnerIds)
          : Promise.resolve({ data: [] }),
        surveyIds.length > 0
          ? supabase
              .from('survey_responses')
              .select('survey_id, learner_id')
              .in('survey_id', surveyIds)
              .in('learner_id', learnerIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from('certificates')
          .select('learner_id, status')
          .eq('course_id', selectedCourseId)
          .in('learner_id', learnerIds),
      ])

      // Build lookup maps
      const profileMap = {}
      for (const p of profilesRes.data ?? []) profileMap[p.id] = p

      const progressMap = {}
      for (const row of progressRes.data ?? []) {
        if (!progressMap[row.learner_id]) progressMap[row.learner_id] = {}
        progressMap[row.learner_id][row.lesson_id] = {
          completed: row.completed,
          completed_at: row.completed_at,
        }
      }

      const subsMap = {}
      for (const sub of subRes.data ?? []) {
        if (!subsMap[sub.learner_id]) subsMap[sub.learner_id] = new Set()
        subsMap[sub.learner_id].add(sub.assignment_id)
      }

      const surveyRespMap = {}
      for (const r of surveyRespRes.data ?? []) {
        if (!surveyRespMap[r.learner_id]) surveyRespMap[r.learner_id] = {}
        surveyRespMap[r.learner_id][r.survey_id] = true
      }

      const certMap = {}
      for (const c of certRes.data ?? []) certMap[c.learner_id] = { status: c.status }

      // Build per-learner rows
      const rows = learnerIds.map((learnerId) => {
        const p = profileMap[learnerId] ?? {}
        const lp = progressMap[learnerId] ?? {}
        const learnerSubs = subsMap[learnerId] ?? new Set()
        const learnerSurveys = surveyRespMap[learnerId] ?? {}

        const completedAts = Object.values(lp)
          .map((x) => x.completed_at)
          .filter(Boolean)
        const lastActivity =
          completedAts.length > 0
            ? completedAts.reduce((latest, d) => (d > latest ? d : latest))
            : null

        const lessonsDone = lessonIds.filter((lid) => lp[lid]?.completed).length

        const modulesDone = mods.filter((mod) => {
          const allLessonsDone =
            mod.lessonIds.length === 0 ||
            mod.lessonIds.every((lid) => !!lp[lid]?.completed)
          const assignmentDone = !mod.assignmentId || learnerSubs.has(mod.assignmentId)
          return allLessonsDone && assignmentDone
        }).length

        const progress = lessonIds.length > 0 ? lessonsDone / lessonIds.length : 0
        const completed = lessonsDone === lessonIds.length && lessonIds.length > 0

        return {
          id: learnerId,
          name: p.full_name || 'Unnamed',
          efacId: p.efac_id ?? '',
          lessonsDone,
          modulesDone,
          lastActivity,
          preSurveyDone: pre ? !!learnerSurveys[pre.id] : null,
          postSurveyDone: post ? !!learnerSurveys[post.id] : null,
          cert: certMap[learnerId] ?? null,
          progress,
          completed,
          stale: !completed && isStaleActivity(lastActivity),
        }
      })

      setLearnerRows(rows)
      setLoading(false)
    }

    load()
  }, [selectedCourseId])

  // ── sort ───────────────────────────────────────────────────────────────────

  function handleSort(col) {
    setSort((prev) => ({
      col,
      dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc',
    }))
  }

  const sortedRows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...learnerRows].sort((a, b) => {
      switch (sort.col) {
        case 'name': return dir * a.name.localeCompare(b.name)
        case 'lessons': return dir * (a.lessonsDone - b.lessonsDone)
        case 'modules': return dir * (a.modulesDone - b.modulesDone)
        case 'progress':
        default: return dir * (a.progress - b.progress)
      }
    })
  }, [learnerRows, sort])

  // ── stat values ───────────────────────────────────────────────────────────

  const enrolled = learnerRows.length
  const activeCount = learnerRows.filter(
    (r) => r.lastActivity && Date.now() - new Date(r.lastActivity).getTime() <= MS_14_DAYS,
  ).length
  const completedCount = learnerRows.filter((r) => r.completed).length
  const certsIssued = learnerRows.filter((r) => r.cert?.status === 'issued').length
  const certsPending = learnerRows.filter((r) => r.cert?.status === 'pending').length

  const totalModules = courseModules.length
  const totalLessons = allLessonIds.length
  const staleCount = sortedRows.filter((r) => r.stale).length

  function handleExport() {
    const csv = buildCsv(sortedRows, totalModules, totalLessons)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `progress-${selectedCourseId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin/reports" className="text-xs font-medium text-teal hover:underline">
            ← Reports
          </Link>
          <p className="mt-3 efac-eyebrow text-orange">Learner tracking</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
            Progress Report
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Per-learner progress, survey completion, and certificate status.
          </p>
        </div>
        {learnerRows.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:border-teal hover:text-teal"
          >
            <Download size={15} strokeWidth={2} aria-hidden="true" />
            Export CSV
          </button>
        )}
      </div>

      {/* Course selector */}
      <div className="mb-8">
        <label htmlFor="course-prog" className="mb-1.5 block text-sm font-medium text-ink/60">
          Course
        </label>
        <select
          id="course-prog"
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile value={enrolled} label="Enrolled" accent="text-navy" />
              <StatTile value={activeCount} label="Active last 14 days" accent="text-teal" />
              <StatTile value={completedCount} label="Completed programme" accent="text-orange" />
              <StatTile value={certsIssued} label="Certificates issued" accent="text-teal" />
              <StatTile value={certsPending} label="Certificates pending" accent="text-orange" />
            </div>
          </section>

          {/* ── PER-LEARNER TABLE ────────────────────────────────────────────── */}
          {learnerRows.length === 0 ? (
            <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
              <p className="font-display text-xl font-semibold text-navy">No enrolments</p>
              <p className="mt-2 text-sm text-ink/60">
                Learners will appear here once they enrol in this course.
              </p>
            </div>
          ) : (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="efac-eyebrow text-ink/40">Learner breakdown</h2>
                {staleCount > 0 && (
                  <p className="flex items-center gap-1.5 text-[11px] text-orange/70">
                    <span className="inline-block h-2 w-2 rounded-full bg-orange/50" />
                    {staleCount} learner{staleCount !== 1 ? 's' : ''} with no activity in 14+ days
                  </p>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-sand/30">
                      <th className="px-5 py-3 text-left">
                        <SortHeader col="name" sort={sort} onSort={handleSort}>
                          Name
                        </SortHeader>
                      </th>
                      <th className="hidden px-4 py-3 text-left md:table-cell">
                        <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                          EFAC ID
                        </span>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <SortHeader col="modules" sort={sort} onSort={handleSort} className="ml-auto">
                          Modules
                        </SortHeader>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <SortHeader col="lessons" sort={sort} onSort={handleSort} className="ml-auto">
                          Lessons
                        </SortHeader>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader col="progress" sort={sort} onSort={handleSort}>
                          Progress
                        </SortHeader>
                      </th>
                      {preSurvey && (
                        <th className="px-4 py-3 text-center">
                          <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                            Pre
                          </span>
                        </th>
                      )}
                      {postSurvey && (
                        <th className="px-4 py-3 text-center">
                          <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                            Post
                          </span>
                        </th>
                      )}
                      <th className="px-5 py-3 text-left">
                        <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                          Cert.
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {sortedRows.map((row) => (
                      <tr
                        key={row.id}
                        className={row.stale ? 'bg-orange-tint/25' : undefined}
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-ink">{row.name}</p>
                          <p className="text-xs text-ink/40">
                            {row.lastActivity
                              ? `Active ${fmtShortDate(row.lastActivity)}`
                              : 'No activity yet'}
                          </p>
                        </td>
                        <td className="hidden px-4 py-3.5 font-mono text-xs text-ink/40 md:table-cell">
                          {row.efacId || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-ink/70">
                          {row.modulesDone}
                          <span className="text-ink/30">/{totalModules}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-ink/70">
                          {row.lessonsDone}
                          <span className="text-ink/30">/{totalLessons}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/8">
                              <div
                                className="h-full rounded-full bg-orange transition-all duration-500"
                                style={{ width: `${Math.round(row.progress * 100)}%` }}
                              />
                            </div>
                            <span className="w-9 text-right text-xs tabular-nums text-ink/45">
                              {Math.round(row.progress * 100)}%
                            </span>
                          </div>
                        </td>
                        {preSurvey && (
                          <td className="px-4 py-3.5 text-center">
                            <YesNoDot done={row.preSurveyDone} />
                          </td>
                        )}
                        {postSurvey && (
                          <td className="px-4 py-3.5 text-center">
                            <YesNoDot done={row.postSurveyDone} />
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <CertBadge cert={row.cert} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-ink/10 px-5 py-2.5 text-xs text-ink/40">
                  {enrolled} learner{enrolled !== 1 ? 's' : ''} enrolled
                  {staleCount > 0 && (
                    <> · {staleCount} with no recent activity</>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </Layout>
  )
}
