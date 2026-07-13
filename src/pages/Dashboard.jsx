import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, BookOpen, BarChart2, Trophy } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import TopNav from '../components/TopNav'
import NotificationBell from '../components/NotificationBell'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { getFileUrl } from '../lib/files'

// ── shared widget helpers ─────────────────────────────────────────────────────

const GOLD = '#ffba08'

function shortName(fullName) {
  if (!fullName) return 'Scholar'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

const WIDGET_POINTS = [
  { label: 'Lesson completed',  pts: 5  },
  { label: 'Active day',        pts: 1  },
  { label: 'Profile complete',  pts: 20 },
  { label: 'Job application',   pts: 10 },
]

// ── Root router ───────────────────────────────────────────────────────────────
// Learner gets its own full-page chrome; instructor/admin use the shared Layout.

export default function Dashboard() {
  const { profile } = useAuth()
  if (profile?.role === 'learner') return <LearnerHome />
  return (
    <Layout>
      {profile?.role === 'instructor' && <InstructorHome />}
      {profile?.role === 'admin' && <AdminHome />}
    </Layout>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEARNER DASHBOARD  — hi-fi redesign
// ═══════════════════════════════════════════════════════════════════════════════

function LearnerHome() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [rawEnrollments, setRawEnrollments] = useState([])
  const [progressMap, setProgressMap] = useState({})    // { [lessonId]: boolean }
  const [submissionMap, setSubmissionMap] = useState({}) // { [assignmentId]: row }
  const [certCount, setCertCount] = useState(0)
  const [streak, setStreak] = useState(0)
  const [availableCourses, setAvailableCourses] = useState([])
  const [enrolling, setEnrolling] = useState({})

  useEffect(() => {
    if (!userId) return
    async function load() {
      const [enrollRes, progressRes, subRes, certRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select(`
            course_id,
            courses (
              id, title, cover_image, category,
              modules (
                id, title, order_index, image_url,
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
          .select('id, assignment_id, status')
          .eq('learner_id', userId),
        supabase
          .from('certificates')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'issued')
          .eq('learner_id', userId),
      ])

      // Build progress map + collect dates for streak
      const pMap = {}
      const completedDates = new Set()
      for (const r of progressRes.data ?? []) {
        pMap[r.lesson_id] = r.completed
        if (r.completed && r.completed_at) {
          completedDates.add(r.completed_at.slice(0, 10))
        }
      }
      setProgressMap(pMap)
      setStreak(computeStreak(completedDates))

      const sMap = {}
      for (const r of subRes.data ?? []) sMap[r.assignment_id] = r
      setSubmissionMap(sMap)

      setCertCount(certRes.count ?? 0)

      const enrolled = (enrollRes.data ?? []).filter((e) => e.courses != null)
      setRawEnrollments(
        enrolled.map((e) => ({
          courseId: e.course_id,
          course: e.courses,
          modules: [...(e.courses?.modules ?? [])].sort(
            (a, b) => a.order_index - b.order_index,
          ),
        })),
      )

      // When the learner has no enrolments, pre-fetch the catalogue so the
      // empty state is useful without requiring a second page load.
      if (enrolled.length === 0) {
        const { data: cat } = await supabase
          .from('courses')
          .select('id, title, cover_image, category, modules ( lessons ( id ) )')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(9)
        setAvailableCourses(
          (cat ?? []).map((c) => ({
            ...c,
            totalLessons: (c.modules ?? []).reduce((s, m) => s + m.lessons.length, 0),
          })),
        )
      }

      setLoading(false)
    }
    load()
  }, [userId])

  // ── Derived — mirrors CourseDetail locking logic exactly ──────────────────
  const enrollments = rawEnrollments.map(({ courseId, course, modules }) => {
    const statuses = modules.map((mod) => {
      const allLessonsComplete =
        mod.lessons.length === 0 || mod.lessons.every((l) => progressMap[l.id])
      const assignmentDone =
        (mod.assignments ?? []).length === 0 ||
        !!submissionMap[(mod.assignments ?? [])[0]?.id]
      return allLessonsComplete && assignmentDone
    })
    const enriched = modules.map((mod, mi) => {
      const isUnlocked = mi === 0 || statuses[mi - 1]
      const isComplete = statuses[mi]
      const lessonDone = mod.lessons.filter((l) => progressMap[l.id]).length
      const lessonTotal = mod.lessons.length
      const pct = lessonTotal > 0 ? Math.round((lessonDone / lessonTotal) * 100) : 0
      const status = !isUnlocked ? 'locked' : isComplete ? 'completed' : 'in-progress'
      return { ...mod, status, lessonDone, lessonTotal, pct }
    })
    const courseLessonsDone = enriched.reduce((s, m) => s + m.lessonDone, 0)
    const courseLessonsTotal = enriched.reduce((s, m) => s + m.lessonTotal, 0)
    const coursePct =
      courseLessonsTotal > 0
        ? Math.round((courseLessonsDone / courseLessonsTotal) * 100)
        : 0
    return { courseId, course, modules: enriched, courseLessonsDone, courseLessonsTotal, coursePct }
  })

  // Prefer a Wezesha course for the leaderboard; fall back to first enrolled.
  const leaderboardCourseId =
    rawEnrollments.find((e) => /wezesha/i.test(e.course?.title))?.courseId ??
    rawEnrollments[0]?.courseId ??
    null

  const totalModules = enrollments.reduce((s, e) => s + e.modules.length, 0)
  const doneModules = enrollments.reduce(
    (s, e) => s + e.modules.filter((m) => m.status === 'completed').length,
    0,
  )
  const overallPct = totalModules > 0 ? Math.round((doneModules / totalModules) * 100) : 0
  const doneCourses = enrollments.filter(
    (e) => e.modules.length > 0 && e.modules.every((m) => m.status === 'completed'),
  ).length
  const totalLessonsDone = enrollments.reduce((s, e) => s + e.courseLessonsDone, 0)

  // First in-progress module (the one to resume)
  let resumeEnr = null
  let resumeModule = null
  let resumeModuleIndex = 0
  for (const enr of enrollments) {
    const idx = enr.modules.findIndex((m) => m.status === 'in-progress')
    if (idx !== -1) {
      resumeEnr = enr
      resumeModule = enr.modules[idx]
      resumeModuleIndex = idx + 1 // 1-based
      break
    }
  }

  const inProgressItems = enrollments.flatMap((enr) =>
    enr.modules
      .filter((m) => m.status === 'in-progress')
      .map((m) => ({ module: m, enr })),
  )

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  async function handleEnroll(courseId) {
    if (enrolling[courseId]) return
    setEnrolling((prev) => ({ ...prev, [courseId]: true }))
    const { error } = await supabase
      .from('enrollments')
      .insert({ learner_id: userId, course_id: courseId })
    if (error) {
      setEnrolling((prev) => ({ ...prev, [courseId]: false }))
    } else {
      navigate(`/courses/${courseId}`)
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="border-b border-line bg-card">
          <div className="mx-auto h-[57px] max-w-[960px] animate-pulse" />
        </div>
        <div className="mx-auto max-w-[960px] space-y-6 px-6 py-8">
          <div className="h-24 animate-pulse rounded-card bg-card" />
          <div className="h-48 animate-pulse rounded-card bg-card" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.65fr_1fr]">
            <div className="h-64 animate-pulse rounded-card bg-card" />
            <div className="h-64 animate-pulse rounded-card bg-card" />
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state (no enrolments yet) ──────────────────────────────────────
  if (enrollments.length === 0) {
    return (
      <div className="min-h-screen bg-paper">
        <TopNav />
        <main className="mx-auto max-w-[960px] px-6 py-8">
          <div className="space-y-6">

            {/* Welcome row */}
            <div>
              <p className="efac-eyebrow">{todayLabel}</p>
              <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
                Karibu, {firstName}
              </h1>
              <p className="mt-1.5 text-[15px] text-muted">
                Pick a course below and start learning today.
              </p>
              {profile?.efac_id && (
                <p className="mt-1 text-[12px] font-medium text-ink/35">{profile.efac_id}</p>
              )}
            </div>

            {/* Hero empty-state card */}
            <div className="efac-card px-8 py-12 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-teal-tint">
                <BookOpen className="h-7 w-7 text-teal" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-[22px] font-semibold text-ink">
                Start your learning journey
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-[15px] text-muted">
                Browse our catalogue, enroll in a course that interests you, and
                begin building skills that matter — at your own pace.
              </p>
              <Link to="/courses" className="efac-btn efac-btn-sm mt-6">
                Browse all courses
              </Link>
            </div>

            {/* Courses you can join */}
            {availableCourses.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[17px] font-bold text-ink">
                    Courses you can join
                  </h2>
                  <Link
                    to="/courses"
                    className="text-[14px] font-bold text-teal hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {availableCourses.map((course) => (
                    <AvailableCourseCard
                      key={course.id}
                      course={course}
                      isEnrolling={!!enrolling[course.id]}
                      onEnroll={() => handleEnroll(course.id)}
                    />
                  ))}
                </div>
              </section>
            )}

          </div>
        </main>
      </div>
    )
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper">

      {/* ── 1. TOP NAV — full-width bar, inner content centred at 960 px ── */}
      <TopNav />

      {/* ── BODY ────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[960px] px-6 py-8">
        <div className="space-y-6">

          {/* ── 2. WELCOME ROW ──────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="efac-eyebrow">{todayLabel}</p>
              <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
                Karibu back, {firstName}
              </h1>
              <p className="mt-1.5 text-[15px] text-muted">
                {doneModules} of {totalModules} topic{totalModules !== 1 ? 's' : ''} done
                {inProgressItems.length > 0 && (
                  <> &middot; {inProgressItems.length} in progress</>
                )}
              </p>
              {profile?.efac_id && (
                <p className="mt-1 text-[12px] font-medium text-ink/35">{profile.efac_id}</p>
              )}
            </div>

            {/* Streak card — shown only when derivable and > 1 day */}
            {streak > 1 && (
              <div className="efac-card flex shrink-0 flex-col items-center justify-center px-5 py-4">
                <span className="font-display text-[26px] font-semibold leading-none text-orange">
                  {streak}
                </span>
                <span className="efac-eyebrow mt-1">day streak</span>
              </div>
            )}
          </div>

          {/* ── 3. CONTINUE LEARNING HERO ───────────────────────────────── */}
          {resumeModule && resumeEnr && (
            <ContinueLearningHero
              module={resumeModule}
              moduleIndex={resumeModuleIndex}
              enr={resumeEnr}
            />
          )}

          {/* ── 4. TWO-COLUMN GRID ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.65fr_1fr]">

            {/* LEFT — Your courses ────────────────────────────────────── */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[17px] font-bold text-ink">Your courses</h2>
                <Link
                  to="/courses"
                  className="text-[14px] font-bold text-teal hover:underline"
                >
                  View all
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {enrollments.map((enr) => (
                  <CourseCard key={enr.courseId} enr={enr} />
                ))}
              </div>
            </div>

            {/* RIGHT — stacked cards ──────────────────────────────────── */}
            <div className="space-y-4">

              {/* Due this week — hidden when no in-progress topics */}
              {inProgressItems.length > 0 && (
                <div className="efac-card p-5">
                  <h2 className="mb-3 text-[17px] font-bold text-ink">
                    Due this week
                  </h2>
                  <ul className="space-y-0.5" role="list">
                    {inProgressItems.slice(0, 4).map(({ module: m, enr: e }, i) => (
                      <li key={i}>
                        <Link
                          to={`/courses/${e.courseId}`}
                          className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-paper"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-orange"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-ink">
                              {m.title}
                            </p>
                            <p className="truncate text-[12px] text-muted">
                              {e.course.title}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-orange/10 px-2.5 py-[3px] text-[10px] font-extrabold uppercase tracking-wide text-orange">
                            Now
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* This term ───────────────────────────────────────────── */}
              <div className="efac-card p-5">
                <h2 className="mb-4 text-[17px] font-bold text-ink">
                  This term
                </h2>
                <div className="mb-5 flex justify-center">
                  <DonutChart pct={overallPct} />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-muted">Courses</span>
                    <span className="text-[15px] font-bold text-ink">
                      {doneCourses}&thinsp;/&thinsp;{enrollments.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] text-muted">Lessons done</span>
                    <span className="text-[15px] font-bold text-ink">
                      {totalLessonsDone}
                    </span>
                  </div>
                  {certCount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] text-muted">Certificates</span>
                      <Link
                        to="/achievements"
                        className="text-[15px] font-extrabold text-orange hover:underline"
                      >
                        {certCount}
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Leaderboard widget ──────────────────────────────────── */}
              {leaderboardCourseId && (
                <LeaderboardWidget courseId={leaderboardCourseId} userId={userId} />
              )}

            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

// ── ContinueLearningHero ──────────────────────────────────────────────────────

function ContinueLearningHero({ module, moduleIndex, enr }) {
  const { courseId, course } = enr
  const [thumbUrl, setThumbUrl] = useState(null)

  useEffect(() => {
    if (!module.image_url) { setThumbUrl(null); return }
    getFileUrl(module.image_url).then((url) => setThumbUrl(url ?? null))
  }, [module.image_url])

  const displayImg = thumbUrl || course.cover_image

  const nextLesson =
    module.lessonTotal > 0
      ? Math.min(module.lessonDone + 1, module.lessonTotal)
      : null

  return (
    <div className="efac-card overflow-hidden">
      <div className="flex flex-col sm:flex-row">

        {/* 296 px thumbnail — module image_url takes priority over course cover */}
        <div className="h-48 overflow-hidden sm:h-auto sm:w-[296px] sm:shrink-0">
          {displayImg ? (
            <img
              src={displayImg}
              alt={module.image_url ? module.title : course.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal to-teal-dark">
              <span
                className="select-none font-display text-6xl font-bold text-white/20"
                aria-hidden="true"
              >
                {course.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-center p-6">
          <p className="efac-eyebrow text-teal">Continue learning</p>

          <h2 className="mt-2 text-[23px] font-extrabold leading-snug text-ink">
            {module.title}
          </h2>

          <p className="mt-1.5 text-[15px] text-muted">
            {course.title}
            {' · '}Module {moduleIndex}
            {nextLesson !== null && (
              <> · Lesson {nextLesson} of {module.lessonTotal}</>
            )}
          </p>

          {module.lessonTotal > 0 && (
            <div className="mt-4">
              <div className="efac-bar">
                <i style={{ width: `${module.pct}%` }} />
              </div>
              <p className="mt-1.5 text-[13px] text-muted">
                {module.pct}% complete &middot; {module.lessonDone} of {module.lessonTotal} lessons
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link to={`/courses/${courseId}`} className="efac-btn efac-btn-sm">
              Resume
            </Link>
            <Link to={`/courses/${courseId}`} className="efac-btn-ghost efac-btn-sm">
              View syllabus
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CourseCard ────────────────────────────────────────────────────────────────

function CourseCard({ enr }) {
  const { courseId, course, courseLessonsDone, courseLessonsTotal, coursePct } = enr
  const notStarted = courseLessonsDone === 0

  return (
    <Link
      to={`/courses/${courseId}`}
      className="efac-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm"
    >
      {/* Cover image */}
      <div className="h-36 w-full overflow-hidden">
        {course.cover_image ? (
          <img
            src={course.cover_image}
            alt={course.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal to-teal-dark">
            <span
              className="select-none font-display text-4xl font-bold text-white/20"
              aria-hidden="true"
            >
              {course.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {course.category && (
          <span className="efac-tag mb-2 self-start">{course.category}</span>
        )}
        <p className="text-[15px] font-bold leading-snug text-ink">{course.title}</p>

        <div className="mt-auto pt-3">
          {notStarted ? (
            <span className="efac-btn efac-btn-sm text-[12px]">Start course</span>
          ) : (
            <>
              <div className="efac-bar">
                <i style={{ width: `${coursePct}%` }} />
              </div>
              <p className="mt-1.5 text-[13px] text-muted">
                {courseLessonsDone} of {courseLessonsTotal} lessons &middot; {coursePct}%
              </p>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── AvailableCourseCard ───────────────────────────────────────────────────────
// Shown in the empty-state catalogue grid (no enrolment yet).

function AvailableCourseCard({ course, isEnrolling, onEnroll }) {
  return (
    <div className="efac-card flex flex-col overflow-hidden">
      {/* Cover */}
      <div className="h-36 w-full overflow-hidden">
        {course.cover_image ? (
          <img
            src={course.cover_image}
            alt={course.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal to-teal-dark">
            <span
              className="select-none font-display text-4xl font-bold text-white/20"
              aria-hidden="true"
            >
              {course.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {course.category && (
          <span className="efac-tag mb-2 self-start">{course.category}</span>
        )}
        <p className="text-[15px] font-bold leading-snug text-ink">{course.title}</p>
        {course.totalLessons > 0 && (
          <p className="mt-1 text-[13px] text-muted">
            {course.totalLessons} lesson{course.totalLessons !== 1 ? 's' : ''}
          </p>
        )}
        <div className="mt-auto pt-4">
          <button
            onClick={onEnroll}
            disabled={isEnrolling}
            className="efac-btn efac-btn-sm w-full"
          >
            {isEnrolling ? 'Enrolling…' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DonutChart ────────────────────────────────────────────────────────────────

function DonutChart({ pct }) {
  const deg = (pct / 100) * 360
  return (
    <div className="relative h-[112px] w-[112px]">
      {/* Conic gradient ring — bg-track (#eee5d6) / bg-orange (#f48c06) */}
      <div
        className="h-[112px] w-[112px] rounded-full"
        style={{
          background: `conic-gradient(#f48c06 0deg ${deg}deg, #eee5d6 ${deg}deg 360deg)`,
        }}
        aria-hidden="true"
      />
      {/* Inner white disc */}
      <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-card">
        <span className="font-display text-[26px] font-semibold leading-none text-ink">
          {pct}%
        </span>
        <span className="efac-eyebrow mt-1">done</span>
      </div>
    </div>
  )
}

// ── computeStreak ─────────────────────────────────────────────────────────────
// Returns the number of consecutive days (ending today or yesterday) on which
// the learner completed at least one lesson. Returns 0 if streak is broken.

function computeStreak(datesSet) {
  if (!datesSet.size) return 0

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const yday = new Date(today)
  yday.setDate(yday.getDate() - 1)
  const ydayStr = yday.toISOString().slice(0, 10)

  // Streak is broken if neither today nor yesterday has activity
  if (!datesSet.has(todayStr) && !datesSet.has(ydayStr)) return 0

  let count = 0
  const startOffset = datesSet.has(todayStr) ? 0 : 1
  for (let i = startOffset; i < 400; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (datesSet.has(d.toISOString().slice(0, 10))) count++
    else break
  }
  return count
}

// ── BoardRow ──────────────────────────────────────────────────────────────────
// One compact row used inside LeaderboardWidget.

function BoardRow({ entry, isUser }) {
  const { rank, avatar_url, full_name, points } = entry
  const rankStyle = rank === 1 ? { color: GOLD } : {}
  const rankCls   = rank === 2 ? 'text-teal' : rank === 3 ? 'text-orange' : 'text-ink/35'

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
        isUser ? 'bg-orange-tint' : ''
      }`}
    >
      <span
        className={`w-5 shrink-0 font-display text-xs font-bold tabular-nums ${
          rank === 1 ? '' : rankCls
        }`}
        style={rankStyle}
      >
        #{rank}
      </span>
      <Avatar
        url={avatar_url}
        name={full_name}
        className="h-6 w-6 shrink-0 text-[8px] font-extrabold"
      />
      <span
        className={`flex-1 truncate text-[13px] font-semibold ${
          isUser ? 'text-orange' : 'text-ink/70'
        }`}
      >
        {isUser ? 'You' : shortName(full_name)}
      </span>
      <span
        className={`shrink-0 font-display text-[11px] font-bold tabular-nums ${
          isUser ? 'text-orange' : 'text-muted'
        }`}
      >
        {(points ?? 0).toLocaleString()}
        <span className="ml-0.5 font-sans text-[9px] font-normal">pts</span>
      </span>
    </div>
  )
}

// ── LeaderboardWidget ─────────────────────────────────────────────────────────
// Sidebar card: top 3 + user neighbourhood + points-work expander.

function LeaderboardWidget({ courseId, userId }) {
  const [board, setBoard]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showPoints, setShowPoints] = useState(false)

  useEffect(() => {
    setLoading(true)
    supabase
      .rpc('course_leaderboard', { p_course: courseId })
      .then(({ data }) => {
        setBoard(data ?? [])
        setLoading(false)
      })
  }, [courseId])

  if (loading) {
    return (
      <div className="efac-card p-5">
        <div className="mb-3 h-5 w-28 animate-pulse rounded bg-ink/8" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded-lg bg-ink/5" />
          ))}
        </div>
      </div>
    )
  }

  if (board.length === 0) return null

  const top3      = board.slice(0, 3)
  const userIdx   = board.findIndex((r) => r.learner_id === userId)
  const userEntry = userIdx >= 0 ? board[userIdx] : null
  const inTop3    = userIdx >= 0 && userIdx <= 2
  // Person directly above the user — only shown when user isn't in the top 3,
  // so the reader can see who they need to beat.
  const oneAbove  = !inTop3 && userIdx > 0 ? board[userIdx - 1] : null

  return (
    <div className="efac-card p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Leaderboard</h2>
        <Trophy size={15} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
      </div>

      {/* Top 3 */}
      <div className="space-y-0.5">
        {top3.map((entry) => (
          <BoardRow
            key={entry.learner_id}
            entry={entry}
            isUser={entry.learner_id === userId}
          />
        ))}
      </div>

      {/* User neighbourhood */}
      <div className="my-3 border-t border-ink/8" />
      {userEntry ? (
        <div className="space-y-0.5">
          {oneAbove && (
            <BoardRow key={oneAbove.learner_id} entry={oneAbove} isUser={false} />
          )}
          <BoardRow key={`user-${userEntry.learner_id}`} entry={userEntry} isUser />
        </div>
      ) : (
        <p className="text-center text-[12px] text-muted">
          Complete a lesson to appear on the board.
        </p>
      )}

      {/* How points work — inline expander */}
      <button
        type="button"
        onClick={() => setShowPoints((v) => !v)}
        className="mt-3.5 flex items-center gap-1 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
      >
        How points work
        <span className="text-[8px]" aria-hidden="true">{showPoints ? '▴' : '▾'}</span>
      </button>
      {showPoints && (
        <div className="mt-2 space-y-1.5 rounded-lg bg-paper px-3 py-2.5">
          {WIDGET_POINTS.map(({ label, pts }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted">{label}</span>
              <span className="font-display text-[11px] font-bold text-orange">+{pts}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTRUCTOR DASHBOARD  (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

function InstructorHome() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [pendingCount, setPendingCount] = useState(null)
  const [certPendingCount, setCertPendingCount] = useState(null)

  useEffect(() => {
    supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('certificates')
      .select('id, courses!inner(instructor_id)')
      .eq('status', 'pending')
      .eq('courses.instructor_id', userId)
      .then(({ data }) => setCertPendingCount(data?.length ?? 0))
  }, [userId])

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-navy">
          Instructor dashboard
        </h1>
        <p className="mt-1 text-ink/60">
          Manage your courses, rosters, and learner feedback.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/instructor/courses"
          className="rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <h3 className="font-semibold text-navy">My courses</h3>
          <p className="mt-1 text-sm text-ink/60">Create and manage your courses.</p>
        </Link>
        <Link
          to="/instructor/courses"
          className="rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <h3 className="font-semibold text-navy">Rosters</h3>
          <p className="mt-1 text-sm text-ink/60">See enrolled learners and their progress.</p>
        </Link>
        <Link
          to="/instructor/feedback"
          className="rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-navy">Feedback inbox</h3>
            {pendingCount !== null && pendingCount > 0 && (
              <span className="rounded-full bg-red px-2.5 py-0.5 text-xs font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Review and respond to learner assignment submissions.
          </p>
        </Link>
        <Link
          to="/instructor/courses"
          className="rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <h3 className="font-semibold text-navy">Gradebook</h3>
          <p className="mt-1 text-sm text-ink/60">View quiz scores for a course.</p>
        </Link>
        <Link
          to="/instructor/certifications"
          className="rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-navy">Certifications</h3>
            {certPendingCount !== null && certPendingCount > 0 && (
              <span className="rounded-full bg-orange px-2.5 py-0.5 text-xs font-semibold text-navy">
                {certPendingCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Issue certificates to learners who have completed a course.
          </p>
        </Link>
        <Link
          to="/admin/jobs"
          className="rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <h3 className="font-semibold text-navy">Post a job</h3>
          <p className="mt-1 text-sm text-ink/60">
            Add and manage job listings visible to all scholars.
          </p>
        </Link>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD  (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

function AdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-orange">
          Admin panel
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
          Admin dashboard
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Manage users, courses, and platform settings.
        </p>
      </div>

      {/* Primary CTA — full admin overview */}
      <Link
        to="/admin"
        className="flex items-center justify-between gap-4 rounded-2xl border border-orange/30 bg-orange-tint px-6 py-5 transition-shadow hover:shadow-sm"
      >
        <div>
          <p className="font-semibold text-navy">Open admin panel →</p>
          <p className="mt-0.5 text-sm text-ink/60">
            Platform stats, recent activity, and quick actions.
          </p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-tint">
          <BarChart2 size={20} strokeWidth={1.75} className="text-orange" />
        </span>
      </Link>

      {/* Quick-access cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/users"
          className="flex items-center gap-4 rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-tint">
            <Users size={20} strokeWidth={1.75} className="text-teal" />
          </span>
          <div>
            <h3 className="font-semibold text-navy">Users</h3>
            <p className="mt-0.5 text-sm text-ink/60">
              Approve instructors and manage roles.
            </p>
          </div>
        </Link>
        <Link
          to="/admin/courses"
          className="flex items-center gap-4 rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-tint">
            <BookOpen size={20} strokeWidth={1.75} className="text-orange" />
          </span>
          <div>
            <h3 className="font-semibold text-navy">All courses</h3>
            <p className="mt-0.5 text-sm text-ink/60">
              Oversee every course on the platform.
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}
