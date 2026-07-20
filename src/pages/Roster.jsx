import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ConsoleLayout from '../components/ConsoleLayout'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { getFileUrl } from '../lib/files'

export default function Roster() {
  const { id: courseId } = useParams()
  const [courseTitle, setCourseTitle] = useState('')
  const [totalLessons, setTotalLessons] = useState(0)
  const [roster, setRoster] = useState([])
  const [modules, setModules] = useState([])
  const [reflectionsByModule, setReflectionsByModule] = useState({})
  const [evidenceByLearner, setEvidenceByLearner] = useState({})  // { [learnerId]: { [lessonId]: { url, type } } }
  const [openModule, setOpenModule] = useState(null)
  const [surveys, setSurveys] = useState([])
  const [surveyQuestions, setSurveyQuestions] = useState({})
  const [surveyResponsesByLearner, setSurveyResponsesByLearner] = useState({})
  const [openSurveyLearner, setOpenSurveyLearner] = useState({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function init() {
      // 1. Fetch course with all lesson IDs (to compute total + filter progress)
      const courseRes = await supabase
        .from('courses')
        .select('id, title, modules ( id, title, order_index, lessons ( id, title, required_action ) )')
        .eq('id', courseId)
        .single()

      if (courseRes.error || !courseRes.data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const course = courseRes.data
      const sortedModules = [...(course.modules ?? [])].sort(
        (a, b) => a.order_index - b.order_index,
      )
      const moduleIds = sortedModules.map((m) => m.id)
      const allLessonIds = sortedModules.flatMap((m) =>
        (m.lessons ?? []).map((l) => l.id),
      )
      setCourseTitle(course.title)
      setTotalLessons(allLessonIds.length)
      setModules(sortedModules.map((m) => ({
        id: m.id,
        title: m.title ?? '',
        order_index: m.order_index,
        lessons: (m.lessons ?? []).map((l) => ({
          id: l.id,
          title: l.title ?? '',
          required_action: l.required_action ?? 'none',
        })),
      })))

      // 2. Fetch enrollments
      const enrollRes = await supabase
        .from('enrollments')
        .select('learner_id')
        .eq('course_id', courseId)

      const learnerIds = (enrollRes.data ?? []).map((e) => e.learner_id)

      if (learnerIds.length === 0) {
        setRoster([])
        setLoading(false)
        return
      }

      // 3. Fetch profiles, progress, and reflections in parallel
      const [profilesRes, progressRes, reflRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, efac_id, avatar_url').in('id', learnerIds),
        allLessonIds.length > 0
          ? supabase
              .from('lesson_progress')
              .select('lesson_id, learner_id, completed, evidence_url, evidence_type, evidence_text')
              .in('lesson_id', allLessonIds)
              .in('learner_id', learnerIds)
          : Promise.resolve({ data: [] }),
        moduleIds.length > 0
          ? supabase
              .from('module_reflections')
              .select('module_id, learner_id, response_text')
              .in('module_id', moduleIds)
              .in('learner_id', learnerIds)
          : Promise.resolve({ data: [] }),
      ])

      // Build per-learner progress + evidence maps
      const progressByLearner = {}
      const evByLearner = {}
      for (const row of progressRes.data ?? []) {
        if (!progressByLearner[row.learner_id]) progressByLearner[row.learner_id] = {}
        progressByLearner[row.learner_id][row.lesson_id] = row.completed
        if (row.evidence_url || row.evidence_text) {
          if (!evByLearner[row.learner_id]) evByLearner[row.learner_id] = {}
          const type = row.evidence_type ?? (row.evidence_text ? 'text' : null)
          evByLearner[row.learner_id][row.lesson_id] = { url: row.evidence_url, type, text: row.evidence_text }
        }
      }
      setEvidenceByLearner(evByLearner)

      const rows = learnerIds
        .map((learnerId) => {
          const profile = (profilesRes.data ?? []).find((p) => p.id === learnerId)
          const learnerProgress = progressByLearner[learnerId] ?? {}
          const completed = allLessonIds.filter((lid) => learnerProgress[lid]).length
          const pct =
            allLessonIds.length > 0
              ? Math.round((completed / allLessonIds.length) * 100)
              : 0
          return {
            id: learnerId,
            name: profile?.full_name || 'Unnamed learner',
            efacId: profile?.efac_id ?? '',
            avatarUrl: profile?.avatar_url ?? null,
            completed,
            pct,
          }
        })
        .sort((a, b) => b.pct - a.pct)

      setRoster(rows)

      const reflMap = {}
      for (const r of reflRes.data ?? []) {
        if (!reflMap[r.module_id]) reflMap[r.module_id] = {}
        reflMap[r.module_id][r.learner_id] = r.response_text
      }
      setReflectionsByModule(reflMap)

      // 4. Fetch survey data for this course
      const { data: surveyData } = await supabase
        .from('surveys')
        .select('id, kind, title')
        .eq('course_id', courseId)

      if (surveyData && surveyData.length > 0) {
        setSurveys(surveyData)
        const surveyIds = surveyData.map((s) => s.id)
        const [questionsRes, responsesRes] = await Promise.all([
          supabase
            .from('survey_questions')
            .select('id, survey_id, prompt, qtype, order_index')
            .in('survey_id', surveyIds)
            .order('order_index'),
          supabase
            .from('survey_responses')
            .select('survey_id, learner_id, answers')
            .in('survey_id', surveyIds)
            .in('learner_id', learnerIds),
        ])
        const qMap = {}
        for (const q of questionsRes.data ?? []) {
          if (!qMap[q.survey_id]) qMap[q.survey_id] = []
          qMap[q.survey_id].push(q)
        }
        setSurveyQuestions(qMap)
        const rMap = {}
        for (const r of responsesRes.data ?? []) {
          if (!rMap[r.learner_id]) rMap[r.learner_id] = {}
          rMap[r.learner_id][r.survey_id] = r.answers
        }
        setSurveyResponsesByLearner(rMap)
      }

      setLoading(false)
    }

    init()
  }, [courseId])

  if (loading) {
    return (
      <ConsoleLayout title="Roster">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-ink/5" />
          ))}
        </div>
      </ConsoleLayout>
    )
  }

  if (notFound) {
    return (
      <ConsoleLayout title="Course not found">
        <div className="py-20 text-center">
          <p className="text-ink/60">
            This course may have been removed or is unavailable.
          </p>
          <Link
            to="/instructor/courses"
            className="mt-6 inline-block text-sm font-medium text-teal hover:underline"
          >
            Back to my courses
          </Link>
        </div>
      </ConsoleLayout>
    )
  }

  return (
    <ConsoleLayout title={courseTitle || 'Roster'}>
      <p className="mb-6 text-sm text-ink/60">
        {courseTitle} · {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
      </p>

      {roster.length === 0 ? (
        <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-navy">
            No enrollments yet
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Learners will appear here once they enroll in this course.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
          <div className="grid grid-cols-[1fr_2fr_4rem] gap-4 border-b border-ink/10 px-5 py-3 text-xs font-medium uppercase tracking-wide text-ink/40 sm:grid-cols-[1fr_7rem_2fr_4rem]">
            <span>Learner</span>
            <span className="hidden sm:block">EFAC ID</span>
            <span>Progress</span>
            <span className="text-right">Done</span>
          </div>

          <ul className="divide-y divide-teal/10">
            {roster.map((learner) => (
              <li
                key={learner.id}
                className="grid grid-cols-[1fr_2fr_4rem] items-center gap-4 px-5 py-4 sm:grid-cols-[1fr_7rem_2fr_4rem]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar url={learner.avatarUrl} name={learner.name} className="h-7 w-7 shrink-0 text-[10px] font-extrabold" />
                  <p className="truncate text-sm font-medium text-ink">{learner.name}</p>
                </div>

                <p className="hidden truncate font-mono text-xs text-ink/40 sm:block">
                  {learner.efacId || '—'}
                </p>

                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-orange-tint">
                    <div
                      className="h-full rounded-full bg-orange transition-all duration-300"
                      style={{ width: `${learner.pct}%` }}
                    />
                  </div>
                </div>

                <p className="text-right text-sm text-ink/60">
                  {learner.pct === 100 ? (
                    <span className="font-medium text-orange">100%</span>
                  ) : (
                    `${learner.pct}%`
                  )}
                </p>
              </li>
            ))}
          </ul>

          <div className="border-t border-ink/10 px-5 py-3 text-xs text-ink/40">
            {roster.length} enrolled · {roster.filter((r) => r.pct === 100).length} completed
          </div>
        </div>
      )}

      {/* Evidence + Reflections by module */}
      {roster.length > 0 && modules.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-navy">
            Reflections
          </h2>

          <div className="space-y-2">
            {modules.map((mod, mi) => {
              const isOpen = openModule === mod.id
              const modRefl = reflectionsByModule[mod.id] ?? {}
              const answeredCount = roster.filter(
                (l) => modRefl[l.id] && modRefl[l.id].trim(),
              ).length

              return (
                <div
                  key={mod.id}
                  className="overflow-hidden rounded-xl border border-ink/10 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setOpenModule(isOpen ? null : mod.id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-sand/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 text-xs font-medium text-ink/40">
                        Module {mi + 1}
                      </span>
                      <span className="truncate text-sm font-medium text-ink">
                        {mod.title || 'Untitled module'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-ink/50">
                        {answeredCount}/{roster.length} responded
                      </span>
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className={`h-3 w-3 text-ink/30 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      >
                        <path d="M2 5l6 6 6-6H2z" />
                      </svg>
                    </div>
                  </button>

                  {isOpen && (() => {
                    const gatedLessons = (mod.lessons ?? []).filter(
                      (l) => l.required_action !== 'none',
                    )
                    const hasEvidence = gatedLessons.length > 0
                    const cols = hasEvidence ? 'grid-cols-[1fr_2fr_auto]' : 'grid-cols-[1fr_2fr]'
                    return (
                      <div className="border-t border-ink/10">
                        <div className={`grid ${cols} gap-4 border-b border-ink/10 px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink/40`}>
                          <span>Learner</span>
                          <span>Reflection</span>
                          {hasEvidence && <span>Evidence</span>}
                        </div>
                        <ul className="divide-y divide-teal/10">
                          {roster.map((learner) => {
                            const text = modRefl[learner.id]
                            const learnerEv = evidenceByLearner[learner.id] ?? {}
                            return (
                              <li key={learner.id} className={`grid ${cols} items-start gap-4 px-5 py-4`}>
                                <div className="flex min-w-0 items-center gap-2">
                                  <Avatar url={learner.avatarUrl} name={learner.name} className="h-6 w-6 shrink-0 text-[9px] font-extrabold" />
                                  <p className="truncate text-sm font-medium text-ink">{learner.name}</p>
                                </div>
                                <p className={`text-sm leading-relaxed ${text && text.trim() ? 'text-ink/80' : 'italic text-ink/30'}`}>
                                  {(text && text.trim()) || 'No reflection yet'}
                                </p>
                                {hasEvidence && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {gatedLessons.map((lesson) => {
                                      const ev = learnerEv[lesson.id]
                                      if (!ev) return null
                                      return (
                                        <RosterEvidenceBadge
                                          key={lesson.id}
                                          evidence={ev}
                                          label={lesson.title}
                                        />
                                      )
                                    })}
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Survey Results */}
      {roster.length > 0 && surveys.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-navy">
            Survey Results
          </h2>
          <div className="space-y-4">
            {surveys.map((survey) => {
              const submitted = roster.filter(
                (l) => surveyResponsesByLearner[l.id]?.[survey.id],
              )
              return (
                <div
                  key={survey.id}
                  className="overflow-hidden rounded-xl border border-ink/10 bg-white"
                >
                  <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          survey.kind === 'pre'
                            ? 'bg-teal-tint text-teal'
                            : 'bg-orange-tint text-orange'
                        }`}
                      >
                        {survey.kind === 'pre' ? 'Pre-survey' : 'Post-survey'}
                      </span>
                      <span className="text-sm font-medium text-ink">{survey.title}</span>
                    </div>
                    <span className="text-xs text-ink/50">
                      {submitted.length}/{roster.length} submitted
                    </span>
                  </div>
                  <ul className="divide-y divide-ink/5">
                    {roster.map((learner) => {
                      const answers = surveyResponsesByLearner[learner.id]?.[survey.id]
                      const isExpanded = openSurveyLearner[survey.id] === learner.id
                      const questions = surveyQuestions[survey.id] ?? []
                      return (
                        <li key={learner.id}>
                          <div className="flex items-center gap-3 px-5 py-3">
                            <Avatar url={learner.avatarUrl} name={learner.name} className="h-7 w-7 shrink-0 text-[10px] font-extrabold" />
                            <p className="flex-1 truncate text-sm font-medium text-ink">
                              {learner.name}
                            </p>
                            {learner.efacId && (
                              <p className="hidden font-mono text-xs text-ink/35 sm:block">
                                {learner.efacId}
                              </p>
                            )}
                            {answers ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenSurveyLearner((o) => ({
                                    ...o,
                                    [survey.id]: isExpanded ? null : learner.id,
                                  }))
                                }
                                className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-teal hover:underline"
                              >
                                {isExpanded ? 'Collapse' : 'View answers'}
                                <svg
                                  viewBox="0 0 16 16"
                                  fill="currentColor"
                                  className={`h-2.5 w-2.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                >
                                  <path d="M2 5l6 6 6-6H2z" />
                                </svg>
                              </button>
                            ) : (
                              <span className="shrink-0 text-xs italic text-ink/30">
                                Not submitted
                              </span>
                            )}
                          </div>
                          {isExpanded && answers && questions.length > 0 && (
                            <div className="space-y-4 border-t border-ink/5 bg-paper px-5 py-4">
                              {questions.map((q, qi) => (
                                <div key={q.id}>
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink/45">
                                    {qi + 1}. {q.prompt}
                                  </p>
                                  <p className="text-sm leading-relaxed text-ink/75">
                                    {answers[q.id] ?? '—'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </ConsoleLayout>
  )
}

// ── RosterEvidenceBadge ───────────────────────────────────────────────────────

function RosterEvidenceBadge({ evidence, label }) {
  if (evidence.type === 'link') {
    return (
      <a
        href={evidence.url}
        target="_blank"
        rel="noreferrer"
        title={`Evidence: ${label}`}
        aria-label={`View link evidence for ${label}`}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-tint text-teal transition-colors hover:bg-teal hover:text-white"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
          <path d="M6.5 9.5a3.18 3.18 0 004.5 0l2-2a3.18 3.18 0 00-4.5-4.5l-1 1" />
          <path d="M9.5 6.5a3.18 3.18 0 00-4.5 0l-2 2a3.18 3.18 0 004.5 4.5l1-1" />
        </svg>
      </a>
    )
  }
  if (evidence.type === 'text') {
    return <RosterTextEvidenceBadge text={evidence.text} label={label} />
  }
  return <RosterFileEvidenceBadge url={evidence.url} label={label} />
}

function RosterTextEvidenceBadge({ text, label }) {
  const [open, setOpen] = useState(false)
  const preview = text ? (text.length > 32 ? text.slice(0, 32) + '…' : text) : '—'
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${open ? 'Collapse' : 'Expand'} written response for ${label}`}
        className="flex max-w-[180px] items-center gap-1.5 rounded-full bg-teal-tint px-2.5 py-1 text-[11px] font-medium text-teal transition-colors hover:bg-teal hover:text-white"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" />
        </svg>
        <span className="truncate">{preview}</span>
      </button>
      {open && text && (
        <div className="mt-1.5 rounded-lg border border-line bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink/70 whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}

function RosterFileEvidenceBadge({ url, label }) {
  const [href, setHref] = useState(null)
  useEffect(() => {
    getFileUrl(url).then((resolved) => setHref(resolved ?? null))
  }, [url])
  return (
    <a
      href={href ?? '#'}
      target={href ? '_blank' : undefined}
      rel="noreferrer"
      title={`Evidence: ${label}`}
      aria-label={`View file evidence for ${label}`}
      onClick={!href ? (e) => e.preventDefault() : undefined}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-tint text-orange transition-colors hover:bg-orange hover:text-white"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
        <path d="M9.5 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5.5L9.5 2z" />
        <path d="M9.5 2v3.5H13" />
      </svg>
    </a>
  )
}
