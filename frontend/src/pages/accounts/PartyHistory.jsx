import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { HandCoins, Search } from 'lucide-react'
import Button from '../../components/Button.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import PageBar from '../../components/PageBar.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import LinkField from '../../components/fields/LinkField.jsx'
import Select from '../../components/fields/Select.jsx'
import { SIDES } from '../../lib/partySides.js'
import { ROUTE_OF } from '../../lib/doctypes.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { useBoot } from '../../app/boot-context.js'

/** Every payment received from customers / paid to suppliers, paged, optionally for one party and period. */
export default function PartyHistory({ side }) {
  const S = SIDES[side]
  const boot = useBoot()
  const [sp, setSp] = useSearchParams()
  const party = sp.get('party') || ''
  const [start, setStart] = useState(0)
  const [size, setSize] = useState(20)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('Submitted')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const id = setTimeout(() => { setSearch(q); setStart(0) }, 300); return () => clearTimeout(id) }, [q])
  const params = { side, party: party || undefined, company: boot.company, from_date: from || undefined, to_date: to || undefined, status, search: search || undefined, start, page_length: size }
  const { data, error, isLoading } = useFrappeGetCall('karya_erp.party_payments.history', params, `party-history:${JSON.stringify(params)}`, { revalidateOnFocus: false, keepPreviousData: true })
  const d = data?.message
  const cur = d?.currency || boot.currency
  const reset = (fn) => (v) => { fn(v); setStart(0) }
  const docRoute = (dt, n) => (ROUTE_OF[dt] ? `${ROUTE_OF[dt]}/${encodeURIComponent(n)}` : null)
  const setParty = (v) => { const n = new URLSearchParams(sp); if (v) n.set('party', v); else n.delete('party'); setSp(n, { replace: true }); setStart(0) }

  return (
    <>
      <PageHeader title={S.historyTitle} subtitle={party ? `${S.partyType}: ${party}` : S.historySub}>
        <Link to={S.list}><Button>{S.listTitle}</Button></Link>
        <Link to={party ? `${S.act}/${encodeURIComponent(party)}` : S.act}><Button variant="primary" icon={HandCoins}>{S.actTitle}</Button></Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-muted">Payments</div><div className="num mt-1 text-xl font-semibold">{d?.total ?? '—'}</div></div>
        <div className="card p-4"><div className="text-xs text-muted">{S.side === 'receive' ? 'Total received' : 'Total paid'}</div><div className="num mt-1 text-xl font-semibold">{d ? formatMoney(d.paid_total, cur) : '—'}</div></div>
        <div className="card p-4"><div className="text-xs text-muted">Showing</div><div className="mt-1 truncate text-sm font-medium">{party || `All ${S.plural}`}</div></div>
      </div>

      <section className="card overflow-hidden">
        <div className="dt-bar flex-wrap gap-2">
          <div className="w-52"><LinkField doctype={S.partyType} value={party} onChange={setParty} placeholder={`All ${S.plural}`} /></div>
          <label className="relative block w-full max-w-[14rem]">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input className="input h-8 ps-8" placeholder="Payment or reference no" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <input className="input h-8 w-36" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From" />
          <input className="input h-8 w-36" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To" />
          <div className="w-36">
            <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
              <option value="Submitted">Submitted</option><option value="Cancelled">Cancelled</option><option value="Draft">Draft</option><option value="All">All</option>
            </Select>
          </div>
        </div>
        {error ? <div className="p-4 text-xs text-danger">{errorText(error)}</div> : (
          <div className="overflow-x-auto">
            <table className="dt w-max min-w-full">
              <thead>
                <tr><th>Payment</th><th>Date</th><th>{S.partyType}</th><th>Mode</th><th>Reference</th><th>Settled invoices</th><th className="text-end">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {isLoading && !d && <tr><td colSpan={8} className="dt-empty">Loading…</td></tr>}
                {d && d.rows.length === 0 && <tr><td colSpan={8} className="dt-empty">No payments found.</td></tr>}
                {d?.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="whitespace-nowrap"><Link to={`/payments/${encodeURIComponent(r.name)}`} className="font-medium hover:text-primary hover:underline">{r.name}</Link></td>
                    <td className="num whitespace-nowrap">{formatDate(r.posting_date)}</td>
                    <td><button type="button" className="text-start font-medium hover:text-primary hover:underline" onClick={() => setParty(r.party)}>{r.party_name || r.party}</button></td>
                    <td className="whitespace-nowrap">{r.mode_of_payment || '—'}</td>
                    <td className="whitespace-nowrap">{r.reference_no || '—'}{r.reference_date && r.reference_no ? <span className="block text-[11px] text-muted">{formatDate(r.reference_date)}</span> : null}</td>
                    <td className="text-xs">
                      {r.references.length === 0 && (r.unallocated_amount > 0 ? <span className="text-muted">On account</span> : '—')}
                      {r.references.map((x) => (
                        <div key={x.reference_name} className="whitespace-nowrap">
                          {docRoute(x.reference_doctype, x.reference_name) ? <Link to={docRoute(x.reference_doctype, x.reference_name)} className="hover:text-primary hover:underline">{x.reference_name}</Link> : x.reference_name}
                          <span className="num text-muted"> · {formatMoney(x.allocated_amount, cur)}</span>
                        </div>
                      ))}
                      {r.references.length > 0 && r.unallocated_amount > 0 && <div className="text-muted">+ {formatMoney(r.unallocated_amount, cur)} on account</div>}
                    </td>
                    <td className="dt-num whitespace-nowrap font-semibold">{formatMoney(r.paid_amount, cur)}</td>
                    <td><StatusBadge status={r.docstatus === 1 ? 'Submitted' : r.docstatus === 2 ? 'Cancelled' : 'Draft'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d && <PageBar start={d.start} pageSize={size} total={d.total} onStart={setStart} onSize={(n) => { setSize(n); setStart(0) }} />}
      </section>
    </>
  )
}
