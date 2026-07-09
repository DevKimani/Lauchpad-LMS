import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import TopNav from '../components/TopNav'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════════
// Progress & Certificates — EFAC hi-fi design 4e
// Route: /progress  (ProtectedRoute, any learner)
// ═══════════════════════════════════════════════════════════════════════════════

export default function Progress() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [loading, setLoading] = useState(true)
  const [enrollments, setEnrollments] = useState([])
  const [lessonProgress, setLessonProgress] = useState([])
  const [submissionsMap, setSubmissionsMap] = useState({})
  const [certificates, setCertificates] = useState([])

  useEffect(() => {
    if (!userId) return
    async function load() {
      const [enrollRes, progressRes, subRes, certRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select(`
            course_id,
            courses (
              id, title, cover_image,
              modules (
                id, order_index,
                lessons ( id ),
                assignments ( id )
              )
            )
          `)
          .eq('learner_id', userId),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed, completed_at')
          .eq('learner_id', userId),
        supabase
          .from('submissions')
          .select('assignment_id')
          .eq('learner_id', userId),
        supabase
          .from('certificates')
          .select('id, created_at, courses (id, title)')
          .eq('status', 'issued')
          .eq('learner_id', userId)
          .order('created_at', { ascending: false }),
      ])

      const enrs = (enrollRes.data ?? []).map((e) => ({
        ...e,
        courses: e.courses
          ? {
              ...e.courses,
              modules: [...(e.courses.modules ?? [])].sort(
                (a, b) => a.order_index - b.order_index,
              ),
            }
          : null,
      }))
      setEnrollments(enrs)
      setLessonProgress(progressRes.data ?? [])

      const sMap = {}
      for (const s of subRes.data ?? []) sMap[s.assignment_id] = true
      setSubmissionsMap(sMap)

      setCertificates(certRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [userId])

  // ── Derived ─────────────────────────────────────────────────────────────────

  const progressMap = {}
  for (const r of lessonProgress) progressMap[r.lesson_id] = r.completed

  const certCourseIds = new Set(
    certificates.map((c) => c.courses?.id).filter(Boolean),
  )

  const totalEnrolled = enrollments.length
  const completedCourses = certCourseIds.size
  const certCount = certificates.length
  const lessonsDone = lessonProgress.filter((l) => l.completed).length

  // Count modules where every lesson is done
  let modulesDone = 0
  for (const enr of enrollments) {
    for (const mod of enr.courses?.modules ?? []) {
      if (
        mod.lessons.length > 0 &&
        mod.lessons.every((l) => !!progressMap[l.id])
      ) {
        modulesDone++
      }
    }
  }

  // In-progress: enrolled but no issued certificate
  const inProgressCourses = enrollments.filter(
    (e) => !certCourseIds.has(e.course_id),
  )

  // Only show heatmap when at least one lesson_progress row has a real completed_at
  const hasDateActivity = lessonProgress.some((l) => l.completed && l.completed_at)

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper">

      {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
      <TopNav />

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[960px] px-6 py-8">
        <div className="space-y-6">

          {/* Header */}
          <div>
            <p className="efac-eyebrow">Your journey</p>
            <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
              Progress &amp; certificates
            </h1>
          </div>

          {/* 1. Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Courses completed"
              value={completedCourses}
              sub={`of ${totalEnrolled} enrolled`}
            />
            <StatCard label="Lessons done" value={lessonsDone} />
            <StatCard label="Modules done" value={modulesDone} />
            <StatCard label="Certificates" value={certCount} orange />
          </div>

          {/* 2. Activity heatmap — hidden when no dated completion data */}
          {hasDateActivity && (
            <ActivityHeatmap lessonProgress={lessonProgress} />
          )}

          {/* 3. Two-column: in-progress + certificates */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <InProgressSection
              inProgressCourses={inProgressCourses}
              progressMap={progressMap}
            />
            <CertificatesSection
              certificates={certificates}
              hasInProgress={inProgressCourses.length > 0}
            />
          </div>

        </div>
      </main>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, orange }) {
  return (
    <div className="efac-card p-5">
      <p className="efac-eyebrow">{label}</p>
      <p
        className={`mt-2 font-display text-[32px] font-extrabold leading-none ${
          orange ? 'text-orange' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
    </div>
  )
}

// ── ActivityHeatmap ───────────────────────────────────────────────────────────

function ActivityHeatmap({ lessonProgress }) {
  const today = new Date()

  // 21 consecutive days: index 0 = 20 days ago, index 20 = today
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (20 - i))
    return d.toISOString().substring(0, 10)
  })

  // Count completed lessons per day
  const activityMap = {}
  for (const row of lessonProgress) {
    if (!row.completed || !row.completed_at) continue
    const day = row.completed_at.substring(0, 10)
    activityMap[day] = (activityMap[day] || 0) + 1
  }

  // Arrange into 3 rows of 7 (week 0 = oldest, week 2 = most recent)
  const weeks = [days.slice(0, 7), days.slice(7, 14), days.slice(14)]

  function cellCls(day) {
    const n = activityMap[day] || 0
    if (n === 0) return 'bg-track'
    if (n === 1) return 'bg-orange/25'
    if (n === 2) return 'bg-orange/45'
    if (n <= 4) return 'bg-orange/65'
    return 'bg-orange'
  }

  return (
    <div className="efac-card p-5">
      <p className="text-[15px] font-bold text-ink">Learning activity</p>
      <div className="mt-4 space-y-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex gap-1.5">
            {week.map((day) => (
              <div
                key={day}
                title={`${day}: ${activityMap[day] || 0} lesson${activityMap[day] !== 1 ? 's' : ''} completed`}
                aria-label={`${activityMap[day] || 0} lessons on ${day}`}
                className={`h-7 w-7 rounded-[5px] ${cellCls(day)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">Last 3 weeks</p>
    </div>
  )
}

// ── InProgressSection ─────────────────────────────────────────────────────────

function InProgressSection({ inProgressCourses, progressMap }) {
  return (
    <div className="efac-card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <p className="text-[17px] font-bold text-ink">In progress</p>
        {inProgressCourses.length > 0 && (
          <p className="text-[13px] text-muted">
            {inProgressCourses.length} course
            {inProgressCourses.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {inProgressCourses.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[14px] text-muted">
            No courses in progress.{' '}
            <Link to="/courses" className="font-semibold text-teal hover:underline">
              Browse courses →
            </Link>
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {inProgressCourses.map((enr) => (
            <InProgressRow key={enr.course_id} enr={enr} progressMap={progressMap} />
          ))}
        </ul>
      )}
    </div>
  )
}

function InProgressRow({ enr, progressMap }) {
  const course = enr.courses
  if (!course) return null

  const mods = course.modules
  const allLessons = mods.flatMap((m) => m.lessons)
  const total = allLessons.length
  const doneCount = allLessons.filter((l) => progressMap[l.id]).length
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100)

  // First module with incomplete lessons (1-indexed label)
  const incompleteIdx = mods.findIndex(
    (m) => m.lessons.length > 0 && !m.lessons.every((l) => progressMap[l.id]),
  )
  const currentModNum =
    incompleteIdx === -1 ? mods.length : incompleteIdx + 1

  return (
    <li>
      <Link
        to={`/courses/${course.id}`}
        className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-paper"
      >
        {/* Thumbnail */}
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[8px]">
          {course.cover_image ? (
            <img
              src={course.cover_image}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal to-teal-dark">
              <span className="select-none font-display text-lg font-bold text-white/25" aria-hidden="true">
                {course.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Text + bar */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">
            {course.title}
          </p>
          {mods.length > 0 && (
            <p className="mt-0.5 text-[12px] text-muted">
              Module {currentModNum} of {mods.length}
            </p>
          )}
          <div className="mt-2">
            <div
              className="efac-bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Percentage */}
        <span className="shrink-0 text-[13px] font-semibold text-muted">
          {pct}%
        </span>
      </Link>
    </li>
  )
}

// ── CertificatesSection ───────────────────────────────────────────────────────

function CertificatesSection({ certificates, hasInProgress }) {
  const showEmpty = certificates.length === 0 && !hasInProgress

  return (
    <div className="efac-card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <p className="text-[17px] font-bold text-ink">Certificates</p>
      </div>

      {showEmpty ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[14px] text-muted">
            No certificates yet.{' '}
            <Link to="/courses" className="font-semibold text-teal hover:underline">
              Start learning →
            </Link>
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {certificates.map((cert) => (
            <CertRow key={cert.id} cert={cert} />
          ))}
          {hasInProgress && <LockedCertCard />}
        </ul>
      )}
    </div>
  )
}

function CertRow({ cert }) {
  const issued = cert.created_at
    ? new Date(cert.created_at).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : null

  return (
    <li className="flex items-center gap-3 px-5 py-4">
      {/* Gold star thumbnail */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffba08]/15">
        <StarIcon className="h-5 w-5 text-[#ffba08]" />
      </div>

      {/* Course + date */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">
          {cert.courses?.title ?? 'Course'}
        </p>
        {issued && (
          <p className="mt-0.5 text-[12px] text-muted">Issued {issued}</p>
        )}
      </div>

      {/* PDF link */}
      <Link
        to={`/certificate/${cert.id}`}
        className="shrink-0 text-[13px] font-bold text-teal transition-opacity hover:opacity-75"
      >
        PDF&nbsp;→
      </Link>
    </li>
  )
}

function LockedCertCard() {
  return (
    <li className="flex items-center gap-3 px-5 py-4 opacity-50">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-track">
        <LockIcon />
      </div>
      <div>
        <p className="text-[14px] font-medium text-ink">
          Finish a course to unlock
        </p>
        <p className="text-[12px] text-muted">Keep going — you're on your way!</p>
      </div>
    </li>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function StarIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 text-muted"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
        clipRule="evenodd"
      />
    </svg>
  )
}
