import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import NotificationBell from './NotificationBell'

// Learner-facing top navigation bar.
// Active link is derived from the current URL so every page using this
// component just drops it in — no active prop needed.

const NAV_LINKS = [
  { label: 'Home',     to: '/dashboard', match: (p) => p === '/dashboard' },
  { label: 'Courses',  to: '/courses',   match: (p) => p === '/courses' },
  { label: 'Library',  to: '/courses',   match: ()  => false },
  { label: 'Progress', to: '/progress',  match: (p) => p === '/progress' },
  { label: 'Jobs',     to: '/jobs',      match: (p) => p === '/jobs' },
]

export default function TopNav() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef(null)

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '?'

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return
    function handler(e) {
      if (dropRef.current?.contains(e.target)) return
      setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropOpen])

  async function handleSignOut() {
    setDropOpen(false)
    await signOut()
    navigate('/login')
  }

  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4 px-6 py-3">

        {/* Left: logo + divider + "Learn" wordmark */}
        <div className="flex shrink-0 items-center gap-3">
          <Link to="/dashboard">
            <img src="/efac-logo.svg" alt="EFAC" className="h-8" />
          </Link>
          <span className="h-5 w-px bg-line" aria-hidden="true" />
          <span className="text-[14px] font-extrabold text-ink">Learn</span>
        </div>

        {/* Centre: nav links */}
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main navigation">
          {NAV_LINKS.map(({ label, to, match }) => {
            const active = match(pathname)
            return (
              <Link
                key={label}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'border-b-2 border-orange px-3 pb-[5px] pt-[7px] text-[14px] font-extrabold text-ink'
                    : 'rounded-[8px] px-3 py-[7px] text-[14px] font-semibold text-muted transition-colors hover:text-ink'
                }
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Right: search pill + bell + avatar */}
        <div className="flex shrink-0 items-center gap-3">

          {/* Search pill — links to the courses catalog */}
          <Link
            to="/courses"
            className="hidden items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-[13px] text-muted transition-colors hover:border-orange/40 sm:flex"
            aria-label="Search courses"
          >
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="7"
                cy="7"
                r="4.5"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M11 11l2.5 2.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            <span>Search…</span>
          </Link>

          <NotificationBell />

          {/* Avatar + dropdown */}
          <div className="relative" ref={dropRef}>
            <button
              type="button"
              onClick={() => setDropOpen((o) => !o)}
              className="shrink-0 overflow-hidden rounded-full transition-opacity hover:opacity-85 focus:outline-none"
              aria-label="Account menu"
              aria-expanded={dropOpen}
            >
              <Avatar
                url={profile?.avatar_url}
                name={profile?.full_name}
                className="h-[34px] w-[34px] text-[13px] font-extrabold"
              />
            </button>

            {dropOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-[14px] border border-line bg-card shadow-frame">
                <div className="border-b border-line px-4 py-3">
                  <p className="text-[14px] font-semibold leading-tight text-ink">
                    {profile?.full_name}
                  </p>
                  <p className="mt-0.5 text-[12px] capitalize text-muted">
                    {profile?.role}
                  </p>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setDropOpen(false)}
                  className="block px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-paper"
                >
                  My profile
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-4 py-2.5 text-left text-[14px] font-semibold text-ink transition-colors hover:bg-paper"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  )
}
