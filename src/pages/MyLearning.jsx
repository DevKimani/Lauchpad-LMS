import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function MyLearning() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    async function init() {
      const [enrollRes, progressRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select(`
            course_id,
            courses (
              id, title, cover_image,
              modules ( id, lessons ( id ) )
            )
          `)
          .eq('learner_id', userId),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed')
          .eq('learner_id', userId),
      ])

      const progressMap = {}
      for (const row of progressRes.data ?? []) {
        progressMap[row.lesson_id] = row.completed
      }

      const enrollments = (enrollRes.data ?? []).flatMap((e) => {
        const course = e.courses
        if (!course) return []
        const allLessons = (course.modules ?? []).flatMap((m) => m.lessons ?? [])
        const total = allLessons.length
        const completed = allLessons.filter((l) => progressMap[l.id]).length
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0
        return [{ course, total, completed, pct }]
      })

      setItems(enrollments)
      setLoading(false)
    }

    init()
  }, [userId])

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-teal-dark">My Learning</h1>
        <p className="mt-1 text-ink/60">Courses you're enrolled in.</p>
      </div>

      {loading ? (
        <p className="text-ink/60">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-teal/10 bg-white px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-teal-dark">
            No courses yet
          </p>
          <p className="mt-2 text-sm text-ink/60">
            You haven't enrolled in any courses yet — browse the catalog to get started.
          </p>
          <Link
            to="/courses"
            className="mt-5 inline-block rounded-lg bg-teal px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-dark"
          >
            Browse the catalog
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(({ course, total, completed, pct }) => (
            <Link
              key={course.id}
              to={`/courses/${course.id}`}
              className="flex items-center gap-4 rounded-xl border border-teal/10 bg-white p-5 transition-shadow hover:shadow-md"
            >
              {course.cover_image ? (
                <img
                  src={course.cover_image}
                  alt=""
                  className="h-14 w-20 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-20 shrink-0 rounded-lg bg-teal" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-semibold text-teal-dark">
                  {course.title}
                </p>

                {total > 0 ? (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-ink/50">
                      <span>{pct}% complete</span>
                      <span>
                        {completed} / {total} lessons
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-teal-light">
                      <div
                        className="h-full rounded-full bg-teal transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-ink/40">No lessons yet</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
