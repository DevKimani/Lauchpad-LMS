import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FileLink from '../components/FileLink'
import { getFileUrl } from '../lib/files'
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
  const [evidenceMap, setEvidenceMap] = useState({})   // { [lessonId]: { url, type } }
  const [evidenceInput, setEvidenceInput] = useState('')
  const [evidenceFile, setEvidenceFile] = useState(null)
  const [replacing, setReplacing] = useState(false)

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
              id, title, order_index, image_url,
              lessons ( id, title, content, order_index, required_action, action_prompt ),
              assignments ( id )
            )
          `)
          .eq('id', courseId)
          .single(),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed, evidence_url, evidence_type')
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
      const evMap = {}
      for (const r of progressRes.data ?? []) {
        pMap[r.lesson_id] = r.completed
        if (r.evidence_url) evMap[r.lesson_id] = { url: r.evidence_url, type: r.evidence_type }
      }
      setProgress(pMap)
      setEvidenceMap(evMap)

      const sMap = {}
      for (const s of subRes.data ?? []) sMap[s.assignment_id] = true
      setSubmissions(sMap)

      setLoading(false)
    }
    load()
  }, [userId, courseId])

  // Reset tab + evidence inputs when lesson changes
  useEffect(() => {
    setActiveTab('overview')
    setEvidenceInput('')
    setEvidenceFile(null)
    setReplacing(false)
  }, [lessonId])

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

  const ra = currentLesson?.required_action ?? 'none'
  const existingEvidence = evidenceMap[lessonId]
  const isEvidenceReady =
    ra === 'none' ||
    (!!existingEvidence && !replacing) ||
    (ra === 'link' && evidenceInput.trim().startsWith('http')) ||
    (ra === 'file' && evidenceFile !== null)

  // Resources for the active module
  const moduleResources = resources[currentModule?.id] ?? []
  const noteResources = moduleResources.filter((r) => r.kind === 'note')
  const linkResources = moduleResources.filter((r) => r.kind !== 'note' && r.kind !== 'recording')

  // ── Mark complete & continue ────────────────────────────────────────────────
  async function handleMarkComplete() {
    if (marking || !currentLesson) return

    // Already complete and not replacing evidence: just navigate
    if (isCurrentComplete && !replacing) {
      const next = nextAfterComplete()
      if (next) navigate(`/courses/${courseId}/lessons/${next.id}`)
      else navigate(`/courses/${courseId}`)
      return
    }

    if (!isEvidenceReady) return

    setMarking(true)
    const next = nextAfterComplete()

    // Collect / upload evidence
    let evUrl = null
    let evType = null
    if (ra === 'link' && evidenceInput.trim()) {
      evUrl = evidenceInput.trim()
      evType = 'link'
    } else if (ra === 'file' && evidenceFile) {
      const ext = evidenceFile.name.split('.').pop()
      const path = `lesson-evidence/${lessonId}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('course-files')
        .upload(path, evidenceFile)
      if (upErr) { setMarking(false); return }
      evUrl = path
      evType = 'file'
    }

    const upsertData = {
      lesson_id: lessonId,
      learner_id: userId,
      completed: true,
      completed_at: new Date().toISOString(),
      ...(evUrl ? { evidence_url: evUrl, evidence_type: evType } : {}),
    }

    const { error } = await supabase.from('lesson_progress').upsert(
      upsertData,
      { onConflict: 'lesson_id,learner_id' },
    )
    if (!error) {
      setProgress((p) => ({ ...p, [lessonId]: true }))
      if (evUrl) setEvidenceMap((m) => ({ ...m, [lessonId]: { url: evUrl, type: evType } }))
      setReplacing(false)
      setEvidenceInput('')
      setEvidenceFile(null)
    }

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

  // No course at all → back to catalog
  if (!course) {
    return <Navigate to="/courses" replace />
  }

  // Modules came back empty — user is not enrolled (RLS blocked content)
  // or the lesson ID is wrong. Either way, send them to the course page.
  if (flatLessons.length === 0 || !currentLesson) {
    return <Navigate to={`/courses/${courseId}`} replace />
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

          {/* Topic banner */}
          <TopicBanner module={currentModule} />

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

          {/* Evidence panel — shown when required_action is 'link' or 'file' */}
          <EvidencePanel
            lesson={currentLesson}
            evidenceMap={evidenceMap}
            evidenceInput={evidenceInput}
            setEvidenceInput={setEvidenceInput}
            evidenceFile={evidenceFile}
            setEvidenceFile={setEvidenceFile}
            replacing={replacing}
            setReplacing={setReplacing}
          />

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
              disabled={marking || ((!isCurrentComplete || replacing) && !isEvidenceReady)}
              className="efac-btn efac-btn-sm"
            >
              {marking
                ? 'Saving…'
                : isCurrentComplete && !replacing
                ? 'Continue ›'
                : 'Mark complete & continue ›'}
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

// ── TopicBanner ───────────────────────────────────────────────────────────────

function TopicBanner({ module: mod }) {
  const [imgUrl, setImgUrl] = useState(null)

  useEffect(() => {
    if (!mod?.image_url) { setImgUrl(null); return }
    getFileUrl(mod.image_url).then((url) => setImgUrl(url))
  }, [mod?.image_url])

  if (imgUrl) {
    return (
      <div className="h-[220px] w-full shrink-0 overflow-hidden">
        <img src={imgUrl} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div
      className="relative flex h-[220px] w-full shrink-0 items-center justify-center overflow-hidden bg-paper"
      style={{
        backgroundImage: 'radial-gradient(circle, #d8cfbf 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <p className="relative z-10 px-8 text-center font-display text-[22px] font-semibold leading-snug text-teal">
        {mod?.title ?? ''}
      </p>
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

// ── EvidencePanel ─────────────────────────────────────────────────────────────

function EvidencePanel({
  lesson, evidenceMap, evidenceInput, setEvidenceInput,
  evidenceFile, setEvidenceFile, replacing, setReplacing,
}) {
  const ra = lesson?.required_action ?? 'none'
  if (ra === 'none') return null

  const existing = evidenceMap[lesson.id]
  const prompt = lesson.action_prompt
    || (ra === 'link' ? 'Share a link as evidence of your work' : 'Upload a file as evidence of your work')

  return (
    <div className="border-y border-line bg-orange-tint/40 px-6 py-5">
      <p className="mb-3 text-[13px] font-semibold text-ink">{prompt}</p>

      {existing && !replacing ? (
        /* Show previously submitted evidence */
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[12px] font-medium text-teal ring-1 ring-line">
            {existing.type === 'link' ? (
              <>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
                  <path d="M6.5 9.5a3.18 3.18 0 004.5 0l2-2a3.18 3.18 0 00-4.5-4.5l-1 1" />
                  <path d="M9.5 6.5a3.18 3.18 0 00-4.5 0l-2 2a3.18 3.18 0 004.5 4.5l1-1" />
                </svg>
                <a
                  href={existing.url}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-[220px] truncate hover:underline"
                >
                  {existing.url}
                </a>
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
                  <path d="M9.5 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5.5L9.5 2z" />
                  <path d="M9.5 2v3.5H13" />
                </svg>
                <FileLink value={existing.url} label="View file" className="hover:underline" />
              </>
            )}
          </span>
          <button
            onClick={() => setReplacing(true)}
            className="text-[12px] text-muted transition-colors hover:text-ink"
          >
            Replace
          </button>
        </div>
      ) : (
        /* Input form */
        <div className="space-y-2.5">
          {ra === 'link' ? (
            <input
              type="url"
              placeholder="https://…"
              value={evidenceInput}
              onChange={(e) => setEvidenceInput(e.target.value)}
              className="efac-input text-[13px]"
            />
          ) : (
            <input
              type="file"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              className="block text-[13px] text-ink/70 file:mr-3 file:cursor-pointer file:rounded-btn file:border-0 file:bg-orange-tint file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink"
            />
          )}
          {replacing && (
            <button
              onClick={() => { setReplacing(false); setEvidenceInput(''); setEvidenceFile(null) }}
              className="text-[12px] text-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
          )}
        </div>
      )}
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

