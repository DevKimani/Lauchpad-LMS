import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function CertificationQueue() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const isAdmin = profile?.role === 'admin'

  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [issuing, setIssuing] = useState(new Set())
  const [issued, setIssued] = useState(new Set())
  const [issueErrors, setIssueErrors] = useState({})

  useEffect(() => {
    if (!userId) return
    load()
  }, [userId])

  async function load() {
    setLoadError('')

    const { data, error } = await supabase
      .from('certificates')
      .select(`
        id, created_at,
        courses ( id, title, instructor_id ),
        profiles ( full_name )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      setLoadError('Failed to load certificates — try refreshing.')
      setLoading(false)
      return
    }

    const visible = isAdmin
      ? (data ?? [])
      : (data ?? []).filter((c) => c.courses?.instructor_id === userId)

    setCerts(visible)
    setLoading(false)
  }

  async function handleIssue(cert) {
    setIssuing((prev) => new Set(prev).add(cert.id))
    setIssueErrors((prev) => {
      const n = { ...prev }
      delete n[cert.id]
      return n
    })

    const { error } = await supabase.rpc('issue_certificate', { p_cert_id: cert.id })

    if (error) {
      setIssueErrors((prev) => ({
        ...prev,
        [cert.id]: error.message ?? 'Failed to issue — please try again.',
      }))
      setIssuing((prev) => {
        const s = new Set(prev)
        s.delete(cert.id)
        return s
      })
      return
    }

    setIssued((prev) => new Set(prev).add(cert.id))
    setIssuing((prev) => {
      const s = new Set(prev)
      s.delete(cert.id)
      return s
    })
    setTimeout(() => {
      setCerts((prev) => prev.filter((c) => c.id !== cert.id))
      setIssued((prev) => {
        const s = new Set(prev)
        s.delete(cert.id)
        return s
      })
    }, 1800)
  }

  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading certification queue…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-navy">
          Certification queue
        </h1>
        <p className="mt-1 text-ink/60">
          {certs.length === 0
            ? 'No pending certificates — all caught up.'
            : `${certs.length} certificate${certs.length !== 1 ? 's' : ''} awaiting issue`}
        </p>
      </div>

      {loadError && (
        <p className="mb-6 rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">
          {loadError}
        </p>
      )}

      {certs.length === 0 ? (
        <div className="rounded-xl border border-ink/10 bg-white px-6 py-14 text-center">
          <IcoAward className="mx-auto mb-3 h-10 w-10 text-ink/15" />
          <p className="font-display text-xl font-semibold text-navy">
            All caught up
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Pending certificates will appear here when learners complete a course.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-sand text-left">
                <th className="px-5 py-3 font-semibold text-ink/60">Learner</th>
                <th className="px-5 py-3 font-semibold text-ink/60">Course</th>
                <th className="hidden px-5 py-3 font-semibold text-ink/60 sm:table-cell">
                  Requested
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {certs.map((cert) => {
                const isIssuingNow = issuing.has(cert.id)
                const justIssued = issued.has(cert.id)
                const err = issueErrors[cert.id]
                return (
                  <tr
                    key={cert.id}
                    className={`transition-colors ${justIssued ? 'bg-teal-light/30' : ''}`}
                  >
                    <td className="px-5 py-4 font-medium text-ink">
                      {cert.profiles?.full_name ?? 'Unknown learner'}
                    </td>
                    <td className="px-5 py-4 text-ink/70">
                      {cert.courses?.title ?? '—'}
                    </td>
                    <td className="hidden px-5 py-4 text-ink/50 sm:table-cell">
                      {cert.created_at
                        ? new Date(cert.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {justIssued ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-light px-3 py-1 text-xs font-semibold text-teal">
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 8l3.5 3.5L13 5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          Issued
                        </span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={() => handleIssue(cert)}
                            disabled={isIssuingNow}
                            className="rounded-lg bg-orange px-4 py-1.5 text-sm font-medium text-navy transition hover:bg-orange-dark disabled:opacity-60"
                          >
                            {isIssuingNow ? 'Issuing…' : 'Issue certificate'}
                          </button>
                          {err && <p className="text-xs text-clay">{err}</p>}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}

function IcoAward({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  )
}
