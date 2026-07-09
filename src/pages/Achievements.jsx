import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Achievements() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!userId) return
    supabase
      .from('certificates')
      .select('id, created_at, courses ( id, title )')
      .eq('status', 'issued')
      .eq('learner_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setLoadError('Failed to load achievements — try refreshing.')
        else setCerts(data ?? [])
        setLoading(false)
      })
  }, [userId])

  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading achievements…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-navy">
          My achievements
        </h1>
        <p className="mt-1 text-ink/60">
          Certificates you have earned by completing a programme.
        </p>
      </div>

      {loadError && (
        <p className="mb-6 rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">
          {loadError}
        </p>
      )}

      {certs.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white px-8 py-20 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-light">
            <IcoAward className="h-8 w-8 text-orange" />
          </span>
          <p className="font-display text-2xl font-semibold text-navy">
            No certificates yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/60">
            Complete a programme to earn your certificate. Your achievements will
            appear here once issued by your tutor.
          </p>
          <Link
            to="/courses"
            className="mt-6 inline-block rounded-lg bg-orange px-6 py-2.5 text-sm font-medium text-navy transition hover:bg-orange-dark"
          >
            Browse programmes →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certs.map((cert) => (
            <CertCard key={cert.id} cert={cert} />
          ))}
        </div>
      )}
    </Layout>
  )
}

function CertCard({ cert }) {
  const earnedDate = cert.created_at
    ? new Date(cert.created_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white">
      {/* Coloured band */}
      <div className="flex items-center gap-3 border-b border-ink/5 bg-orange-light/40 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-light">
          <IcoAward className="h-5 w-5 text-orange" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-orange">
            Certificate of completion
          </p>
          <p className="mt-0.5 truncate font-display text-base font-semibold leading-snug text-navy">
            {cert.courses?.title ?? 'Programme'}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col justify-between px-5 py-4">
        {earnedDate && (
          <p className="text-xs text-ink/50">
            Earned{' '}
            <span className="font-medium text-ink/70">{earnedDate}</span>
          </p>
        )}
        <Link
          to={`/certificate/${cert.id}`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal hover:underline"
        >
          View certificate
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </div>
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
