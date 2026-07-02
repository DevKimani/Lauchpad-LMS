import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function SurveyForm({ surveyId, onComplete }) {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [questions, setQuestions] = useState(null) // null = loading
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!surveyId) return
    supabase
      .from('survey_questions')
      .select('id, prompt, qtype, options, order_index')
      .eq('survey_id', surveyId)
      .order('order_index')
      .then(({ data }) => {
        const qs = data ?? []
        setQuestions(qs)
        const init = {}
        for (const q of qs) init[q.id] = ''
        setAnswers(init)
      })
  }, [surveyId])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const unanswered = (questions ?? []).filter(
      (q) => !answers[q.id] || String(answers[q.id]).trim() === '',
    )
    if (unanswered.length > 0) {
      setError('Please answer all questions before submitting.')
      return
    }

    setSubmitting(true)
    const { error: err } = await supabase
      .from('survey_responses')
      .upsert(
        { survey_id: surveyId, learner_id: userId, answers },
        { onConflict: 'survey_id,learner_id' },
      )
    setSubmitting(false)

    if (err) {
      setError(err.message ?? 'Could not save — try again.')
    } else {
      onComplete?.()
    }
  }

  if (questions === null) {
    return <p className="text-sm text-ink/50">Loading questions…</p>
  }

  if (questions.length === 0) {
    return <p className="text-sm text-ink/50">No questions found for this survey.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {questions.map((q, qi) => (
        <div key={q.id}>
          <p className="mb-2.5 text-sm font-medium text-ink">
            <span className="mr-2 font-normal text-ink/40">{qi + 1}.</span>
            {q.prompt}
          </p>

          {q.qtype === 'text' && (
            <textarea
              rows={3}
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Your response…"
              className="efac-input resize-y"
            />
          )}

          {q.qtype === 'scale' && (
            <div className="flex flex-wrap items-center gap-5">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className="flex cursor-pointer flex-col items-center gap-1"
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={String(n)}
                    checked={answers[q.id] === String(n)}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: String(n) }))}
                    className="h-4 w-4 accent-teal"
                  />
                  <span className="text-sm font-semibold text-ink/60">{n}</span>
                </label>
              ))}
              <span className="text-xs text-ink/35">1 = strongly disagree · 5 = strongly agree</span>
            </div>
          )}

          {q.qtype === 'choice' && (
            <div className="space-y-2.5">
              {(q.options ?? []).map((opt, oi) => (
                <label
                  key={oi}
                  className="flex cursor-pointer items-start gap-2.5"
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    className="mt-0.5 h-4 w-4 accent-teal"
                  />
                  <span className="text-sm text-ink/80">{opt}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && (
        <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p>
      )}

      <button type="submit" disabled={submitting} className="efac-btn">
        {submitting ? 'Submitting…' : 'Submit survey'}
      </button>
    </form>
  )
}
