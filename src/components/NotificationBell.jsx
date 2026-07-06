import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function NotificationBell() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const navigate = useNavigate()
  const location = useLocation()

  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)

  const panelRef = useRef(null)
  const btnRef = useRef(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  // ── Fetch on mount + realtime subscription ─────────────────────────────────
  useEffect(() => {
    if (!userId) return

    // Initial fetch
    supabase
      .from('notifications')
      .select('id, type, title, body, link, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications(data ?? []))

    // Live subscription — prepends new notifications as they arrive
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev].slice(0, 20))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (
        panelRef.current?.contains(e.target) ||
        btnRef.current?.contains(e.target)
      )
        return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Actions ─────────────────────────────────────────────────────────────────
  function handleClick(notif) {
    // 1. Mark read (optimistic + fire-and-forget DB write)
    if (!notif.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      )
      supabase.from('notifications').update({ read: true }).eq('id', notif.id)
    }

    // 2. Close panel
    setOpen(false)

    // 3. Navigate — guard against missing link
    const link = notif.link
    if (!link) return
    if (link.startsWith('http')) {
      window.open(link, '_blank', 'noreferrer')
      return
    }
    // replace:true when already on the same route so navigate() still fires
    // (otherwise RR6 treats it as a no-op and data never refreshes)
    navigate(link, { replace: location.pathname === link })
  }

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id)
    if (!ids.length) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    await supabase.from('notifications').update({ read: true }).in('id', ids)
  }

  if (!userId) return null

  return (
    <div className="relative">
      {/* ── Bell button ──────────────────────────────────────────────────── */}
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <Bell size={18} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange px-1 text-[10px] font-bold leading-none text-navy"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ───────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink/5 px-4 py-3">
            <span className="text-sm font-semibold text-navy">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-teal hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell
                size={28}
                strokeWidth={1.25}
                className="mx-auto mb-2 text-ink/20"
              />
              <p className="text-sm text-ink/40">No notifications yet</p>
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-ink/5 overflow-y-auto">
              {notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => handleClick(notif)}
                    className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-sand ${
                      notif.read ? 'bg-white' : 'bg-orange-light/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Unread dot */}
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                          notif.read ? 'bg-transparent' : 'bg-orange'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm leading-snug ${
                              notif.read
                                ? 'font-medium text-ink'
                                : 'font-semibold text-navy'
                            }`}
                          >
                            {notif.title}
                          </p>
                          <span className="shrink-0 pt-px text-[11px] tabular-nums text-ink/35">
                            {timeAgo(notif.created_at)}
                          </span>
                        </div>
                        {notif.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink/55">
                            {notif.body}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Relative time helper ──────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}
