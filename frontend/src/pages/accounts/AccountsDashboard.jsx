import { Link } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { ArrowDownLeft, ArrowUpRight, BookText, FilePlus2, Landmark, Plus, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { useBoot } from '../../app/boot-context.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'
import GroupedBars from '../../components/charts/GroupedBars.jsx'

function Card({ title, action, children, className }) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      <div className="dt-bar">
        <h3 className="dt-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Kpi({ label, value, sub, icon: Icon, tone, to, loading }) {
  const toneClass = {
    blue: 'bg-primary-soft text-primary',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400',
  }[tone]
  return (
    <Link to={to} className="card flex items-start justify-between gap-3 p-4 transition-colors hover:border-gray-300 dark:hover:border-zinc-600">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="num mt-1.5 truncate text-lg font-semibold">{loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-surface-2" /> : value}</p>
        {sub && !loading && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
      </div>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', toneClass)}><Icon className="size-4" /></span>
    </Link>
  )
}

/** Receivable ageing: one series, horizontal bars with direct labels. */
function AgeingBars({ buckets, currency }) {
  const max = Math.max(...buckets.map((b) => b.amount), 0) || 1
  return (
    <div className="space-y-2.5 p-4">
      {buckets.map((b, i) => (
        <div key={b.label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-xs" title={`${b.label}: ${formatMoney(b.amount, currency)}`}>
          <span className={cn('text-muted', b.label === '90+' && b.amount > 0 && 'font-semibold text-danger')}>{b.label === 'Not due' ? b.label : `${b.label} days`}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full origin-left animate-[grow-x_.5s_var(--ease-out-soft)_both] rounded-full bg-series-1" style={{ width: `${(b.amount / max) * 100}%`, animationDelay: `${i * 50}ms` }} />
          </span>
          <span className="num w-28 text-end">{formatMoney(b.amount, currency)}</span>
        </div>
      ))}
    </div>
  )
}

const ACTIONS = [
  { label: 'Receive payment', to: '/payments/new', state: { defaults: { payment_type: 'Receive', party_type: 'Customer' } }, icon: ArrowDownLeft },
  { label: 'Pay supplier', to: '/payments/new', state: { defaults: { payment_type: 'Pay', party_type: 'Supplier' } }, icon: ArrowUpRight },
  { label: 'Journal entry', to: '/journal-entries/new', icon: BookText },
  { label: 'Credit note', to: '/credit-notes', icon: FilePlus2 },
]

export default function AccountsDashboard() {
  const boot = useBoot()
  const { data, error, isLoading } = useFrappeGetCall('karya_erp.accounts.dashboard', { company: boot.company }, `acc-dash:${boot.company}`, { refreshInterval: 120_000 })
  const d = data?.message
  const cur = d?.currency || boot.currency
  const m = (v) => (v == null ? '—' : formatMoney(v, cur))
  const cashTotal = d?.cash_bank?.reduce((s, b) => s + b.balance, 0)
  const thisMonth = d?.income_expense?.at(-1)

  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error, 'Could not load the accounts overview.')}</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <Link key={a.label} to={a.to} state={a.state} className="pressable inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-surface-2">
            <a.icon className="size-3.5 text-muted" /> {a.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="To receive" value={m(d?.receivable?.total)} sub={d?.receivable ? `${m(d.receivable.overdue)} overdue · ${d.receivable.overdue_count} invoices` : null} icon={Wallet} tone="blue" to="/financial-reports/accounts-receivable" loading={isLoading} />
        <Kpi label="To pay" value={m(d?.payable?.total)} sub={d?.payable ? `${m(d.payable.overdue)} overdue · ${d.payable.overdue_count} bills` : null} icon={Landmark} tone="amber" to="/financial-reports/accounts-payable" loading={isLoading} />
        <Kpi label="Cash & bank" value={m(cashTotal)} sub={d?.cash_bank ? `${d.cash_bank.length} accounts` : null} icon={Receipt} tone="green" to="/chart-of-accounts" loading={isLoading} />
        <Kpi label="Net profit this month" value={thisMonth ? m(thisMonth.income - thisMonth.expense) : '—'} sub={thisMonth ? `${m(thisMonth.income)} in · ${m(thisMonth.expense)} out` : null} icon={TrendingUp} tone={thisMonth && thisMonth.income - thisMonth.expense < 0 ? 'red' : 'green'} to="/financial-reports/profit-and-loss" loading={isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title="Income vs expense · last 6 months" action={<Link to="/financial-reports/profit-and-loss" className="text-xs text-primary hover:underline">P&amp;L</Link>}>
          {isLoading ? <div className="m-4 h-48 animate-pulse rounded bg-surface-2" />
            : d?.income_expense ? <GroupedBars months={d.income_expense} currency={cur} series={[{ key: 'income', label: 'Income', color: 'bg-series-1' }, { key: 'expense', label: 'Expense', color: 'bg-series-2' }]} net={(m) => m.income - m.expense} />
              : <p className="p-4 text-xs text-muted">You need access to the General Ledger to see this.</p>}
        </Card>
        <Card title="Receivable ageing" action={<Link to="/financial-reports/accounts-receivable" className="text-xs text-primary hover:underline">Details</Link>}>
          {isLoading ? <div className="m-4 h-40 animate-pulse rounded bg-surface-2" />
            : d?.ageing ? <AgeingBars buckets={d.ageing} currency={cur} /> : <p className="p-4 text-xs text-muted">No access to sales invoices.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Cash & bank">
          <ul className="divide-y">
            {(d?.cash_bank ?? []).map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <Link to={`/financial-reports/general-ledger?account=${encodeURIComponent(b.name)}`} className="min-w-0 hover:text-primary">
                  <span className="block truncate">{b.account_name}</span>
                  <span className="text-[11px] text-muted">{b.account_type}</span>
                </Link>
                <span className={cn('num shrink-0', b.balance < 0 && 'text-danger')}>{formatMoney(b.balance, b.account_currency || cur)}</span>
              </li>
            ))}
            {!isLoading && !(d?.cash_bank?.length) && <li className="px-4 py-8 text-center text-xs text-muted">No bank or cash accounts.</li>}
          </ul>
        </Card>
        <Card title="Overdue invoices" action={<Link to="/sales-invoices?tab=Overdue" className="text-xs text-primary hover:underline">All</Link>}>
          <ul className="divide-y">
            {(d?.overdue_invoices ?? []).map((inv) => (
              <li key={inv.name}>
                <Link to={`/sales-invoices/${encodeURIComponent(inv.name)}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50/80 dark:hover:bg-zinc-800/40">
                  <span className="min-w-0">
                    <span className="block truncate">{inv.customer_name}</span>
                    <span className="num text-[11px] text-danger">Due {formatDate(inv.due_date)}</span>
                  </span>
                  <span className="num shrink-0">{formatMoney(inv.outstanding_amount, inv.currency || cur)}</span>
                </Link>
              </li>
            ))}
            {!isLoading && !(d?.overdue_invoices?.length) && <li className="px-4 py-8 text-center text-xs text-muted">Nothing overdue.</li>}
          </ul>
        </Card>
        <Card title="Recent payments" action={<Link to="/payments" className="text-xs text-primary hover:underline">All</Link>}>
          <ul className="divide-y">
            {(d?.recent_payments ?? []).map((p) => (
              <li key={p.name}>
                <Link to={`/payments/${encodeURIComponent(p.name)}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50/80 dark:hover:bg-zinc-800/40">
                  <span className="flex min-w-0 items-center gap-2">
                    {p.payment_type === 'Receive' ? <ArrowDownLeft className="size-3.5 shrink-0 text-success" /> : <ArrowUpRight className="size-3.5 shrink-0 text-warning" />}
                    <span className="min-w-0">
                      <span className="block truncate">{p.party_name || p.payment_type}</span>
                      <span className="num text-[11px] text-muted">{formatDate(p.posting_date)}{p.mode_of_payment ? ` · ${p.mode_of_payment}` : ''}</span>
                    </span>
                  </span>
                  <span className="num shrink-0">{formatMoney(p.paid_amount, p.currency || cur)}</span>
                </Link>
              </li>
            ))}
            {!isLoading && !(d?.recent_payments?.length) && <li className="px-4 py-8 text-center text-xs text-muted">No payments yet.</li>}
          </ul>
        </Card>
      </div>

      {d?.drafts && Object.values(d.drafts).some(Boolean) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <Plus className="size-3.5" /> Drafts waiting:
          {[['Sales Invoice', '/sales-invoices'], ['Purchase Invoice', '/purchase-invoices'], ['Payment Entry', '/payments'], ['Journal Entry', '/journal-entries']]
            .filter(([dt]) => d.drafts[dt])
            .map(([dt, to]) => <Link key={dt} to={`${to}?tab=Draft`} className="text-primary hover:underline">{d.drafts[dt]} {dt}{d.drafts[dt] > 1 ? 's' : ''}</Link>)}
        </p>
      )}
    </div>
  )
}
