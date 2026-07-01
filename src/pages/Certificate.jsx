import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Standalone page — no Layout wrapper so the print output is clean.

export default function Certificate() {
  const { id } = useParams()
  const [cert, setCert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('certificates')
      .select('id, created_at, courses ( id, title ), profiles ( full_name )')
      .eq('id', id)
      .eq('status', 'issued')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true)
        else setCert(data)
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-ink/60">Loading certificate…</p>
      </div>
    )
  }

  if (notFound || !cert) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-light">
          <IcoAward className="h-8 w-8 text-orange" />
        </span>
        <p className="font-display text-2xl font-semibold text-navy">
          Certificate not found
        </p>
        <p className="max-w-xs text-sm text-ink/60">
          This certificate may not exist or hasn't been issued yet.
        </p>
        <Link to="/achievements" className="text-sm font-medium text-teal hover:underline">
          ← Back to achievements
        </Link>
      </div>
    )
  }

  const certNumber = `EFAC-${cert.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
  const issueDate = new Date(cert.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const learnerName = cert.profiles?.full_name ?? 'Learner'
  const courseTitle = cert.courses?.title ?? 'Programme'

  return (
    <>
      {/* ── Print stylesheet ───────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .cert-no-print {
            display: none !important;
          }
          .cert-screen-wrap {
            display: block !important;
            min-height: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .cert-card {
            max-width: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            aspect-ratio: auto !important;
            width: 100vw !important;
            height: 100vh !important;
          }
        }
      `}</style>

      {/* ── Screen: chrome bar (hidden in print) ──────────────────────────── */}
      <div className="cert-no-print sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-6 py-3">
        <Link
          to="/achievements"
          className="flex items-center gap-1.5 text-sm font-medium text-teal hover:underline"
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          My achievements
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-orange px-5 py-2 text-sm font-medium text-navy transition hover:bg-orange-dark"
        >
          Download / Print
        </button>
      </div>

      {/* ── Certificate wrapper ────────────────────────────────────────────── */}
      <div className="cert-screen-wrap flex min-h-[calc(100vh-49px)] items-center justify-center bg-paper p-6 sm:p-10">
        {/*
          A4 landscape ratio = 297 ÷ 210 ≈ 1.414.
          max-w-5xl (1024px) keeps it readable on screen; in print the card
          expands to 100vw × 100vh via the @media print rule above.
        */}
        <div
          className="cert-card relative w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-lg"
          style={{ aspectRatio: '297 / 210' }}
        >

          {/* ── Decorative bands ────────────────────────────────────────── */}
          <div className="absolute inset-x-0 top-0 h-3 bg-orange" />
          <div className="absolute inset-x-0 bottom-0 h-3 bg-navy" />
          {/* subtle side rules */}
          <div className="absolute inset-y-0 left-0 w-px bg-orange/30" />
          <div className="absolute inset-y-0 right-0 w-px bg-orange/30" />

          {/* ── Content ─────────────────────────────────────────────────── */}
          <div className="flex h-full flex-col items-center justify-center px-12 pb-12 pt-10 text-center sm:px-20">

            {/* Logo */}
            <img
              src="/efac-logo.svg"
              alt="EFAC"
              className="mb-4"
              style={{ height: 'clamp(28px, 4%, 40px)' }}
            />

            {/* Main heading */}
            <h1
              className="font-display font-semibold tracking-wide text-navy"
              style={{ fontSize: 'clamp(1.25rem, 2.5vw, 2rem)', letterSpacing: '0.04em' }}
            >
              Certificate of Completion
            </h1>

            {/* Rule 1 — orange → diamond → teal */}
            <div className="my-4 flex w-full max-w-xs items-center gap-2 sm:max-w-sm">
              <div className="h-px flex-1 bg-orange" />
              <div
                className="h-2 w-2 shrink-0 rotate-45 rounded-none bg-teal"
                aria-hidden="true"
              />
              <div className="h-px flex-1 bg-teal" />
            </div>

            {/* "This certifies that" label */}
            <p
              className="font-semibold uppercase text-teal"
              style={{ fontSize: 'clamp(0.6rem, 1vw, 0.75rem)', letterSpacing: '0.2em' }}
            >
              This certifies that
            </p>

            {/* Learner name */}
            <p
              className="mt-2 font-display font-semibold text-navy"
              style={{ fontSize: 'clamp(1.5rem, 3.75vw, 3rem)', lineHeight: 1.15 }}
            >
              {learnerName}
            </p>

            {/* Completion sentence */}
            <p
              className="mt-3 text-ink/60"
              style={{ fontSize: 'clamp(0.7rem, 1.1vw, 0.875rem)' }}
            >
              has successfully completed
            </p>

            {/* Course title */}
            <p
              className="mt-1 font-display font-semibold text-teal"
              style={{ fontSize: 'clamp(0.9rem, 1.75vw, 1.375rem)' }}
            >
              {courseTitle}
            </p>

            {/* Rule 2 — teal → diamond → orange */}
            <div className="my-4 flex w-full max-w-xs items-center gap-2 sm:max-w-sm">
              <div className="h-px flex-1 bg-teal" />
              <div
                className="h-2 w-2 shrink-0 rotate-45 bg-orange"
                aria-hidden="true"
              />
              <div className="h-px flex-1 bg-orange" />
            </div>

            {/* Footer: signature | date | cert number */}
            <div className="flex w-full max-w-md items-end justify-between gap-4 sm:max-w-lg">

              {/* Signature */}
              <div className="text-left">
                <div className="mb-1.5 h-px w-28 bg-ink/20 sm:w-36" />
                <p
                  className="font-medium text-ink/50"
                  style={{ fontSize: 'clamp(0.6rem, 0.9vw, 0.75rem)' }}
                >
                  Programme Director
                </p>
              </div>

              {/* Issue date */}
              <div className="flex-1 text-center">
                <p
                  className="font-semibold text-navy"
                  style={{ fontSize: 'clamp(0.65rem, 1vw, 0.8rem)' }}
                >
                  {issueDate}
                </p>
                <p
                  className="mt-0.5 uppercase tracking-widest text-ink/40"
                  style={{ fontSize: 'clamp(0.5rem, 0.7vw, 0.625rem)' }}
                >
                  Date of issue
                </p>
              </div>

              {/* Certificate number */}
              <div className="text-right">
                <p
                  className="font-mono font-semibold text-ink/50"
                  style={{ fontSize: 'clamp(0.6rem, 0.9vw, 0.75rem)' }}
                >
                  {certNumber}
                </p>
                <p
                  className="mt-0.5 uppercase tracking-widest text-ink/40"
                  style={{ fontSize: 'clamp(0.5rem, 0.7vw, 0.625rem)' }}
                >
                  Certificate no.
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function IcoAward({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"
      />
    </svg>
  )
}
