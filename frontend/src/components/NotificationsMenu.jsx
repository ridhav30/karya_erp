import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Bell, CheckCheck, CheckSquare, ChevronRight } from 'lucide-react'
import { useCall } from '../lib/useCall.js'
import { useDashboard } from '../lib/useDashboard.js'
import { docRoute } from '../lib/docRoute.js'
import { useBoot } from '../app/boot-context.js'
import { ago, plainText } from '../lib/activity.js'
import { cn } from '../lib/utils.js'

/** Bell: Frappe notification log (assignments, mentions, alerts, shares) + pending approvals. */
export default function NotificationsMenu() {
  const boot = useBoot()
  const call = useCall()
  const navigate = useNavigate()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const { data: counts } = useDashboard()
  const pending = counts?.pending_approvals ?? 0
  const { data, mutate } = useFrappeGetCall(
    'frappe.desk.doctype.notification_log.notification_log.get_notification_logs', { limit: 20 }, 'notifications',
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )
  const logs = data?.message?.notification_logs ?? []
  const unread = logs.filter((n) => !Number(n.read)).length
  const badge = unread + pending

  useEffect(() => {
    if (!open) return
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])

  async function openLog(n) {
    setOpen(false)
    if (!Number(n.read)) {
      try { await call.post('frappe.desk.doctype.notification_log.notification_log.mark_as_read', { docname: n.name }) } catch { /* ignore */ }
      mutate()
    }
    const route = n.document_name ? docRoute(boot, n.document_type, n.document_name) : null // nothing happens when the document is not one this person can open
    if (route) navigate(route)
  }
  async function readAll() {
    try { await call.post('frappe.desk.doctype.notification_log.notification_log.mark_all_as_read') } catch { /* ignore */ }
    mutate()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-label="Notifications" aria-expanded={open} title="Notifications"
        className="pressable relative grid size-8 place-items-center rounded-md border border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="size-4" />
        {badge > 0 && (
          <span className="num absolute -end-0.5 -top-0.5 min-w-4 animate-pop-in rounded bg-danger px-1 text-center text-[9px] font-semibold leading-4 text-white">{badge > 9 ? '9+' : badge}</span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] animate-pop-in overflow-hidden rounded-lg border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold">Notifications</span>
            {unread > 0 && <button type="button" onClick={readAll} className="flex items-center gap-1 text-[11px] text-primary hover:underline"><CheckCheck className="size-3" />Mark all read</button>}
          </div>
          {pending > 0 && (
            <Link to="/approvals" onClick={() => setOpen(false)} className="flex items-center gap-2.5 border-b bg-amber-50/60 px-3 py-2.5 text-xs hover:bg-amber-50 dark:bg-amber-950/20">
              <CheckSquare className="size-4 shrink-0 text-amber-600" />
              <span className="flex-1"><b>{pending}</b> waiting for your approval</span>
              <ChevronRight className="size-3.5 text-muted" />
            </Link>
          )}
          <ul className="max-h-96 divide-y overflow-y-auto">
            {logs.length === 0 && <li className="px-3 py-8 text-center text-xs text-muted">No notifications.</li>}
            {logs.map((n) => (
              <li key={n.name}>
                <button type="button" onClick={() => openLog(n)} className={cn('flex w-full items-start gap-2.5 px-3 py-2.5 text-start text-xs hover:bg-surface-2/60', !Number(n.read) && 'bg-primary-soft/30')}>
                  <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', Number(n.read) ? 'bg-transparent' : 'bg-primary')} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{plainText(n.subject)}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{n.document_type ? `${n.document_type} · ` : ''}{ago(n.creation)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
