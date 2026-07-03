import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, FileText, Award, TrendingUp, ArrowRight } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'

export default function AdminReports() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    async function load() {
      const [surveyRes, subRes, certRes, enrollRes] = await Promise.all([
        supabase.from('survey_responses').select('id', { count: 'exact', head: true }),
        supabase.from('submissions').select('id', { count: 'exact', head: true }),
        supabase.from('certificates').select('id', { count: 'exact', head: true }),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }),
      ])
      setStats({
        surveys: surveyRes.count ?? 0,
        submissions: subRes.count ?? 0,
        certificates: certRes.count ?? 0,
        enrollments: enrollRes.count ?? 0,
      })
    }
    load()
  }, [])

  return (
    <Layout>
      <div className="mb-8">
        <Link to="/admin" className="text-xs font-medium text-teal hover:underline">
          ← Admin overview
        </Link>
        <p className="mt-3 efac-eyebrow text-orange">Admin</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-navy">Reports</h1>
        <p className="mt-1 text-sm text-ink/60">
          Read-only analytics across courses and learners.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Survey Analysis */}
        <Link
          to="/admin/reports/surveys"
          className="efac-card group flex flex-col p-6 transition-shadow hover:shadow-md"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-tint">
              <BarChart2 size={20} strokeWidth={1.75} className="text-teal" />
            </span>
            <ArrowRight
              size={16}
              className="text-ink/25 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <p className="efac-eyebrow text-teal">Learning outcomes</p>
          <p className="mt-1 font-display text-xl font-semibold text-navy">
            Survey Analysis
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Pre/post comparison, response rates, and individual answers.
          </p>
          <p className="mt-4 text-[13px] font-semibold text-ink/45">
            {stats
              ? `${stats.surveys} response${stats.surveys !== 1 ? 's' : ''} collected`
              : <span className="animate-pulse">Loading…</span>}
          </p>
        </Link>

        {/* Submissions Report */}
        <Link
          to="/admin/reports/submissions"
          className="efac-card group flex flex-col p-6 transition-shadow hover:shadow-md"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-tint">
              <FileText size={20} strokeWidth={1.75} className="text-orange" />
            </span>
            <ArrowRight
              size={16}
              className="text-ink/25 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <p className="efac-eyebrow text-orange">Assignments</p>
          <p className="mt-1 font-display text-xl font-semibold text-navy">
            Submissions
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Module-by-module submission rates, turnaround times, and feedback status.
          </p>
          <p className="mt-4 text-[13px] font-semibold text-ink/45">
            {stats
              ? `${stats.submissions} submission${stats.submissions !== 1 ? 's' : ''}`
              : <span className="animate-pulse">Loading…</span>}
          </p>
        </Link>

        {/* Progress Report */}
        <Link
          to="/admin/reports/progress"
          className="efac-card group flex flex-col p-6 transition-shadow hover:shadow-md"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-tint">
              <TrendingUp size={20} strokeWidth={1.75} className="text-teal" />
            </span>
            <ArrowRight
              size={16}
              className="text-ink/25 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <p className="efac-eyebrow text-teal">Learner tracking</p>
          <p className="mt-1 font-display text-xl font-semibold text-navy">
            Progress
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Per-learner completion, survey status, and who's falling behind.
          </p>
          <p className="mt-4 text-[13px] font-semibold text-ink/45">
            {stats
              ? `${stats.enrollments} enrolment${stats.enrollments !== 1 ? 's' : ''}`
              : <span className="animate-pulse">Loading…</span>}
          </p>
        </Link>

        {/* Certificates */}
        <Link
          to="/instructor/certifications"
          className="efac-card group flex flex-col p-6 transition-shadow hover:shadow-md"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy/10">
              <Award size={20} strokeWidth={1.75} className="text-navy" />
            </span>
            <ArrowRight
              size={16}
              className="text-ink/25 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <p className="efac-eyebrow text-navy/60">Completion</p>
          <p className="mt-1 font-display text-xl font-semibold text-navy">
            Certificates
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Track certificate issuance and review the certification queue.
          </p>
          <p className="mt-4 text-[13px] font-semibold text-ink/45">
            {stats
              ? `${stats.certificates} issued`
              : <span className="animate-pulse">Loading…</span>}
          </p>
        </Link>
      </div>
    </Layout>
  )
}
