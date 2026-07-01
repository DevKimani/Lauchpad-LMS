import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FileLink from '../components/FileLink'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════════
// Lesson Player  — EFAC hi-fi design 4c
// Route: /courses/:courseId/lessons/:lessonId
// ═══════════════════════════════════════════════════════════════════════════════

export default function LessonPlayer() {
  const { courseId, lessonId } = useParams()
  const { session, profile, signOut } = useAuth()
  const userId = session?.user?.id
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState(null)
  const [progress, setProgress] = useState({})      // { [lessonId]: boolean }
  const [submissions, setSubmissions] = useState({}) // { [assignmentId]: true }
  const [resources, setResources] = useState({})    // { [moduleId]: row[] }
  const [activeTab, setActiveTab] = useState('overview')
  const [localNotes, setLocalNotes] = useState('')
  const [marking, setMarking] = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    async function load() {
      const [courseRes, progressRes, subRes] = await Promise.all([
        supabase
          .from('courses')
          .select(`
            id, title,
            modules (
              id, title, order_index,
              lessons ( id, title, content, order_index, video_url ),
              assignments ( id )
            )
          `)
          .eq('id', courseId)
          .single(),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed')
          .eq('learner_id', userId),
        supabase
          .from('submissions')
          .select('assignment_id')
          .eq('learner_id', userId),
      ])

      if (courseRes.data) {
        const sorted = [...(courseRes.data.modules ?? [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map((m) => ({
            ...m,
            assignment: (m.assignments ?? [])[0] ?? null,
            lessons: [...(m.lessons ?? [])].sort(
              (a, b) => a.order_index - b.order_index,
            ),
          }))
        setCourse({ ...courseRes.data, modules: sorted })

        // Fetch all module resources for the Resources tab
        const moduleIds = sorted.map((m) => m.id)
        if (moduleIds.length > 0) {
          const { data: resData } = await supabase
            .from('module_resources')
            .select('id, module_id, kind, title, url, body, order_index')
            .in('module_id', moduleIds)
            .order('order_index')
          const resMap = {}
          for (const r of resData ?? []) {
            if (!resMap[r.module_id]) resMap[r.module_id] = []
            resMap[r.module_id].push(r)
          }
          setResources(resMap)
        }
      }

      const pMap = {}
      for (const r of progressRes.data ?? []) pMap[r.lesson_id] = r.completed
      setProgress(pMap)

      const sMap = {}
      for (const s of subRes.data ?? []) sMap[s.assignment_id] = true
      setSubmissions(sMap)

      setLoading(false)
    }
    load()
  }, [userId, courseId])

  // Reset to Overview tab when the lesson changes
  useEffect(() => { setActiveTab('overview') }, [lessonId])

  // ── Derived ─────────────────────────────────────────────────────────────────

  // Flat list of lessons in module order, each tagged with its module + mi
  const flatLessons = course?.modules.flatMap((m, mi) =>
    m.lessons.map((l) => ({ ...l, module: m, moduleIndex: mi })),
  ) ?? []

  const currentIdx = flatLessons.findIndex((l) => l.id === lessonId)
  const currentLesson = flatLessons[currentIdx] ?? null
  const currentModule = currentLesson?.module ?? null
  const currentModuleIndex = currentLesson?.moduleIndex ?? 0

  // Module completion for lock logic
  function computeStatuses(progressOverride = progress) {
    return (course?.modules ?? []).map((mod) => {
      const allDone =
        mod.lessons.length === 0 ||
        mod.lessons.every((l) => !!progressOverride[l.id])
      const assignDone = !mod.assignment || !!submissions[mod.assignment.id]
      return allDone && assignDone
    })
  }
  const moduleStatuses = computeStatuses()
  const isUnlocked = (mi) => mi === 0 || moduleStatuses[mi - 1]

  // Previous lesson in flat order (no lock check — we reached it so it's accessible)
  const prevLesson = currentIdx > 0 ? flatLessons[currentIdx - 1] : null

  // Next accessible lesson taking into account the effect of marking THIS one done
  function nextAfterComplete() {
    const newProgress = { ...progress, [lessonId]: true }
    const newStatuses = computeStatuses(newProgress)
    const unlockWith = (mi) => mi === 0 || newStatuses[mi - 1]
    for (let i = currentIdx + 1; i < flatLessons.length; i++) {
      if (unlockWith(flatLessons[i].moduleIndex)) return flatLessons[i]
    }
    return null
  }

  const totalLessons = flatLessons.length
  const lessonNumber = currentIdx + 1
  const completedCount = flatLessons.filter((l) => !!progress[l.id]).length
  const isCurrentComplete = !!progress[lessonId]

  // Resources for the active module
  const moduleResources = resources[currentModule?.id] ?? []
  const noteResources = moduleResources.filter((r) => r.kind === 'note')
  const linkResources = moduleResources.filter((r) => r.kind !== 'note' && r.kind !== 'recording')

  // ── Mark complete & continue ────────────────────────────────────────────────
  async function handleMarkComplete() {
    if (marking || !currentLesson) return
    setMarking(true)

    const next = nextAfterComplete()

    const { error } = await supabase.from('lesson_progress').upsert(
      {
        lesson_id: lessonId,
        learner_id: userId,
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'lesson_id,learner_id' },
    )
    if (!error) setProgress((p) => ({ ...p, [lessonId]: true }))

    setMarking(false)

    if (next) navigate(`/courses/${courseId}/lessons/${next.id}`)
    else navigate(`/courses/${courseId}`)
  }

  // ── Sign-out helper ──────────────────────────────────────────────────────────
  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?'

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-muted">Loading lesson…</p>
      </div>
    )
  }

  if (!course || !currentLesson) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper">
        <p className="font-display text-[20px] font-semibold text-ink">Lesson not found</p>
        <Link to={`/courses/${courseId}`} className="text-[14px] font-semibold text-teal hover:underline">
          ← Back to course
        </Link>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-paper">

      {/* ── MINIMAL TOP NAV ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-[57px] shrink-0 items-center border-b border-line bg-card">
        <div className="flex w-full items-center justify-between gap-4 px-6">

          {/* Left: logo + divider + back link */}
          <div className="flex shrink-0 items-center gap-3">
            <Link to="/dashboard">
              <img src="/efac-logo.svg" alt="EFAC" className="h-7" />
            </Link>
            <span className="h-5 w-px bg-line" aria-hidden="true" />
            <Link
              to={`/courses/${courseId}`}
              className="flex items-center gap-1.5 text-[14px] font-semibold text-muted transition-colors hover:text-ink"
            >
              <span aria-hidden="true">‹</span>
              <span className="max-w-[180px] truncate sm:max-w-[280px]">{course.title}</span>
            </Link>
          </div>

          {/* Centre: "Lesson X of Y" */}
          <p className="hidden shrink-0 text-[13px] text-muted sm:block">
            Lesson{' '}
            <span className="font-semibold text-ink">{lessonNumber}</span>
            {' '}of{' '}
            <span className="font-semibold text-ink">{totalLessons}</span>
          </p>

          {/* Right: avatar with sign-out on click */}
          <button
            onClick={handleSignOut}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-orange text-[13px] font-extrabold text-ink transition-opacity hover:opacity-85"
            aria-label="Sign out"
            title="Sign out"
          >
            {initials}
          </button>
        </div>
      </header>

      {/* ── TWO-COLUMN BODY ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col lg:flex-row">

        {/* ── MAIN ───────────────────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col min-w-0">

          {/* Media area — 300 px tall */}
          <VideoArea lesson={currentLesson} />

          {/* Lesson info + tabs */}
          <div className="px-6 py-6">

            {/* Eyebrow: module context */}
            <p className="efac-eyebrow text-teal">
              MODULE {currentModuleIndex + 1}&nbsp;&middot;&nbsp;{currentModule?.title}
            </p>

            {/* Lesson title */}
            <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight text-ink">
              {currentLesson.title}
            </h1>

            {/* Tab row */}
            <div className="mt-5 flex border-b border-line" role="tablist">
              {[
                { key: 'overview',  label: 'Overview'   },
                { key: 'resources', label: 'Resources'  },
                { key: 'notes',     label: 'Notes'      },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={activeTab === key}
                  onClick={() => setActiveTab(key)}
                  className={
                    activeTab === key
                      ? 'mr-6 border-b-2 border-orange pb-2.5 pt-1 text-[14px] font-extrabold text-ink'
                      : 'mr-6 pb-2.5 pt-1 text-[14px] font-semibold text-muted transition-colors hover:text-ink'
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            <div className="mt-5" role="tabpanel">
              {activeTab === 'overview' && <OverviewTab lesson={currentLesson} />}
              {activeTab === 'resources' && (
                <ResourcesTab
                  noteResources={noteResources}
                  linkResources={linkResources}
                />
              )}
              {activeTab === 'notes' && (
                <NotesTab notes={localNotes} onChange={setLocalNotes} />
              )}
            </div>

          </div>

          {/* Nav footer */}
          <footer className="mt-auto flex items-center justify-between gap-3 border-t border-line bg-paper px-6 py-4">
            {prevLesson ? (
              <Link
                to={`/courses/${courseId}/lessons/${prevLesson.id}`}
                className="efac-btn-ghost efac-btn-sm"
              >
                ‹ Previous
              </Link>
            ) : (
              <Link to={`/courses/${courseId}`} className="efac-btn-ghost efac-btn-sm">
                ‹ Course
              </Link>
            )}

            <button
              onClick={handleMarkComplete}
              disabled={marking}
              className="efac-btn efac-btn-sm"
            >
              {marking ? 'Saving…' : isCurrentComplete ? 'Continue ›' : 'Mark complete & continue ›'}
            </button>
          </footer>

        </main>

        {/* ── CONTENTS RAIL ──────────────────────────────────────────────── */}
        {/* On desktop: sticky column that scrolls independently; on mobile: below main */}
        <aside
          className="w-full shrink-0 border-t border-line bg-card
                     lg:w-[296px] lg:border-l lg:border-t-0
                     lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:overflow-y-auto"
        >
          <ContentsRail
            course={course}
            courseId={courseId}
            currentLessonId={lessonId}
            progress={progress}
            moduleStatuses={moduleStatuses}
            completedCount={completedCount}
            totalLessons={totalLessons}
          />
        </aside>

      </div>
    </div>
  )
}

// ── VideoArea ─────────────────────────────────────────────────────────────────

function VideoArea({ lesson }) {
  const embed = lesson.video_url ? getVideoEmbed(lesson.video_url) : null

  if (embed?.type === 'iframe') {
    return (
      <div className="h-[300px] w-full shrink-0 overflow-hidden bg-ink">
        <iframe
          src={embed.src}
          title={lesson.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    )
  }

  if (embed?.type === 'video') {
    return (
      <div className="h-[300px] w-full shrink-0 overflow-hidden bg-ink">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={embed.src} controls className="h-full w-full" />
      </div>
    )
  }

  // Styled placeholder
  return (
    <div className="flex h-[300px] w-full shrink-0 flex-col items-center justify-center gap-3 bg-gradient-to-br from-teal-dark to-teal">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-7 w-7 text-white/70"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <p className="text-[13px] font-medium text-white/50">No video for this lesson</p>
    </div>
  )
}

// ── OverviewTab ───────────────────────────────────────────────────────────────

function OverviewTab({ lesson }) {
  if (!lesson.content) {
    return (
      <p className="text-[14px] text-muted">No content has been added to this lesson yet.</p>
    )
  }
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink/80">
      {lesson.content}
    </p>
  )
}

// ── ResourcesTab ──────────────────────────────────────────────────────────────

function ResourcesTab({ noteResources, linkResources }) {
  if (noteResources.length === 0 && linkResources.length === 0) {
    return (
      <p className="text-[14px] text-muted">
        No resources have been added to this module yet.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {noteResources.map((r) => (
        <div key={r.id} className="rounded-[10px] bg-paper px-5 py-4">
          {r.title && (
            <p className="mb-1.5 text-[14px] font-semibold text-ink">{r.title}</p>
          )}
          {r.body && (
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink/70">
              {r.body}
            </p>
          )}
        </div>
      ))}

      {linkResources.length > 0 && (
        <ul className="space-y-2.5">
          {linkResources.map((r) => (
            <li key={r.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 text-[13px] text-muted" aria-hidden="true">→</span>
              <div>
                <FileLink
                  value={r.url}
                  label={r.title || r.url}
                  className="text-[14px] font-semibold text-teal hover:underline"
                />
                {r.body && (
                  <p className="mt-0.5 text-[13px] text-muted">{r.body}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── NotesTab ──────────────────────────────────────────────────────────────────

function NotesTab({ notes, onChange }) {
  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">
        Personal notes — visible only to you.
      </p>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your notes here…"
        rows={8}
        className="efac-input resize-y text-[14px]"
      />
    </div>
  )
}

// ── ContentsRail ──────────────────────────────────────────────────────────────

function ContentsRail({
  course, courseId, currentLessonId, progress, moduleStatuses, completedCount, totalLessons,
}) {
  return (
    <div className="px-[22px] py-5">

      {/* Rail header */}
      <p className="efac-eyebrow">Course contents</p>
      <p className="mt-0.5 mb-5 text-[13px] text-muted">
        {completedCount} of {totalLessons}{' '}
        lesson{totalLessons !== 1 ? 's' : ''} complete
      </p>

      {/* Module list */}
      <div className="space-y-5">
        {course.modules.map((mod, mi) => {
          const unlocked = mi === 0 || moduleStatuses[mi - 1]
          return (
            <div key={mod.id}>
              {/* Module label */}
              <p
                className={`mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] ${
                  unlocked ? 'text-ink' : 'text-muted'
                }`}
              >
                {mi + 1}.&nbsp;{mod.title}
              </p>

              {/* Lesson rows */}
              <ul className="space-y-0.5">
                {mod.lessons.map((lesson) => {
                  const completed = !!progress[lesson.id]
                  const isCurrent = lesson.id === currentLessonId

                  if (!unlocked) {
                    return (
                      <li key={lesson.id}>
                        <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-[7px]">
                          <RailDot state="locked" />
                          <span className="text-[13px] leading-snug text-muted/50">
                            {lesson.title}
                          </span>
                        </div>
                      </li>
                    )
                  }

                  return (
                    <li key={lesson.id}>
                      <Link
                        to={`/courses/${courseId}/lessons/${lesson.id}`}
                        className={`flex items-center gap-2.5 rounded-[8px] px-2 py-[7px] transition-colors ${
                          isCurrent ? 'bg-orange/[0.09]' : 'hover:bg-paper'
                        }`}
                        aria-current={isCurrent ? 'page' : undefined}
                      >
                        <RailDot
                          state={completed ? 'completed' : isCurrent ? 'current' : 'upcoming'}
                        />
                        <span
                          className={`text-[13px] leading-snug ${
                            isCurrent
                              ? 'font-bold text-teal'
                              : completed
                              ? 'text-ink'
                              : 'text-ink/70'
                          }`}
                        >
                          {lesson.title}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── RailDot ───────────────────────────────────────────────────────────────────

function RailDot({ state }) {
  if (state === 'completed') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange">
        <svg
          viewBox="0 0 16 16" fill="none"
          stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="h-2.5 w-2.5" aria-hidden="true"
        >
          <path d="M2.5 8.5l3.5 3.5 7-7" />
        </svg>
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-orange bg-orange/15">
        <span className="h-1.5 w-1.5 rounded-full bg-orange" />
      </span>
    )
  }
  if (state === 'locked') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-line">
        <svg
          viewBox="0 0 16 16" fill="currentColor"
          className="h-2.5 w-2.5 text-muted/40" aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8 1a3 3 0 00-3 3v1H4a1 1 0 00-1 1v6a1 1 0 001 1h8a1 1 0 001-1V6a1 1 0 00-1-1h-1V4a3 3 0 00-3-3zm-1 4V4a1 1 0 112 0v1H7z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    )
  }
  // upcoming — empty circle
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-edge" />
  )
}

// ── Video embed helper ────────────────────────────────────────────────────────

function getVideoEmbed(url) {
  if (!url) return null

  // YouTube: watch?v=, youtu.be/, /embed/
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  )
  if (ytMatch) {
    return { type: 'iframe', src: `https://www.youtube.com/embed/${ytMatch[1]}` }
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeoMatch) {
    return { type: 'iframe', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` }
  }

  // Direct video file
  if (/\.(mp4|webm|ogv|ogg)(\?|#|$)/i.test(url)) {
    return { type: 'video', src: url }
  }

  // Generic URL — render in iframe
  if (url.startsWith('http')) {
    return { type: 'iframe', src: url }
  }

  return null
}
