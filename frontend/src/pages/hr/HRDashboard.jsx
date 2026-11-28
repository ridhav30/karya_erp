import Link from '../../components/AccessLink.jsx'
import { useState } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import { AlertTriangle, Cake, ShieldAlert, CalendarCheck, FileBadge, LogIn, LogOut, Plane, Trophy, Users } from 'lucide-react'
import Button from '../../components/Button.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import GroupedBars from '../../components/charts/GroupedBars.jsx'
import { useBoot } from '../../app/boot-context.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatNumber } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

function Kpi({ label, value, sub, icon: Icon, to, tone = 'bg-primary-soft text-primary' }) {
  const body = (
    <div className="card flex items-start justify-between gap-3 p-4 transition-colors hover:border-gray-300 dark:hover:border-zinc-600">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="num mt-1.5 text-lg font-semibold">{value}</p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
      </div>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', tone)}><Icon className="size-4" /></span>
    </div>
  )
  return to ? <Link fallback="text" to={to}>{body}</Link> : body
}

function Card({ title, icon: Icon, action, children, className }) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      <div className="dt-bar"><h3 className="dt-title flex items-center gap-2">{Icon && <Icon className="size-3.5 text-muted" />}{title}</h3>{action}</div>
      {children}
    </section>
  )
}

/** Employee logins that can read other employees' records (no User Permission on their own Employee). */
function AccessGaps({ rows, company, onFixed }) {
  const { call, loading } = useFrappePostCall('karya_erp.hr.restrict_to_own_records')
  const [err, setErr] = useState(null)
  if (!rows?.length) return null
  const fix = () => call({ company }).then(onFixed).catch((e) => setErr(errorText(e, 'Could not update access.')))
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs dark:border-amber-900/60 dark:bg-amber-950/40">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{rows.length} employee login{rows.length === 1 ? ' can' : 's can'} see other employees&apos; records</p>
        <p className="mt-0.5 text-muted">
          {rows.slice(0, 5).map((r) => r.employee_name).join(', ')}{rows.length > 5 ? ` and ${rows.length - 5} more` : ''} — payslips, leave and employee details of everyone are visible to them.
        </p>
        {err && <p className="mt-1 text-danger">{err}</p>}
      </div>
      <Button variant="primary" icon={ShieldAlert} onClick={fix} loading={loading}>Limit to own records</Button>
    </div>
  )
}

const Empty = ({ children }) => <p className="px-4 py-6 text-center text-xs text-muted">{children}</p>
const emp = (id) => `/employees/${encodeURIComponent(id)}`

/** HR overview: people, today, documents, approvals, payroll cost, celebrations. */
export default function HRDashboard() {
  const boot = useBoot()
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.hr.dashboard', { company: boot.company }, `hr-dashboard:${boot.company}`, { revalidateOnFocus: false })
  const d = data?.message
  const cur = d?.currency || boot.currency

  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error, 'Could not load the HR dashboard.')}</div>
  if (isLoading || !d) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="card h-24 animate-pulse" />)}</div>

  const present = (d.attendance_today.Present ?? 0) + (d.attendance_today['Work From Home'] ?? 0) + (d.attendance_today['Half Day'] ?? 0)
  const maxDept = Math.max(...d.by_department.map(([, n]) => n), 1)
  const expired = d.documents.filter((x) => x.status === 'Expired').length

  return (
    <>
      <PageHeader title="HR dashboard" subtitle={`${d.company || ''} · ${formatDate(new Date().toLocaleDateString('en-CA'))}`} />

      <AccessGaps rows={d.access_gaps} company={boot.company} onFixed={() => mutate()} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Headcount" value={formatNumber(d.headcount)} sub={`${d.joiners.length} joined · ${d.leavers.length} leaving this month`} icon={Users} to="/employees" />
        <Kpi label="Present today" value={`${present} / ${d.headcount}`} sub={`${d.checked_in_today} checked in · ${d.attendance_today.Absent ?? 0} absent`} icon={CalendarCheck} to="/attendance-sheet" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400" />
        <Kpi label="On leave today" value={formatNumber(d.on_leave.length)} sub={`${d.pending.leave} leave request${d.pending.leave === 1 ? '' : 's'} open`} icon={Plane} to="/leave-applications" tone="bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400" />
        <Kpi label="Documents to renew" value={formatNumber(d.documents.length)} sub={expired ? `${expired} already expired` : 'within 30 days'} icon={FileBadge} to="/employee-documents" tone={expired ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Payroll cost · last 6 months" className="xl:col-span-2" action={<Link to="/payroll" className="text-xs text-primary hover:underline">Payroll</Link>}>
          {d.payroll_cost.some((m) => m.gross) ? (
            <GroupedBars months={d.payroll_cost} currency={cur}
              series={[{ key: 'gross', label: 'Gross', color: 'bg-series-1' }, { key: 'net', label: 'Net paid', color: 'bg-series-2' }]}
              net={(m) => m.gross - m.net} netLabel="Deductions" />
          ) : <Empty>No submitted salary slips yet.</Empty>}
        </Card>
        <Card title="Headcount by department" icon={Users}>
          {d.by_department.length === 0 ? <Empty>No active employees.</Empty> : (
            <ul className="space-y-2.5 p-4">
              {d.by_department.slice(0, 8).map(([dept, n], i) => (
                <li key={dept} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-xs" title={`${dept}: ${n}`}>
                  <span className="truncate text-muted">{dept}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full origin-left animate-[grow-x_.5s_var(--ease-out-soft)_both] rounded-full bg-series-1" style={{ width: `${(n / maxDept) * 100}%`, animationDelay: `${i * 40}ms` }} /></span>
                  <span className="num w-6 text-end font-medium">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Documents expiring" icon={AlertTriangle} action={<Link to="/employee-documents?tab=Expiring%20Soon" className="text-xs text-primary hover:underline">All</Link>}>
          {d.documents.length === 0 ? <Empty>Nothing expiring in the next 30 days.</Empty> : (
            <ul className="divide-y">
              {d.documents.slice(0, 8).map((x) => (
                <li key={x.name} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <Link fallback="text" to={`/employee-documents/${encodeURIComponent(x.name)}`} className="font-medium hover:text-primary hover:underline">{x.employee_name}</Link>
                    <p className="num text-[11px] text-muted">{x.document_type} · {formatDate(x.expiry_date)}</p>
                  </div>
                  <StatusBadge status={x.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="On leave today" icon={Plane}>
          {d.on_leave.length === 0 ? <Empty>Everyone is in.</Empty> : (
            <ul className="divide-y">
              {d.on_leave.map((l) => (
                <li key={`${l.employee}${l.leave_type}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <Link fallback="text" to={emp(l.employee)} className="truncate font-medium hover:text-primary hover:underline">{l.employee_name}</Link>
                  <span className="num shrink-0 text-[11px] text-muted">{l.leave_type} · back after {formatDate(l.to_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Joining & leaving" icon={LogIn}>
          {d.joiners.length + d.leavers.length + d.on_notice.length === 0 ? <Empty>No joiners or leavers this month.</Empty> : (
            <ul className="divide-y">
              {d.joiners.map((j) => (
                <li key={`j${j.name}`} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <LogIn className="size-3.5 shrink-0 text-emerald-600" />
                  <Link to={emp(j.name)} className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline">{j.employee_name}</Link>
                  <span className="num shrink-0 text-[11px] text-muted">joins {formatDate(j.date_of_joining)}</span>
                </li>
              ))}
              {[...d.leavers.map((l) => ({ ...l, employee: l.name })), ...d.on_notice.filter((n) => !d.leavers.some((l) => l.name === n.employee))].map((l) => (
                <li key={`l${l.employee}`} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <LogOut className="size-3.5 shrink-0 text-danger" />
                  <Link to={emp(l.employee)} className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline">{l.employee_name}</Link>
                  <Link to={`/final-settlement?employee=${encodeURIComponent(l.employee)}`} className="shrink-0 text-[11px] text-primary hover:underline">Settlement</Link>
                  <span className="num shrink-0 text-[11px] text-muted">last day {formatDate(l.relieving_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Birthdays · next 2 weeks" icon={Cake}>
          {d.birthdays.length === 0 ? <Empty>No birthdays coming up.</Empty> : (
            <ul className="divide-y">
              {d.birthdays.map((b) => (
                <li key={b.employee} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="truncate font-medium">{b.employee_name}</span>
                  <span className="num shrink-0 text-[11px] text-muted">{formatDate(b.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Work anniversaries · next 2 weeks" icon={Trophy}>
          {d.anniversaries.length === 0 ? <Empty>None coming up.</Empty> : (
            <ul className="divide-y">
              {d.anniversaries.map((a) => (
                <li key={a.employee} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="truncate font-medium">{a.employee_name}</span>
                  <span className="num shrink-0 text-[11px] text-muted">{a.years} yr{a.years > 1 ? 's' : ''} · {formatDate(a.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Waiting for approval" icon={CalendarCheck} action={<Link to="/approvals" className="text-xs text-primary hover:underline">Inbox</Link>}>
          <ul className="divide-y text-xs">
            <li className="flex justify-between px-4 py-2.5"><Link to="/leave-applications?tab=Open" className="hover:text-primary hover:underline">Leave requests</Link><span className="num font-semibold">{d.pending.leave}</span></li>
            <li className="flex justify-between px-4 py-2.5"><Link to="/expense-claims?tab=To%20approve" className="hover:text-primary hover:underline">Expense claims</Link><span className="num font-semibold">{d.pending.expense_claims}</span></li>
          </ul>
        </Card>
      </div>
    </>
  )
}
