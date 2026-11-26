import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { HandCoins, History } from 'lucide-react'
import Button from '../../components/Button.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import LinkField from '../../components/fields/LinkField.jsx'
import Select from '../../components/fields/Select.jsx'
import { SIDES } from '../../lib/partySides.js'
import { fifoShares } from '../../lib/fifo.js'
import { ROUTE_OF } from '../../lib/doctypes.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { useBoot } from '../../app/boot-context.js'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { cn } from '../../lib/utils.js'

const today = () => new Date().toISOString().slice(0, 10)
const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0)

/** Receive money from a customer / pay a supplier: tick the invoices, enter the amount, record one Payment Entry. */
export default function PartyPayment({ side }) {
  const S = SIDES[side]
  const { party } = useParams()
  const navigate = useNavigate()
  const boot = useBoot()
  const call = useCall()
  const toast = useToast()
  const key = `party-open:${side}:${boot.company}:${party}`
  const { data, error, isLoading, mutate } = useFrappeGetCall(
    'karya_erp.party_payments.open_invoices', party ? { side, party, company: boot.company } : undefined, party ? key : null, { revalidateOnFocus: false },
  )
  const d = data?.message
  const cur = d?.currency || boot.currency
  const [alloc, setAlloc] = useState({}) // invoice -> amount (string)
  const [amount, setAmount] = useState(null) // null = follow the ticked invoices
  const [mode, setMode] = useState('')
  const [date, setDate] = useState(today())
  const [ref, setRef] = useState('')
  const [refDate, setRefDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [advanceOnly, setAdvanceOnly] = useState(false)

  const invoices = useMemo(() => d?.invoices ?? [], [d])
  const ticked = useMemo(() => (advanceOnly ? [] : invoices.filter((i) => num(alloc[i.name]) > 0)), [invoices, alloc, advanceOnly])
  const allocated = ticked.reduce((s, i) => s + num(alloc[i.name]), 0)
  const paid = amount == null ? allocated : num(amount)
  const mop = mode || (d?.modes?.includes('Cash') ? 'Cash' : d?.modes?.[0]) || ''
  const anyOpen = invoices.some((i) => i.outstanding_amount > 0)
  const route = (dt, n) => (ROUTE_OF[dt] ? `${ROUTE_OF[dt]}/${encodeURIComponent(n)}` : null)
  const invDoctype = side === 'receive' ? 'Sales Invoice' : 'Purchase Invoice'

  // Typing an amount spreads it over the open invoices, oldest due date first; ticking / editing rows still works by hand.
  function typeAmount(v) {
    setAmount(v)
    if (advanceOnly) return
    const share = fifoShares(invoices, num(v), (i) => i.name, (i) => i.outstanding_amount)
    setAlloc(Object.fromEntries(Object.entries(share).map(([k, a]) => [k, String(a)])))
  }

  const tick = (i) => { setAdvanceOnly(false); setAlloc((a) => ({ ...a, [i.name]: num(a[i.name]) > 0 ? '' : String(i.outstanding_amount) })) }
  const tickAll = () => { setAdvanceOnly(false); setAlloc(ticked.length === invoices.filter((i) => i.outstanding_amount > 0).length ? {} : Object.fromEntries(invoices.filter((i) => i.outstanding_amount > 0).map((i) => [i.name, String(i.outstanding_amount)]))) }
  const over = ticked.some((i) => num(alloc[i.name]) > i.outstanding_amount + 0.005)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await call.post('karya_erp.party_payments.settle', {
        side, party, company: boot.company, amount: paid, mode_of_payment: mop, posting_date: date,
        reference_no: ref || undefined, reference_date: refDate || undefined, remarks: remarks || undefined,
        advance_only: advanceOnly ? 1 : undefined,
        allocations: ticked.length ? JSON.stringify(ticked.map((i) => ({ invoice: i.name, amount: num(alloc[i.name]) }))) : undefined,
      })
      const r = res?.message
      setDone(r)
      toast({ tone: 'success', title: `${S.actVerb === 'Pay' ? 'Paid' : 'Received'} ${formatMoney(r.amount, cur)}`, description: r.advance > 0 ? `${formatMoney(r.advance, cur)} kept on account` : `${r.invoices.length} invoice(s) settled` })
      setAlloc({}); setAmount(null); setAdvanceOnly(false); setRef(''); setRefDate(''); setRemarks('')
      await mutate()
    } catch (err) {
      toast({ tone: 'error', title: 'Could not record the payment', description: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={S.actTitle} subtitle={d ? `${d.party_name || party}${d.party_name && d.party_name !== party ? ` · ${party}` : ''}` : S.actSub}>
        <Link to={S.list}><Button>{S.listTitle}</Button></Link>
        <Link to={party ? `${S.history}?party=${encodeURIComponent(party)}` : S.history}><Button icon={History}>{S.historyTitle}</Button></Link>
      </PageHeader>

      <div className="card p-4">
        <label className="block max-w-md space-y-1.5">
          <span className="label">{S.partyType}</span>
          <LinkField doctype={S.partyType} value={party || ''} onChange={(v) => navigate(v ? `${S.act}/${encodeURIComponent(v)}` : S.act)} placeholder={`Choose a ${S.partyType.toLowerCase()}`} />
        </label>
      </div>

      {!party ? (
        <div className="card p-8 text-center text-xs text-muted"><HandCoins className="mx-auto mb-2 size-6 text-muted/60" />Choose a {S.partyType.toLowerCase()} to see their open invoices, or pick one from <Link to={S.list} className="text-primary hover:underline">{S.listTitle}</Link>.</div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error)}</div>
      ) : isLoading || !d ? <div className="card h-64 animate-pulse" /> : (
        <form onSubmit={submit} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="card overflow-hidden">
            <div className="dt-bar">
              <h3 className="dt-title">Open invoices <span className="num font-normal text-muted">{invoices.length}</span></h3>
              <span className="num text-xs text-muted">{S.owed} {formatMoney(d.outstanding, cur)}{d.overdue > 0 && <> · <span className="text-danger">overdue {formatMoney(d.overdue, cur)}</span></>}{d.advance > 0 && <> · on account {formatMoney(d.advance, cur)}</>}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="dt w-max min-w-full">
                <thead>
                  <tr>
                    <th className="w-10"><input type="checkbox" disabled={!anyOpen} checked={anyOpen && ticked.length === invoices.filter((i) => i.outstanding_amount > 0).length} onChange={tickAll} className="size-3.5 accent-[var(--primary)]" aria-label="Select all" /></th>
                    <th>Invoice</th><th>Due</th><th className="text-end">Total</th><th className="text-end">Open</th><th className="text-end">{S.actVerb === 'Pay' ? 'Pay now' : 'Receive now'}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 && <tr><td colSpan={6} className="dt-empty">Nothing open. Any amount you record will be kept on account.</td></tr>}
                  {invoices.map((i) => {
                    const credit = i.outstanding_amount < 0
                    const on = num(alloc[i.name]) > 0
                    return (
                      <tr key={i.name} className={cn(on && 'bg-primary-soft/40')} onClick={() => !credit && tick(i)}>
                        <td><input type="checkbox" disabled={credit} checked={on} onChange={() => tick(i)} onClick={(e) => e.stopPropagation()} className="size-3.5 accent-[var(--primary)]" /></td>
                        <td className="whitespace-nowrap">
                          {route(invDoctype, i.name) ? <Link to={route(invDoctype, i.name)} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary hover:underline">{i.name}</Link> : <span className="font-medium">{i.name}</span>}
                          <span className="block text-[11px] text-muted">{formatDate(i.posting_date)}{i.bill_no ? ` · ${i.bill_no}` : ''}{credit ? ' · credit note' : ''}</span>
                        </td>
                        <td className="num whitespace-nowrap">{i.due_date ? formatDate(i.due_date) : '—'}{i.days_overdue > 0 && <span className="block text-[11px] text-danger">{i.days_overdue} days late</span>}</td>
                        <td className="dt-num whitespace-nowrap">{formatMoney(i.grand_total, i.currency || cur)}</td>
                        <td className="dt-num whitespace-nowrap font-semibold">{formatMoney(i.outstanding_amount, i.currency || cur)}</td>
                        <td className="w-36" onClick={(e) => e.stopPropagation()}>
                          {credit ? <span className="block text-end text-[11px] text-muted">use Payment reconciliation</span> : (
                            <input className="input num h-8 text-end" type="number" min="0" step="0.01" max={i.outstanding_amount} value={alloc[i.name] ?? ''} placeholder="0.00" onChange={(e) => setAlloc((a) => ({ ...a, [i.name]: e.target.value }))} />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="card sticky top-3 space-y-3 p-4">
            <label className="block space-y-1.5">
              <span className="label">Amount</span>
              <input className="input num h-10 text-end text-lg font-semibold" type="number" min="0" step="0.01" value={amount == null ? (allocated ? String(Math.round(allocated * 100) / 100) : '') : amount} placeholder="0.00" onChange={(e) => typeAmount(e.target.value)} />
            </label>
                        <label className="flex items-start gap-2 text-[12px]">
              <input type="checkbox" className="mt-0.5 size-3.5 accent-[var(--primary)]" checked={advanceOnly} onChange={(e) => { setAdvanceOnly(e.target.checked); setAlloc({}) }} />
              <span><b>Advance only</b> — keep the whole amount on account and leave the invoices open.</span>
            </label>
            {paid > allocated + 0.005 && !advanceOnly && (
              <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <b className="num">{formatMoney(paid - allocated, cur)}</b> is more than the open invoices. It is kept as an <b>advance</b> on {d.party_name || party}'s account and can be used against their next {side === 'receive' ? 'invoice' : 'bill'}.
              </p>
            )}
            {ticked.length > 0 && paid + 0.005 < allocated && <p className="text-[11px] text-danger">The amount is less than the invoices ticked.</p>}
            <label className="block space-y-1.5">
              <span className="label">{S.mode}</span>
              <Select value={mop} onChange={(e) => setMode(e.target.value)}>
                {(d.modes || []).map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5"><span className="label">Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
              <label className="block space-y-1.5"><span className="label">Reference date</span><input className="input" type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} /></label>
            </div>
            <label className="block space-y-1.5"><span className="label">Reference no (cheque / transfer)</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
            <label className="block space-y-1.5"><span className="label">Remarks</span><textarea className="input min-h-16 py-2" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!(paid > 0) || !mop || over || (ticked.length > 0 && paid + 0.005 < allocated)}>
              {S.actVerb} {paid > 0 ? formatMoney(paid, cur) : ''}
            </Button>
            {done && <p className="text-[11px] text-muted">Last recorded: <Link className="text-primary hover:underline" to={`/payments/${encodeURIComponent(done.name)}`}>{done.name}</Link></p>}
          </aside>
        </form>
      )}
    </>
  )
}
