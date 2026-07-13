import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── tuneable constants ────────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000   // 15 minutes — sign out after this
export const WARN_BEFORE_MS  =  1 * 60 * 1000   // 1 minute  — show warning this early

const THROTTLE_MS = 4_000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Tracks user activity and signs them out after IDLE_TIMEOUT_MS of inactivity.
 * Shows a warning WARN_BEFORE_MS before the timeout fires.
 *
 * Only active while isSignedIn is true. Cleans up all timers and listeners
 * on sign-out or unmount.
 *
 * Returns { showWarning, staySignedIn } where staySignedIn() resets the clock.
 */
export function useIdleTimeout(isSignedIn) {
  const [showWarning, setShowWarning] = useState(false)
  const navigate = useNavigate()

  const lastActivity = useRef(Date.now())
  const warnTimer    = useRef(null)
  const logoutTimer  = useRef(null)
  const throttle     = useRef(null)

  // Mirror isSignedIn in a ref so event callbacks always see the current value
  // without being re-created on every auth state change.
  const signedInRef = useRef(isSignedIn)
  useEffect(() => { signedInRef.current = isSignedIn }, [isSignedIn])

  const clearTimers = useCallback(() => {
    clearTimeout(warnTimer.current)
    clearTimeout(logoutTimer.current)
  }, [])

  const doLogout = useCallback(async () => {
    clearTimers()
    setShowWarning(false)
    await supabase.auth.signOut()
    navigate('/login?reason=timeout', { replace: true })
  }, [clearTimers, navigate])

  const resetTimer = useCallback(() => {
    lastActivity.current = Date.now()
    setShowWarning(false)
    clearTimers()
    warnTimer.current   = setTimeout(() => setShowWarning(true), IDLE_TIMEOUT_MS - WARN_BEFORE_MS)
    logoutTimer.current = setTimeout(doLogout, IDLE_TIMEOUT_MS)
  }, [clearTimers, doLogout])

  // Throttled: at most one reset per THROTTLE_MS regardless of event volume.
  const onActivity = useCallback(() => {
    if (!signedInRef.current || throttle.current) return
    throttle.current = setTimeout(() => { throttle.current = null }, THROTTLE_MS)
    resetTimer()
  }, [resetTimer])

  // When the tab becomes visible again, check if the timeout already elapsed
  // while the tab was in the background.
  const onVisibility = useCallback(() => {
    if (document.hidden || !signedInRef.current) return
    if (Date.now() - lastActivity.current >= IDLE_TIMEOUT_MS) doLogout()
  }, [doLogout])

  useEffect(() => {
    if (!isSignedIn) {
      clearTimers()
      setShowWarning(false)
      clearTimeout(throttle.current)
      throttle.current = null
      return
    }

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    resetTimer()

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimers()
      clearTimeout(throttle.current)
      throttle.current = null
    }
  }, [isSignedIn, onActivity, onVisibility, resetTimer, clearTimers])

  return { showWarning, staySignedIn: resetTimer }
}
