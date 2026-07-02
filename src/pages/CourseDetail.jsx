import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import FileLink from '../components/FileLink'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function CourseDetail() {
  const { id } = useParams()
  const { session, profile } = useAuth()
  const userId = session?.user?.id

  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  // Incrementing this triggers a full re-fetch (used after enrollment)
  const [fetchTrigger, setFetchTrigger] = useState(0)
  const [openLessons, setOpenLessons] = useState({})

  // enrollment
  const [enrolled, setEnrolled] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState('')

  // progress: { [lessonId]: boolean }
  const [progress, setProgress] = useState({})
  const [evidenceMap, setEvidenceMap] = useState({})  // { [lessonId]: { url, type } }
  const [toggling, setToggling] = useState(new Set())

  // quiz attempts: { [quizId]: { count, bestScore } }
  const [quizAttempts, setQuizAttempts] = useState({})

  // submissions: { [assignmentId]: submission_row }
  const [submissions, setSubmissions] = useState({})
  // submissionAnswers: { [submissionId]: { [questionId]: answer_text } }
  const [submissionAnswers, setSubmissionAnswers] = useState({})
  // resources: { [moduleId]: resource_row[] }
  const [resources, setResources] = useState({})
  // reflections: { [moduleId]: reflection_row }
  const [reflections, setReflections] = useState({})

  useEffect(() => {
    if (!userId) return

    async function init() {
      const [courseRes, enrollRes, progressRes, attemptsRes] = await Promise.all([
        supabase
          .from('courses')
          .select(`
            id, title, description, cover_image,
            modules (
              id, title, order_index, outcome, reflective_question,
              quizzes ( id, title, passing_score, max_attempts ),
              lessons ( id, title, content, order_index, required_action, action_prompt ),
              assignments ( id, title, instructions, submission_type,
                assignment_questions ( id, prompt, order_index )
              )
            )
          `)
          .eq('id', id)
          .single(),
        supabase
          .from('enrollments')
          .select('id')
          .eq('course_id', id)
          .eq('learner_id', userId)
          .maybeSingle(),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed, evidence_url, evidence_type')
          .eq('learner_id', userId),
        supabase
          .from('quiz_attempts')
          .select('quiz_id, score, passed')
          .eq('learner_id', userId),
      ])

      if (!courseRes.error && courseRes.data) {
        const data = courseRes.data
        setCourse({
          ...data,
          modules: [...(data.modules ?? [])]
            .sort((a, b) => a.order_index - b.order_index)
            .map((m) => {
              const quiz = (m.quizzes ?? [])[0] ?? null
              const assignment = (m.assignments ?? [])[0] ?? null
              return {
                id: m.id,
                title: m.title,
                order_index: m.order_index,
                outcome: m.outcome ?? null,
                reflective_question: m.reflective_question ?? null,
                quiz,
                assignment,
                lessons: [...(m.lessons ?? [])].sort(
                  (a, b) => a.order_index - b.order_index,
                ),
              }
            }),
        })
      } else {
        setCourse(null)
      }

      setEnrolled(!enrollRes.error && !!enrollRes.data)

      const map = {}
      const evMap = {}
      for (const row of progressRes.data ?? []) {
        map[row.lesson_id] = row.completed
        if (row.evidence_url) evMap[row.lesson_id] = { url: row.evidence_url, type: row.evidence_type }
      }
      setProgress(map)
      setEvidenceMap(evMap)

      const attMap = {}
      for (const row of attemptsRes.data ?? []) {
        if (!attMap[row.quiz_id]) attMap[row.quiz_id] = { count: 0, bestScore: null }
        attMap[row.quiz_id].count++
        if (
          row.score !== null &&
          (attMap[row.quiz_id].bestScore === null ||
            row.score > attMap[row.quiz_id].bestScore)
        ) {
          attMap[row.quiz_id].bestScore = row.score
        }
      }
      setQuizAttempts(attMap)

      // Fetch resources, reflections, and submissions in parallel
      if (!courseRes.error && courseRes.data) {
        const moduleIds = (courseRes.data.modules ?? []).map((m) => m.id)
        const assignmentIds = (courseRes.data.modules ?? [])
          .flatMap((m) => m.assignments ?? [])
          .map((a) => a.id)

        const [resResult, reflResult, subResult] = await Promise.all([
          moduleIds.length > 0
            ? supabase
                .from('module_resources')
                .select('id, module_id, kind, title, url, body, order_index')
                .in('module_id', moduleIds)
                .order('order_index')
            : Promise.resolve({ data: [] }),
          moduleIds.length > 0
            ? supabase
                .from('module_reflections')
                .select('id, module_id, response_text, updated_at')
                .in('module_id', moduleIds)
                .eq('learner_id', userId)
            : Promise.resolve({ data: [] }),
          assignmentIds.length > 0
            ? supabase
                .from('submissions')
                .select('id, assignment_id, status, response_text, file_url, feedback')
                .in('assignment_id', assignmentIds)
                .eq('learner_id', userId)
            : Promise.resolve({ data: [] }),
        ])

        const resMap = {}
        for (const r of resResult.data ?? []) {
          if (!resMap[r.module_id]) resMap[r.module_id] = []
          resMap[r.module_id].push(r)
        }
        setResources(resMap)

        const reflMap = {}
        for (const r of reflResult.data ?? []) reflMap[r.module_id] = r
        setReflections(reflMap)

        const subMap = {}
        for (const s of subResult.data ?? []) subMap[s.assignment_id] = s
        setSubmissions(subMap)

        const subIds = (subResult.data ?? []).map((s) => s.id)
        if (subIds.length > 0) {
          const { data: ansData } = await supabase
            .from('submission_answers')
            .select('submission_id, question_id, answer_text')
            .in('submission_id', subIds)

          const ansMap = {}
          for (const a of ansData ?? []) {
            if (!ansMap[a.submission_id]) ansMap[a.submission_id] = {}
            ansMap[a.submission_id][a.question_id] = a.answer_text
          }
          setSubmissionAnswers(ansMap)
        }
      }

      setLoading(false)
    }

    init()
  }, [id, userId, fetchTrigger])

  async function handleEnroll() {
    setEnrolling(true)
    setEnrollError('')
    const { error } = await supabase
      .from('enrollments')
      .insert({ course_id: id, learner_id: userId })
    if (error) {
      setEnrollError('Could not enroll — try again.')
      setEnrolling(false)
      return
    }
    setEnrolling(false)
    // Re-fetch the full course content (modules/lessons now visible via RLS)
    setFetchTrigger((t) => t + 1)
  }

  async function toggleProgress(lessonId, evidence = null) {
    const current = !!progress[lessonId]
    const next = !current

    // Optimistic update so the progress bar reacts instantly
    setProgress((prev) => ({ ...prev, [lessonId]: next }))
    if (next && evidence) setEvidenceMap((m) => ({ ...m, [lessonId]: evidence }))
    if (!next) setEvidenceMap((m) => { const n = { ...m }; delete n[lessonId]; return n })
    setToggling((prev) => new Set(prev).add(lessonId))

    const upsertData = {
      lesson_id: lessonId,
      learner_id: userId,
      completed: next,
      completed_at: next ? new Date().toISOString() : null,
    }
    if (next && evidence) {
      upsertData.evidence_url = evidence.url
      upsertData.evidence_type = evidence.type
    }

    const { error } = await supabase.from('lesson_progress').upsert(
      upsertData,
      { onConflict: 'lesson_id,learner_id' },
    )

    if (error) {
      // Revert on failure
      setProgress((prev) => ({ ...prev, [lessonId]: current }))
      if (next && evidence) setEvidenceMap((m) => { const n = { ...m }; delete n[lessonId]; return n })
    }

    setToggling((prev) => {
      const s = new Set(prev)
      s.delete(lessonId)
      return s
    })
  }

  function toggleLesson(lessonId) {
    setOpenLessons((prev) => ({ ...prev, [lessonId]: !prev[lessonId] }))
  }

  // Derived progress bar values
  const allLessons = course?.modules.flatMap((m) => m.lessons) ?? []
  const totalLessons = allLessons.length
  const completedCount = allLessons.filter((l) => progress[l.id]).length
  const pct =
    totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading course…</p>
      </Layout>
    )
  }

  if (!course) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <h1 className="font-display text-2xl font-semibold text-navy">
            Course not found
          </h1>
          <p className="mt-2 text-ink/60">
            This course may have been removed or is not yet available.
          </p>
          <Link
            to="/courses"
            className="mt-6 inline-block text-sm font-medium text-teal hover:underline"
          >
            Back to catalog
          </Link>
        </div>
      </Layout>
    )
  }

  // Non-enrolled learners see a preview; instructors and admins always see full content
  const isPrivileged =
    profile?.role === 'instructor' || profile?.role === 'admin'
  if (!enrolled && !isPrivileged) {
    return (
      <Layout>
        <CoursePreview
          course={course}
          enrolling={enrolling}
          enrollError={enrollError}
          onEnroll={handleEnroll}
        />
      </Layout>
    )
  }

  // A module is complete when every lesson is done AND (if it has an assignment)
  // the learner has submitted it. Module 0 is always unlocked; each later module
  // unlocks only when the one before it is complete.
  const moduleStatuses = course.modules.map((module) => {
    const allLessonsComplete =
      module.lessons.length === 0 ||
      module.lessons.every((l) => !!progress[l.id])
    const assignmentDone =
      !module.assignment || !!submissions[module.assignment.id]
    return allLessonsComplete && assignmentDone
  })

  return (
    <Layout>
      {course.cover_image ? (
        <img
          src={course.cover_image}
          alt={course.title}
          className="mb-8 h-48 w-full rounded-xl object-cover"
        />
      ) : (
        <div className="mb-8 h-48 w-full rounded-xl bg-navy" />
      )}

      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-navy">
          {course.title}
        </h1>
        {course.description && (
          <p className="mt-2 leading-relaxed text-ink/70">{course.description}</p>
        )}
      </div>

      {/* Enroll CTA or progress bar */}
      {!enrolled ? (
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={handleEnroll}
            disabled={enrolling}
            className="rounded-lg bg-orange px-5 py-2.5 text-sm font-medium text-navy transition hover:bg-orange-dark disabled:opacity-60"
          >
            {enrolling ? 'Enrolling…' : 'Enroll in this course'}
          </button>
          {enrollError && <p className="text-sm text-clay">{enrollError}</p>}
        </div>
      ) : totalLessons > 0 ? (
        <div className="mb-8">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-orange">{pct}% complete</span>
            <span className="text-ink/50">
              {completedCount} / {totalLessons} lessons
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-orange-light">
            <div
              className="h-full rounded-full bg-orange transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Modules */}
      {course.modules.length === 0 ? (
        <p className="text-ink/60">No modules have been added to this course yet.</p>
      ) : (
        <div className="space-y-6">
          {course.modules.map((module, mi) => {
            const isUnlocked = mi === 0 || moduleStatuses[mi - 1]
            const prevModule = mi > 0 ? course.modules[mi - 1] : null
            const modLessonCount = module.lessons.length
            const modDoneCount = module.lessons.filter((l) => !!progress[l.id]).length
            const modPct =
              modLessonCount > 0
                ? Math.round((modDoneCount / modLessonCount) * 100)
                : 0

            const modRes = resources[module.id] ?? []
            const materials = modRes.filter((r) => r.kind !== 'recording')
            const recordings = modRes.filter((r) => r.kind === 'recording')
            const notes = materials.filter((r) => r.kind === 'note')
            const matGroups = [
              { key: 'pdf', label: 'PDFs' },
              { key: 'doc', label: 'Documents' },
              { key: 'youtube', label: 'Videos' },
              { key: 'link', label: 'Links' },
            ]
              .map(({ key, label }) => ({ label, items: materials.filter((r) => r.kind === key) }))
              .filter((g) => g.items.length > 0)

            return (
              <section
                key={module.id}
                className={`overflow-hidden rounded-xl border bg-white ${
                  isUnlocked ? 'border-ink/10' : 'border-ink/10'
                }`}
              >
                {/* Module header */}
                <div
                  className={`border-b px-6 py-4 ${
                    isUnlocked ? 'border-ink/10' : 'border-ink/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2
                      className={`font-display text-xl font-semibold ${
                        isUnlocked ? 'text-navy' : 'text-ink/40'
                      }`}
                    >
                      <span className="mr-2 text-base font-normal text-ink/30">
                        Module {mi + 1}
                      </span>
                      {module.title}
                    </h2>
                    {!isUnlocked ? (
                      <LockIcon />
                    ) : modLessonCount > 0 ? (
                      <span className="shrink-0 tabular-nums text-xs text-ink/40">
                        {modDoneCount}/{modLessonCount}
                      </span>
                    ) : null}
                  </div>
                  {isUnlocked && modLessonCount > 0 && (
                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-orange-light">
                      <div
                        className="h-full rounded-full bg-orange transition-all duration-300"
                        style={{ width: `${modPct}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Lock hint */}
                {!isUnlocked && prevModule && (
                  <p className="border-b border-ink/5 bg-sand/30 px-6 py-3 text-sm text-ink/50">
                    Finish{' '}
                    <span className="font-medium text-ink/60">{prevModule.title}</span>
                    {' '}to unlock this module.
                  </p>
                )}

                {/* 1. Outcome */}
                {isUnlocked && module.outcome && (
                  <div className="border-b border-ink/10 bg-teal-light/40 px-6 py-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal">
                      What you'll achieve
                    </p>
                    <p className="text-sm leading-relaxed text-ink/80">{module.outcome}</p>
                  </div>
                )}

                {/* 2. Reflective question */}
                {isUnlocked && module.reflective_question && (
                  <ReflectionWidget
                    moduleId={module.id}
                    question={module.reflective_question}
                    initialReflection={reflections[module.id] ?? null}
                    userId={userId}
                  />
                )}

                {/* 3. Materials (notes, PDFs, docs, videos, links) */}
                {isUnlocked && (notes.length > 0 || matGroups.length > 0) && (
                  <div className="border-b border-ink/10 px-6 py-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/40">
                      Materials
                    </p>
                    <div className="space-y-4">
                      {/* Notes rendered as text blocks */}
                      {notes.map((r) => (
                        <div key={r.id} className="rounded-lg bg-sand px-5 py-4">
                          {r.title && (
                            <p className="mb-1.5 text-sm font-semibold text-ink">{r.title}</p>
                          )}
                          {r.body && (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                              {r.body}
                            </p>
                          )}
                        </div>
                      ))}
                      {/* Grouped link / file resources */}
                      {matGroups.map(({ label, items }) => (
                        <div key={label}>
                          <p className="mb-1 text-xs font-medium text-ink/50">{label}</p>
                          <ul className="space-y-1">
                            {items.map((r) => (
                              <li key={r.id}>
                                <FileLink
                                  value={r.url}
                                  label={r.title || r.url}
                                  className="text-sm font-medium text-teal hover:underline"
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lessons */}
                {modLessonCount === 0 ? (
                  <p className="px-6 py-4 text-sm text-ink/60">No lessons yet.</p>
                ) : (
                  <ul
                    className={`divide-y ${
                      isUnlocked ? 'divide-ink/10' : 'divide-ink/5'
                    }`}
                  >
                    {module.lessons.map((lesson) => (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        locked={!isUnlocked}
                        open={isUnlocked ? !!openLessons[lesson.id] : false}
                        onToggle={isUnlocked ? () => toggleLesson(lesson.id) : undefined}
                        enrolled={enrolled}
                        completed={!!progress[lesson.id]}
                        toggling={isUnlocked ? toggling.has(lesson.id) : false}
                        onToggleComplete={
                          isUnlocked ? (ev) => toggleProgress(lesson.id, ev) : undefined
                        }
                        courseId={id}
                        requiredAction={lesson.required_action ?? 'none'}
                        actionPrompt={lesson.action_prompt ?? ''}
                        evidence={evidenceMap[lesson.id] ?? null}
                      />
                    ))}
                  </ul>
                )}

                {/* Assignment card — only when unlocked */}
                {module.assignment && isUnlocked && (
                  <AssignmentCard
                    key={module.assignment.id}
                    assignment={module.assignment}
                    enrolled={enrolled}
                    initialSubmission={submissions[module.assignment.id] ?? null}
                    initialAnswers={
                      submissions[module.assignment.id]
                        ? (submissionAnswers[submissions[module.assignment.id].id] ?? {})
                        : {}
                    }
                    userId={userId}
                  />
                )}

                {/* Quiz card — only when unlocked */}
                {module.quiz && isUnlocked && (
                  <div className="border-t border-ink/10 bg-sand/50 px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold uppercase tracking-wide text-teal/60">
                          Quiz
                        </span>
                        <p className="mt-0.5 truncate text-sm font-medium text-ink">
                          {module.quiz.title}
                        </p>
                        <p className="text-xs text-ink/50">
                          Passing: {module.quiz.passing_score}%
                          {quizAttempts[module.quiz.id]?.bestScore != null &&
                            ` · Best score: ${quizAttempts[module.quiz.id].bestScore}%`}
                          {quizAttempts[module.quiz.id]?.bestScore == null &&
                            quizAttempts[module.quiz.id]?.count > 0 &&
                            ' · Pending review'}
                        </p>
                      </div>
                      {enrolled ? (
                        quizAttempts[module.quiz.id]?.count >= module.quiz.max_attempts ? (
                          <span className="shrink-0 text-xs text-ink/40">
                            No attempts remaining
                          </span>
                        ) : (
                          <Link
                            to={`/quizzes/${module.quiz.id}`}
                            className="shrink-0 rounded-lg bg-orange px-4 py-2 text-sm font-medium text-navy transition hover:bg-orange-dark"
                          >
                            {quizAttempts[module.quiz.id]?.count > 0
                              ? 'Retake quiz'
                              : 'Take quiz'}
                          </Link>
                        )
                      ) : (
                        <span className="shrink-0 text-xs text-ink/40">
                          Enroll to take this quiz
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Session recordings — always last */}
                {isUnlocked && recordings.length > 0 && (
                  <div className="border-t border-ink/10 px-6 py-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/40">
                      Session recordings
                    </p>
                    <ul className="space-y-1">
                      {recordings.map((r) => (
                        <li key={r.id}>
                          <FileLink
                            value={r.url}
                            label={r.title}
                            className="text-sm font-medium text-teal hover:underline"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </Layout>
  )
}

function ReflectionWidget({ moduleId, question, initialReflection, userId }) {
  const [text, setText] = useState(initialReflection?.response_text ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const { error: err } = await supabase
        .from('module_reflections')
        .upsert(
          {
            module_id: moduleId,
            learner_id: userId,
            response_text: text,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'module_id,learner_id' },
        )
      if (err) throw err
      setSaved(true)
    } catch (e) {
      setError(e.message ?? 'Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-ink/10 px-6 py-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal/60">
        Reflection
      </p>
      <p className="mb-3 text-sm font-medium text-ink">{question}</p>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        placeholder="Write your reflection…"
        className="w-full resize-y rounded-lg border border-teal/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-orange px-4 py-2 text-sm font-medium text-navy transition hover:bg-orange-dark disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm font-medium text-teal">Saved</span>}
        {error && <span className="text-sm text-clay">{error}</span>}
      </div>
    </div>
  )
}

function AssignmentCard({ assignment, enrolled, initialSubmission, initialAnswers, userId }) {
  const questions = [...(assignment.assignment_questions ?? [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  )
  const isSingle = assignment.submission_type === 'single'

  const [submission, setSubmission] = useState(initialSubmission)
  const [savedAnswers, setSavedAnswers] = useState(initialAnswers)
  const [editing, setEditing] = useState(!initialSubmission)

  const [responseText, setResponseText] = useState(initialSubmission?.response_text ?? '')
  const [fileObj, setFileObj] = useState(null)
  const [questionAnswers, setQuestionAnswers] = useState(() => {
    const init = {}
    for (const q of [...(assignment.assignment_questions ?? [])]) {
      init[q.id] = initialAnswers[q.id] ?? ''
    }
    return init
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isReviewed = submission?.status === 'reviewed'
  const showForm = !submission || (!isReviewed && editing)

  function handleStartEdit() {
    setResponseText(submission?.response_text ?? '')
    const init = {}
    for (const q of questions) init[q.id] = savedAnswers[q.id] ?? ''
    setQuestionAnswers(init)
    setFileObj(null)
    setError('')
    setEditing(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      let fileUrl = submission?.file_url ?? null

      if (fileObj && isSingle) {
        const path = `assignments/${assignment.id}/${Date.now()}_${fileObj.name}`
        const { error: upErr } = await supabase.storage
          .from('course-files')
          .upload(path, fileObj, { upsert: true })
        if (upErr) throw upErr
        fileUrl = path
      }

      const upsertRow = {
        assignment_id: assignment.id,
        learner_id: userId,
        status: 'submitted',
        ...(isSingle ? { response_text: responseText, file_url: fileUrl } : {}),
      }

      const { data: sub, error: subErr } = await supabase
        .from('submissions')
        .upsert(upsertRow, { onConflict: 'assignment_id,learner_id' })
        .select('id, assignment_id, status, response_text, file_url, feedback')
        .single()
      if (subErr) throw subErr

      if (!isSingle && questions.length > 0) {
        const answerRows = questions.map((q) => ({
          submission_id: sub.id,
          question_id: q.id,
          answer_text: questionAnswers[q.id] ?? '',
        }))
        const { error: ansErr } = await supabase
          .from('submission_answers')
          .upsert(answerRows, { onConflict: 'submission_id,question_id' })
        if (ansErr) throw ansErr

        const newSaved = {}
        for (const r of answerRows) newSaved[r.question_id] = r.answer_text
        setSavedAnswers(newSaved)
      }

      setSubmission(sub)
      setEditing(false)
      setFileObj(null)
    } catch (err) {
      setError(err.message ?? 'Submission failed — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-t border-ink/10 bg-sand/30 px-6 py-5">
      <div className="mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-teal/60">
          Assignment
        </span>
        <p className="mt-0.5 text-sm font-medium text-ink">{assignment.title}</p>
      </div>

      {assignment.instructions && (
        <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-ink/70">
          {assignment.instructions}
        </p>
      )}

      {!enrolled ? (
        <p className="text-sm text-ink/40">Enroll to submit this assignment.</p>
      ) : showForm ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSingle ? (
            <>
              <textarea
                rows={5}
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Write your response here…"
                className="w-full resize-y rounded-lg border border-teal/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
              <div>
                <p className="mb-1 text-xs font-medium text-ink/60">
                  Attachment (optional)
                </p>
                <input
                  type="file"
                  onChange={(e) => setFileObj(e.target.files?.[0] ?? null)}
                  className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-light file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-navy file:transition file:hover:bg-teal/20"
                />
                {submission?.file_url && !fileObj && (
                  <p className="mt-1.5 text-xs text-ink/50">
                    Current file:{' '}
                    <FileLink
                      value={submission.file_url}
                      label="view"
                      className="text-teal hover:underline"
                    />{' '}
                    — upload a new file to replace it.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {questions.length === 0 ? (
                <p className="text-sm text-ink/40">No questions added yet.</p>
              ) : (
                questions.map((q, qi) => (
                  <div key={q.id}>
                    <label className="mb-1.5 block text-sm font-medium text-ink">
                      <span className="mr-1.5 font-normal text-ink/40">Q{qi + 1}.</span>
                      {q.prompt}
                    </label>
                    <textarea
                      rows={3}
                      value={questionAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setQuestionAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="Your answer…"
                      className="w-full resize-y rounded-lg border border-teal/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-orange px-5 py-2 text-sm font-medium text-navy transition hover:bg-orange-dark disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : submission ? 'Resubmit' : 'Submit assignment'}
            </button>
            {submission && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm text-ink/50 hover:text-ink"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : isReviewed ? (
        <>
          {submission.feedback && (
            <div className="mb-4 rounded-lg border border-teal/20 bg-teal-light p-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-teal">
                Instructor feedback
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {submission.feedback}
              </p>
            </div>
          )}
          <SubmissionDisplay
            submission={submission}
            isSingle={isSingle}
            questions={questions}
            savedAnswers={savedAnswers}
            statusLabel="Reviewed"
            statusClass="bg-sand text-ink/50"
          />
        </>
      ) : (
        <>
          <SubmissionDisplay
            submission={submission}
            isSingle={isSingle}
            questions={questions}
            savedAnswers={savedAnswers}
            statusLabel="Submitted"
            statusClass="bg-orange-light text-navy"
          />
          <button
            onClick={handleStartEdit}
            className="mt-3 text-sm font-medium text-teal hover:underline"
          >
            Edit and resubmit
          </button>
        </>
      )}
    </div>
  )
}

function SubmissionDisplay({ submission, isSingle, questions, savedAnswers, statusLabel, statusClass }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink/40">
          Your submission
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {isSingle ? (
        <>
          {submission.response_text ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
              {submission.response_text}
            </p>
          ) : (
            <p className="text-sm italic text-ink/30">No written response.</p>
          )}
          {submission.file_url && (
            <FileLink
              value={submission.file_url}
              label="View attached file →"
              className="mt-2 inline-block text-sm font-medium text-teal hover:underline"
            />
          )}
        </>
      ) : (
        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div key={q.id}>
              <p className="text-xs font-medium text-ink/50">
                Q{qi + 1}. {q.question_text}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                {savedAnswers[q.id] || (
                  <span className="italic text-ink/30">No answer provided.</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LessonRow({
  lesson, open, onToggle, enrolled, completed, toggling, onToggleComplete,
  locked, courseId, requiredAction, actionPrompt, evidence,
}) {
  const ra = requiredAction ?? 'none'
  const [panelOpen, setPanelOpen] = useState(false)
  const [evidenceInput, setEvidenceInput] = useState('')
  const [evidenceFile, setEvidenceFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const evidenceReady =
    (ra === 'link' && evidenceInput.trim().startsWith('http')) ||
    (ra === 'file' && evidenceFile !== null)

  function handleMarkDone() {
    if (completed) {
      onToggleComplete()
    } else if (ra === 'none') {
      onToggleComplete()
    } else {
      setPanelOpen((o) => !o)
    }
  }

  async function handleEvidenceSubmit() {
    setUploadError('')
    if (ra === 'link') {
      if (!evidenceInput.trim().startsWith('http')) {
        setUploadError('URL must start with http.')
        return
      }
      setPanelOpen(false)
      onToggleComplete({ url: evidenceInput.trim(), type: 'link' })
      setEvidenceInput('')
    } else {
      if (!evidenceFile) { setUploadError('Please select a file.'); return }
      setUploading(true)
      const ext = evidenceFile.name.split('.').pop()
      const path = `lesson-evidence/${lesson.id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('course-files')
        .upload(path, evidenceFile)
      setUploading(false)
      if (upErr) { setUploadError(upErr.message ?? 'Upload failed.'); return }
      setPanelOpen(false)
      onToggleComplete({ url: path, type: 'file' })
      setEvidenceFile(null)
    }
  }

  return (
    <li>
      <div className="flex items-center gap-3 px-6 py-4">
        {enrolled && !locked ? (
          /* Enrolled + unlocked: title row navigates to the lesson player */
          <Link
            to={`/courses/${courseId}/lessons/${lesson.id}`}
            className="flex flex-1 items-center gap-3 transition-colors hover:text-teal"
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${
                completed ? 'bg-orange' : 'bg-orange-tint'
              }`}
            >
              {completed ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-white" aria-hidden="true">
                  <path d="M2.5 8.5l3.5 3.5 7-7" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-orange" aria-hidden="true">
                  <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                </svg>
              )}
            </span>
            <span className="flex-1 text-sm font-medium text-ink">{lesson.title}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-ink/30" aria-hidden="true">
              <path d="M5 3l7 5-7 5V3z" />
            </svg>
          </Link>
        ) : (
          /* Locked or not enrolled: expand inline (preview) */
          <button
            onClick={locked ? undefined : onToggle}
            aria-disabled={locked}
            aria-expanded={locked ? undefined : open}
            className={`flex flex-1 items-center gap-3 text-left transition-colors ${
              locked ? 'pointer-events-none' : 'hover:text-teal'
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${
                locked ? 'bg-ink/10' : completed ? 'bg-orange' : 'bg-orange-light'
              }`}
            >
              {!locked && completed ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-white" aria-hidden="true">
                  <path d="M2.5 8.5l3.5 3.5 7-7" />
                </svg>
              ) : !locked ? (
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-orange" aria-hidden="true">
                  <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                </svg>
              ) : null}
            </span>
            <span className={`flex-1 text-sm font-medium ${locked ? 'text-ink/40' : 'text-ink'}`}>
              {lesson.title}
            </span>
            {!locked && (
              <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 shrink-0 text-ink/30 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
                <path d="M2 5l6 6 6-6H2z" />
              </svg>
            )}
          </button>
        )}

        {/* Mark done + optional evidence icon */}
        {enrolled && !locked && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Evidence icon when lesson is done and evidence was submitted */}
            {completed && evidence && ra !== 'none' && (
              evidence.type === 'link' ? (
                <a
                  href={evidence.url}
                  target="_blank"
                  rel="noreferrer"
                  title="View submitted evidence"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-tint text-teal transition-colors hover:bg-teal hover:text-white"
                  aria-label="View evidence link"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden="true">
                    <path d="M6.5 9.5a3.18 3.18 0 004.5 0l2-2a3.18 3.18 0 00-4.5-4.5l-1 1" />
                    <path d="M9.5 6.5a3.18 3.18 0 00-4.5 0l-2 2a3.18 3.18 0 004.5 4.5l1-1" />
                  </svg>
                </a>
              ) : (
                <FileEvidenceIcon url={evidence.url} label={lesson.title} />
              )
            )}
            <button
              onClick={handleMarkDone}
              disabled={toggling}
              aria-label={completed ? 'Mark as incomplete' : 'Mark as complete'}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                completed
                  ? 'bg-orange/10 text-navy hover:bg-orange/20'
                  : ra !== 'none'
                  ? 'bg-orange-tint text-navy ring-1 ring-orange/30 hover:bg-orange/20'
                  : 'bg-orange-tint text-navy hover:bg-orange/20'
              }`}
            >
              {completed ? 'Done ✓' : ra !== 'none' ? 'Submit & done' : 'Mark done'}
            </button>
          </div>
        )}
      </div>

      {/* Inline evidence panel — for action-gated lessons not yet done */}
      {panelOpen && enrolled && !locked && !completed && (
        <div className="border-t border-line bg-orange-tint/30 px-6 py-4">
          {actionPrompt && (
            <p className="mb-2.5 text-[13px] font-semibold text-ink">{actionPrompt}</p>
          )}
          {ra === 'link' ? (
            <input
              type="url"
              placeholder="https://…"
              value={evidenceInput}
              onChange={(e) => setEvidenceInput(e.target.value)}
              className="efac-input mb-2.5 text-[13px]"
            />
          ) : (
            <input
              type="file"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              className="mb-2.5 block text-[13px] text-ink/70 file:mr-3 file:cursor-pointer file:rounded-btn file:border-0 file:bg-orange-tint file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink"
            />
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleEvidenceSubmit}
              disabled={!evidenceReady || uploading}
              className="efac-btn efac-btn-sm"
            >
              {uploading ? 'Uploading…' : 'Submit & mark done'}
            </button>
            <button
              onClick={() => { setPanelOpen(false); setEvidenceInput(''); setEvidenceFile(null); setUploadError('') }}
              className="text-[13px] text-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
          </div>
          {uploadError && (
            <p className="mt-2 text-[13px] text-clay">{uploadError}</p>
          )}
        </div>
      )}

      {/* Inline lesson content — only for non-enrolled preview */}
      {!enrolled && !locked && open && (
        <div className="border-t border-ink/10 bg-sand px-6 py-5">
          {lesson.content ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
              {lesson.content}
            </p>
          ) : (
            <p className="text-sm text-ink/40">No content has been added yet.</p>
          )}
        </div>
      )}
    </li>
  )
}

function FileEvidenceIcon({ url, label }) {
  const [href, setHref] = useState(null)
  useEffect(() => {
    import('../lib/files').then(({ getFileUrl }) => getFileUrl(url).then(setHref))
  }, [url])
  return (
    <a
      href={href ?? '#'}
      target={href ? '_blank' : undefined}
      rel="noreferrer"
      title={`View file evidence: ${label}`}
      aria-label="View evidence file"
      onClick={!href ? (e) => e.preventDefault() : undefined}
      className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-tint text-orange transition-colors hover:bg-orange hover:text-white"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden="true">
        <path d="M9.5 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5.5L9.5 2z" />
        <path d="M9.5 2v3.5H13" />
      </svg>
    </a>
  )
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 shrink-0 text-ink/30"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6zm-5 4a2 2 0 114 0 2 2 0 01-4 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ── CoursePreview ─────────────────────────────────────────────────────────────
// Shown to authenticated users who aren't enrolled.
// course.modules may be empty (RLS blocks nested data for non-enrolled); the
// preview degrades gracefully — module titles shown when available, hidden otherwise.

function CoursePreview({ course, enrolling, enrollError, onEnroll }) {
  // modules / lessons may be empty if RLS returns nothing for non-enrolled users
  const modules = course.modules ?? []
  const totalLessons = modules.reduce((sum, m) => sum + (m.lessons?.length ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Cover image */}
      <div className="overflow-hidden rounded-xl">
        {course.cover_image ? (
          <img
            src={course.cover_image}
            alt={course.title}
            className="h-52 w-full object-cover"
          />
        ) : (
          <div className="flex h-52 w-full items-center justify-center bg-gradient-to-br from-teal to-teal-dark">
            <span
              className="select-none font-display text-6xl font-bold text-white/20"
              aria-hidden="true"
            >
              {course.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Title + description */}
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
          {course.title}
        </h1>
        {course.description && (
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {course.description}
          </p>
        )}
      </div>

      {/* Summary + topic list */}
      <div className="efac-card p-5">
        {/* Stats row — only when we have data */}
        {(modules.length > 0 || totalLessons > 0) && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            {modules.length > 0 && (
              <span className="text-[14px] font-semibold text-ink">
                {modules.length}&nbsp;topic{modules.length !== 1 ? 's' : ''}
              </span>
            )}
            {modules.length > 0 && totalLessons > 0 && (
              <span className="text-muted" aria-hidden="true">·</span>
            )}
            {totalLessons > 0 && (
              <span className="text-[14px] font-semibold text-ink">
                {totalLessons}&nbsp;lesson{totalLessons !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Module title list */}
        {modules.length > 0 ? (
          <ol className="space-y-2">
            {modules.map((mod, mi) => (
              <li key={mod.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 rounded-full bg-orange-tint px-2 py-0.5 text-[11px] font-extrabold text-orange">
                  {mi + 1}
                </span>
                <span className="text-[14px] text-ink">{mod.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[14px] text-muted">
            Enroll to see the full course content.
          </p>
        )}
      </div>

      {/* Enroll CTA */}
      <div className="flex items-center gap-4">
        <button
          onClick={onEnroll}
          disabled={enrolling}
          className="efac-btn"
        >
          {enrolling ? 'Enrolling…' : 'Enroll to start learning'}
        </button>
        {enrollError && (
          <p className="text-[14px] text-clay">{enrollError}</p>
        )}
      </div>
    </div>
  )
}
