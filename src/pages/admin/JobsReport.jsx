import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MousePointerClick, ChevronDown, ChevronUp, Download } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtDateShort(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function buildCsv(jobRows) {
  const header = ['"Job title"', '"Organisation"', '"Learner name"', '"EFAC ID"', '"Clicked at"']
  const rows = []
  for (const job of jobRows) {
    for (const click of job.rawClicks) {
      rows.push([
        `"${job.title.replace(/"/g, '""')}"`,
        `"${job.organisation.replace(/"/g, '""')}"`,
        `"${(click.profiles?.full_name ?? '').replace(/"/g, '""')}"`,
        `"${(click.profiles?.efac_id ?? '').replace(/"/g, '""')}"`,
        `"${click.clicked_at}"`,
      ].join(','))
    }
  }
  return [header.join(','), ...rows].join('\n')
}

// ── StatTile ──────────────────────────────────────────────────────────────────

function StatTile({ value, label, accent = 'text-ink' }) {
  return (
    <div className="efac-card p-5">
      <p className="efac-eyebrow text-muted">{label}</p>
      <p className={`mt-2 font-display text-4xl font-semibold tabular-nums ${accent}`}>
        {value !== null ? value : <span className="animate-pulse text-ink/20">—</span>}
      </p>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function JobsReport() {
  const [loading, setLoading] = useState(true)
  const [publishedCount, setPublishedCount] = useState(null)
  const [jobRows, setJobRows] = useState([])
  const [totalClicks, setTotalClicks] = useState(null)
  const [uniqueScholars, setUniqueScholars] = useState(null)
  const [recentClicks, setRecentClicks] = useState(null)
  const [expanded, setExpanded] = useState(new Set())

  useEffect(() => {
    async function load() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [pubRes, clicksRes, savedRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('is_published', true),
        supabase
          .from('job_clicks')
          .select('job_id, learner_id, clicked_at, jobs(id, title, organisation, created_at, deadline), profiles(full_name, efac_id)')
          .order('clicked_at', { ascending: true }),
        supabase
          .from('saved_jobs')
          .select('job_id'),
      ])

      setPublishedCount(pubRes.count ?? 0)

      const clicks = clicksRes.data ?? []
      setTotalClicks(clicks.length)
      setUniqueScholars(new Set(clicks.map((c) => c.learner_id)).size)
      setRecentClicks(clicks.filter((c) => c.clicked_at >= sevenDaysAgo).length)

      // Bookmark counts per job
      const savedCounts = {}
      for (const row of savedRes.data ?? []) {
        savedCounts[row.job_id] = (savedCounts[row.job_id] ?? 0) + 1
      }

      // Per-job aggregation — clicks are ascending so first encounter = first click per learner
      const jobMap = {}
      for (const click of clicks) {
        const jid = click.job_id
        if (!jobMap[jid]) {
          jobMap[jid] = {
            jobId: jid,
            title: click.jobs?.title ?? 'Unknown job',
            organisation: click.jobs?.organisation ?? '',
            deadline: click.jobs?.deadline,
            createdAt: click.jobs?.created_at,
            clicks: [],
            learnerMap: {},
          }
        }
        const j = jobMap[jid]
        j.clicks.push(click)
        const lid = click.learner_id
        if (!j.learnerMap[lid]) {
          j.learnerMap[lid] = {
            learnerId: lid,
            name: click.profiles?.full_name ?? 'Unknown',
            efacId: click.profiles?.efac_id ?? '',
            firstClick: click.clicked_at,
            count: 0,
          }
        }
        j.learnerMap[lid].count++
      }

      const rows = Object.values(jobMap)
        .map((j) => ({
          jobId: j.jobId,
          title: j.title,
          organisation: j.organisation,
          deadline: j.deadline,
          createdAt: j.createdAt,
          totalClicks: j.clicks.length,
          uniqueClickers: Object.keys(j.learnerMap).length,
          bookmarks: savedCounts[j.jobId] ?? 0,
          learners: Object.values(j.learnerMap).sort((a, b) =>
            a.firstClick.localeCompare(b.firstClick),
          ),
          rawClicks: j.clicks,
        }))
        .sort((a, b) => b.totalClicks - a.totalClicks)

      setJobRows(rows)
      setLoading(false)
    }
    load()
  }, [])

  const maxClicks = Math.max(...jobRows.map((j) => j.totalClicks), 1)
  const hasClicks = (totalClicks ?? 0) > 0

  function toggleExpand(jobId) {
    setExpanded((prev) => {
      const s = new Set(prev)
      if (s.has(jobId)) s.delete(jobId)
      else s.add(jobId)
      return s
    })
  }

  function handleExport() {
    const csv = buildCsv(jobRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jobs-clicks.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout>
      {/* ── Back + header ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link to="/admin/reports" className="text-xs font-medium text-teal hover:underline">
          ← Reports
        </Link>
        <p className="mt-3 efac-eyebrow text-orange">Career engagement</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-semibold text-navy">Jobs Report</h1>
          {!loading && hasClicks && (
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 rounded-[10px] border border-line bg-card px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-ink/30"
            >
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              Export CSV
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-ink/60">
          Apply-click engagement across all posted jobs. For career-office use.
        </p>
      </div>

      {/* ── Stat tiles ────────────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile value={publishedCount} label="Published jobs" accent="text-ink" />
        <StatTile value={totalClicks} label="Total apply clicks" accent="text-orange" />
        <StatTile value={uniqueScholars} label="Unique scholars" accent="text-teal" />
        <StatTile value={recentClicks} label="Clicks last 7 days" accent="text-ink" />
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-ink/5" />
          ))}
        </div>
      ) : !hasClicks ? (
        <div className="rounded-card border border-line bg-card px-8 py-16 text-center">
          <MousePointerClick
            size={36}
            strokeWidth={1.25}
            className="mx-auto mb-3 text-line"
            aria-hidden="true"
          />
          <p className="font-display text-xl font-semibold text-navy">No apply clicks yet</p>
          <p className="mt-2 text-sm text-muted">
            Clicks appear here when scholars click Apply on the Jobs board.
          </p>
        </div>
      ) : (
        <div className="efac-card overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem_8rem_5rem_4rem_2rem] items-center gap-x-4 border-b border-line bg-paper px-5 py-2.5">
            <span className="efac-eyebrow text-muted">Job</span>
            <span className="efac-eyebrow text-muted">Posted</span>
            <span className="efac-eyebrow text-muted">Deadline</span>
            <span className="efac-eyebrow text-muted">Clicks</span>
            <span className="efac-eyebrow text-muted">Unique</span>
            <span className="efac-eyebrow text-muted">Saved</span>
            <span />
          </div>

          {/* Job rows */}
          <div className="divide-y divide-line">
            {jobRows.map((job) => {
              const isExpanded = expanded.has(job.jobId)
              const barPct = Math.round((job.totalClicks / maxClicks) * 100)
              return (
                <div key={job.jobId}>
                  {/* Main clickable row */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(job.jobId)}
                    aria-expanded={isExpanded}
                    className="grid w-full grid-cols-[1fr_5.5rem_5.5rem_8rem_5rem_4rem_2rem] items-center gap-x-4 px-5 py-4 text-left transition-colors hover:bg-paper"
                  >
                    {/* Job title + org */}
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink">
                        {job.title}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {job.organisation}
                      </p>
                    </div>

                    {/* Posted */}
                    <span className="text-[13px] text-muted">{fmtDateShort(job.createdAt)}</span>

                    {/* Deadline */}
                    <span className="text-[13px] text-muted">{fmtDateShort(job.deadline)}</span>

                    {/* Clicks + relative bar */}
                    <div>
                      <span className="text-[15px] font-bold text-orange">
                        {job.totalClicks}
                      </span>
                      <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-track">
                        <div
                          className="h-full rounded-full bg-orange transition-[width]"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Unique clickers */}
                    <span className="text-[13px] text-ink/70">{job.uniqueClickers}</span>

                    {/* Bookmarks */}
                    <span className="text-[13px] text-muted">{job.bookmarks}</span>

                    {/* Expand chevron */}
                    <span className="flex items-center justify-center text-muted">
                      {isExpanded
                        ? <ChevronUp size={15} strokeWidth={2} aria-hidden="true" />
                        : <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />}
                    </span>
                  </button>

                  {/* Expanded learner panel */}
                  {isExpanded && (
                    <div className="border-t border-orange/20 bg-orange-tint/30 px-5 pb-5 pt-4">
                      <p className="mb-3 text-[11px] font-extrabold uppercase tracking-widest text-orange">
                        Scholars who applied — for career-office follow-up
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[440px]">
                          <thead>
                            <tr className="border-b border-line">
                              <th className="pb-2 pr-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-muted">
                                Name
                              </th>
                              <th className="pb-2 pr-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-muted">
                                EFAC ID
                              </th>
                              <th className="pb-2 pr-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-muted">
                                First applied
                              </th>
                              <th className="pb-2 text-left text-[11px] font-extrabold uppercase tracking-wide text-muted">
                                Times
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line/60">
                            {job.learners.map((l) => (
                              <tr key={l.learnerId}>
                                <td className="py-2.5 pr-4 text-[14px] font-medium text-ink">
                                  {l.name}
                                </td>
                                <td className="py-2.5 pr-4 font-mono text-[13px] text-muted">
                                  {l.efacId || '—'}
                                </td>
                                <td className="py-2.5 pr-4 text-[13px] text-muted">
                                  {fmtDate(l.firstClick)}
                                </td>
                                <td className="py-2.5">
                                  {l.count > 1 ? (
                                    <span className="rounded-full bg-orange-tint px-2 py-0.5 text-[11px] font-bold text-orange">
                                      clicked {l.count}×
                                    </span>
                                  ) : (
                                    <span className="text-[13px] text-muted">1×</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Layout>
  )
}
