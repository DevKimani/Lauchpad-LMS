import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function GradingQueue() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // grades[answerId] = { points: number }
  const [grades, setGrades] = useState({})
  const [saving, setSaving] = useState(new Set())
  const [saveErrors, setSaveErrors] = useState({})

  useEffect(() => {
    if (!userId) return

    async function load() {
      const { data, error } = await supabase
        .from('attempt_answers')
        .select(`
          id, text_answer, attempt_id,
          questions (
            id, question_text, points, type,
            quizzes (
              id, title, passing_score,
              modules (
                courses ( id, title )
              )
            )
          ),
          quiz_attempts (
            learner_id,
            profiles ( full_name )
          )
        `)
        .is('is_correct', null)
        .order('attempt_id')

      if (error) {
        setLoadError('Failed to load grading queue.')
        setLoading(false)
        return
      }

      // RLS restricts rows to the instructor's own courses (or all for admins);
      // filter client-side to short_answer only as a safety net.
      const saItems = (data ?? []).filter(
        (row) => row.questions?.type === 'short_answer',
      )

      setItems(saItems)

      const initGrades = {}
      for (const item of saItems) {
        initGrades[item.id] = { points: 0 }
      }
      setGrades(initGrades)

      setLoading(false)
    }

    load()
  }, [userId])

  async function handleSave(item) {
    const maxPts = item.questions?.points ?? 0
    const raw = grades[item.id]?.points ?? 0
    const pointsAwarded = Math.max(0, Math.min(Number(raw), maxPts))
    const isCorrect = pointsAwarded > 0

    setSaving((prev) => new Set(prev).add(item.id))
    setSaveErrors((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })

    try {
      // 1. Grade the answer
      const { error: updErr } = await supabase
        .from('attempt_answers')
        .update({ points_awarded: pointsAwarded, is_correct: isCorrect })
        .eq('id', item.id)
      if (updErr) throw updErr

      // 2. Recompute attempt score from all answers (null points_awarded treated as 0)
      const { data: allAnswers, error: aErr } = await supabase
        .from('attempt_answers')
        .select('points_awarded, questions ( points )')
        .eq('attempt_id', item.attempt_id)
      if (aErr) throw aErr

      const possible = (allAnswers ?? []).reduce(
        (s, a) => s + (a.questions?.points ?? 0),
        0,
      )
      const earned = (allAnswers ?? []).reduce(
        (s, a) => s + (a.points_awarded ?? 0),
        0,
      )
      const score = possible > 0 ? Math.round((earned / possible) * 100) : 0
      const passed = score >= (item.questions.quizzes?.passing_score ?? 70)

      const { error: scoreErr } = await supabase
        .from('quiz_attempts')
        .update({ score, passed })
        .eq('id', item.attempt_id)
      if (scoreErr) throw scoreErr

      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [item.id]: err.message ?? 'Failed to save grade.',
      }))
    } finally {
      setSaving((prev) => {
        const s = new Set(prev)
        s.delete(item.id)
        return s
      })
    }
  }

  function setPoints(itemId, value) {
    setGrades((prev) => ({ ...prev, [itemId]: { points: value } }))
  }

  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading grading queue…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-teal-dark">
          Grading queue
        </h1>
        <p className="mt-1 text-ink/60">
          {items.length === 0
            ? 'All caught up — no ungraded responses.'
            : `${items.length} response${items.length !== 1 ? 's' : ''} pending review`}
        </p>
      </div>

      {loadError && (
        <p className="rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">
          {loadError}
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => {
            const q = item.questions
            const quiz = q?.quizzes
            const course = quiz?.modules?.courses
            const learner = item.quiz_attempts?.profiles
            const grade = grades[item.id] ?? { points: 0 }
            const isSaving = saving.has(item.id)
            const saveError = saveErrors[item.id]

            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-teal/10 bg-white"
              >
                {/* context header */}
                <div className="border-b border-teal/10 bg-sand px-6 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium text-ink">
                      {course?.title ?? 'Unknown course'}
                    </span>
                    <span className="text-ink/30">›</span>
                    <span className="text-ink/70">
                      {quiz?.title ?? 'Unknown quiz'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink/50">
                    Learner: {learner?.full_name ?? 'Unknown'}
                  </p>
                </div>

                {/* question + answer */}
                <div className="px-6 py-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <p className="text-sm font-medium text-ink">
                      {q?.question_text}
                    </p>
                    <span className="shrink-0 rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark">
                      {q?.points ?? 0} pt{(q?.points ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="rounded-lg border border-teal/10 bg-sand p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                      Learner's answer
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                      {item.text_answer || (
                        <span className="italic text-ink/30">No answer provided</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* grading controls */}
                <div className="border-t border-teal/10 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`pts-${item.id}`}
                        className="text-sm font-medium text-ink"
                      >
                        Points:
                      </label>
                      <input
                        id={`pts-${item.id}`}
                        type="number"
                        min={0}
                        max={q?.points ?? 0}
                        value={grade.points}
                        onChange={(e) => setPoints(item.id, e.target.value)}
                        disabled={isSaving}
                        className="w-20 rounded-lg border border-teal/20 bg-white px-3 py-1.5 text-center text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:opacity-60"
                      />
                      <span className="text-sm text-ink/50">/ {q?.points ?? 0}</span>
                    </div>
                    <button
                      onClick={() => handleSave(item)}
                      disabled={isSaving}
                      className="rounded-lg bg-teal px-4 py-1.5 text-sm font-medium text-white transition hover:bg-teal-dark disabled:opacity-60"
                    >
                      {isSaving ? 'Saving…' : 'Save grade'}
                    </button>
                    {saveError && (
                      <p className="text-sm text-clay">{saveError}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
