import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Calculator, Info, Send } from 'lucide-react'
import Button from '../../components/Button.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import LinkField from '../../components/fields/LinkField.jsx'
import { useToast } from '../../app/toast-context.js'
import { useCall } from '../../lib/useCall.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney, formatNumber } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'
import { confirm } from '../../lib/dialogs.js'

function Row({ label, value, sub, strong, muted }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5 text-xs', strong && 'border-t pt-2.5 text-sm font-semibold', muted && 'text-muted')}>
      <span>{label}{sub && <span className="block text-[11px] font-normal text-muted">{sub}</span>}</span>
      <span className="num shrink-0">{value}</span>
    </div>
  )
}

/**
 * UAE end-of-service gratuity + unused leave encashment for a leaving employee, with the breakdown;
 * "Add to final payroll" books both as Additional Salary on the relieving date.
 */
export default function FinalSettlement() {
  const call = useCall()
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const employee = sp.get('employee') || ''
  const [inputs, setInputs] = useState({ relieving_date: '', basic: '', total_wage: '', leave_days: '' })
  const args = employee ? { employee, ...Object.fromEntries(Object.entries(inputs).filter(([, v]) => v !== '')) } : undefined
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.settlement.calculate', args, args ? `settlement:${JSON.stringify(args)}` : null, { revalidateOnFocus: false })
  const r = data?.message
  const cur = r?.currency
  const money = (v) => formatMoney(v ?? 0, cur)
  const [busy, setBusy] = useState(false)
  const done = (r?.already_added ?? []).length > 0

  const pick = (v) => { setSp(v ? { employee: v } : {}); setInputs({ relieving_date: '', basic: '', total_wage: '', leave_days: '' }) }
  const set = (k) => (e) => setInputs((x) => ({ ...x, [k]: e.target.value }))

  async function book() {
    if (!(await confirm({ title: 'Add to final payroll?', message: `Add ${money(r.gratuity.amount)} gratuity and ${money(r.leave.amount)} leave encashment to ${r.employee_name}'s final payroll (${formatDate(r.relieving_date)})?`, confirmLabel: 'Add to payroll' }))) return
    setBusy(true)
    try {
      const res = await call.post('karya_erp.settlement.add_to_payroll', {
        employee, relieving_date: r.relieving_date, gratuity: r.gratuity.amount, leave_encashment: r.leave.amount, save_relieving_date: 1,
        note: `Final settlement: ${formatNumber(r.years, 2)} yrs service, basic ${r.basic}, ${r.leave.days} leave days.`,
      })
      toast({ tone: 'success', title: 'Added to final payroll', description: (res?.message?.created ?? []).join(', ') || 'Nothing to add' })
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not add to payroll', description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Final settlement" subtitle="UAE end-of-service gratuity and leave encashment" />

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1.5 lg:col-span-2">
          <span className="label">Employee</span>
          <LinkField doctype="Employee" value={employee} onChange={pick} placeholder="Choose employee…" />
        </label>
        <label className="space-y-1.5"><span className="label">Last working day</span><input type="date" value={inputs.relieving_date || r?.relieving_date || ''} onChange={set('relieving_date')} className="input" disabled={!employee} /></label>
        <label className="space-y-1.5"><span className="label">Monthly basic</span><input type="number" step="0.01" value={inputs.basic} placeholder={r ? String(r.basic) : ''} onChange={set('basic')} className="input num" disabled={!employee} /></label>
        <label className="space-y-1.5"><span className="label">Monthly total wage</span><input type="number" step="0.01" value={inputs.total_wage} placeholder={r ? String(r.total_wage) : ''} onChange={set('total_wage')} className="input num" disabled={!employee} /></label>
      </div>

      {!employee ? (
        <div className="card p-8 text-center text-xs text-muted"><Calculator className="mx-auto mb-2 size-6 text-muted/60" />Choose an employee to calculate their final settlement.</div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error)}</div>
      ) : isLoading || !r ? <div className="card h-64 animate-pulse" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h3 className="mb-2 text-xs font-semibold text-muted">Service</h3>
            <Row label="Joined" value={formatDate(r.date_of_joining)} />
            <Row label="Last working day" value={formatDate(r.relieving_date)} sub={r.saved_relieving_date && r.saved_relieving_date !== r.relieving_date ? `Employee record says ${formatDate(r.saved_relieving_date)}` : undefined} />
            <Row label="Calendar days" value={formatNumber(r.calendar_days)} />
            <Row label="Unpaid leave (not counted)" value={`− ${formatNumber(r.unpaid_days, 1)}`} muted />
            <Row label="Service" value={`${formatNumber(r.years, 2)} years`} sub={`${formatNumber(r.service_days, 1)} days ÷ 365`} strong />

            <h3 className="mb-2 mt-5 text-xs font-semibold text-muted">Gratuity</h3>
            {!r.eligible ? (
              <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Less than one year of continuous service — no gratuity is due.</p>
            ) : (
              <>
                <Row label="Daily basic" value={money(r.daily_basic)} sub={`${money(r.basic)} ÷ 30${r.wages_from_slip ? ` · from ${r.wages_from_slip}` : ''}`} />
                <Row label={`First ${formatNumber(r.gratuity.first_years, 2)} years × 21 days`} value={money(r.daily_basic * r.gratuity.days_first)} sub={`${formatNumber(r.gratuity.days_first, 1)} days`} />
                {r.gratuity.beyond_years > 0 && <Row label={`Next ${formatNumber(r.gratuity.beyond_years, 2)} years × 30 days`} value={money(r.daily_basic * r.gratuity.days_beyond)} sub={`${formatNumber(r.gratuity.days_beyond, 1)} days`} />}
                {r.gratuity.capped && <Row label="Capped at 2 years' total wage" value={money(r.gratuity.cap)} muted />}
                <Row label="Gratuity" value={money(r.gratuity.amount)} strong />
              </>
            )}
            {!r.basic && <p className="mt-2 text-[11px] text-danger">No basic salary found on a full-month salary slip — enter the monthly basic above.</p>}
          </section>

          <section className="card p-4">
            <h3 className="mb-2 text-xs font-semibold text-muted">Unused leave</h3>
            {r.leave.balances.length === 0 ? <p className="text-xs text-muted">No leave allocated for this period.</p> : r.leave.balances.map((b) => (
              <Row key={b.leave_type} label={b.leave_type} value={`${formatNumber(b.balance, 1)} days`} sub={b.encash ? 'encashed' : 'not encashed'} muted={!b.encash} />
            ))}
            <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span>Days to encash</span>
              <input type="number" step="0.5" min="0" value={inputs.leave_days} placeholder={String(r.leave.days)} onChange={set('leave_days')} className="input num h-8 w-24 text-end" />
            </label>
            <Row label="Leave encashment" value={money(r.leave.amount)} sub={`${formatNumber(r.leave.days, 1)} × ${money(r.daily_basic)}`} strong />

            <div className="mt-5 rounded-lg border-2 border-foreground/80 p-3">
              <Row label="Total to pay with the final salary" value={money(r.total)} strong />
              <p className="text-[11px] text-muted">Plus the last month's salary (pro-rated on the 30-day basis by the normal payroll run).</p>
            </div>

            {r.advances.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-1 text-xs font-semibold text-muted">Outstanding advances</h3>
                {r.advances.map((a) => <Row key={a.name} label={<Link to={`/employee-advances/${encodeURIComponent(a.name)}`} className="text-primary hover:underline">{a.purpose || a.name}</Link>} value={`− ${money(a.outstanding)}`} />)}
                <p className="mt-1 text-[11px] text-muted">Recover these via a deduction (Additional Salary) or a return entry on the advance.</p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {done ? (
                <p className="me-auto text-[11px] text-muted">Already added: {r.already_added.map((a) => <Link key={a.name} to={`/additional-salary/${encodeURIComponent(a.name)}`} className="text-primary hover:underline"> {a.salary_component} {money(a.amount)}</Link>)}</p>
              ) : (
                <p className="me-auto flex items-start gap-1.5 text-[11px] text-muted"><Info className="mt-px size-3 shrink-0" />Creates Additional Salary on the last working day; it is paid on that month's payroll and WPS file.</p>
              )}
              <Button variant="primary" icon={Send} onClick={book} loading={busy} disabled={done || r.total <= 0}>Add to final payroll</Button>
            </div>
          </section>
        </div>
      )}
      <p className="text-[11px] text-muted">UAE Federal Decree-Law No. 33 of 2021 (private sector): 21 days' basic per year for the first 5 years, 30 days per year after, pro-rata after the first year, unpaid leave excluded, capped at 2 years' wages. Check special cases (e.g. free zones such as DIFC, which use a separate savings scheme) with your legal adviser.</p>
    </>
  )
}
