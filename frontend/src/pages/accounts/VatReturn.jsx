import { useState } from 'react'
import { Link } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { ArrowLeft, Info, Printer } from 'lucide-react'
import Button from '../../components/Button.jsx'
import FilterPopover from '../../components/FilterPopover.jsx'
import { useBoot } from '../../app/boot-context.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Calendar quarters; UAE VAT periods are usually quarterly (some businesses file monthly). */
function presets() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const quarter = (y, qi) => [iso(new Date(y, qi * 3, 1)), iso(new Date(y, qi * 3 + 3, 0))]
  const prevQ = q === 0 ? [now.getFullYear() - 1, 3] : [now.getFullYear(), q - 1]
  return [
    { label: 'This quarter', range: quarter(now.getFullYear(), q) },
    { label: 'Last quarter', range: quarter(...prevQ) },
    { label: 'This month', range: [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))] },
    { label: 'Last month', range: [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))] },
  ]
}

export default function VatReturn() {
  const boot = useBoot()
  const options = presets()
  const [range, setRange] = useState(options[1].range)
  const [from, to] = range
  const { data, error, isLoading } = useFrappeGetCall(
    'karya_erp.accounts.vat_return', { company: boot.company, from_date: from, to_date: to },
    from && to ? `vat:${boot.company}:${from}:${to}` : null, { revalidateOnFocus: false, keepPreviousData: true },
  )
  const v = data?.message
  const cur = v?.currency || boot.currency
  const m = (x) => formatMoney(x ?? 0, cur)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/financial-reports" title="All reports" className="pressable grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted hover:bg-surface-2 hover:text-foreground"><ArrowLeft className="size-4" /></Link>
          <div>
            <div className="text-sm font-bold">VAT Return</div>
            <div className="text-xs text-muted">UAE VAT 5% · summary for the VAT 201 form</div>
          </div>
        </div>
        <Button icon={Printer} onClick={() => window.print()}>Print</Button>
      </div>

      <FilterPopover
        className="justify-end print:hidden"
        fields={[{ field: 'period', label: 'Period', type: 'Date', range: true, reqd: true }]}
        values={{ period: range }}
        defaults={{ period: options[1].range }}
        onApply={(v) => setRange([v.period?.[0] || from, v.period?.[1] || to])}
        extra={({ draft, setDraft }) => (
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => {
              const on = draft.period?.[0] === o.range[0] && draft.period?.[1] === o.range[1]
              return (
                <button
                  key={o.label} type="button" onClick={() => setDraft({ ...draft, period: o.range })}
                  className={cn('inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium', on ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-background text-muted hover:text-foreground')}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        )}
      />

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error, 'Could not build the VAT return.')}</div>}

      {!error && (
        <div className={cn('space-y-4 transition-opacity', isLoading && 'opacity-60')}>
          <div className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{v?.company ?? boot.company}</p>
                <p className="num text-xs text-muted">TRN {v?.trn || '— (set Tax ID on the Company)'} · {formatDate(from)} – {formatDate(to)}</p>
              </div>
              <div className="text-end">
                <p className="text-xs text-muted">{(v?.net_vat ?? 0) >= 0 ? 'Net VAT payable' : 'Net VAT refundable'}</p>
                <p className={cn('num text-2xl font-bold', (v?.net_vat ?? 0) < 0 && 'text-success')}>{m(Math.abs(v?.net_vat ?? 0))}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Side
              title="Sales (output VAT)" side={v?.sales} money={m}
              rows={[
                ['Box 1', 'Standard rated supplies', v?.sales?.standard_amount, v?.sales?.standard_vat],
                ['Box 4–5', 'Zero-rated / exempt supplies', v?.sales?.zero_exempt_amount, null],
                ['Box 8', 'Total', (v?.sales?.standard_amount ?? 0) + (v?.sales?.zero_exempt_amount ?? 0), v?.sales?.standard_vat],
              ]}
            />
            <Side
              title="Purchases (input VAT)" side={v?.purchases} money={m}
              rows={[
                ['Box 9', 'Standard rated expenses', v?.purchases?.standard_amount, v?.purchases?.standard_vat],
                ['', 'Zero-rated / exempt purchases', v?.purchases?.zero_exempt_amount, null],
                ['Box 11', 'Total', (v?.purchases?.standard_amount ?? 0) + (v?.purchases?.zero_exempt_amount ?? 0), v?.purchases?.standard_vat],
              ]}
            />
          </div>

          <div className="card overflow-hidden">
            <table className="dt">
              <tbody>
                <tr><td className="text-muted">Box 12 · Total value of due tax for the period</td><td className="dt-num">{m(v?.output_vat)}</td></tr>
                <tr><td className="text-muted">Box 13 · Total value of recoverable tax for the period</td><td className="dt-num">{m(v?.input_vat)}</td></tr>
                <tr className="dt-total"><td>Box 14 · Payable tax for the period</td><td className="dt-num">{m(v?.net_vat)}</td></tr>
              </tbody>
            </table>
          </div>

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Built from submitted sales and purchase invoices dated in the period (credit and debit notes net off). Invoices that carry tax count as standard rated;
            invoices without tax are shown as zero-rated / exempt together. The emirate split (Box 1a–1g), reverse charge and tourist refunds are not split out —
            use ERPNext's UAE VAT 201 report for those, and check figures with your tax agent before filing.
          </p>
        </div>
      )}
    </div>
  )
}

function Side({ title, side, rows, money }) {
  if (side === null) return <div className="card p-4 text-xs text-muted">{title}: you don't have permission to read these invoices.</div>
  return (
    <div className="card overflow-hidden">
      <div className="dt-bar">
        <h3 className="dt-title">{title}</h3>
        <span className="num text-[11px] text-muted">{side?.documents ?? 0} invoices{side?.returns ? ` · ${side.returns} returns` : ''}</span>
      </div>
      <table className="dt">
        <thead>
          <tr><th colSpan={2}>Description</th><th className="text-end">Amount</th><th className="text-end">VAT</th></tr>
        </thead>
        <tbody>
          {rows.map(([box, label, amount, vat], i) => (
            <tr key={label} className={cn(i === rows.length - 1 && 'dt-total')}>
              <td className="num w-20 whitespace-nowrap text-[11px] text-muted">{box}</td>
              <td>{label}</td>
              <td className="dt-num">{money(amount)}</td>
              <td className="dt-num">{vat == null ? <span className="text-muted">—</span> : money(vat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(side?.by_account?.length ?? 0) > 0 && (
        <div className="border-t px-4 py-3">
          <p className="mb-1.5 text-xs font-semibold text-muted">By tax account</p>
          {side.by_account.map((a) => (
            <div key={a.account} className="flex justify-between gap-3 py-0.5 text-xs">
              <Link to={`/financial-reports/general-ledger?account=${encodeURIComponent(a.account)}`} className="truncate text-primary hover:underline">{a.account}</Link>
              <span className="num">{money(a.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
