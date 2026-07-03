import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import NotificationBell from './NotificationBell'

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4 px-6 py-3">
          <Link to="/dashboard">
            <img src="/efac-logo.svg" alt="EFAC" className="h-8" />
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/dashboard" className="text-[14px] font-semibold text-ink/70 hover:text-teal">
              Dashboard
            </Link>
            <Link to="/jobs" className="text-[14px] font-semibold text-ink/70 hover:text-teal">
              Jobs
            </Link>
            {(profile?.role === 'admin' || profile?.role === 'instructor') && (
              <Link
                to="/admin/jobs"
                className="text-[14px] font-semibold text-ink/70 hover:text-teal"
              >
                Post jobs
              </Link>
            )}
            {(profile?.role === 'admin' || profile?.role === 'instructor') && (
              <Link
                to="/admin/reports"
                className="text-[14px] font-semibold text-ink/70 hover:text-teal"
              >
                Reports
              </Link>
            )}
            {profile?.role === 'admin' && (
              <Link
                to="/admin"
                className="text-[14px] font-semibold text-ink/70 hover:text-teal"
              >
                Admin
              </Link>
            )}
            {profile && (
              <span className="rounded-full bg-orange-tint px-3 py-1 text-xs font-semibold text-ink capitalize">
                {profile.role}
              </span>
            )}
            {profile && <NotificationBell />}
            <button
              onClick={handleSignOut}
              className="text-[14px] font-semibold text-ink/70 hover:text-red"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] px-6 py-8">{children}</main>
    </div>
  )
}
