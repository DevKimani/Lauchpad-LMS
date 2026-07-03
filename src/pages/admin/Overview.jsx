import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  GraduationCap,
  BookOpen,
  UserCheck,
  Award,
  Clock,
  BarChart2,
  Briefcase,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'

// ── Tile definitions ───────────────────────────────────────────────────────────
const TILES = [
  {
    key: 'learners',
    label: 'Learners',
    icon: Users,
    chip: 'bg-teal-light text-teal',
    link: '/admin/users',
  },
  {
    key: 'instructors',
    label: 'Instructors',
    icon: GraduationCap,
    chip: 'bg-navy/10 text-navy',
    link: '/admin/users',
  },
  {
    key: 'courses',
    label: 'Courses',
    icon: BookOpen,
    chip: 'bg-orange-light text-orange',
    link: '/admin/courses',
  },
  {
    key: 'enrolments',
    label: 'Enrolments',
    icon: UserCheck,
    chip: 'bg-teal-light text-teal',
    link: null,
  },
  {
    key: 'certificates',
    label: 'Certificates issued',
    icon: Award,
    chip: 'bg-orange-light text-orange',
    link: null,
  },
  {
    key: 'pending',
    label: 'Awaiting feedback',
    icon: Clock,
    chip: 'bg-red/10 text-red',
    link: '/instructor/feedback',
  },
]

export default function AdminOverview() {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    async function load() {
      const [
        learnersRes,
        instructorsRes,
        coursesRes,
        enrolmentsRes,
        certsRes,
        pendingRes,
        recentRes,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'learner'),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'instructor'),
        supabase
          .from('courses')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('enrollments')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('certificates')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'issued'),
        supabase
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'submitted'),
        supabase
          .from('enrollments')
          .select(
            'created_at, profiles!learner_id ( full_name ), courses ( title )',
          )
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      setStats({
        learners: learnersRes.count ?? 0,
        instructors: instructorsRes.count ?? 0,
        courses: coursesRes.count ?? 0,
        enrolments: enrolmentsRes.count ?? 0,
        certificates: certsRes.count ?? 0,
        pending: pendingRes.count ?? 0,
      })
      setRecent(recentRes.data ?? [])
    }
    load()
  }, [])

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange">
          Admin panel
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
          Platform overview
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Live statistics across the entire platform.
        </p>
      </div>

      {/* ── Metric tiles ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TILES.map(({ key, label, icon: Icon, chip, link }) => {
          const inner = (
            <>
              <div
                className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${chip}`}
              >
                <Icon size={18} strokeWidth={1.75} />
              </div>
              {stats === null ? (
                <div className="h-7 w-12 animate-pulse rounded bg-ink/10" />
              ) : (
                <p className="text-2xl font-bold leading-none text-navy">
                  {stats[key]}
                </p>
              )}
              <p className="mt-1 text-xs text-ink/50">{label}</p>
            </>
          )
          return link ? (
            <Link
              key={key}
              to={link}
              className="rounded-xl border border-ink/10 bg-white p-4 transition-shadow hover:shadow-sm"
            >
              {inner}
            </Link>
          ) : (
            <div key={key} className="rounded-xl border border-ink/10 bg-white p-4">
              {inner}
            </div>
          )
        })}
      </div>

      {/* ── Recent enrolments ────────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-semibold text-navy">Recent enrolments</h2>
          <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
            <ul className="divide-y divide-ink/5">
              {recent.map((row, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {row.profiles?.full_name ?? 'Unknown learner'}
                    </p>
                    <p className="truncate text-xs text-ink/50">
                      enrolled in{' '}
                      <span className="text-teal">
                        {row.courses?.title ?? '—'}
                      </span>
                    </p>
                  </div>
                  <span className="ml-4 shrink-0 text-xs tabular-nums text-ink/40">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Quick nav cards ───────────────────────────────────────────────────── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/admin/users"
          className="flex items-center gap-4 rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-light">
            <Users size={20} strokeWidth={1.75} className="text-teal" />
          </span>
          <div>
            <p className="font-semibold text-navy">Manage users</p>
            <p className="mt-0.5 text-sm text-ink/60">
              Approve instructors, update roles and permissions.
            </p>
          </div>
        </Link>
        <Link
          to="/admin/courses"
          className="flex items-center gap-4 rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-tint">
            <BookOpen size={20} strokeWidth={1.75} className="text-orange" />
          </span>
          <div>
            <p className="font-semibold text-navy">All courses</p>
            <p className="mt-0.5 text-sm text-ink/60">
              Browse, review, and oversee every course.
            </p>
          </div>
        </Link>
        <Link
          to="/admin/reports"
          className="flex items-center gap-4 rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-tint">
            <BarChart2 size={20} strokeWidth={1.75} className="text-teal" />
          </span>
          <div>
            <p className="font-semibold text-navy">Reports</p>
            <p className="mt-0.5 text-sm text-ink/60">
              Survey analysis, submissions, and certificates.
            </p>
          </div>
        </Link>
        <Link
          to="/admin/jobs"
          className="flex items-center gap-4 rounded-xl border border-ink/10 bg-white p-5 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-tint">
            <Briefcase size={20} strokeWidth={1.75} className="text-orange" />
          </span>
          <div>
            <p className="font-semibold text-navy">Post jobs</p>
            <p className="mt-0.5 text-sm text-ink/60">
              Curate job listings for EFAC scholars.
            </p>
          </div>
        </Link>
      </div>
    </Layout>
  )
}
