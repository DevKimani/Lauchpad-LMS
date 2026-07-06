import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import Avatar from '../components/Avatar'
import FileLink from '../components/FileLink'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function FeedbackInbox() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const isAdmin = profile?.role === 'admin'

  const [allItems, setAllItems] = useState([])
  // { [submissionId]: [{ questionText, orderIndex, answerText }] }
  const [answerMap, setAnswerMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('submitted')

  const [feedbacks, setFeedbacks] = useState({})
  const [saving, setSaving] = useState(new Set())
  const [saveErrors, setSaveErrors] = useState({})

  useEffect(() => {
    if (!userId) return
    loadInbox(isAdmin)
  }, [userId, isAdmin])

  async function loadInbox(asAdmin) {
    setLoadError('')

    const { data, error } = await supabase
      .from('submissions')
      .select(`
        id, status, response_text, file_url, feedback,
        submitted_at, reviewed_at, learner_id,
        assignments (
          id, title, submission_type,
          modules (
            id, title,
            courses ( id, title, instructor_id )
          )
        ),
        profiles ( full_name, avatar_url )
      `)
      .in('status', ['submitted', 'reviewed'])
      .order('submitted_at', { ascending: false })

    if (error) {
      setLoadError('Failed to load submissions — try refreshing.')
      setLoading(false)
      return
    }

    // Instructors see only their own courses; admins see everything
    const visible = asAdmin
      ? (data ?? [])
      : (data ?? []).filter(
          (item) =>
            item.assignments?.modules?.courses?.instructor_id === userId,
        )

    // Fetch Q&A pairs for questions-type submissions in one query
    const qSubIds = visible
      .filter((item) => item.assignments?.submission_type === 'questions')
      .map((item) => item.id)

    let aMap = {}
    if (qSubIds.length > 0) {
      const { data: ansRows } = await supabase
        .from('submission_answers')
        .select(`
          submission_id, answer_text,
          assignment_questions ( question_text, order_index )
        `)
        .in('submission_id', qSubIds)

      for (const row of ansRows ?? []) {
        if (!aMap[row.submission_id]) aMap[row.submission_id] = []
        aMap[row.submission_id].push({
          questionText: row.assignment_questions?.question_text ?? '',
          orderIndex: row.assignment_questions?.order_index ?? 0,
          answerText: row.answer_text ?? '',
        })
      }
      for (const subId of Object.keys(aMap)) {
        aMap[subId].sort((a, b) => a.orderIndex - b.orderIndex)
      }
    }

    setAllItems(visible)
    setAnswerMap(aMap)

    const initFeedbacks = {}
    for (const item of visible) {
      initFeedbacks[item.id] = item.feedback ?? ''
    }
    setFeedbacks(initFeedbacks)
    setLoading(false)
  }

  async function handleSave(item) {
    setSaving((prev) => new Set(prev).add(item.id))
    setSaveErrors((prev) => {
      const n = { ...prev }
      delete n[item.id]
      return n
    })

    try {
      const { error } = await supabase
        .from('submissions')
        .update({
          feedback: feedbacks[item.id] ?? '',
          status: 'reviewed',
          reviewed_at: new Date().toISOString(),
          reviewed_by: userId,
        })
        .eq('id', item.id)
      if (error) throw error

      // Move item to reviewed in local state
      setAllItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'reviewed',
                feedback: feedbacks[item.id] ?? '',
                reviewed_at: new Date().toISOString(),
              }
            : i,
        ),
      )
    } catch (err) {
      setSaveErrors((prev) => ({
        ...prev,
        [item.id]: err.message ?? 'Failed to save — please try again.',
      }))
    } finally {
      setSaving((prev) => {
        const s = new Set(prev)
        s.delete(item.id)
        return s
      })
    }
  }

  const pendingItems = allItems.filter((i) => i.status === 'submitted')
  const reviewedItems = allItems.filter((i) => i.status === 'reviewed')
  const visibleItems = tab === 'submitted' ? pendingItems : reviewedItems

  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading feedback inbox…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-navy">
          Feedback inbox
        </h1>
        <p className="mt-1 text-ink/60">
          {pendingItems.length === 0
            ? 'All caught up — no submissions awaiting review.'
            : `${pendingItems.length} submission${pendingItems.length !== 1 ? 's' : ''} awaiting review`}
        </p>
      </div>

      {loadError && (
        <p className="mb-6 rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">
          {loadError}
        </p>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-sand p-1">
        {[
          { key: 'submitted', label: 'Awaiting review', count: pendingItems.length },
          { key: 'reviewed', label: 'Reviewed', count: reviewedItems.length },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-navy shadow-sm'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none ${
                  key === 'submitted' && tab === key
                    ? 'bg-clay/10 text-clay'
                    : tab === key
                      ? 'bg-orange-light text-navy'
                      : 'bg-ink/10 text-ink/50'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Item list */}
      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-navy">
            {tab === 'submitted' ? 'Nothing to review' : 'No reviewed submissions yet'}
          </p>
          <p className="mt-2 text-sm text-ink/60">
            {tab === 'submitted'
              ? 'Learner submissions will appear here when ready for feedback.'
              : "Submissions you've reviewed will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleItems.map((item) => {
            const assignment = item.assignments
            const mod = assignment?.modules
            const course = mod?.courses
            const learnerName = item.profiles?.full_name ?? 'Unknown learner'
            const isSingle = assignment?.submission_type === 'single'
            const answers = answerMap[item.id] ?? []
            const isSaving = saving.has(item.id)
            const saveError = saveErrors[item.id]
            const isReviewed = item.status === 'reviewed'

            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-ink/10 bg-white"
              >
                {/* Context breadcrumb */}
                <div className="border-b border-ink/10 bg-sand px-6 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                      <span className="font-medium text-ink">
                        {course?.title ?? '—'}
                      </span>
                      <span className="text-ink/30">›</span>
                      <span className="text-ink/60">{mod?.title ?? '—'}</span>
                      <span className="text-ink/30">›</span>
                      <span className="text-ink/60">
                        {assignment?.title ?? '—'}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-ink/40">
                      {item.submitted_at
                        ? new Date(item.submitted_at).toLocaleDateString(
                            'en-GB',
                            { day: 'numeric', month: 'short', year: 'numeric' },
                          )
                        : ''}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Avatar
                      url={item.profiles?.avatar_url}
                      name={learnerName}
                      className="h-6 w-6 shrink-0 text-[9px] font-extrabold"
                    />
                    <span className="text-xs font-medium text-ink/70">{learnerName}</span>
                  </div>
                </div>

                {/* Submitted content */}
                <div className="px-6 py-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/40">
                    Submission
                  </p>

                  {isSingle ? (
                    <div className="space-y-2">
                      {item.response_text ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                          {item.response_text}
                        </p>
                      ) : (
                        <p className="text-sm italic text-ink/30">
                          No written response.
                        </p>
                      )}
                      {item.file_url && (
                        <FileLink
                          value={item.file_url}
                          label="View attached file →"
                          className="inline-block text-sm font-medium text-teal hover:underline"
                        />
                      )}
                    </div>
                  ) : answers.length === 0 ? (
                    <p className="text-sm italic text-ink/30">
                      No answers recorded.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {answers.map((a, qi) => (
                        <div key={qi}>
                          <p className="text-xs font-medium text-ink/50">
                            Q{qi + 1}. {a.questionText}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                            {a.answerText || (
                              <span className="italic text-ink/30">
                                No answer provided.
                              </span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Feedback panel */}
                <div className="border-t border-ink/10 px-6 py-5">
                  {isReviewed ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-teal">
                        Feedback sent
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                        {item.feedback || (
                          <span className="italic text-ink/40">
                            No feedback was written.
                          </span>
                        )}
                      </p>
                      {item.reviewed_at && (
                        <p className="mt-2 text-xs text-ink/40">
                          Reviewed{' '}
                          {new Date(item.reviewed_at).toLocaleDateString(
                            'en-GB',
                            { day: 'numeric', month: 'short', year: 'numeric' },
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label
                        htmlFor={`fb-${item.id}`}
                        className="block text-xs font-semibold uppercase tracking-wide text-ink/40"
                      >
                        Write feedback
                      </label>
                      <textarea
                        id={`fb-${item.id}`}
                        rows={4}
                        value={feedbacks[item.id] ?? ''}
                        onChange={(e) =>
                          setFeedbacks((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="Share what the learner did well and where they can improve…"
                        className="w-full resize-y rounded-lg border border-teal/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleSave(item)}
                          disabled={isSaving}
                          className="rounded-lg bg-orange px-4 py-2 text-sm font-medium text-navy transition hover:bg-orange-dark disabled:opacity-60"
                        >
                          {isSaving ? 'Saving…' : 'Send feedback'}
                        </button>
                        {saveError && (
                          <p className="text-sm text-clay">{saveError}</p>
                        )}
                      </div>
                      <p className="text-xs text-ink/40">
                        Feedback is visible to the learner on the course page once sent.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
