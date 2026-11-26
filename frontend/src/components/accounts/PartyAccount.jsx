import { useState } from 'react'
import { Link } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { HandCoins, History } from 'lucide-react'
import Button from '../Button.jsx'
import PageBar from '../PageBar.jsx'
import StatusBadge from '../StatusBadge.jsx'
import { SIDES } from '../../lib/partySides.js'
import { ROUTE_OF } from '../../lib/doctypes.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { useBoot } from '../../app/boot-context.js'

const Stat = ({ label, value, tone, sub }) => (
  <div className="card p-3.5">
    <div className="text-xs text-muted">{label}</div>
    <div className={`num mt-1 text-lg font-semibold ${tone ?? ''}`}>{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
  </div>
)

/** Payments tab of a customer / supplier: what they owe or are owed, what has been paid, and every payment (paged). */
export default function PartyAccount({ doctype, name }) {
  const boot = useBoot()
  const [start, setStart] = useState(0)
  const [size, setSize] = useState(10)
  const side = doctype === 'Customer' ? 'receive' : 'pay'
  const S = SIDES[side]
  const sum = useFrappeGetCall('karya_erp.party_payments.party_summary', { party_type: doctype, party: name, company: boot.company }, `party-summary:${doctype}:${name}:${boot.company}`, { revalidateOnFocus: false })
  const hist = useFrappeGetCall('karya_erp.party_payments.history', { side, party: name, company: boot.company, start, page_length: size }, `party-tab-history:${side}:${name}:${boot.company}:${start}:${size}`, { revalidateOnFocus: false, keepPreviousData: true })
  const s = sum.data?.message
  const h = hist.data?.message
  const cur = s?.currency || boot.currency
  const enc = encodeURIComponent(name)
  const receive = side === 'receive'
  const invRoute = (n) => (ROUTE_OF[S.partyType === 'Customer' ? 'Sales Invoice' : 'Purchase Invoice'] ? `${ROUTE_OF[S.partyType === 'Customer' ? 'Sales Invoice' : 'Purchase Invoice']}/${encodeURIComponent(n)}` : null)

  if (sum.error) return <div className="card p-4 text-xs text-danger">{errorText(sum.error)}</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{receive ? 'Receivable account' : 'Payable account'}</h3>
        <div className="flex gap-1.5">
          <Link to={`${S.history}?party=${enc}`}><Button size="sm" icon={History}>All {receive ? 'receipts' : 'payments'}</Button></Link>
          <Link to={`${S.act}/${enc}`}><Button size="sm" variant="primary" icon={HandCoins}>{S.actTitle}</Button></Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={receive ? 'To receive' : 'To pay'} value={s ? formatMoney(s.outstanding, cur) : '—'} sub={s ? `${s.open_count} open ${receive ? 'invoice' : 'bill'}${s.open_count === 1 ? '' : 's'}` : null} />
        <Stat label="Overdue" value={s ? formatMoney(s.overdue, cur) : '—'} tone={s?.overdue > 0 ? 'text-danger' : ''} />
        <Stat label="Advance on account" value={s ? formatMoney(s.advance, cur) : '—'} />
        <Stat label={receive ? 'Total received' : 'Total paid'} value={s ? formatMoney(s.paid, cur) : '—'} sub={s ? `${s.payments} payment${s.payments === 1 ? '' : 's'}${s.last_payment ? ` · last ${formatDate(s.last_payment)}` : ''}` : null} />
      </div>
      {s && <p className="text-xs text-muted">{receive ? 'Invoiced' : 'Billed'} {formatMoney(s.billed, cur)} across {s.invoices} {receive ? 'invoice' : 'bill'}{s.invoices === 1 ? '' : 's'}.</p>}

      {s && s.open.length > 0 && (
        <section className="card overflow-hidden">
          <div className="dt-bar"><h3 className="dt-title">Open {receive ? 'invoices' : 'bills'} <span className="num font-normal text-muted">{s.open_count}</span></h3></div>
          <div className="overflow-x-auto">
            <table className="dt w-max min-w-full">
              <thead><tr><th>{receive ? 'Invoice' : 'Bill'}</th><th>Due</th><th className="text-end">Total</th><th className="text-end">Open</th></tr></thead>
              <tbody>
                {s.open.map((i) => (
                  <tr key={i.name}>
                    <td className="whitespace-nowrap">{invRoute(i.name) ? <Link to={invRoute(i.name)} className="font-medium hover:text-primary hover:underline">{i.name}</Link> : i.name}<span className="block text-[11px] text-muted">{formatDate(i.posting_date)}</span></td>
                    <td className="num whitespace-nowrap">{i.due_date ? formatDate(i.due_date) : '—'}{i.days_overdue > 0 && <span className="block text-[11px] text-danger">{i.days_overdue} days late</span>}</td>
                    <td className="dt-num whitespace-nowrap">{formatMoney(i.grand_total, cur)}</td>
                    <td className="dt-num whitespace-nowrap font-semibold">{formatMoney(i.outstanding_amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="dt-bar"><h3 className="dt-title">{S.historyTitle} <span className="num font-normal text-muted">{h?.total ?? ''}</span></h3></div>
        {hist.error ? <div className="p-4 text-xs text-danger">{errorText(hist.error)}</div> : (
          <div className="overflow-x-auto">
            <table className="dt w-max min-w-full">
              <thead><tr><th>Payment</th><th>Date</th><th>Mode</th><th>Reference</th><th>Settled</th><th className="text-end">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {hist.isLoading && !h && <tr><td colSpan={7} className="dt-empty">Loading…</td></tr>}
                {h && h.rows.length === 0 && <tr><td colSpan={7} className="dt-empty">No payments yet.</td></tr>}
                {h?.rows.map((r) => (
                  <tr key={r.name}>
                    <td className="whitespace-nowrap"><Link to={`/payments/${encodeURIComponent(r.name)}`} className="font-medium hover:text-primary hover:underline">{r.name}</Link></td>
                    <td className="num whitespace-nowrap">{formatDate(r.posting_date)}</td>
                    <td className="whitespace-nowrap">{r.mode_of_payment || '—'}</td>
                    <td className="whitespace-nowrap">{r.reference_no || '—'}</td>
                    <td className="text-xs">
                      {r.references.length === 0 && (r.unallocated_amount > 0 ? <span className="text-muted">On account</span> : '—')}
                      {r.references.map((x) => <div key={x.reference_name} className="whitespace-nowrap">{x.reference_name}<span className="num text-muted"> · {formatMoney(x.allocated_amount, cur)}</span></div>)}
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
        {h && <PageBar start={h.start} pageSize={size} total={h.total} onStart={setStart} onSize={(n) => { setSize(n); setStart(0) }} />}
      </section>
    </div>
  )
}
