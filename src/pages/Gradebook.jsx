import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

export default function Gradebook() {
  const { id: courseId } = useParams()
  const [courseTitle, setCourseTitle] = useState('')
  const [quizzes, setQuizzes] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function init() {
      // 1. Course + modules (ordered) + quizzes
      const { data: course, error } = await supabase
        .from('courses')
        .select('id, title, modules ( id, order_index, quizzes ( id, title ) )')
        .eq('id', courseId)
        .single()

      if (error || !course) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setCourseTitle(course.title)

      const sortedMods = [...(course.modules ?? [])].sort(
        (a, b) => a.order_index - b.order_index,
      )
      const quizList = sortedMods.flatMap((m) => m.quizzes ?? [])
      setQuizzes(quizList)

      // 2. Enrolled learners
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('learner_id')
        .eq('course_id', courseId)

      const learnerIds = (enrollments ?? []).map((e) => e.learner_id)

      if (learnerIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      // 3. Profiles + attempts in parallel
      const [profilesRes, attemptsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', learnerIds),
        quizList.length > 0
          ? supabase
              .from('quiz_attempts')
              .select('id, quiz_id, learner_id, score, passed, submitted_at')
              .in('quiz_id', quizList.map((q) => q.id))
              .in('learner_id', learnerIds)
              .order('submitted_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ])

      const attempts = attemptsRes.data ?? []

      // 4. Detect attempts with ungraded SA answers
      const pendingIds = new Set()
      if (attempts.length > 0) {
        const { data: pendingRows } = await supabase
          .from('attempt_answers')
          .select('attempt_id')
          .in('attempt_id', attempts.map((a) => a.id))
          .is('is_correct', null)
        for (const row of pendingRows ?? []) {
          pendingIds.add(row.attempt_id)
        }
      }

      // 5. Build cell data per learner per quiz.
      // attempts is sorted DESC so first-seen per (learner, quiz) = latest attempt.
      const cellMap = {}
      for (const a of attempts) {
        if (!cellMap[a.learner_id]) cellMap[a.learner_id] = {}
        const existing = cellMap[a.learner_id][a.quiz_id]
        if (!existing) {
          cellMap[a.learner_id][a.quiz_id] = {
            bestScore: a.score,
            passed: a.passed,
            latestPending: pendingIds.has(a.id),
          }
        } else if (
          a.score !== null &&
          (existing.bestScore === null || a.score > existing.bestScore)
        ) {
          existing.bestScore = a.score
          existing.passed = a.passed
        }
      }

      // 6. Build table rows
      const tableRows = learnerIds
        .map((learnerId) => {
          const profile = (profilesRes.data ?? []).find((p) => p.id === learnerId)
          const cells = {}
          for (const q of quizList) {
            cells[q.id] = cellMap[learnerId]?.[q.id] ?? null
          }
          const scoredCells = Object.values(cells).filter(
            (c) => c?.bestScore !== null && c?.bestScore !== undefined,
          )
          const avg =
            scoredCells.length > 0
              ? Math.round(
                  scoredCells.reduce((s, c) => s + c.bestScore, 0) /
                    scoredCells.length,
                )
              : null

          return {
            id: learnerId,
            name: profile?.full_name || 'Unnamed learner',
            cells,
            avg,
          }
        })
        .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))

      setRows(tableRows)
      setLoading(false)
    }

    init()
  }, [courseId])

  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading gradebook…</p>
      </Layout>
    )
  }

  if (notFound) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <h1 className="font-display text-2xl font-semibold text-teal-dark">
            Course not found
          </h1>
          <p className="mt-2 text-ink/60">
            This course may have been removed or is unavailable.
          </p>
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
      <div className="mb-2">
        <Link
          to="/instructor/courses"
          className="text-sm font-medium text-teal hover:underline"
        >
          ← My courses
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-teal-dark">
          Gradebook
        </h1>
        <p className="mt-1 text-ink/60">
          {courseTitle} · {rows.length} learner{rows.length !== 1 ? 's' : ''} ·{' '}
          {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-teal/10 bg-white px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-teal-dark">
            No enrollments yet
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Learners will appear here once they enroll in this course.
          </p>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="rounded-xl border border-teal/10 bg-white px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-teal-dark">
            No quizzes yet
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Add quizzes to modules to see scores here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-teal/10">
            <table className="min-w-full bg-white text-sm">
              <thead>
                <tr className="border-b border-teal/10 bg-sand text-xs font-medium uppercase tracking-wide text-ink/40">
                  <th className="sticky left-0 z-20 bg-sand px-5 py-3 text-left">
                    Learner
                  </th>
                  {quizzes.map((q) => (
                    <th
                      key={q.id}
                      className="px-5 py-3 text-center"
                    >
                      <span className="block max-w-[9rem] truncate">{q.title}</span>
                    </th>
                  ))}
                  <th className="px-5 py-3 text-center">Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal/10">
                {rows.map((row) => (
                  <tr key={row.id} className="group transition-colors hover:bg-sand/40">
                    <td className="sticky left-0 z-10 bg-white px-5 py-4 font-medium text-ink group-hover:bg-sand/40">
                      {row.name}
                    </td>
                    {quizzes.map((q) => (
                      <td key={q.id} className="px-5 py-4 text-center">
                        <ScoreCell cell={row.cells[q.id]} />
                      </td>
                    ))}
                    <td className="px-5 py-4 text-center">
                      {row.avg !== null ? (
                        <span className="font-semibold text-ink">{row.avg}%</span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-ink/40">
            Best score shown per quiz.{' '}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink/30" />
              Latest attempt pending review.
            </span>
          </p>
        </>
      )}
    </Layout>
  )
}

function ScoreCell({ cell }) {
  if (!cell) return <span className="text-ink/30">—</span>

  const { bestScore, passed, latestPending } = cell

  if (bestScore === null) {
    return (
      <span className="inline-block rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-ink/50">
        Pending
      </span>
    )
  }

  const colorClass =
    passed === true
      ? 'bg-teal-light text-teal-dark'
      : passed === false
        ? 'bg-clay/10 text-clay'
        : 'bg-sand text-ink/60'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {bestScore}%
      {latestPending && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60"
          title="Latest attempt pending review"
        />
      )}
    </span>
  )
}
