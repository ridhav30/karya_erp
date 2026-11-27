import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Link from '../../components/AccessLink.jsx'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Eye, LogOut, Plus, Search, Store } from 'lucide-react'
import Button from '../../components/Button.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import PageBar from '../../components/PageBar.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import LinkField from '../../components/fields/LinkField.jsx'
import { OpenShiftModal, CloseShift, Setup } from './PointOfSale.jsx'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { cn } from '../../lib/utils.js'

const when = (v) => (v ? `${formatDate(v)} ${String(v).slice(11, 16)}` : '—')

/** Point of Sale opens here: every session (shift) with its cashier, counter, status and takings. The till is its own page. */
export default function PosSessions() {
  const navigate = useNavigate()
  const sess = useFrappeGetCall('karya_erp.pos.session', {}, 'pos-session', { revalidateOnFocus: false })
  const s = sess.data?.message
  const [status, setStatus] = useState('')
  const [user, setUser] = useState('')
  const [counter, setCounter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [start, setStart] = useState(0)
  const [size, setSize] = useState(20)
  const [creating, setCreating] = useState(false)
  const [closing, setClosing] = useState(null) // session row being closed
  useEffect(() => { const id = setTimeout(() => { setSearch(q); setStart(0) }, 300); return () => clearTimeout(id) }, [q])

  const params = { status: status || undefined, user: user || undefined, pos_profile: counter || undefined, from_date: from || undefined, to_date: to || undefined, search: search || undefined, start, page_length: size }
  const list = useFrappeGetCall('karya_erp.pos_sessions.sessions', params, `pos-sessions:${JSON.stringify(params)}`, { revalidateOnFocus: false, keepPreviousData: true })
  const d = list.data?.message
  const cur = d?.currency || 'AED'
  const money = (v) => formatMoney(v ?? 0, cur)
  const refresh = async () => { await Promise.all([sess.mutate(), list.mutate()]) }
  const reset = (fn) => (v) => { fn(v); setStart(0) }

  if (sess.error) return <div className="card p-4 text-xs text-danger">{errorText(sess.error)}</div>
  if (!s) return <div className="card h-64 animate-pulse" />
  if (s.profiles.length === 0) return <Setup s={s} onDone={sess.mutate} />
  const mine = s.opening

  return (
    <>
      <PageHeader title="Point of Sale" subtitle="Sessions: who opened a counter, when, and what it sold">
        {mine && <Link to="/pos/screen"><Button variant="accent" icon={Store}>Open POS screen</Button></Link>}
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New session</Button>
      </PageHeader>

      {mine && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span>{t('You have an open session on')} <b>{mine.pos_profile}</b> {t('since')} {when(mine.period_start_date)}.</span>
          <span className="flex gap-2">
            <Link to="/pos/screen"><Button size="sm" variant="primary" icon={Store}>Continue selling</Button></Link>
            <Button size="sm" icon={LogOut} onClick={() => setClosing({ name: mine.name })}>Close session</Button>
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><div className="text-xs text-muted">Sessions</div><div className="num mt-1 text-xl font-semibold">{d?.total ?? '—'}</div></div>
        <div className="card p-4"><div className="text-xs text-muted">Open now</div><div className={cn('num mt-1 text-xl font-semibold', d?.open > 0 && 'text-amber-600')}>{d?.open ?? '—'}</div></div>
        <div className="card p-4"><div className="text-xs text-muted">Total sales</div><div className="num mt-1 text-xl font-semibold">{d ? money(d.sales) : '—'}</div></div>
        <div className="card p-4"><div className="text-xs text-muted">Invoices</div><div className="num mt-1 text-xl font-semibold">{d?.invoices ?? '—'}</div></div>
      </div>

      <section className="card overflow-hidden">
        <div className="dt-bar flex-wrap gap-2">
          <div className="inline-flex rounded-md border bg-surface-2 p-0.5 text-xs" role="tablist">
            {[['', 'All'], ['Open', 'Open'], ['Closed', 'Closed']].map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => reset(setStatus)(k)}
                className={cn('rounded px-3 py-1.5', status === k ? 'bg-background font-semibold text-foreground' : 'font-medium text-muted hover:text-foreground')}>{label}</button>
            ))}
          </div>
          {d?.manager && <div className="w-44"><LinkField doctype="User" value={user} onChange={reset(setUser)} placeholder="All cashiers" filters={{ enabled: 1 }} /></div>}
          <div className="w-40"><LinkField doctype="POS Profile" value={counter} onChange={reset(setCounter)} placeholder="All counters" /></div>
          <input className="input h-8 w-36" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From" />
          <input className="input h-8 w-36" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To" />
          <label className="relative block w-full max-w-[13rem]">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input className="input h-8 ps-8" placeholder="Search sessions" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {list.error ? <div className="p-4 text-xs text-danger">{errorText(list.error)}</div> : (
          <div className="overflow-x-auto">
            <table className="dt w-max min-w-full">
              <thead>
                <tr><th>Session</th><th>Counter</th><th>Cashier</th><th>Started</th><th>Ended</th><th>Status</th><th className="text-end">Invoices</th><th className="text-end">Sales</th><th className="w-px" /></tr>
              </thead>
              <tbody>
                {list.isLoading && !d && <tr><td colSpan={9} className="dt-empty">Loading…</td></tr>}
                {d && d.rows.length === 0 && <tr><td colSpan={9} className="dt-empty">No sessions found.</td></tr>}
                {d?.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="whitespace-nowrap"><Link fallback="text" to={`/pos/session/${encodeURIComponent(r.name)}`} className="font-medium hover:text-primary hover:underline">{r.name}</Link></td>
                    <td className="whitespace-nowrap">{r.pos_profile}</td>
                    <td className="whitespace-nowrap">{r.user_name}{r.mine && <span className="ms-1 text-[11px] text-muted">(you)</span>}</td>
                    <td className="num whitespace-nowrap">{when(r.period_start_date)}</td>
                    <td className="num whitespace-nowrap">{when(r.period_end_date)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="dt-num">{r.invoices}</td>
                    <td className="dt-num whitespace-nowrap font-semibold">{money(r.sales)}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <Link to={`/pos/session/${encodeURIComponent(r.name)}`}><Button size="sm" icon={Eye}>View</Button></Link>
                        {r.status === 'Open' && r.mine && <Link to="/pos/screen"><Button size="sm" variant="accent" icon={Store}>POS screen</Button></Link>}
                        {r.status === 'Open' && (r.mine || d.manager) && <Button size="sm" icon={LogOut} onClick={() => setClosing(r)}>Close</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d && <PageBar start={d.start} pageSize={size} total={d.total} onStart={setStart} onSize={(n) => { setSize(n); setStart(0) }} />}
      </section>

      {creating && <OpenShiftModal s={s} onClose={() => setCreating(false)} onOpened={async (name) => { if (name) navigate('/pos/screen'); else await refresh() }} />}
      {closing && <CloseShift opening={closing.name} money={money} onClose={() => setClosing(null)} onClosed={async () => { setClosing(null); await refresh() }} />}
    </>
  )
}
