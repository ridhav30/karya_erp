import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { HandCoins, History, Search } from 'lucide-react'
import Button from '../../components/Button.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import PageBar from '../../components/PageBar.jsx'
import { SIDES } from '../../lib/partySides.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { useBoot } from '../../app/boot-context.js'

/** Accounts receivable / payable: one row per customer or supplier with what is open, overdue and on account. */
export default function PartyBalances({ side }) {
  const S = SIDES[side]
  const boot = useBoot()
  const [start, setStart] = useState(0)
  const [size, setSize] = useState(20)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const id = setTimeout(() => { setSearch(q); setStart(0) }, 300); return () => clearTimeout(id) }, [q])
  const { data, error, isLoading } = useFrappeGetCall(
    'karya_erp.party_payments.balances', { side, company: boot.company, search: search || undefined, start, page_length: size },
    `party-balances:${side}:${boot.company}:${search}:${start}:${size}`, { revalidateOnFocus: false, keepPreviousData: true },
  )
  const d = data?.message
  const cur = d?.currency || boot.currency
  const key = encodeURIComponent

  return (
    <>
      <PageHeader title={S.listTitle} subtitle={S.listSub}>
        <Link to={S.history}><Button icon={History}>{S.historyTitle}</Button></Link>
        <Link to={S.act}><Button variant="primary" icon={HandCoins}>{S.actTitle}</Button></Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-muted">{S.partyType === 'Customer' ? 'Customers owing' : 'Suppliers owed'}</div><div className="num mt-1 text-xl font-semibold">{d?.total ?? '—'}</div></div>
        <div className="card p-4"><div className="text-xs text-muted">{S.owedLabel}</div><div className="num mt-1 text-xl font-semibold">{d ? formatMoney(d.outstanding, cur) : '—'}</div></div>
        <div className="card p-4"><div className="text-xs text-muted">Overdue</div><div className="num mt-1 text-xl font-semibold text-danger">{d ? formatMoney(d.overdue, cur) : '—'}</div></div>
      </div>

      <section className="card overflow-hidden">
        <div className="dt-bar">
          <label className="relative block w-full max-w-xs">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input className="input h-8 ps-8" placeholder={`Search ${S.plural}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {error ? <div className="p-4 text-xs text-danger">{errorText(error)}</div> : (
          <div className="overflow-x-auto">
            <table className="dt w-max min-w-full">
              <thead>
                <tr><th>{S.partyType}</th><th className="text-end">{S.owed}</th><th className="text-end">Overdue</th><th className="text-end">Open invoices</th><th className="text-end">On account</th><th>{S.last}</th><th className="w-px" /></tr>
              </thead>
              <tbody>
                {isLoading && !d && <tr><td colSpan={7} className="dt-empty">Loading…</td></tr>}
                {d && d.rows.length === 0 && <tr><td colSpan={7} className="dt-empty">{search ? 'No match.' : `No ${S.plural} with a balance.`}</td></tr>}
                {d?.rows.map((r) => (
                  <tr key={r.party}>
                    <td><Link to={`${S.act}/${key(r.party)}`} className="font-medium hover:text-primary hover:underline">{r.party_name || r.party}</Link>{r.party_name && r.party_name !== r.party && <span className="block text-[11px] text-muted">{r.party}</span>}</td>
                    <td className="dt-num whitespace-nowrap font-semibold">{formatMoney(r.outstanding, cur)}</td>
                    <td className={`dt-num whitespace-nowrap ${r.overdue > 0 ? 'text-danger' : 'text-muted'}`}>{r.overdue > 0 ? formatMoney(r.overdue, cur) : '—'}</td>
                    <td className="dt-num">{r.open_invoices}</td>
                    <td className="dt-num whitespace-nowrap">{r.advance > 0 ? formatMoney(r.advance, cur) : '—'}</td>
                    <td className="num whitespace-nowrap text-muted">{r.last_payment ? formatDate(r.last_payment) : '—'}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <Link to={`${S.history}?party=${key(r.party)}`}><Button size="sm" icon={History}>History</Button></Link>
                        <Link to={`${S.act}/${key(r.party)}`}><Button size="sm" variant="accent" icon={HandCoins}>{S.actVerb}</Button></Link>
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
    </>
  )
}
