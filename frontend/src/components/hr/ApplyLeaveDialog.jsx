import { useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Plane, Send } from 'lucide-react'
import Button from '../Button.jsx'
import Modal from '../Modal.jsx'
import Combobox from '../fields/Combobox.jsx'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { formatNumber } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

const todayIso = () => new Date().toLocaleDateString('en-CA')

/** Employee applies for leave: type, dates, half day, reason — with a live working-days and balance preview. */
export default function ApplyLeaveDialog({ open, onClose, onDone, initialType }) {
  const call = useCall()
  const toast = useToast()
  const [f, setF] = useState(() => ({ leave_type: initialType ?? '', from_date: todayIso(), to_date: todayIso(), half_day: 0, half_day_date: '', reason: '' }))
  const [busy, setBusy] = useState(false)
  const { data: typesRes } = useFrappeGetCall('karya_erp.leave.leave_types', undefined, open ? 'leave-types' : null, { revalidateOnFocus: false })
  const types = typesRes?.message ?? []

  const ready = f.leave_type && f.from_date && f.to_date
  const previewArgs = ready ? {
    leave_type: f.leave_type, from_date: f.from_date, to_date: f.to_date, half_day: f.half_day,
    ...(f.half_day ? { half_day_date: f.half_day_date || f.from_date } : {}),
  } : undefined
  const { data: pv, isLoading: pvLoading } = useFrappeGetCall('karya_erp.leave.preview', previewArgs, open && ready ? `leave-preview:${JSON.stringify(previewArgs)}` : null, { revalidateOnFocus: false })
  const p = pv?.message
  const after = p && p.balance != null ? p.balance - p.days : null
  const multiDay = f.from_date && f.to_date && f.from_date !== f.to_date


  if (!open) return null
  const set = (patch) => setF((x) => {
    const n = { ...x, ...patch }
    if (n.to_date < n.from_date) n.to_date = n.from_date
    return n
  })

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      const res = await call.post('karya_erp.leave.apply', {
        leave_type: f.leave_type, from_date: f.from_date, to_date: f.to_date, reason: f.reason || undefined,
        half_day: f.half_day, ...(f.half_day ? { half_day_date: f.half_day_date || f.from_date } : {}),
      })
      toast({ tone: 'success', title: 'Leave requested', description: `${res?.message?.name} · sent to ${p?.approver_name || 'your approver'}` })
      onDone?.()
      onClose()
    } catch (err) {
      toast({ tone: 'error', title: 'Could not apply for leave', description: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal as="form" onSubmit={submit} size="max-w-3xl" icon={Plane} tone="blue" title="Apply for leave" subtitle="Goes to your leave approver"
      onClose={() => !busy && onClose()} bodyClassName="space-y-3.5"
      footer={<>
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!ready || (p && p.days <= 0)}>Request leave</Button>
      </>}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_1fr]">
          <label className="block space-y-1.5">
            <span className="label">Leave type <span className="text-danger">*</span></span>
            <Combobox
              options={types.map((t) => ({ value: t.name, label: t.name, sublabel: t.is_lwp ? 'Unpaid' : t.allocated ? undefined : 'No allocation' }))}
              value={f.leave_type} onChange={(v) => set({ leave_type: v })} placeholder="Choose leave type…" autoFocus
              emptyText="No leave allocated to you yet — ask HR."
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="label">From <span className="text-danger">*</span></span>
              <input type="date" value={f.from_date} onChange={(e) => set({ from_date: e.target.value })} className="input" required />
            </label>
            <label className="block space-y-1.5">
              <span className="label">To <span className="text-danger">*</span></span>
              <input type="date" value={f.to_date} min={f.from_date} onChange={(e) => set({ to_date: e.target.value })} className="input" required />
            </label>
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-9 items-center gap-2 text-xs">
              <input type="checkbox" checked={Boolean(f.half_day)} onChange={(e) => set({ half_day: e.target.checked ? 1 : 0 })} className="size-4 accent-[var(--primary)]" />
              Half day
            </label>
            {Boolean(f.half_day) && multiDay && (
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted">on</span>
                <input type="date" value={f.half_day_date || f.from_date} min={f.from_date} max={f.to_date} onChange={(e) => set({ half_day_date: e.target.value })} className="input h-8 w-auto" />
              </label>
            )}
          </div>
          <label className="block space-y-1.5">
            <span className="label">Reason</span>
            <textarea rows={3} value={f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Optional note for your approver" className="input h-auto resize-none py-2" />
          </label>

          {/* Live preview */}
          <div className={cn('grid grid-cols-3 gap-2 rounded-lg border bg-surface p-3 text-center dark:bg-zinc-900', pvLoading && 'opacity-60')}>
            <div><p className="num text-base font-semibold">{p ? formatNumber(p.days, p.days % 1 ? 1 : 0) : '—'}</p><p className="text-[11px] text-muted">working days</p></div>
            <div><p className="num text-base font-semibold">{p?.balance != null ? formatNumber(p.balance, 1) : p?.is_lwp ? 'Unpaid' : '—'}</p><p className="text-[11px] text-muted">balance now</p></div>
            <div><p className={cn('num text-base font-semibold', after != null && after < 0 && 'text-danger')}>{after != null ? formatNumber(after, 1) : '—'}</p><p className="text-[11px] text-muted">after this</p></div>
          </div>
          {p?.error && <p className="text-xs text-danger">{p.error}</p>}
          {p && <p className="text-[11px] text-muted">Goes to <b className="text-foreground">{p.approver_name || 'HR'}</b> for approval.</p>}
    </Modal>
  )
}
