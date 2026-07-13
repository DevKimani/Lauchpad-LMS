import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useIdleTimeout, WARN_BEFORE_MS } from '../hooks/useIdleTimeout'

const AuthContext = createContext(null)

const WARN_MINUTES = Math.round(WARN_BEFORE_MS / 60_000)

function IdleWarningBanner({ onStay }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-4 rounded-xl border border-orange/30 bg-orange-tint px-5 py-4 shadow-lg">
        <p className="text-sm font-medium text-ink">
          You'll be signed out in{' '}
          <strong>{WARN_MINUTES} minute{WARN_MINUTES !== 1 ? 's' : ''}</strong> due to
          inactivity.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="shrink-0 rounded-lg bg-orange px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-orange-dark"
        >
          Stay signed in
        </button>
      </div>
    </div>
  )
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null) // holds the user's role + name
  const [loading, setLoading] = useState(true)

  // Fire at most once per app load — records today as an active day for the learner.
  const activityFiredRef = useRef(false)
  function recordActivityDay(userId) {
    if (activityFiredRef.current) return
    activityFiredRef.current = true
    supabase
      .from('activity_days')
      .upsert({ learner_id: userId }, { onConflict: 'learner_id,day', ignoreDuplicates: true })
      .then()
      .catch(() => {})
  }

  // Load the profile row (which carries the role) for a signed-in user.
  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('Could not load profile:', error.message)
      setProfile(null)
    } else {
      setProfile(data)
    }
  }

  useEffect(() => {
    // Get the current session on first load.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        recordActivityDay(session.user.id)
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Keep state in sync as the user logs in / out.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        recordActivityDay(session.user.id) // no-op after first call thanks to ref
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signUp({ email, password, fullName, efacId }) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, efac_id: efacId } },
    })
  }

  function signIn({ email, password }) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  function signOut() {
    return supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user.id)
  }

  const { showWarning, staySignedIn } = useIdleTimeout(!!session)

  const value = { session, profile, loading, signUp, signIn, signOut, refreshProfile }
  return (
    <AuthContext.Provider value={value}>
      {children}
      {showWarning && <IdleWarningBanner onStay={staySignedIn} />}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
