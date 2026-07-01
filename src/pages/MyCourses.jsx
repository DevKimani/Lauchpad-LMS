import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { btnClass } from './Signup'

export default function MyCourses() {
  const { session } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCourses() {
      const { data } = await supabase
        .from('courses')
        .select('id, title, is_published, created_at')
        .eq('instructor_id', session.user.id)
        .order('created_at', { ascending: false })
      setCourses(data ?? [])
      setLoading(false)
    }
    fetchCourses()
  }, [session])

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-navy">My Courses</h1>
        <Link to="/instructor/courses/new" className={`${btnClass} w-auto px-5 py-2`}>
          New course
        </Link>
      </div>

      {loading ? (
        <p className="text-ink/60">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="text-ink/60">No courses yet — create your first one.</p>
      ) : (
        <div className="divide-y divide-teal/10 overflow-hidden rounded-xl border border-ink/10 bg-white">
          {courses.map((course) => (
            <div key={course.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium text-ink">{course.title || 'Untitled'}</p>
                <span
                  className={`text-xs font-medium ${
                    course.is_published ? 'text-teal' : 'text-ink/40'
                  }`}
                >
                  {course.is_published ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="flex items-center gap-4">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
