import { resolveField } from '../lib/meta.js'
import { formatMoney } from '../lib/format.js'
import { Progress } from './fields/FieldValue.jsx'
import { cn } from '../lib/utils.js'

const EMPHASIS = new Set(['grand_total', 'rounded_total'])

/** Invoice-style totals: ERPNext values in view mode, a live estimate while editing. */
export default function TotalsCard({ meta, fields, doc, editing, estimate, calc, currency, onDiscount }) {
  const resolved = fields.map((f) => resolveField(meta, f)).filter(Boolean)
  const money = resolved.filter((f) => f.fieldtype !== 'Percent')
  const percents = resolved.filter((f) => f.fieldtype === 'Percent')
  const shown = money.filter((f) => f.fieldname === 'grand_total' || Number(doc[f.fieldname]))

  return (
    <div className="card overflow-hidden">
      <div className="dt-bar">
        <h3 className="dt-title">Summary</h3>
      </div>
      <div className="p-4">
        {editing ? (
          <>
            <dl className="space-y-2">
              <Row label="Sub total" value={formatMoney(calc ? calc.total : estimate, currency)} />
              {onDiscount && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <dt className="text-muted">Discount</dt>
                  <dd><input type="number" min="0" step="0.01" inputMode="decimal" className="input num h-7 w-28 text-end" placeholder="0.00" value={doc.discount_amount || ''} onChange={(e) => onDiscount(e.target.value === '' ? 0 : Number(e.target.value))} /></dd>
                </div>
              )}
              {calc && <Row label="Taxes and charges" value={formatMoney(calc.total_taxes_and_charges, currency)} />}
              {calc && Math.abs(calc.round_off) > 0 && <Row label="Round off" value={formatMoney(calc.round_off, currency)} />}
              <Row label="Total" value={formatMoney(calc ? (calc.rounded_total || calc.grand_total) : estimate, currency)} strong />
            </dl>
          </>
        ) : (
          <dl className="space-y-2">
            {shown.map((f) => (
              <Row key={f.fieldname} label={f.label} value={formatMoney(doc[f.fieldname] ?? 0, currency)} strong={EMPHASIS.has(f.fieldname)} />
            ))}
          </dl>
        )}
        {!editing && percents.length > 0 && Number(doc.docstatus) === 1 && (
          <dl className="mt-4 space-y-2 border-t pt-4">
            {percents.map((f) => (
              <div key={f.fieldname} className="flex items-center justify-between gap-3 text-xs">
                <dt className="text-muted">{f.label}</dt>
                <dd><Progress value={doc[f.fieldname]} /></dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', strong ? 'border-t pt-2 text-sm font-semibold first:border-t-0 first:pt-0' : 'text-xs')}>
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd className="num tabular-nums">{value}</dd>
    </div>
  )
}
