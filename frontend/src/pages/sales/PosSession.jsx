import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { ArrowLeft, LogOut, Search, Store } from 'lucide-react'
import Button from '../../components/Button.jsx'
import PageBar from '../../components/PageBar.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { CloseShift } from './PointOfSale.jsx'
import { ROUTE_OF } from '../../lib/doctypes.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

const when = (v) => (v ? `${formatDate(v)} ${String(v).slice(11, 16)}` : '—')
const Stat = ({ label, value, sub, tone }) => (
  <div className="card p-4"><div className="text-xs text-muted">{label}</div><div className={cn('num mt-1 text-xl font-semibold', tone)}>{value}</div>{sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}</div>
)

/** One session: who ran which counter, when, the takings by payment method, and every invoice it made (paged, date-filtered). */
export default function PosSession() {
  const { name } = useParams()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [start, setStart] = useState(0)
  const [size, setSize] = useState(20)
  const [closing, setClosing] = useState(false)
  useEffect(() => { const id = setTimeout(() => { setSearch(q); setStart(0) }, 300); return () => clearTimeout(id) }, [q])
  const params = { opening: name, from_date: from || undefined, to_date: to || undefined, search: search || undefined, start, page_length: size }
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.pos_sessions.session_detail', params, `pos-session:${JSON.stringify(params)}`, { revalidateOnFocus: false, keepPreviousData: true })
  const d = data?.message
  const cur = d?.currency || 'AED'
  const money = (v) => formatMoney(v ?? 0, cur)
  const reset = (fn) => (v) => { fn(v); setStart(0) }
  const invRoute = (n) => (ROUTE_OF[d?.invoice_type] ? `${ROUTE_OF[d.invoice_type]}/${encodeURIComponent(n)}` : null)

  if (error) return <div className="space-y-3"><Link to="/pos" className="text-xs text-primary hover:underline">← Sessions</Link><div className="card p-4 text-xs text-danger">{errorText(error)}</div></div>
  if (isLoading && !d) return <div className="card h-64 animate-pulse" />
  if (!d) return null
  const t = d.totals

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2.5 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/pos" title="All sessions" className="pressable grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted hover:bg-surface-2 hover:text-foreground"><ArrowLeft className="size-4" /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="num truncate text-sm font-bold">{d.name}</span><StatusBadge status={d.status} /></div>
            <div className="truncate text-xs text-muted">{d.pos_profile} · {d.user_name} · {when(d.started)}{d.ended ? ` → ${when(d.ended)}` : ''}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {d.status === 'Open' && d.mine && <Link to="/pos/screen"><Button variant="accent" icon={Store}>POS screen</Button></Link>}
          {d.can_close && <Button variant="primary" icon={LogOut} onClick={() => setClosing(true)}>Close session</Button>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total sales" value={money(t.grand_total)} sub={`${t.invoices} invoice${t.invoices === 1 ? '' : 's'}`} />
        <Stat label="Net sales" value={money(t.net_total)} sub={`Tax ${money(t.taxes)}`} />
        <Stat label="Returns" value={t.returns} sub={t.returns ? money(t.returns_total) : null} tone={t.returns ? 'text-danger' : ''} />
        <Stat label="Average sale" value={money(t.invoices ? t.grand_total / t.invoices : 0)} />
      </div>

      <section className="card overflow-hidden">
        <div className="dt-bar"><h3 className="dt-title">{d.closing ? 'Cash count at closing' : 'Takings by payment method'}</h3></div>
        <div className="overflow-x-auto">
          {d.closing ? (
            <table className="dt w-max min-w-full">
              <thead><tr><th>Payment method</th><th className="text-end">Opening</th><th className="text-end">Expected</th><th className="text-end">Counted</th><th className="text-end">Difference</th></tr></thead>
              <tbody>{d.closing.map((r) => (
                <tr key={r.mode_of_payment}>
                  <td className="font-medium">{r.mode_of_payment}</td><td className="dt-num whitespace-nowrap">{money(r.opening)}</td><td className="dt-num whitespace-nowrap">{money(r.expected)}</td>
                  <td className="dt-num whitespace-nowrap">{money(r.counted)}</td><td className={cn('dt-num whitespace-nowrap', r.difference < 0 && 'text-danger', r.difference > 0 && 'text-amber-600')}>{money(r.difference)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <table className="dt w-max min-w-full">
              <thead><tr><th>Payment method</th><th className="text-end">Opening</th><th className="text-end">Sales</th><th className="text-end">Invoices</th></tr></thead>
              <tbody>
                {d.opening_balances.map((b) => { const m = d.by_mode.find((x) => x.mode_of_payment === b.mode_of_payment); return (
                  <tr key={b.mode_of_payment}><td className="font-medium">{b.mode_of_payment}</td><td className="dt-num whitespace-nowrap">{money(b.opening_amount)}</td><td className="dt-num whitespace-nowrap">{money(m?.amount)}</td><td className="dt-num">{m?.invoices ?? 0}</td></tr>
                ) })}
                {d.by_mode.filter((m) => !d.opening_balances.some((b) => b.mode_of_payment === m.mode_of_payment)).map((m) => (
                  <tr key={m.mode_of_payment}><td className="font-medium">{m.mode_of_payment}</td><td className="dt-num">{money(0)}</td><td className="dt-num whitespace-nowrap">{money(m.amount)}</td><td className="dt-num">{m.invoices}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="dt-bar flex-wrap gap-2">
          <h3 className="dt-title">Transactions <span className="num font-normal text-muted">{d.total}</span></h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block w-48">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input className="input h-8 ps-8" placeholder="Invoice or customer" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <input className="input h-8 w-36" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From" />
            <input className="input h-8 w-36" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="dt w-max min-w-full">
            <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="text-end">Total</th><th className="text-end">Paid</th><th className="text-end">Change</th><th>Status</th></tr></thead>
            <tbody>
              {d.rows.length === 0 && <tr><td colSpan={7} className="dt-empty">No transactions{from || to || search ? ' for these filters' : ' in this session yet'}.</td></tr>}
              {d.rows.map((r) => (
                <tr key={r.name}>
                  <td className="whitespace-nowrap">{invRoute(r.name) ? <Link to={invRoute(r.name)} className="font-medium hover:text-primary hover:underline">{r.name}</Link> : <span className="font-medium">{r.name}</span>}{r.is_return ? <span className="ms-1 text-[11px] text-danger">return</span> : null}</td>
                  <td className="num whitespace-nowrap">{formatDate(r.posting_date)} {String(r.posting_time || '').slice(0, 5)}</td>
                  <td>{r.customer_name || r.customer}</td>
                  <td className="dt-num whitespace-nowrap font-semibold">{money(r.grand_total)}</td>
                  <td className="dt-num whitespace-nowrap">{money(r.paid_amount)}</td>
                  <td className="dt-num whitespace-nowrap">{r.change_amount ? money(r.change_amount) : '—'}</td>
                  <td><StatusBadge status={r.status || 'Paid'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PageBar start={d.start} pageSize={size} total={d.total} onStart={setStart} onSize={(n) => { setSize(n); setStart(0) }} />
      </section>

      {closing && <CloseShift opening={d.name} money={money} onClose={() => setClosing(false)} onClosed={async () => { setClosing(false); await mutate() }} />}
    </div>
  )
}
