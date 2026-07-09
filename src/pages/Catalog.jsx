import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import TopNav from '../components/TopNav'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════════
// Catalog — EFAC hi-fi design 4b
// Standalone page (own nav) so the "Courses" link can be marked active and the
// container matches the learner dashboard exactly.
// ═══════════════════════════════════════════════════════════════════════════════

export default function Catalog() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [enrolledIds, setEnrolledIds] = useState(new Set())
  const [progressMap, setProgressMap] = useState({})      // { [lessonId]: boolean }
  const [certCourseIds, setCertCourseIds] = useState(new Set()) // course_ids with issued cert
  const [enrolling, setEnrolling] = useState({})           // { [courseId]: bool }
  const [activeCategory, setActiveCategory] = useState('All')

  useEffect(() => {
    if (!userId) return
    async function load() {
      const [coursesRes, enrollRes, progressRes, certRes] = await Promise.all([
        supabase
          .from('courses')
          .select(`
            id, title, cover_image, category,
            modules (
              id, order_index,
              lessons ( id )
            )
          `)
          .eq('is_published', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('enrollments')
          .select('course_id')
          .eq('learner_id', userId),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed')
          .eq('learner_id', userId),
        supabase
          .from('certificates')
          .select('courses ( id )')
          .eq('status', 'issued')
          .eq('learner_id', userId),
      ])

      setCourses(
        (coursesRes.data ?? []).map((c) => ({
          ...c,
          modules: [...(c.modules ?? [])].sort((a, b) => a.order_index - b.order_index),
          totalLessons: (c.modules ?? []).reduce((s, m) => s + m.lessons.length, 0),
        })),
      )

      setEnrolledIds(new Set((enrollRes.data ?? []).map((e) => e.course_id)))

      const pMap = {}
      for (const r of progressRes.data ?? []) pMap[r.lesson_id] = r.completed
      setProgressMap(pMap)

      setCertCourseIds(
        new Set(
          (certRes.data ?? []).map((c) => c.courses?.id).filter(Boolean),
        ),
      )

      setLoading(false)
    }
    load()
  }, [userId])

  // ── Enroll ────────────────────────────────────────────────────────────────
  async function handleEnroll(courseId) {
    if (enrolling[courseId]) return
    setEnrolling((prev) => ({ ...prev, [courseId]: true }))
    const { error } = await supabase
      .from('enrollments')
      .insert({ course_id: courseId, learner_id: userId })
    if (error) {
      setEnrolling((prev) => ({ ...prev, [courseId]: false }))
    } else {
      setEnrolledIds((prev) => new Set([...prev, courseId]))
      setEnrolling((prev) => ({ ...prev, [courseId]: false }))
      navigate(`/courses/${courseId}`)
    }
  }

  // ── Per-course state ──────────────────────────────────────────────────────
  function courseState(course) {
    if (!enrolledIds.has(course.id)) return { status: 'not-enrolled', pct: 0 }
    const allLessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
    const total = allLessonIds.length
    if (total === 0) return { status: 'enrolled', pct: 0 }
    const done = allLessonIds.filter((lid) => progressMap[lid]).length
    const pct = Math.round((done / total) * 100)
    if (certCourseIds.has(course.id) || pct === 100) return { status: 'completed', pct: 100 }
    return { status: done > 0 ? 'in-progress' : 'enrolled', pct }
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  // "All" is always first; category chips are the distinct non-null values,
  // sorted alphabetically so order is stable regardless of DB row order.
  const categories = [
    'All',
    ...Array.from(new Set(courses.map((c) => c.category).filter(Boolean))).sort(),
  ]
  // When "All" is active every published course is shown, including those whose
  // category is null.  Only a specific chip narrows the grid.
  const filtered =
    activeCategory === 'All'
      ? courses
      : courses.filter((c) => c.category === activeCategory)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper">

      {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
      <TopNav />

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[960px] px-6 py-8">

        {/* 1. Header */}
        <div className="mb-6">
          <p className="efac-eyebrow">Catalog</p>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
            Explore courses
          </h1>
        </div>

        {/* 2. Filter chip row — always rendered after load; shows only "All"
               when no courses carry a category yet, so the UI stays consistent */}
        {!loading && (
          <div
            className="mb-6 flex flex-wrap gap-2"
            role="group"
            aria-label="Filter by category"
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={`efac-chip ${activeCategory === cat ? 'efac-chip-on' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* 3. Course grid */}
        {loading ? (
          <LoadingSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyFilter onReset={() => setActiveCategory('All')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((course) => (
              <CatalogCard
                key={course.id}
                course={course}
                state={courseState(course)}
                isEnrolling={!!enrolling[course.id]}
                onEnroll={() => handleEnroll(course.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ── CatalogCard ───────────────────────────────────────────────────────────────

function CatalogCard({ course, state, isEnrolling, onEnroll }) {
  const { status, pct } = state

  return (
    <article className="efac-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">

      {/* Cover — 104 px tall */}
      <Link to={`/courses/${course.id}`} tabIndex={-1} aria-hidden="true">
        <div className="h-[104px] w-full overflow-hidden">
          {course.cover_image ? (
            <img
              src={course.cover_image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
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
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col p-[14px]">

        {/* Category tag */}
        {course.category && (
          <span className="efac-tag mb-2 self-start">{course.category}</span>
        )}

        {/* Title */}
        <Link
          to={`/courses/${course.id}`}
          className="text-[15px] font-bold leading-snug text-ink hover:text-teal"
        >
          {course.title}
        </Link>

        {/* Meta: lesson count */}
        {course.totalLessons > 0 && (
          <p className="mt-1.5 text-[12px] text-muted">
            {course.totalLessons}&nbsp;lesson{course.totalLessons !== 1 ? 's' : ''}
          </p>
        )}

        {/* State-dependent footer */}
        <div className="mt-auto pt-3">
          <CardFooter
            status={status}
            pct={pct}
            courseId={course.id}
            isEnrolling={isEnrolling}
            onEnroll={onEnroll}
          />
        </div>
      </div>
    </article>
  )
}

// ── CardFooter ────────────────────────────────────────────────────────────────

function CardFooter({ status, pct, courseId, isEnrolling, onEnroll }) {
  if (status === 'completed') {
    return (
      <Link
        to="/achievements"
        className="inline-flex items-center gap-1.5 text-[13px] font-bold text-teal transition-opacity hover:opacity-75"
      >
        <span
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-teal text-[9px] font-extrabold text-white"
          aria-hidden="true"
        >
          ✓
        </span>
        Completed &middot; certificate
      </Link>
    )
  }

  if (status === 'in-progress') {
    return (
      <div>
        <div className="efac-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] text-muted">{pct}%</span>
          <Link
            to={`/courses/${courseId}`}
            className="text-[12px] font-bold text-teal hover:underline"
          >
            Continue &rarr;
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'enrolled') {
    return (
      <Link
        to={`/courses/${courseId}`}
        className="efac-btn efac-btn-sm inline-flex"
      >
        Start learning
      </Link>
    )
  }

  // not-enrolled
  return (
    <button
      onClick={onEnroll}
      disabled={isEnrolling}
      className="efac-btn efac-btn-sm w-full"
    >
      {isEnrolling ? 'Enrolling…' : 'Enroll'}
    </button>
  )
}

// ── LoadingSkeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading courses">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="efac-card animate-pulse overflow-hidden">
          <div className="h-[104px] bg-track" />
          <div className="space-y-2.5 p-[14px]">
            <div className="h-3 w-14 rounded-full bg-track" />
            <div className="h-4 w-4/5 rounded bg-track" />
            <div className="h-3 w-1/3 rounded bg-track" />
            <div className="mt-3 h-8 w-full rounded-[9px] bg-track" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── EmptyFilter ───────────────────────────────────────────────────────────────

function EmptyFilter({ onReset }) {
  return (
    <div className="efac-card px-8 py-16 text-center">
      <p className="font-display text-[20px] font-semibold text-ink">
        No courses match this filter
      </p>
      <p className="mt-2 text-[15px] text-muted">
        Try selecting a different category, or browse everything.
      </p>
      <button onClick={onReset} className="efac-btn efac-btn-sm mt-6">
        Show all courses
      </button>
    </div>
  )
}
