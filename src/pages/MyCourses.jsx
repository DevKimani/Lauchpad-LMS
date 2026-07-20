import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import ConsoleLayout from '../components/ConsoleLayout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { btnClass } from './Signup'

function Section({ title, subtitle, courses, renderRow }) {
  if (courses.length === 0) return null
  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center gap-2.5">
        <p className="efac-eyebrow text-ink/60">{title}</p>
        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold text-ink/40">
          {courses.length}
        </span>
      </div>
      {subtitle && (
        <p className="mb-2.5 text-xs text-ink/40">{subtitle}</p>
      )}
      <div className="divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10 bg-white">
        {courses.map(renderRow)}
      </div>
    </div>
  )
}

export default function MyCourses() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const isAdmin = profile?.role === 'admin'

  const [courses, setCourses] = useState([])
  const [collabIds, setCollabIds] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    async function load() {
      const [coursesRes, collabRes] = await Promise.all([
        supabase
          .from('courses')
          .select(
            'id, title, is_published, created_at, instructor_id, profiles!instructor_id(full_name)',
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('course_instructors')
          .select('course_id')
          .eq('instructor_id', userId),
      ])
      setCollabIds(new Set((collabRes.data ?? []).map((r) => r.course_id)))
      setCourses(coursesRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [userId])

  function canEdit(course) {
    return isAdmin || course.instructor_id === userId || collabIds.has(course.id)
  }

  function category(course) {
    if (course.instructor_id === userId) return 'owned'
    if (collabIds.has(course.id)) return 'collab'
    return 'other'
  }

  const owned = courses.filter((c) => category(c) === 'owned')
  const collab = courses.filter((c) => category(c) === 'collab')
  const other = courses.filter((c) => category(c) === 'other')

  function renderCourseRow(course) {
    const editable = canEdit(course)
    const cat = category(course)
    const ownerName = course.profiles?.full_name

    return (
      <div key={course.id} className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{course.title || 'Untitled'}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
            <span
              className={`text-xs font-medium ${
                course.is_published ? 'text-teal' : 'text-ink/40'
              }`}
            >
              {course.is_published ? 'Published' : 'Draft'}
            </span>
            {cat !== 'owned' && ownerName && (
              <span className="hidden text-xs text-ink/40 sm:inline">
                · {ownerName}
              </span>
            )}
          </div>
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-4">
          {editable ? (
            <>
              <Link
                to={`/instructor/courses/${course.id}/roster`}
                className="text-sm text-ink/50 hover:text-teal hover:underline"
              >
                Roster
              </Link>
              <Link
                to={`/instructor/courses/${course.id}/gradebook`}
                className="text-sm text-ink/50 hover:text-teal hover:underline"
              >
                Gradebook
              </Link>
              <Link
                to={`/instructor/courses/${course.id}`}
                className="text-sm font-medium text-teal hover:underline"
              >
                Edit
              </Link>
            </>
          ) : (
            <Link
              to={`/courses/${course.id}`}
              className="text-sm font-medium text-ink/50 hover:text-teal hover:underline"
            >
              View
            </Link>
          )}
        </div>
      </div>
    )
  }

  const isEmpty = !loading && courses.length === 0

  return (
    <ConsoleLayout title="My Courses">
      <div className="mb-6 flex justify-end">
        <Link to="/instructor/courses/new" className={`${btnClass} w-auto px-5 py-2`}>
          New course
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-ink/5" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
          <BookOpen
            size={32}
            strokeWidth={1.25}
            className="mx-auto mb-2 text-ink/20"
            aria-hidden="true"
          />
          <p className="text-sm text-ink/50">No courses yet — create your first one.</p>
        </div>
      ) : (
        <>
          <Section
            title="Owned by me"
            courses={owned}
            renderRow={renderCourseRow}
          />
          <Section
            title="Shared with me"
            courses={collab}
            renderRow={renderCourseRow}
          />
          <Section
            title="Other courses"
            subtitle={
              isAdmin ? undefined : 'You can view these courses but cannot edit them.'
            }
            courses={other}
            renderRow={renderCourseRow}
          />
        </>
      )}
    </ConsoleLayout>
  )
}
