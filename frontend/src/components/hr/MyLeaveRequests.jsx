import { useFrappeGetCall } from 'frappe-react-sdk'
import { ListChecks, Undo2 } from 'lucide-react'
import StatusBadge from '../StatusBadge.jsx'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatNumber } from '../../lib/format.js'
import { confirm } from '../../lib/dialogs.js'

/** The employee's own leave requests with status; open ones can be withdrawn. */
export default function MyLeaveRequests({ onChange }) {
  const call = useCall()
  const toast = useToast()
  const { data, isLoading, mutate } = useFrappeGetCall('karya_erp.leave.my_leaves', { limit: 20 }, 'my-leaves', { revalidateOnFocus: false })
  const rows = data?.message ?? []

  async function withdraw(r) {
    if (!(await confirm({ title: 'Withdraw leave request?', message: `Withdraw your ${r.leave_type} request (${formatDate(r.from_date)})?`, confirmLabel: 'Withdraw', tone: 'danger' }))) return
    try {
      await call.post('karya_erp.leave.withdraw', { name: r.name })
      toast({ tone: 'success', title: 'Request withdrawn' })
      await mutate()
      onChange?.()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not withdraw', description: errorText(e) })
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="dt-bar"><h3 className="dt-title flex items-center gap-2"><ListChecks className="size-3.5 text-muted" />My leave requests</h3></div>
      {isLoading ? (
        <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-surface-2" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">No leave requests yet.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 px-4 py-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.leave_type} <span className="num font-normal text-muted">· {formatNumber(r.total_leave_days, r.total_leave_days % 1 ? 1 : 0)} day{Number(r.total_leave_days) === 1 ? '' : 's'}</span></p>
                <p className="num truncate text-[11px] text-muted">
                  {formatDate(r.from_date)}{r.to_date !== r.from_date && ` → ${formatDate(r.to_date)}`}
                  {r.status === 'Open' && r.leave_approver_name && ` · with ${r.leave_approver_name}`}
                </p>
              </div>
              <StatusBadge status={r.docstatus === 2 ? 'Cancelled' : r.status} />
              {r.can_withdraw && (
                <button type="button" onClick={() => withdraw(r)} title="Withdraw" aria-label={`Withdraw ${r.name}`} className="pressable grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger">
                  <Undo2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
