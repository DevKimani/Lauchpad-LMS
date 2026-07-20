import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  BarChart2,
  Briefcase,
  Award,
  UserPlus,
  MessageSquare,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import NotificationBell from './NotificationBell'

// ── Nav definitions ───────────────────────────────────────────────────────────

const ADMIN_NAV = [
  {
    group: 'Platform',
    items: [
      { label: 'Overview',       to: '/admin',                     icon: LayoutDashboard, exact: true },
      { label: 'Users',          to: '/admin/users',               icon: Users },
      { label: 'Courses',        to: '/admin/courses',             icon: BookOpen },
    ],
  },
  {
    group: 'Content',
    items: [
      { label: 'Jobs',           to: '/admin/jobs',                icon: Briefcase },
      { label: 'Invitations',    to: '/admin/users',               icon: UserPlus },
    ],
  },
  {
    group: 'Tools',
    items: [
      { label: 'Reports',        to: '/admin/reports',             icon: BarChart2 },
      { label: 'Certifications', to: '/instructor/certifications', icon: Award },
    ],
  },
]

const INSTRUCTOR_NAV = [
  {
    group: 'Teaching',
    items: [
      { label: 'Dashboard',         to: '/dashboard',                 icon: LayoutDashboard, exact: true },
      { label: 'My Courses',        to: '/instructor/courses',        icon: BookOpen },
      { label: 'Roster & Feedback', to: '/instructor/feedback',       icon: MessageSquare },
      { label: 'Certifications',    to: '/instructor/certifications', icon: Award },
    ],
  },
  {
    group: 'Job Board',
    items: [
      { label: 'Jobs',              to: '/admin/jobs',                icon: Briefcase },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isActive(pathname, to, exact) {
  if (exact) return pathname === to
  return pathname === to || pathname.startsWith(to + '/')
}

// Auto-generate a two-level breadcrumb from the pathname.
function buildBreadcrumb(pathname, role) {
  const root = role === 'admin'
    ? { label: 'Admin', to: '/admin' }
    : { label: 'Instructor', to: '/dashboard' }

  if (pathname === root.to) return [root]

  const nav = role === 'admin' ? ADMIN_NAV : INSTRUCTOR_NAV
  for (const group of nav) {
    for (const item of group.items) {
      if (!item.exact && pathname.startsWith(item.to + '/')) {
        return [root, { label: item.label, to: item.to }]
      }
    }
  }
  return [root]
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({ item, pathname, onClick }) {
  const { label, to, icon: Icon, exact } = item
  const active = isActive(pathname, to, exact)

  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`
        group flex items-center gap-3 border-l-[3px] px-4 py-2.5
        text-[13.5px] font-semibold transition-colors
        ${active
          ? 'border-orange bg-white/[0.08] text-white'
          : 'border-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/90'}
      `}
    >
      <Icon
        size={15}
        strokeWidth={active ? 2.25 : 1.75}
        className="shrink-0"
        aria-hidden="true"
      />
      {label}
    </Link>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ navGroups, profile, onClose, onSignOut }) {
  const { pathname } = useLocation()

  return (
    <div
      className="flex h-full w-[240px] shrink-0 flex-col"
      style={{ background: '#03071e' }}
    >
      {/* Logo row */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-5">
        <Link to="/dashboard" onClick={onClose} className="flex-1">
          <img
            src="/efac-logo-white.svg"
            alt="EFAC"
            className="h-7 max-w-[120px]"
            onError={(e) => {
              // Fall back to the standard logo if the white variant is missing
              e.currentTarget.src = '/efac-logo.svg'
            }}
          />
        </Link>
        {/* Close button — visible only on mobile */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="rounded-lg p-1.5 text-white/30 transition-colors hover:text-white lg:hidden"
        >
          <X size={17} strokeWidth={2} />
        </button>
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 overflow-y-auto py-5" aria-label="Console navigation">
        {navGroups.map((group) => (
          <div key={group.group} className="mb-5">
            <p className="mb-1.5 px-5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/25">
              {group.group}
            </p>
            {group.items.map((item) => (
              <NavItem
                key={item.label}
                item={item}
                pathname={pathname}
                onClick={onClose}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom: user identity + sign-out */}
      <div className="shrink-0 border-t border-white/[0.07] p-4">
        <div className="flex items-center gap-3">
          <Avatar
            url={profile?.avatar_url}
            name={profile?.full_name}
            className="h-9 w-9 shrink-0 text-[12px] font-extrabold"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-snug text-white">
              {profile?.full_name ?? '—'}
            </p>
            <p className="text-[11px] capitalize text-white/40">{profile?.role}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="shrink-0 rounded-lg p-1.5 text-white/30 transition-colors hover:text-white/90"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ConsoleLayout ─────────────────────────────────────────────────────────────

/**
 * Full-page shell for admin and instructor pages.
 *
 * Usage:
 *   <ConsoleLayout title="Users">
 *     <YourPageContent />
 *   </ConsoleLayout>
 *
 * Learners who reach a console page are redirected to /dashboard.
 * Sidebar collapses to an off-canvas drawer below the lg breakpoint (1024 px).
 */
export default function ConsoleLayout({ title, children }) {
  const { profile, loading, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const backdropRef = useRef(null)

  // Redirect learners away — wait until auth has resolved before redirecting
  // so we don't bounce someone whose profile is still loading.
  useEffect(() => {
    if (!loading && profile?.role === 'learner') {
      navigate('/dashboard', { replace: true })
    }
  }, [loading, profile, navigate])

  // Escape key closes the mobile drawer
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Close drawer when the route changes (user tapped a nav link)
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const navGroups =
    profile?.role === 'admin'
      ? ADMIN_NAV
      : profile?.role === 'instructor'
      ? INSTRUCTOR_NAV
      : []

  const breadcrumbs = profile ? buildBreadcrumb(pathname, profile.role) : []

  // ── Loading splash ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper">
        <div className="h-8 w-8 animate-pulse rounded-full bg-orange/30" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Mobile backdrop ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      {/*
          Mobile:  position:fixed, slides in/out with a CSS transform.
          Desktop: position:relative (in the flex flow), always visible.
          The transition is CSS-only so it stays smooth even at low FPS.
      */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 transition-transform duration-200
          lg:relative lg:z-auto lg:flex lg:translate-x-0
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-label="Site navigation"
      >
        <Sidebar
          navGroups={navGroups}
          profile={profile}
          onClose={() => setDrawerOpen(false)}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-paper">

        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-card px-4 sm:px-6">

          {/* Hamburger — only rendered on mobile */}
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="console-sidebar"
            onClick={() => setDrawerOpen(true)}
            className="shrink-0 rounded-lg p-1.5 text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink lg:hidden"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          {/* Title + breadcrumb */}
          <div className="min-w-0 flex-1">
            {breadcrumbs.length > 1 && (
              <p className="flex items-center gap-1 text-[11px] text-ink/40">
                {breadcrumbs.slice(0, -1).map((crumb, i) => (
                  <span key={crumb.to} className="flex items-center gap-1">
                    {i > 0 && <span aria-hidden="true">/</span>}
                    <Link
                      to={crumb.to}
                      className="hover:text-teal hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <h1 className="truncate font-display text-[19px] font-semibold leading-tight text-navy">
              {title}
            </h1>
          </div>

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-[900px]">
            {children}
          </div>
        </main>

      </div>
    </div>
  )
}
