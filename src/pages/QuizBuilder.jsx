import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { inputClass, btnClass, Field } from './Signup'

// ─── helpers ────────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short answer' },
]

function mkOption(text = '', is_correct = false) {
  return { _key: crypto.randomUUID(), id: null, option_text: text, is_correct }
}

function defaultOptions(type) {
  if (type === 'true_false') return [mkOption('True'), mkOption('False')]
  if (type === 'multiple_choice') return [mkOption(), mkOption()]
  return []
}

function mkQuestion() {
  return {
    _key: crypto.randomUUID(),
    id: null,
    question_text: '',
    question_type: 'multiple_choice',
    points: 1,
    options: defaultOptions('multiple_choice'),
  }
}

// ─── main component ──────────────────────────────────────────────────────────

export default function QuizBuilder() {
  const { id: quizId } = useParams()

  const [quiz, setQuiz] = useState(null)
  const [courseId, setCourseId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [deletedQuestionIds, setDeletedQuestionIds] = useState([])
  const [deletedOptionIds, setDeletedOptionIds] = useState([])
  const [openKey, setOpenKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // ── load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data, error: err } = await supabase
        .from('quizzes')
        .select(`
          id, title, passing_score, max_attempts, module_id,
          questions (
            id, question_text, type, points,
            answer_options ( id, option_text, is_correct )
          )
        `)
        .eq('id', quizId)
        .single()

      if (err || !data) {
        setQuiz(null)
        setLoading(false)
        return
      }

      setQuiz({ id: data.id, title: data.title, passing_score: data.passing_score, max_attempts: data.max_attempts })

      // Resolve course_id via module
      if (data.module_id) {
        const { data: mod } = await supabase
          .from('modules')
          .select('course_id')
          .eq('id', data.module_id)
          .single()
        if (mod) setCourseId(mod.course_id)
      }

      setQuestions(
        [...(data.questions ?? [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map((q) => ({
            _key: q.id,
            id: q.id,
            question_text: q.question_text ?? '',
            question_type: q.type ?? 'multiple_choice',
            points: q.points ?? 1,
            options: (q.answer_options ?? []).map((o) => ({
              _key: o.id,
              id: o.id,
              option_text: o.option_text ?? '',
              is_correct: o.is_correct ?? false,
            })),
          })),
      )
      setLoading(false)
    }
    init()
  }, [quizId])

  // ── save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    setError('')
    setSaving(true)
    setSaved(false)

    try {
      // Delete removed options then questions (FK order)
      if (deletedOptionIds.length) {
        const { error: e } = await supabase
          .from('answer_options')
          .delete()
          .in('id', deletedOptionIds)
        if (e) throw e
      }
      if (deletedQuestionIds.length) {
        const { error: e } = await supabase
          .from('questions')
          .delete()
          .in('id', deletedQuestionIds)
        if (e) throw e
      }

      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi]
        let questionId = q.id

        const qRow = {
          question_text: q.question_text,
          type: q.question_type,
          points: Number(q.points),
          quiz_id: quizId,
        }

        if (questionId) {
          const { error: e } = await supabase
            .from('questions')
            .update(qRow)
            .eq('id', questionId)
          if (e) throw e
        } else {
          const { data, error: e } = await supabase
            .from('questions')
            .insert(qRow)
            .select('id')
            .single()
          if (e) throw e
          questionId = data.id
        }

        if (q.question_type !== 'short_answer') {
          for (const opt of q.options) {
            const optRow = {
              option_text: opt.option_text,
              is_correct: opt.is_correct,
              question_id: questionId,
            }
            if (opt.id) {
              const { error: e } = await supabase
                .from('answer_options')
                .update(optRow)
                .eq('id', opt.id)
              if (e) throw e
            } else {
              const { error: e } = await supabase.from('answer_options').insert(optRow)
              if (e) throw e
            }
          }
        }
      }

      setSaved(true)
    } catch (err) {
      setError(err.message ?? 'Something went wrong — try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── question helpers ────────────────────────────────────────────────────
  function addQuestion() {
    const q = mkQuestion()
    setQuestions((prev) => [...prev, q])
    setOpenKey(q._key)
    setSaved(false)
  }

  function updateQuestion(key, patch) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q._key !== key) return q
        const updated = { ...q, ...patch }

        // When changing type, reset options appropriately
        if (patch.question_type && patch.question_type !== q.question_type) {
          const existingOptionIds = q.options.filter((o) => o.id).map((o) => o.id)
          if (existingOptionIds.length) {
            setDeletedOptionIds((p) => [...p, ...existingOptionIds])
          }
          updated.options = defaultOptions(patch.question_type)
        }

        return updated
      }),
    )
    setSaved(false)
  }

  function deleteQuestion(key) {
    const q = questions.find((x) => x._key === key)
    if (q?.id) setDeletedQuestionIds((p) => [...p, q.id])
    const optIds = (q?.options ?? []).filter((o) => o.id).map((o) => o.id)
    if (optIds.length) setDeletedOptionIds((p) => [...p, ...optIds])
    if (openKey === key) setOpenKey(null)
    setQuestions((prev) => prev.filter((x) => x._key !== key))
    setSaved(false)
  }

  function moveQuestion(key, dir) {
    setQuestions((prev) => {
      const i = prev.findIndex((q) => q._key === key)
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setSaved(false)
  }

  // ── option helpers ──────────────────────────────────────────────────────
  function addOption(qKey) {
    setQuestions((prev) =>
      prev.map((q) =>
        q._key === qKey ? { ...q, options: [...q.options, mkOption()] } : q,
      ),
    )
    setSaved(false)
  }

  function updateOption(qKey, oKey, patch) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q._key !== qKey) return q
        let options = q.options.map((o) => (o._key === oKey ? { ...o, ...patch } : o))

        // true_false enforces single correct answer (radio behaviour)
        if (patch.is_correct && q.question_type === 'true_false') {
          options = options.map((o) => ({ ...o, is_correct: o._key === oKey }))
        }

        return { ...q, options }
      }),
    )
    setSaved(false)
  }

  function deleteOption(qKey, oKey) {
    const q = questions.find((x) => x._key === qKey)
    const opt = q?.options.find((o) => o._key === oKey)
    if (opt?.id) setDeletedOptionIds((p) => [...p, opt.id])
    setQuestions((prev) =>
      prev.map((q) =>
        q._key !== qKey ? q : { ...q, options: q.options.filter((o) => o._key !== oKey) },
      ),
    )
    setSaved(false)
  }

  // ── render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading…</p>
      </Layout>
    )
  }

  if (!quiz) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <h1 className="font-display text-2xl font-semibold text-teal-dark">Quiz not found</h1>
          <p className="mt-2 text-ink/60">This quiz may have been removed.</p>
          <Link
            to="/instructor/courses"
            className="mt-6 inline-block text-sm font-medium text-teal hover:underline"
          >
            Back to my courses
          </Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* back link */}
      <div className="mb-2">
        {courseId ? (
          <Link
            to={`/instructor/courses/${courseId}`}
            className="text-sm font-medium text-teal hover:underline"
          >
            ← Back to course
          </Link>
        ) : (
          <Link
            to="/instructor/courses"
            className="text-sm font-medium text-teal hover:underline"
          >
            ← My courses
          </Link>
        )}
      </div>

      {/* header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-teal-dark">
            {quiz.title || 'Quiz Builder'}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Passing score: {quiz.passing_score}% · Max attempts: {quiz.max_attempts}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-teal">Saved ✓</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`${btnClass} w-auto px-6`}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-6 rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p>
      )}

      {/* questions */}
      {questions.length === 0 ? (
        <div className="mb-4 rounded-xl border border-dashed border-teal/20 py-12 text-center text-sm text-ink/40">
          No questions yet — add your first one below.
        </div>
      ) : (
        <div className="mb-4 space-y-3">
          {questions.map((q, qi) => (
            <QuestionCard
              key={q._key}
              question={q}
              index={qi}
              total={questions.length}
              open={openKey === q._key}
              onToggle={() => setOpenKey((k) => (k === q._key ? null : q._key))}
              onUpdate={(patch) => updateQuestion(q._key, patch)}
              onDelete={() => deleteQuestion(q._key)}
              onMoveUp={() => moveQuestion(q._key, -1)}
              onMoveDown={() => moveQuestion(q._key, 1)}
              onAddOption={() => addOption(q._key)}
              onUpdateOption={(oKey, patch) => updateOption(q._key, oKey, patch)}
              onDeleteOption={(oKey) => deleteOption(q._key, oKey)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addQuestion}
        className="w-full rounded-xl border-2 border-dashed border-teal/20 py-3 text-sm font-medium text-teal/60 transition-colors hover:border-teal hover:text-teal"
      >
        + Add question
      </button>

      {/* bottom save */}
      <div className="mt-10 flex items-center justify-end gap-4">
        {error && <p className="text-sm text-clay">{error}</p>}
        {saved && <span className="text-sm text-teal">Saved ✓</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`${btnClass} w-auto px-6`}
        >
          {saving ? 'Saving…' : 'Save questions'}
        </button>
      </div>
    </Layout>
  )
}

// ─── question card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  total,
  open,
  onToggle,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
}) {
  const typeLabel = TYPES.find((t) => t.value === question.question_type)?.label ?? ''

  return (
    <div className="overflow-hidden rounded-xl border border-teal/10 bg-white">
      {/* question header */}
      <div
        className="flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-sand"
        onClick={onToggle}
      >
        <span className="shrink-0 text-xs font-medium text-ink/40">Q{index + 1}</span>
        <span className="flex-1 truncate text-sm font-medium text-ink">
          {question.question_text || (
            <span className="italic text-ink/30">Untitled question</span>
          )}
        </span>
        <span className="shrink-0 rounded-full bg-teal-light px-2 py-0.5 text-xs font-medium text-teal-dark">
          {typeLabel}
        </span>
        <span className="shrink-0 text-xs text-ink/40">
          {question.points} pt{question.points !== 1 ? 's' : ''}
        </span>
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <IconBtn label="Move up" onClick={onMoveUp} disabled={index === 0}>↑</IconBtn>
          <IconBtn label="Move down" onClick={onMoveDown} disabled={index === total - 1}>↓</IconBtn>
          <IconBtn label="Delete question" onClick={onDelete} danger>×</IconBtn>
        </div>
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`h-3 w-3 shrink-0 text-ink/30 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M2 5l6 6 6-6H2z" />
        </svg>
      </div>

      {/* question body */}
      {open && (
        <div className="space-y-4 border-t border-teal/10 bg-sand px-5 py-5">
          {/* type + points row */}
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Question type" id={`type-${question._key}`}>
              <select
                id={`type-${question._key}`}
                value={question.question_type}
                onChange={(e) => onUpdate({ question_type: e.target.value })}
                className={inputClass}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Points" id={`pts-${question._key}`}>
              <input
                id={`pts-${question._key}`}
                type="number"
                min="1"
                value={question.points}
                onChange={(e) => onUpdate({ points: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
          </div>

          {/* question text */}
          <Field label="Question" id={`qt-${question._key}`}>
            <textarea
              id={`qt-${question._key}`}
              rows={3}
              value={question.question_text}
              onChange={(e) => onUpdate({ question_text: e.target.value })}
              className={`${inputClass} resize-y`}
            />
          </Field>

          {/* options */}
          {question.question_type === 'short_answer' ? (
            <p className="rounded-lg border border-teal/10 bg-white px-4 py-3 text-sm text-ink/50">
              Learners type a free-text answer. Grade manually or auto-score in the grading queue.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-ink/80">
                Answer options
                {question.question_type === 'multiple_choice' && (
                  <span className="ml-1 text-xs font-normal text-ink/40">
                    (check all correct answers)
                  </span>
                )}
                {question.question_type === 'true_false' && (
                  <span className="ml-1 text-xs font-normal text-ink/40">
                    (select the correct answer)
                  </span>
                )}
              </p>

              <ul className="space-y-2">
                {question.options.map((opt) => (
                  <li key={opt._key} className="flex items-center gap-2">
                    {/* correct toggle */}
                    {question.question_type === 'true_false' ? (
                      <input
                        type="radio"
                        name={`correct-${question._key}`}
                        checked={opt.is_correct}
                        onChange={() => onUpdateOption(opt._key, { is_correct: true })}
                        className="h-4 w-4 shrink-0 accent-teal"
                        aria-label="Mark as correct"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={opt.is_correct}
                        onChange={(e) =>
                          onUpdateOption(opt._key, { is_correct: e.target.checked })
                        }
                        className="h-4 w-4 shrink-0 accent-teal"
                        aria-label="Mark as correct"
                      />
                    )}

                    {/* option text */}
                    <input
                      type="text"
                      value={opt.option_text}
                      onChange={(e) =>
                        onUpdateOption(opt._key, { option_text: e.target.value })
                      }
                      placeholder="Option text"
                      className="flex-1 rounded-md border border-teal/20 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                    />

                    {/* delete option — only for MC with > 2 options */}
                    {question.question_type === 'multiple_choice' &&
                      question.options.length > 2 && (
                        <IconBtn
                          label="Delete option"
                          onClick={() => onDeleteOption(opt._key)}
                          danger
                        >
                          ×
                        </IconBtn>
                      )}
                  </li>
                ))}
              </ul>

              {question.question_type === 'multiple_choice' && (
                <button
                  type="button"
                  onClick={onAddOption}
                  className="mt-3 text-sm font-medium text-teal hover:underline"
                >
                  + Add option
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── shared icon button ───────────────────────────────────────────────────────

function IconBtn({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-7 w-7 place-items-center rounded text-sm transition-colors disabled:opacity-30 ${
        danger
          ? 'text-clay hover:bg-clay/10'
          : 'text-ink/50 hover:bg-teal-light hover:text-teal'
      }`}
    >
      {children}
    </button>
  )
}
