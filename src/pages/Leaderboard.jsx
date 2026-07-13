import { useEffect, useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import TopNav from '../components/TopNav'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── helpers ───────────────────────────────────────────────────────────────────

// First name + last initial, e.g. "Amara T." — gives a bit of privacy.
function shortName(fullName) {
  if (!fullName) return 'Scholar'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

// ── constants ─────────────────────────────────────────────────────────────────

const GOLD = '#ffba08'

const POINTS_BREAKDOWN = [
  { label: 'Lesson completed',    pts: 5   },
  { label: 'Submission reviewed', pts: 15  },
  { label: 'Reflection written',  pts: 5   },
  { label: 'Survey completed',    pts: 10  },
  { label: 'Job application',     pts: 10  },
  { label: 'Certificate earned',  pts: 100 },
]

// ── podium card ───────────────────────────────────────────────────────────────

function PodiumCard({ entry, rank, isUser }) {
  if (!entry) return <div aria-hidden="true" />

  const isFirst  = rank === 1
  const rankLabel = ['', '1st', '2nd', '3rd'][rank]

  // Colour scheme per rank
  const scheme =
    rank === 1
      ? { border: { borderColor: `${GOLD}80` }, bg: { background: `${GOLD}0d` }, pointsCls: '', pointsStyle: { color: GOLD }, labelStyle: { color: GOLD }, labelCls: '' }
      : rank === 2
      ? { border: {}, bg: {}, pointsCls: 'text-teal', pointsStyle: {}, labelStyle: {}, labelCls: 'text-teal', wrapperCls: 'border-teal/25 bg-teal-tint' }
      : { border: {}, bg: {}, pointsCls: 'text-orange', pointsStyle: {}, labelStyle: {}, labelCls: 'text-orange', wrapperCls: 'border-orange/25 bg-orange-tint' }

  const wrapperBase = `flex flex-col items-center rounded-xl border px-3 pb-6 ${isFirst ? 'pt-6' : 'mt-8 pt-5'}`
  const wrapperCls  = isFirst ? `${wrapperBase} bg-white shadow-md` : `${wrapperBase} ${scheme.wrapperCls}`
  const wrapperStyle = isFirst ? { borderColor: `${GOLD}70`, boxShadow: `0 4px 24px ${GOLD}18` } : {}

  return (
    <div className={wrapperCls} style={wrapperStyle}>
      {/* Rank label */}
      <p
        className={`mb-2.5 font-display text-xl font-bold ${scheme.labelCls}`}
        style={scheme.labelStyle}
      >
        {rankLabel}
      </p>

      {/* Avatar */}
      <Avatar
        url={entry.avatar_url}
        name={entry.full_name}
        className={
          isFirst
            ? 'h-[72px] w-[72px] text-xl font-extrabold'
            : 'h-[52px] w-[52px] text-[15px] font-extrabold'
        }
      />

      {/* Name */}
      <p className="mt-3 max-w-full truncate px-1 text-center text-[13px] font-semibold leading-tight text-navy">
        {shortName(entry.full_name)}
        {isUser && (
          <span className="ml-1 font-sans text-[9px] font-bold uppercase tracking-wide text-orange">
            ✦ you
          </span>
        )}
      </p>

      {/* Points */}
      <p
        className={`mt-1.5 font-display ${isFirst ? 'text-2xl' : 'text-xl'} font-bold tabular-nums ${scheme.pointsCls}`}
        style={scheme.pointsStyle}
      >
        {(entry.points ?? 0).toLocaleString()}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">pts</p>
    </div>
  )
}

// ── neighbourhood row ─────────────────────────────────────────────────────────

function NeighbourRow({ entry, isUser }) {
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 ${
        isUser ? 'bg-orange-tint' : ''
      }`}
    >
      {/* Rank */}
      <span className="w-7 shrink-0 font-display text-sm font-bold tabular-nums text-muted">
        #{entry.rank}
      </span>

      {/* Avatar */}
      <Avatar
        url={entry.avatar_url}
        name={entry.full_name}
        className="h-8 w-8 shrink-0 text-[11px] font-extrabold"
      />

      {/* Name */}
      <span
        className={`flex-1 text-sm font-semibold ${isUser ? 'text-ink' : 'text-ink/70'}`}
      >
        {shortName(entry.full_name)}
        {isUser && (
          <span className="ml-2 inline-flex items-center rounded-full bg-orange px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            you
          </span>
        )}
      </span>

      {/* Points */}
      <span
        className={`shrink-0 font-display text-sm font-bold tabular-nums ${
          isUser ? 'text-orange' : 'text-muted'
        }`}
      >
        {(entry.points ?? 0).toLocaleString()}
        <span className="ml-0.5 font-sans text-[10px] font-normal">pts</span>
      </span>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [courses, setCourses]           = useState([])
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [board, setBoard]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [boardLoading, setBoardLoading] = useState(false)

  // ── 1. Load enrolled courses ──────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return
    supabase
      .from('enrollments')
      .select('course_id, courses(id, title)')
      .eq('learner_id', userId)
      .then(({ data }) => {
        const list = (data ?? [])
          .filter((e) => e.courses)
          .map((e) => ({ id: e.courses.id, title: e.courses.title }))
        setCourses(list)
        // Prefer a course named "Wezesha"; fall back to the first enrolled
        const preferred = list.find((c) => /wezesha/i.test(c.title)) ?? list[0] ?? null
        setSelectedCourse(preferred)
        setLoading(false)
      })
  }, [userId])

  // ── 2. Fetch leaderboard whenever the selected course changes ─────────────

  useEffect(() => {
    if (!selectedCourse) return
    setBoardLoading(true)
    supabase
      .rpc('course_leaderboard', { p_course: selectedCourse.id })
      .then(({ data }) => {
        setBoard(data ?? [])
        setBoardLoading(false)
      })
  }, [selectedCourse])

  // ── Derived data ──────────────────────────────────────────────────────────

  const top3 = board.slice(0, 3)

  const userIdx   = board.findIndex((r) => r.learner_id === userId)
  const userEntry = userIdx >= 0 ? board[userIdx] : null

  // 2 above + user + 2 below, clamped to array bounds
  const neighbourhood = useMemo(() => {
    if (userIdx < 0) return []
    const start = Math.max(0, userIdx - 2)
    const end   = Math.min(board.length - 1, userIdx + 2)
    return board.slice(start, end + 1)
  }, [board, userIdx])

  const skippedAbove = neighbourhood.length > 0 ? neighbourhood[0].rank - 1 : 0
  const skippedBelow =
    neighbourhood.length > 0
      ? board.length - neighbourhood[neighbourhood.length - 1].rank
      : 0

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-paper">
        <TopNav />
        <main className="mx-auto max-w-[720px] px-6 py-8">
          <div className="mb-4 h-10 w-48 animate-pulse rounded-lg bg-ink/5" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-ink/5" />
            ))}
          </div>
        </main>
      </div>
    )
  }

  // ── Not enrolled ──────────────────────────────────────────────────────────

  if (courses.length === 0) {
    return (
      <div className="min-h-screen bg-paper">
        <TopNav />
        <main className="mx-auto max-w-[720px] px-6 py-8">
          <div className="rounded-xl border border-ink/10 bg-white px-8 py-16 text-center">
            <Trophy size={36} strokeWidth={1.25} className="mx-auto mb-3 text-line" aria-hidden="true" />
            <p className="font-display text-xl font-semibold text-navy">Not enrolled yet</p>
            <p className="mt-2 text-sm text-muted">
              Enrol in a course to see the cohort leaderboard.
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-paper">
      <TopNav />
      <main className="mx-auto max-w-[720px] px-6 py-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-7">
          <p className="efac-eyebrow text-orange">Cohort ranking</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-semibold text-navy">Leaderboard</h1>
            {courses.length > 1 && (
              <select
                value={selectedCourse?.id ?? ''}
                onChange={(e) => {
                  const c = courses.find((c) => c.id === e.target.value)
                  if (c) setSelectedCourse(c)
                }}
                className="rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            )}
          </div>
          {selectedCourse && (
            <p className="mt-0.5 text-sm text-muted">{selectedCourse.title}</p>
          )}
        </div>

        {/* ── Board loading ────────────────────────────────────────────────── */}
        {boardLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-xl bg-ink/5" />
              ))}
            </div>
            <div className="h-32 animate-pulse rounded-xl bg-ink/5" />
          </div>

        ) : board.length === 0 ? (
          <div className="rounded-xl border border-ink/10 bg-white px-8 py-16 text-center">
            <Trophy size={36} strokeWidth={1.25} className="mx-auto mb-3 text-line" aria-hidden="true" />
            <p className="font-display text-xl font-semibold text-navy">No scores yet</p>
            <p className="mt-2 text-sm text-muted">
              Complete lessons and assignments to get on the board.
            </p>
          </div>

        ) : (
          <>
            {/* ── Podium ─────────────────────────────────────────────────── */}
            {/* Order: 2nd | 1st | 3rd. items-end aligns card bottoms; mt-8
                on the flanking cards creates the step-down effect. */}
            <div className="mb-10 grid grid-cols-3 items-end gap-3" aria-label="Top 3">
              {([top3[1], top3[0], top3[2]]).map((entry, i) => {
                const rank = [2, 1, 3][i]
                return (
                  <PodiumCard
                    key={entry?.learner_id ?? `empty-${rank}`}
                    entry={entry}
                    rank={rank}
                    isUser={entry?.learner_id === userId}
                  />
                )
              })}
            </div>

            {/* ── Your rank neighbourhood ──────────────────────────────────── */}
            <section className="mb-8" aria-label="Your rank">
              <p className="efac-eyebrow mb-2.5 text-ink/60">Your rank</p>
              {userEntry ? (
                <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
                  {skippedAbove > 0 && (
                    <p className="border-b border-ink/5 px-5 py-2 text-[11px] text-muted">
                      ↑ {skippedAbove} scholar{skippedAbove !== 1 ? 's' : ''} above
                    </p>
                  )}
                  <div className="divide-y divide-ink/5">
                    {neighbourhood.map((entry) => (
                      <NeighbourRow
                        key={entry.learner_id}
                        entry={entry}
                        isUser={entry.learner_id === userId}
                      />
                    ))}
                  </div>
                  {skippedBelow > 0 && (
                    <p className="border-t border-ink/5 px-5 py-2 text-[11px] text-muted">
                      ↓ {skippedBelow} scholar{skippedBelow !== 1 ? 's' : ''} below
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-ink/10 bg-white px-5 py-5 text-center text-sm text-muted">
                  You don't have any points yet — complete a lesson to appear on the board.
                </div>
              )}
            </section>

            {/* ── How points work ──────────────────────────────────────────── */}
            <section aria-label="Scoring breakdown">
              <p className="efac-eyebrow mb-2.5 text-ink/60">How points work</p>
              <div className="rounded-xl border border-ink/10 bg-white px-5 py-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 sm:grid-cols-3">
                  {POINTS_BREAKDOWN.map(({ label, pts }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-ink/70">{label}</span>
                      <span className="shrink-0 font-display text-sm font-bold text-orange">
                        +{pts}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
