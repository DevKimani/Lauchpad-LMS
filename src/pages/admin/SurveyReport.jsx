import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ChevronDown, ChevronRight } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'

// ── pure helpers ──────────────────────────────────────────────────────────────

function mean(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function fmt(n, dec = 1) {
  return n == null ? '—' : n.toFixed(dec)
}

function pct(n, total) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function buildCsv(surveys, questions, responses, profiles) {
  const rows = [['Learner name', 'EFAC ID', 'Survey kind', 'Survey title', 'Question', 'Answer']]
  for (const survey of surveys) {
    const qs = questions[survey.id] ?? []
    for (const resp of responses[survey.id] ?? []) {
      const p = profiles[resp.learner_id] ?? {}
      for (const q of qs) {
        rows.push([
          p.full_name ?? '',
          p.efac_id ?? '',
          survey.kind,
          survey.title,
          q.prompt,
          String(resp.answers?.[q.id] ?? ''),
        ])
      }
    }
  }
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

// ── stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ value, label, sub, barPct, barColor = 'bg-teal' }) {
  return (
    <div className="efac-card p-5">
      <p className="font-display text-4xl font-semibold tabular-nums leading-none text-navy">
        {value ?? <span className="text-ink/20">—</span>}
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink/70">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/40">{sub}</p>}
      {barPct != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/8">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ── paired bar row ────────────────────────────────────────────────────────────

function PairedBar({ prompt, preAvg, postAvg, preN, postN }) {
  const delta = preAvg != null && postAvg != null ? postAvg - preAvg : null

  return (
    <div className="border-b border-ink/5 px-5 py-4 last:border-0">
      <p className="mb-3 text-[13px] font-medium leading-snug text-ink">{prompt}</p>
      <div className="space-y-2">
        {/* Pre bar */}
        <div className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-ink/45">
            Pre
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded-full bg-ink/8">
            {preAvg != null && (
              <div
                className="h-full rounded-full bg-ink/35 transition-all duration-700"
                style={{ width: `${(preAvg / 5) * 100}%` }}
              />
            )}
          </div>
          <span className="w-24 shrink-0 text-[12px] text-ink/60">
            {fmt(preAvg)}{' '}
            <span className="text-ink/30">n={preN}</span>
          </span>
          {/* spacer so columns align */}
          <span className="w-10 shrink-0" />
        </div>

        {/* Post bar */}
        <div className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-orange">
            Post
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded-full bg-orange-tint">
            {postAvg != null && (
              <div
                className="h-full rounded-full bg-orange transition-all duration-700"
                style={{ width: `${(postAvg / 5) * 100}%` }}
              />
            )}
          </div>
          <span className="w-24 shrink-0 text-[12px] text-ink/60">
            {fmt(postAvg)}{' '}
            <span className="text-ink/30">n={postN}</span>
          </span>
          <span
            className={`w-10 shrink-0 text-right font-display text-base font-semibold tabular-nums ${
              delta == null
                ? 'text-transparent'
                : delta > 0
                ? 'text-teal'
                : delta < 0
                ? 'text-clay'
                : 'text-ink/30'
            }`}
          >
            {delta == null
              ? ''
              : delta === 0
              ? '0.0'
              : `${delta > 0 ? '+' : ''}${fmt(delta)}`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── choice breakdown ──────────────────────────────────────────────────────────

function ChoiceBreakdown({ prompt, options, counts, total }) {
  const maxCount = Math.max(...options.map((o) => counts[o] ?? 0), 1)
  return (
    <div className="px-5 py-4">
      <p className="mb-3 text-[13px] font-medium leading-snug text-ink">{prompt}</p>
      {total === 0 ? (
        <p className="text-[12px] italic text-ink/35">No responses yet.</p>
      ) : (
        <div className="space-y-2">
          {options.map((opt) => {
            const count = counts[opt] ?? 0
            const p = pct(count, total)
            return (
              <div key={opt} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[12px] text-ink/70">{opt}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink/8">
                  <div
                    className="h-full rounded-full bg-teal/50 transition-all duration-700"
                    style={{ width: `${maxCount ? (count / maxCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[12px] text-ink/50">
                  {count}{' '}
                  <span className="text-ink/30">({p}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── text answers accordion ────────────────────────────────────────────────────

function TextAnswers({ prompt, answers }) {
  const [open, setOpen] = useState(false)
  const filled = answers.filter((a) => a.answer && a.answer.trim())

  return (
    <div className="border-b border-ink/5 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-sand/40"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-ink">{prompt}</p>
          <p className="text-[12px] text-ink/40">
            {filled.length} response{filled.length !== 1 ? 's' : ''}
          </p>
        </div>
        {open ? (
          <ChevronDown size={14} className="shrink-0 text-ink/30" aria-hidden="true" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-ink/30" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="divide-y divide-ink/5 border-t border-ink/5 bg-paper">
          {filled.length === 0 ? (
            <p className="px-5 py-3 text-[12px] italic text-ink/35">No responses yet.</p>
          ) : (
            filled.map((a, i) => (
              <div key={i} className="px-5 py-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                  {a.name}
                </p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink/80">
                  {a.answer}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── section wrapper ───────────────────────────────────────────────────────────

function SurveyKindBadge({ kind }) {
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-wide ${
        kind === 'pre' ? 'text-teal' : 'text-orange'
      }`}
    >
      {kind === 'pre' ? 'Pre-survey' : 'Post-survey'}
    </span>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function SurveyReport() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [loading, setLoading] = useState(false)

  // Report data
  const [preSurvey, setPreSurvey] = useState(null)
  const [postSurvey, setPostSurvey] = useState(null)
  const [questions, setQuestions] = useState({})        // { [surveyId]: question[] }
  const [responses, setResponses] = useState({})        // { [surveyId]: response[] }
  const [profiles, setProfiles] = useState({})          // { [learnerId]: { full_name, efac_id } }
  const [enrollmentCount, setEnrollmentCount] = useState(null)

  // Load all courses once
  useEffect(() => {
    supabase
      .from('courses')
      .select('id, title')
      .order('title')
      .then(({ data }) => {
        const list = data ?? []
        setCourses(list)
        if (list.length > 0) {
          const wezesha = list.find((c) =>
            c.title.toLowerCase().includes('wezesha'),
          )
          setSelectedCourseId((wezesha ?? list[0]).id)
        }
      })
  }, [])

  // Load report data whenever the selected course changes
  useEffect(() => {
    if (!selectedCourseId) return

    async function loadReport() {
      setLoading(true)
      setPreSurvey(null)
      setPostSurvey(null)
      setQuestions({})
      setResponses({})
      setProfiles({})
      setEnrollmentCount(null)

      const [surveyRes, enrollRes] = await Promise.all([
        supabase
          .from('surveys')
          .select('id, kind, title')
          .eq('course_id', selectedCourseId),
        supabase
          .from('enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('course_id', selectedCourseId),
      ])

      setEnrollmentCount(enrollRes.count ?? 0)

      const surveyList = surveyRes.data ?? []
      const pre = surveyList.find((s) => s.kind === 'pre') ?? null
      const post = surveyList.find((s) => s.kind === 'post') ?? null
      setPreSurvey(pre)
      setPostSurvey(post)

      if (surveyList.length === 0) {
        setLoading(false)
        return
      }

      const surveyIds = surveyList.map((s) => s.id)

      const [qRes, rRes] = await Promise.all([
        supabase
          .from('survey_questions')
          .select('id, survey_id, prompt, qtype, options, order_index')
          .in('survey_id', surveyIds)
          .order('order_index'),
        supabase
          .from('survey_responses')
          .select('survey_id, learner_id, answers')
          .in('survey_id', surveyIds),
      ])

      const qMap = {}
      for (const q of qRes.data ?? []) {
        if (!qMap[q.survey_id]) qMap[q.survey_id] = []
        qMap[q.survey_id].push(q)
      }
      setQuestions(qMap)

      const rMap = {}
      const learnerIds = new Set()
      for (const r of rRes.data ?? []) {
        if (!rMap[r.survey_id]) rMap[r.survey_id] = []
        rMap[r.survey_id].push(r)
        learnerIds.add(r.learner_id)
      }
      setResponses(rMap)

      if (learnerIds.size > 0) {
        const { data: pd } = await supabase
          .from('profiles')
          .select('id, full_name, efac_id')
          .in('id', [...learnerIds])
        const pMap = {}
        for (const p of pd ?? []) pMap[p.id] = p
        setProfiles(pMap)
      }

      setLoading(false)
    }

    loadReport()
  }, [selectedCourseId])

  // ── derived ────────────────────────────────────────────────────────────────

  const preResponses = preSurvey ? (responses[preSurvey.id] ?? []) : []
  const postResponses = postSurvey ? (responses[postSurvey.id] ?? []) : []
  const preQuestions = preSurvey ? (questions[preSurvey.id] ?? []) : []
  const postQuestions = postSurvey ? (questions[postSurvey.id] ?? []) : []

  // Paired bars: pre scale questions matched to post by order_index
  const showComparison = !!(preSurvey && postSurvey)
  const pairedRows = preQuestions
    .filter((q) => q.qtype === 'scale')
    .map((preQ) => {
      const postQ =
        postQuestions.find(
          (q) => q.qtype === 'scale' && q.order_index === preQ.order_index,
        ) ?? null
      const preNums = preResponses
        .map((r) => parseFloat(r.answers?.[preQ.id]))
        .filter((v) => !isNaN(v))
      const postNums = postQ
        ? postResponses
            .map((r) => parseFloat(r.answers?.[postQ.id]))
            .filter((v) => !isNaN(v))
        : []
      return {
        prompt: preQ.prompt,
        preAvg: mean(preNums),
        postAvg: postQ ? mean(postNums) : null,
        preN: preNums.length,
        postN: postNums.length,
      }
    })

  function getChoiceSections(surveyId, surveyResponses) {
    return (questions[surveyId] ?? [])
      .filter((q) => q.qtype === 'choice')
      .map((q) => {
        const counts = {}
        for (const opt of q.options ?? []) counts[opt] = 0
        for (const r of surveyResponses) {
          const ans = r.answers?.[q.id]
          if (ans != null && counts[ans] !== undefined) counts[ans]++
        }
        return {
          prompt: q.prompt,
          options: q.options ?? [],
          counts,
          total: surveyResponses.length,
        }
      })
  }

  function getTextSections(surveyId, surveyResponses) {
    return (questions[surveyId] ?? [])
      .filter((q) => q.qtype === 'text')
      .map((q) => ({
        prompt: q.prompt,
        answers: surveyResponses.map((r) => ({
          name: profiles[r.learner_id]?.full_name ?? 'Unknown',
          answer: r.answers?.[q.id] ?? '',
        })),
      }))
  }

  const preChoiceSections = preSurvey
    ? getChoiceSections(preSurvey.id, preResponses)
    : []
  const postChoiceSections = postSurvey
    ? getChoiceSections(postSurvey.id, postResponses)
    : []
  const preTextSections = preSurvey
    ? getTextSections(preSurvey.id, preResponses)
    : []
  const postTextSections = postSurvey
    ? getTextSections(postSurvey.id, postResponses)
    : []

  const hasSurveys = !!(preSurvey || postSurvey)
  const hasResponses = preResponses.length > 0 || postResponses.length > 0
  const allSurveys = [preSurvey, postSurvey].filter(Boolean)

  function handleExportCsv() {
    const csv = buildCsv(allSurveys, questions, responses, profiles)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `survey-report-${selectedCourseId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/reports"
            className="text-xs font-medium text-teal hover:underline"
          >
            ← Reports
          </Link>
          <p className="mt-3 efac-eyebrow text-orange">Survey Analysis</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-navy">
            Pre / Post Survey Report
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Learning confidence scores before and after the programme.
          </p>
        </div>

        {hasResponses && (
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-2 rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:border-teal hover:text-teal"
          >
            <Download size={15} strokeWidth={2} aria-hidden="true" />
            Export CSV
          </button>
        )}
      </div>

      {/* Course selector */}
      <div className="mb-8">
        <label
          htmlFor="course-select"
          className="mb-1.5 block text-sm font-medium text-ink/60"
        >
          Course
        </label>
        <select
          id="course-select"
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="min-w-[280px] rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-ink/5" />
          ))}
        </div>
      )}

      {/* No surveys configured */}
      {!loading && !hasSurveys && selectedCourseId && (
        <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
          <p className="font-display text-xl font-semibold text-navy">
            No surveys configured
          </p>
          <p className="mt-2 text-sm text-ink/60">
            This course does not have a pre or post survey set up yet.
          </p>
        </div>
      )}

      {/* Report body */}
      {!loading && hasSurveys && (
        <div className="space-y-10">

          {/* ── RESPONSE RATES ──────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 efac-eyebrow text-ink/40">Response rates</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                value={enrollmentCount ?? '…'}
                label="Enrolled learners"
              />
              <StatTile
                value={preResponses.length}
                label={
                  preSurvey
                    ? `Pre-survey — ${preSurvey.title}`
                    : 'Pre-survey (none)'
                }
                sub={
                  enrollmentCount
                    ? `${pct(preResponses.length, enrollmentCount)}% response rate`
                    : null
                }
                barPct={pct(preResponses.length, enrollmentCount ?? 0)}
                barColor="bg-teal"
              />
              <StatTile
                value={postResponses.length}
                label={
                  postSurvey
                    ? `Post-survey — ${postSurvey.title}`
                    : 'Post-survey (none)'
                }
                sub={
                  enrollmentCount
                    ? `${pct(postResponses.length, enrollmentCount)}% response rate`
                    : null
                }
                barPct={pct(postResponses.length, enrollmentCount ?? 0)}
                barColor="bg-orange"
              />
            </div>
          </section>

          {/* ── PRE/POST SCALE COMPARISON ────────────────────────────────────── */}
          {showComparison && pairedRows.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="efac-eyebrow text-ink/40">
                  Confidence scores: pre vs post
                </h2>
                <div className="flex items-center gap-5 text-[11px] font-semibold text-ink/50">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-5 rounded-full bg-ink/30" />
                    Pre (1–5)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-5 rounded-full bg-orange" />
                    Post (1–5)
                  </span>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
                {pairedRows.map((row, i) => (
                  <PairedBar key={i} {...row} />
                ))}
              </div>
            </section>
          )}

          {/* ── CHOICE QUESTIONS ──────────────────────────────────────────────── */}
          {(preChoiceSections.length > 0 || postChoiceSections.length > 0) && (
            <section>
              <h2 className="mb-3 efac-eyebrow text-ink/40">Choice questions</h2>
              <div className="space-y-3">
                {[
                  ...preChoiceSections.map((s) => ({ ...s, kind: 'pre' })),
                  ...postChoiceSections.map((s) => ({ ...s, kind: 'post' })),
                ].map((s, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-xl border border-ink/10 bg-white"
                  >
                    <div className="border-b border-ink/5 bg-sand/30 px-5 py-2">
                      <SurveyKindBadge kind={s.kind} />
                    </div>
                    <ChoiceBreakdown
                      prompt={s.prompt}
                      options={s.options}
                      counts={s.counts}
                      total={s.total}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── TEXT RESPONSES ────────────────────────────────────────────────── */}
          {(preTextSections.length > 0 || postTextSections.length > 0) && (
            <section>
              <h2 className="mb-3 efac-eyebrow text-ink/40">Text responses</h2>
              <div className="space-y-3">
                {[
                  ...preTextSections.map((s) => ({ ...s, kind: 'pre' })),
                  ...postTextSections.map((s) => ({ ...s, kind: 'post' })),
                ].map((s, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-xl border border-ink/10 bg-white"
                  >
                    <div className="border-b border-ink/5 bg-sand/30 px-5 py-2">
                      <SurveyKindBadge kind={s.kind} />
                    </div>
                    <TextAnswers prompt={s.prompt} answers={s.answers} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* No responses yet */}
          {!hasResponses && (
            <div className="rounded-xl border border-ink/10 bg-white px-6 py-12 text-center">
              <p className="font-display text-xl font-semibold text-navy">
                No responses yet
              </p>
              <p className="mt-2 text-sm text-ink/60">
                Results will appear once learners submit the survey.
              </p>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
