import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function TakeQuiz() {
  const { id: quizId } = useParams()
  const { session } = useAuth()
  const userId = session?.user?.id

  const [quiz, setQuiz] = useState(null)
  const [questions, setQuestions] = useState([])
  const [courseId, setCourseId] = useState(null)
  const [pastAttempts, setPastAttempts] = useState([])
  const [loading, setLoading] = useState(true)

  // 'blocked' | 'taking' | 'results'
  const [phase, setPhase] = useState('taking')

  const [answers, setAnswers] = useState({}) // { [questionId]: optionId | text }
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState(null) // { score, passed, hasPending }

  // ── load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return

    async function init() {
      const [quizRes, attemptsRes] = await Promise.all([
        supabase
          .from('quizzes')
          .select(`
            id, title, passing_score, max_attempts, module_id,
            questions (
              id, question_text, type, points,
              answer_options ( id, option_text, is_correct )
            )
          `)
          .eq('id', quizId)
          .single(),
        supabase
          .from('quiz_attempts')
          .select('id, score, passed, submitted_at')
          .eq('quiz_id', quizId)
          .eq('learner_id', userId)
          .order('submitted_at', { ascending: false }),
      ])

      if (quizRes.error || !quizRes.data) {
        setQuiz(null)
        setLoading(false)
        return
      }

      const data = quizRes.data
      const past = attemptsRes.data ?? []

      setQuiz({
        id: data.id,
        title: data.title,
        passing_score: data.passing_score,
        max_attempts: data.max_attempts,
      })
      setQuestions(data.questions ?? [])
      setPastAttempts(past)

      // Resolve course_id so we can render a back link
      if (data.module_id) {
        const { data: mod } = await supabase
          .from('modules')
          .select('course_id')
          .eq('id', data.module_id)
          .single()
        if (mod) setCourseId(mod.course_id)
      }

      setPhase(past.length >= data.max_attempts ? 'blocked' : 'taking')
      setLoading(false)
    }

    init()
  }, [quizId, userId])

  // ── submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    setSubmitting(true)

    try {
      // 1. Create attempt row
      const { data: attempt, error: aErr } = await supabase
        .from('quiz_attempts')
        .insert({ quiz_id: quizId, learner_id: userId })
        .select('id')
        .single()
      if (aErr) throw aErr

      // 2. Build answer rows + grade objective questions inline
      let autoGradablePoints = 0
      let earnedPoints = 0
      let hasPending = false

      const rows = questions.map((q) => {
        if (q.type === 'short_answer') {
          hasPending = true
          return {
            attempt_id: attempt.id,
            question_id: q.id,
            selected_option_id: null,
            text_answer: answers[q.id] ?? '',
            is_correct: null,
            points_awarded: null,
          }
        }

        autoGradablePoints += q.points
        const selectedId = answers[q.id] ?? null
        const selectedOpt = selectedId
          ? (q.answer_options ?? []).find((o) => o.id === selectedId)
          : null
        const isCorrect = selectedOpt?.is_correct ?? false
        const pointsAwarded = isCorrect ? q.points : 0
        earnedPoints += pointsAwarded

        return {
          attempt_id: attempt.id,
          question_id: q.id,
          selected_option_id: selectedId,
          text_answer: null,
          is_correct: isCorrect,
          points_awarded: pointsAwarded,
        }
      })

      if (rows.length > 0) {
        const { error: rErr } = await supabase.from('attempt_answers').insert(rows)
        if (rErr) throw rErr
      }

      // 3. Compute score
      const score =
        autoGradablePoints > 0
          ? Math.round((earnedPoints / autoGradablePoints) * 100)
          : null
      const passed =
        score !== null && !hasPending ? score >= quiz.passing_score : null

      // 4. Stamp the attempt
      await supabase
        .from('quiz_attempts')
        .update({ score, passed })
        .eq('id', attempt.id)

      setResult({ score, passed, hasPending })
      setPhase('results')
    } catch (err) {
      setSubmitError(err.message ?? 'Submission failed — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function setAnswer(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  // ── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading quiz…</p>
      </Layout>
    )
  }

  if (!quiz) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <h1 className="font-display text-2xl font-semibold text-teal-dark">
            Quiz not found
          </h1>
          <p className="mt-2 text-ink/60">This quiz may have been removed.</p>
          {courseId && (
            <Link
              to={`/courses/${courseId}`}
              className="mt-6 inline-block text-sm font-medium text-teal hover:underline"
            >
              Back to course
            </Link>
          )}
        </div>
      </Layout>
    )
  }

  // ── blocked ──────────────────────────────────────────────────────────────
  if (phase === 'blocked') {
    const best = pastAttempts.reduce(
      (b, a) => (a.score !== null && (b === null || a.score > b) ? a.score : b),
      null,
    )
    return (
      <Layout>
        <div className="mx-auto max-w-xl">
          <BackLink courseId={courseId} />
          <div className="mt-4 rounded-xl border border-teal/10 bg-white px-8 py-14 text-center">
            <h1 className="font-display text-2xl font-semibold text-teal-dark">
              {quiz.title}
            </h1>
            <p className="mt-3 text-ink/60">
              You've used all {quiz.max_attempts} attempt
              {quiz.max_attempts !== 1 ? 's' : ''} for this quiz.
            </p>
            {best !== null && (
              <p className="mt-2 text-sm text-ink/60">
                Best score:{' '}
                <span className="font-semibold text-teal-dark">{best}%</span>
              </p>
            )}
            {courseId && (
              <Link
                to={`/courses/${courseId}`}
                className="mt-8 inline-block rounded-lg bg-teal px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-dark"
              >
                Back to course
              </Link>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  // ── results ──────────────────────────────────────────────────────────────
  if (phase === 'results') {
    const { score, passed, hasPending } = result
    return (
      <Layout>
        <div className="mx-auto max-w-xl">
          <BackLink courseId={courseId} />
          <div className="mt-4 rounded-xl border border-teal/10 bg-white px-8 py-14 text-center">
            <h1 className="font-display text-2xl font-semibold text-teal-dark">
              {quiz.title}
            </h1>

            {hasPending ? (
              <>
                <div className="mx-auto mt-6 max-w-xs rounded-xl bg-sand px-6 py-6">
                  <p className="font-display text-xl font-semibold text-teal-dark">
                    Submitted
                  </p>
                  <p className="mt-1 text-sm text-ink/60">
                    Pending instructor review
                  </p>
                </div>
                {score !== null && (
                  <p className="mt-4 text-sm text-ink/60">
                    Auto-graded portion: {score}%
                    <span className="ml-1 text-xs text-ink/40">
                      (short answers not yet included)
                    </span>
                  </p>
                )}
              </>
            ) : (
              <>
                <div
                  className={`mx-auto mt-6 max-w-xs rounded-xl px-6 py-6 ${
                    passed ? 'bg-teal-light' : 'bg-clay/10'
                  }`}
                >
                  <p
                    className={`font-display text-5xl font-semibold ${
                      passed ? 'text-teal-dark' : 'text-clay'
                    }`}
                  >
                    {score ?? '—'}%
                  </p>
                  <p
                    className={`mt-1 text-sm font-medium ${
                      passed ? 'text-teal' : 'text-clay'
                    }`}
                  >
                    {passed ? 'Passed ✓' : 'Not passed'}
                  </p>
                </div>
                <p className="mt-3 text-sm text-ink/60">
                  Passing score: {quiz.passing_score}%
                </p>
              </>
            )}

            {courseId && (
              <Link
                to={`/courses/${courseId}`}
                className="mt-8 inline-block rounded-lg bg-teal px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-dark"
              >
                Back to course
              </Link>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  // ── taking ───────────────────────────────────────────────────────────────
  const attemptsLeft = quiz.max_attempts - pastAttempts.length

  return (
    <Layout>
      <div className="mx-auto max-w-2xl">
        <BackLink courseId={courseId} />

        <div className="mb-6 mt-4">
          <h1 className="font-display text-3xl font-semibold text-teal-dark">
            {quiz.title}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Passing score: {quiz.passing_score}%
            {' · '}
            {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div
                key={q.id}
                className="overflow-hidden rounded-xl border border-teal/10 bg-white"
              >
                {/* question header */}
                <div className="border-b border-teal/10 px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-medium text-ink">
                      <span className="mr-2 text-sm font-normal text-ink/40">
                        Q{qi + 1}.
                      </span>
                      {q.question_text}
                    </p>
                    <span className="shrink-0 text-xs text-ink/40">
                      {q.points} pt{q.points !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* answer area */}
                <div className="px-6 py-4">
                  {q.type === 'short_answer' ? (
                    <textarea
                      rows={4}
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Your answer…"
                      className="w-full resize-y rounded-lg border border-teal/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                    />
                  ) : (
                    <div className="space-y-1">
                      {(q.answer_options ?? []).map((opt) => (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-sand"
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt.id}
                            checked={answers[q.id] === opt.id}
                            onChange={() => setAnswer(q.id, opt.id)}
                            className="h-4 w-4 shrink-0 accent-teal"
                          />
                          <span className="text-sm text-ink">{opt.option_text}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {submitError && (
            <p className="mt-4 rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">
              {submitError}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-teal px-6 py-2.5 font-medium text-white transition hover:bg-teal-dark disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit quiz'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}

function BackLink({ courseId }) {
  if (!courseId) return null
  return (
    <Link
      to={`/courses/${courseId}`}
      className="text-sm font-medium text-teal hover:underline"
    >
      ← Back to course
    </Link>
  )
}
