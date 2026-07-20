import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, BookOpen, CheckCircle, Circle, ExternalLink, Pencil } from 'lucide-react'
import ConsoleLayout from '../../components/ConsoleLayout'
import { supabase } from '../../lib/supabase'

export default function AdminCourses() {
  const [courses, setCourses] = useState([])
  const [enrolCounts, setEnrolCounts] = useState({})  // { [course_id]: number }
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [coursesRes, enrolRes] = await Promise.all([
        supabase
          .from('courses')
          .select(
            'id, title, is_published, created_at, profiles!instructor_id ( full_name )',
          )
          .order('created_at', { ascending: false }),
        supabase.from('enrollments').select('course_id'),
      ])

      // Count enrolments per course client-side (avoids complex aggregate query)
      const counts = {}
      for (const e of enrolRes.data ?? []) {
        counts[e.course_id] = (counts[e.course_id] ?? 0) + 1
      }

      setCourses(coursesRes.data ?? [])
      setEnrolCounts(counts)
      setLoading(false)
    }
    load()
  }, [])

  // Filter by title or instructor name
  const visible = query.trim()
    ? courses.filter(
        (c) =>
          (c.title ?? '').toLowerCase().includes(query.trim().toLowerCase()) ||
          (c.profiles?.full_name ?? '')
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      )
    : courses

  const publishedCount = courses.filter((c) => c.is_published).length

  return (
    <ConsoleLayout title="Courses">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-ink/60">
          {loading
            ? 'Loading…'
            : `${courses.length} course${courses.length !== 1 ? 's' : ''} · ${publishedCount} published`}
        </p>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search
            size={15}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or instructor…"
            aria-label="Search courses"
            className="w-full rounded-lg border border-ink/20 bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-ink/5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
          <BookOpen
            size={32}
            strokeWidth={1.25}
            className="mx-auto mb-2 text-ink/20"
            aria-hidden="true"
          />
          <p className="text-sm text-ink/50">
            {query ? 'No courses match that search.' : 'No courses found.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-sand text-left">
                <th className="px-5 py-3 font-semibold text-ink/60">Course</th>
                <th className="hidden px-5 py-3 font-semibold text-ink/60 sm:table-cell">
                  Instructor
                </th>
                <th className="px-5 py-3 font-semibold text-ink/60">Status</th>
                <th className="px-5 py-3 text-right font-semibold text-ink/60">
                  Enrolments
                </th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {visible.map((course) => (
                <tr key={course.id} className="group">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-ink">{course.title}</p>
                    {/* Instructor shown inline on mobile */}
                    {course.profiles?.full_name && (
                      <p className="mt-0.5 text-xs text-ink/50 sm:hidden">
                        {course.profiles.full_name}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-5 py-3.5 sm:table-cell">
                    {course.profiles?.full_name ? (
                      <span className="text-ink/70">
                        {course.profiles.full_name}
                      </span>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {course.is_published ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-tint px-2.5 py-0.5 text-xs font-medium text-teal">
                        <CheckCircle size={11} strokeWidth={2.5} aria-hidden="true" />
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-medium text-ink/40">
                        <Circle size={11} strokeWidth={2.5} aria-hidden="true" />
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-ink/70">
                    {enrolCounts[course.id] ?? 0}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Link
                        to={`/instructor/courses/${course.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline"
                        aria-label={`Edit ${course.title}`}
                      >
                        <Pencil size={11} strokeWidth={2} aria-hidden="true" />
                        Edit
                      </Link>
                      <Link
                        to={`/courses/${course.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-ink/50 hover:text-teal hover:underline"
                        aria-label={`View ${course.title}`}
                      >
                        View
                        <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConsoleLayout>
  )
}
