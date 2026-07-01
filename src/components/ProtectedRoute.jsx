import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Wrap any page that requires a login. Pass `roles` to restrict to certain roles,
// e.g. <ProtectedRoute roles={['instructor', 'admin']}>.
export default function ProtectedRoute({ children, roles }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-teal">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
