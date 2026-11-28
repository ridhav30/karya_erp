import { Navigate } from 'react-router'
import Link from '../components/AccessLink.jsx'
import { useFrappeGetCall } from 'frappe-react-sdk'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckSquare, ClipboardList, PackageCheck, Plus, TrendingDown, TrendingUp, Truck,
} from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import GroupedBars from '../components/charts/GroupedBars.jsx'
import { useBoot } from '../app/boot-context.js'
import { useDashboard } from '../lib/useDashboard.js'
import { ago } from '../lib/activity.js'
import { docRoute } from '../lib/docRoute.js'
import { formatMoney, formatNumber } from '../lib/format.js'
import { cn } from '../lib/utils.js'

const TONES = {
  primary: 'bg-primary-soft text-primary',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400',
}

function Kpi({ label, value, sub, icon: Icon, tone = 'primary', to, loading }) {
  const body = (
    <div className="card flex items-start justify-between gap-3 p-4 transition-colors hover:border-gray-300 dark:hover:border-zinc-600">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="num mt-1.5 truncate text-lg font-semibold">
          {loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-surface-2" /> : value}
        </p>
        {sub && !loading && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
      </div>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', TONES[tone])}>
        <Icon className="size-4" />
      </span>
    </div>
  )
  return to ? <Link fallback="text" to={to}>{body}</Link> : body
}

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

const More = ({ to, children = 'All' }) => <Link to={to} className="text-xs text-primary hover:underline">{children}</Link>
const Empty = ({ children }) => <p className="px-4 py-6 text-center text-xs text-muted">{children}</p>
const Skeleton = () => <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-surface-2" />)}</div>

function Trend({ now, before }) {
  if (now == null || !before) return null
  const pct = ((now - before) / Math.abs(before)) * 100
  const up = pct >= 0
  return <span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% vs last month</span>
}

const QUICK = [
  { label: 'Sales Order', to: '/sales-orders/new' },
  { label: 'Sales Invoice', to: '/sales-invoices/new' },
  { label: 'Purchase Order', to: '/purchase-orders/new' },
  { label: 'Payment', to: '/payments/new' },
  { label: 'Customer', to: '/customers?new=1' },
  { label: 'Item', to: '/items?new=1' },
]

export default function Dashboard() {
  const boot = useBoot()
  const { data: d, isLoading } = useDashboard()
  const { data: ov, isLoading: ovLoading } = useFrappeGetCall('karya_erp.api.overview', undefined, 'dashboard:overview', { revalidateOnFocus: false })
  const { data: ap, isLoading: apLoading } = useFrappeGetCall('karya_erp.approvals.pending', undefined, 'approvals:pending', { refreshInterval: 60_000 })
  const o = ov?.message
  const approvals = ap?.message ?? []
  const cur = boot.currency || 'AED'
  const money = (v) => (v == null ? '—' : formatMoney(v, cur))
  const count = (v) => (v == null ? '—' : formatNumber(v))
  const first = (boot.full_name || '').split(' ')[0]
  const topMax = Math.max(...(o?.top_customers ?? []).map((c) => c.amount), 0) || 1

  // Plain employees have no ERP dashboard: their home is My HR.
  if (boot.employee_only || boot.menu_view === 'employee') return <Navigate to="/my-hr" replace />

  return (
    <>
      <PageHeader title={`Welcome back${first ? `, ${first}` : ''}`} subtitle={`${boot.company || ''} · This month`}>
        {QUICK.slice(0, 2).map((q) => (
          <Link key={q.to} to={q.to} className="pressable inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-surface-2">
            <Plus className="size-3.5" /> {q.label}
          </Link>
        ))}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sales this month" value={money(d?.sales_month)} sub={<Trend now={d?.sales_month} before={o?.prev_month_sales} />} icon={TrendingUp} tone="green" to="/sales-invoices" loading={isLoading} />
        <Kpi label="Purchases this month" value={money(d?.purchase_month)} icon={TrendingDown} tone="sky" to="/purchase-invoices" loading={isLoading} />
        <Kpi label="To receive (customers)" value={money(d?.receivable)} icon={ArrowDownLeft} tone="primary" to="/sales-invoices" loading={isLoading} />
        <Kpi label="To pay (suppliers)" value={money(d?.payable)} icon={ArrowUpRight} tone="amber" to="/purchase-invoices" loading={isLoading} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pending my approval" value={count(d?.pending_approvals)} icon={CheckSquare} tone="amber" to="/approvals" loading={isLoading} />
        <Kpi label="Sales orders to deliver" value={count(d?.so_to_deliver)} icon={Truck} tone="primary" to="/sales-orders" loading={isLoading} />
        <Kpi label="Purchase orders to receive" value={count(d?.po_to_receive)} icon={PackageCheck} tone="sky" to="/purchase-orders" loading={isLoading} />
        <Kpi label="Overdue invoices" value={count(d?.overdue_invoices)} icon={AlertTriangle} tone="red" to="/sales-invoices?tab=Overdue" loading={isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Sales vs purchases · last 6 months" className="xl:col-span-2" action={<More to="/financial-reports">Reports</More>}>
          {ovLoading ? <Skeleton /> : o?.months?.length ? (
            <GroupedBars
              months={o.months} currency={cur}
              series={[{ key: 'sales', label: 'Sales', color: 'bg-series-1' }, { key: 'purchases', label: 'Purchases', color: 'bg-series-2' }]}
              net={(m) => m.sales - m.purchases} netLabel="Difference"
            />
          ) : <Empty>No invoices yet.</Empty>}
        </Card>

        <Card title="Top customers · 90 days" action={<More to="/customers" />}>
          {ovLoading ? <Skeleton /> : (o?.top_customers?.length ?? 0) === 0 ? <Empty>No sales in the last 90 days.</Empty> : (
            <ul className="space-y-3 p-4">
              {o.top_customers.map((c, i) => (
                <li key={c.customer} className="text-xs">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <Link fallback="text" to={`/customers/${encodeURIComponent(c.customer)}`} className="truncate font-medium hover:text-primary hover:underline">{c.customer_name || c.customer}</Link>
                    <span className="num shrink-0">{formatMoney(c.amount, cur)}</span>
                  </div>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full origin-left animate-[grow-x_.5s_var(--ease-out-soft)_both] rounded-full bg-series-1" style={{ width: `${(c.amount / topMax) * 100}%`, animationDelay: `${i * 50}ms` }} />
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">{c.invoices} invoice{c.invoices === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Waiting for my approval" action={<More to="/approvals">Open inbox</More>}>
          {apLoading ? <Skeleton /> : approvals.length === 0 ? <Empty>You're all caught up.</Empty> : (
            <ul className="divide-y">
              {approvals.slice(0, 6).map((a) => {
                const to = docRoute(boot, a.doctype, a.name)
                return (
                  <li key={`${a.doctype}:${a.name}`} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      {to ? <Link fallback="text" to={to} className="font-medium text-primary hover:underline">{a.name}</Link> : <span className="font-medium">{a.name}</span>}
                      <span className="block truncate text-[11px] text-muted">{a.doctype}{a.party ? ` · ${a.party}` : ''} · {a.owner}</span>
                    </div>
                    {a.amount != null && <span className="num shrink-0">{formatMoney(a.amount, a.currency || cur)}</span>}
                    <StatusBadge status={a.state} />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent activity">
          {ovLoading ? <Skeleton /> : (o?.recent?.length ?? 0) === 0 ? <Empty>Nothing yet.</Empty> : (
            <ul className="divide-y">
              {o.recent.map((r) => {
                const to = docRoute(boot, r.doctype, r.name)
                return (
                  <li key={`${r.doctype}:${r.name}`} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      {to ? <Link fallback="text" to={to} className="font-medium hover:text-primary hover:underline">{r.name}</Link> : <span className="font-medium">{r.name}</span>}
                      <span className="block truncate text-[11px] text-muted">{r.doctype}{r.party ? ` · ${r.party}` : ''} · {r.by} · {ago(r.modified)}</span>
                    </div>
                    {r.amount != null && <span className="num shrink-0">{formatMoney(r.amount, r.currency || cur)}</span>}
                    <StatusBadge status={r.status} />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <section className="pt-2">
        <h2 className="mb-3 text-xs font-semibold text-muted">Quick create</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Link key={q.to} to={q.to} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-strong px-3 text-xs font-medium text-strong-foreground hover:opacity-90">
              <ClipboardList className="size-3.5" /> New {q.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
