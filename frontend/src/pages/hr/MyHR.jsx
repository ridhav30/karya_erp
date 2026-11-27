import { useState } from 'react'
import { Link } from 'react-router'
import { useFrappeGetCall, useSWRConfig } from 'frappe-react-sdk'
import { BadgeCheck, CalendarDays, Download, Plus, FileBadge, Mail, Phone, Plane, UserRound, Wallet } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import CheckInCard from '../../components/hr/CheckInCard.jsx'
import AttendanceCalendar from '../../components/hr/AttendanceCalendar.jsx'
import ApplyLeaveDialog from '../../components/hr/ApplyLeaveDialog.jsx'
import MyLeaveRequests from '../../components/hr/MyLeaveRequests.jsx'
import MyExpenses from '../../components/hr/MyExpenses.jsx'
import MyPerformance from '../../components/performance/MyPerformance.jsx'
import Button from '../../components/Button.jsx'
import { useBoot } from '../../app/boot-context.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney, formatNumber, initials } from '../../lib/format.js'
import { printUrls } from '../../lib/print.js'
import { cn } from '../../lib/utils.js'

function Card({ title, icon: Icon, action, children, className }) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      <div className="dt-bar">
        <h3 className="dt-title flex items-center gap-2">{Icon && <Icon className="size-3.5 text-muted" />}{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

const Empty = ({ children }) => <p className="px-4 py-6 text-center text-xs text-muted">{children}</p>
const monthOf = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

function daysUntil(date) {
  const ms = new Date(`${date}T00:00:00`) - new Date(new Date().toDateString())
  return Math.round(ms / 86_400_000)
}

/** Self-service home for the logged-in employee (Frappe HR data). */
export default function MyHR() {
  const boot = useBoot()
  const { data, error, isLoading } = useFrappeGetCall('karya_erp.hr.my_hr', undefined, 'my-hr', { revalidateOnFocus: false })
  const { mutate } = useSWRConfig()
  const [applying, setApplying] = useState(false)
  const refreshLeave = () => { mutate('my-hr'); mutate('my-leaves'); mutate((k) => typeof k === 'string' && k.startsWith('my-month:')) }
  const d = data?.message

  if (error) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error, 'Could not load My HR.')}</div>
  }
  if (isLoading) {
    return <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card h-32 animate-pulse" />)}</div>
  }
  if (!d?.employee) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-center">
        <UserRound className="mx-auto mb-3 size-8 text-muted/60" />
        <h2 className="text-sm font-semibold">Your user isn't linked to an employee</h2>
        <p className="mt-1 text-xs text-muted">
          {boot.is_hr
            ? <>Open the employee in <Link to="/employees" className="text-primary hover:underline">Employees</Link> and use <b>Create login</b>, or set their User ID.</>
            : 'Ask HR to link your login to your employee record.'}
        </p>
      </div>
    )
  }

  const p = d.profile
  const docsAlert = d.documents.filter((x) => x.status === 'Expired' || x.status === 'Expiring Soon').length

  return (
    <>
      {/* Header */}
      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        {p.image
          ? <img src={p.image} alt="" className="size-14 shrink-0 rounded-full object-cover" />
          : <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary-soft text-lg font-bold text-primary">{initials(p.employee_name)}</span>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{p.employee_name}</h1>
          <p className="truncate text-xs text-muted">{[p.designation, p.department?.replace(/ - [^-]+$/, ''), p.branch].filter(Boolean).join(' · ') || p.company}</p>
          <p className="num mt-1 text-[11px] text-muted">
            {p.name}{p.date_of_joining && <> · Joined {formatDate(p.date_of_joining)}{d.years_of_service != null && ` (${formatNumber(d.years_of_service, 1)} yrs)`}</>}
          </p>
        </div>
        {d.open_leave_applications > 0 && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-md border px-2.5 py-1 text-xs sm:self-center"><Plane className="size-3.5 text-muted" />{d.open_leave_applications} leave request{d.open_leave_applications > 1 ? 's' : ''} open</span>
        )}
      </div>

      <CheckInCard checkins={d.checkins_today} onLeave={d.on_leave_today} shift={d.shift} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><AttendanceCalendar /></div>
        {/* Holidays */}
        <Card title="Upcoming holidays" icon={CalendarDays}>
          {d.holidays.upcoming.length === 0 ? <Empty>{d.holidays.holiday_list ? 'No more holidays this year.' : 'No holiday list assigned.'}</Empty> : (
            <ul className="divide-y">
              {d.holidays.upcoming.map((h) => {
                const n = daysUntil(h.holiday_date)
                return (
                  <li key={h.holiday_date} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <span className="grid w-10 shrink-0 place-items-center rounded-md border py-1 leading-tight">
                      <span className="text-xs text-muted">{new Date(`${h.holiday_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span>
                      <span className="num text-sm font-semibold">{h.holiday_date.slice(8, 10)}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate">{h.description || 'Holiday'}</span>
                    <span className="shrink-0 text-[11px] text-muted">{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Leave balance */}
        <Card title="Leave balance" icon={Plane} className="lg:col-span-2" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setApplying(true)}>Apply leave</Button>}>
          {d.leave_balances.length === 0 ? <Empty>No leave allocated for this period yet.</Empty> : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              {d.leave_balances.map((l) => {
                const used = Math.min(1, (Number(l.taken) + Number(l.pending)) / (Number(l.allocated) || 1))
                return (
                  <div key={l.leave_type} className="rounded-md border p-3">
                    <p className="truncate text-xs text-muted" title={l.leave_type}>{l.leave_type}</p>
                    <p className="num mt-1 text-lg font-semibold">{formatNumber(l.balance, 1)}<span className="text-xs font-normal text-muted"> / {formatNumber(l.allocated, 1)} days</span></p>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-series-1" style={{ width: `${used * 100}%` }} />
                    </span>
                    <p className="num mt-1 text-[11px] text-muted">{formatNumber(l.taken, 1)} taken{Number(l.pending) > 0 && ` · ${formatNumber(l.pending, 1)} pending`}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Leave requests */}
        <MyLeaveRequests onChange={refreshLeave} />

        {/* Payslips */}
        <Card title="Payslips" icon={Wallet}>
          {d.payslips.length === 0 ? <Empty>No payslips yet.</Empty> : (
            <ul className="divide-y">
              {d.payslips.map((s) => (
                <li key={s.name} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{monthOf(s.start_date)}</p>
                    <p className="num text-[11px] text-muted">Net {formatMoney(s.net_pay, s.currency || boot.currency)}</p>
                  </div>
                  <a href={printUrls({ doctype: 'Salary Slip', name: s.name, format: d.payslip_format }).pdf} target="_blank" rel="noreferrer" title="Download PDF"
                    className="pressable inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-[11px] font-medium hover:bg-surface-2">
                    <Download className="size-3.5" />PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Performance */}
        <MyPerformance />

        {/* Expenses & advances */}
        <MyExpenses />

        {/* Documents */}
        <Card title="My documents" icon={FileBadge} action={docsAlert > 0 && <span className="text-[11px] font-medium text-danger">{docsAlert} need attention</span>}>
          {d.documents.length === 0 ? <Empty>No documents on file. HR adds your visa, Emirates ID and labour card here.</Empty> : (
            <ul className="divide-y">
              {d.documents.map((x) => (
                <li key={x.name} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{x.document_type}</p>
                    <p className="num truncate text-[11px] text-muted">{x.document_number || '—'}{x.expiry_date && ` · expires ${formatDate(x.expiry_date)}`}</p>
                  </div>
                  <StatusBadge status={x.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Profile */}
        <Card title="My details" icon={BadgeCheck}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-xs">
            <dt className="text-muted">Reports to</dt><dd className="truncate">{p.reports_to_name || '—'}</dd>
            <dt className="text-muted">Leave approver</dt><dd className="truncate">{p.leave_approver || '—'}</dd>
            <dt className="text-muted">Company</dt><dd className="truncate">{p.company}</dd>
            <dt className="text-muted"><Mail className="inline size-3" /> Email</dt><dd className="truncate">{p.email || '—'}</dd>
            <dt className="text-muted"><Phone className="inline size-3" /> Mobile</dt><dd className="num truncate">{p.mobile || '—'}</dd>
          </dl>
        </Card>
      </div>

      <ApplyLeaveDialog open={applying} onClose={() => setApplying(false)} onDone={refreshLeave} />
    </>
  )
}
