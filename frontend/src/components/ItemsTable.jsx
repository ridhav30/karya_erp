import { useEffect, useRef } from 'react'
import { Minus, Package, Plus, Trash2 } from 'lucide-react'
import LinkField from './fields/LinkField.jsx'
import FieldValue from './fields/FieldValue.jsx'
import { resolveField } from '../lib/meta.js'
import { useCall } from '../lib/useCall.js'
import { formatMoney, formatNumber } from '../lib/format.js'
import { cn } from '../lib/utils.js'

const NUM = new Set(['Currency', 'Float', 'Int', 'Percent'])
const WAREHOUSE_FIELDS = new Set(['warehouse', 's_warehouse', 't_warehouse'])
const NUMBER_INPUTS = new Set(['qty', 'rate', 'basic_rate'])
// Only computed money columns are right-aligned; everything you type in is left-aligned.
const alignRight = (c) => NUM.has(c.fieldtype) && !NUMBER_INPUTS.has(c.fieldname)

/**
 * Invoice line editor.
 * Desktop: spreadsheet grid (Tab through cells, Tab on the last cell adds a row).
 * Mobile: one card per line with a quantity stepper.
 * Picking an item calls ERPNext get_item_details to fill name, UOM, rate and warehouse.
 */
export default function ItemsTable({ rows, onChange, editing, childMeta, itemsConfig, pricing, parentDoctype, doc, currency }) {
  const call = useCall()
  const tableRef = useRef(null)
  const focusRow = useRef(null)
  const columns = itemsConfig.columns.map((c) => resolveField(childMeta, c)).filter(Boolean)
  const hasAmount = columns.some((c) => c.fieldname === 'amount')
  const isEditable = (c) => editing && (c.fieldname === 'item_code' || WAREHOUSE_FIELDS.has(c.fieldname) || NUMBER_INPUTS.has(c.fieldname) || c.fieldtype === 'Date')
  const editableCols = columns.filter(isEditable)
  const lastEditable = editableCols[editableCols.length - 1]?.fieldname
  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0)
  const warehouseFilters = { is_group: 0, ...(doc.company ? { company: doc.company } : {}) }

  // Focus the item cell of a freshly added row.
  useEffect(() => {
    if (focusRow.current == null) return
    tableRef.current?.querySelector(`[data-row="${focusRow.current}"] input`)?.focus()
    focusRow.current = null
  }, [rows.length])

  const setRow = (i, patch) => {
    onChange(rows.map((r, idx) => {
      if (idx !== i) return r
      const row = { ...r, ...patch }
      if (hasAmount) row.amount = (Number(row.qty) || 0) * (Number(row.rate) || 0)
      return row
    }))
  }
  const addRow = (focus = true) => {
    onChange([...rows, { qty: 1 }])
    if (focus) focusRow.current = rows.length
  }
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i))

  async function pickItem(i, code) {
    const row = rows[i]
    if (!code) { setRow(i, { item_code: '', item_name: '' }); return }
    setRow(i, { item_code: code })
    const details = await fetchItemDetails(code, row)
    if (details) setRow(i, { item_code: code, ...details })
  }

  async function fetchItemDetails(code, row) {
    if (pricing && !itemsConfig.basicDetails) {
      const ctx = {
        item_code: code, company: doc.company, doctype: parentDoctype, child_doctype: childMeta?.name,
        currency: doc.currency, conversion_rate: doc.conversion_rate || 1,
        price_list: pricing.priceList ? doc[pricing.priceList] : undefined,
        price_list_currency: doc.price_list_currency || doc.currency, plc_conversion_rate: doc.plc_conversion_rate || 1,
        transaction_date: doc[pricing.dateField], posting_date: doc[pricing.dateField],
        qty: row.qty || 1, conversion_factor: 1, warehouse: row.warehouse || doc.set_warehouse,
        is_return: doc.is_return || 0, ignore_pricing_rule: 0, name: doc.name,
      }
      if (pricing.partyField && (pricing.partyField !== 'party_name' || doc.quotation_to === 'Customer')) {
        ctx[pricing.partyKey] = doc[pricing.partyField]
      }
      try {
        // `args` (v14/v15) and `ctx` (v16) — Frappe ignores the one the method doesn't take
        const res = await call.post('erpnext.stock.get_item_details.get_item_details', { args: ctx, ctx })
        const d = res?.message
        if (d) {
          return {
            item_name: d.item_name, description: d.description, uom: d.uom, stock_uom: d.stock_uom,
            conversion_factor: d.conversion_factor || 1, price_list_rate: d.price_list_rate,
            ...(d.item_tax_template ? { item_tax_template: d.item_tax_template } : {}),
            rate: d.rate || d.price_list_rate || row.rate || 0,
            warehouse: row.warehouse || d.warehouse || doc.set_warehouse,
          }
        }
      } catch { /* fall back to basic details */ }
    }
    try {
      const res = await call.get('frappe.client.get_value', {
        doctype: 'Item', fieldname: ['item_name', 'stock_uom', 'description', 'valuation_rate'], filters: code,
      })
      const d = res?.message ?? {}
      const out = { item_name: d.item_name, description: d.description, uom: d.stock_uom, stock_uom: d.stock_uom, conversion_factor: 1 }
      if (itemsConfig.basicDetails) {
        out.s_warehouse = row.s_warehouse || doc[itemsConfig.sourceWarehouse]
        out.t_warehouse = row.t_warehouse || doc[itemsConfig.targetWarehouse]
        if (!row.basic_rate && d.valuation_rate) out.basic_rate = d.valuation_rate
      }
      return out
    } catch {
      return null
    }
  }

  // Tab on the last editable cell of the last row inserts a new row.
  const onCellKeyDown = (i, fieldname) => (e) => {
    if (e.key === 'Tab' && !e.shiftKey && i === rows.length - 1 && fieldname === lastEditable) {
      e.preventDefault()
      addRow()
    }
  }

  const amountOf = (row) => (editing ? (Number(row.qty) || 0) * (Number(row.rate) || 0) : row.amount)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="dt-bar">
        <div className="flex items-center gap-2">
          <Package className="size-4 text-primary" />
          <h3 className="dt-title">Items</h3>
          <span className="dt-count">{rows.filter((r) => r.item_code).length}</span>
        </div>
        <span className="num text-[11px] text-muted">Qty <span className="font-semibold text-foreground">{formatNumber(totalQty, 3)}</span></span>
      </div>

      {/* Desktop grid */}
      <div ref={tableRef} className="hidden w-full overflow-x-auto md:block">
        <table className="dt dt-grid grid-table">
          <thead>
            <tr>
              <th className="dt-idx">#</th>
              {columns.map((c) => (
                <th
                  key={c.fieldname}
                  className={cn(
                    NUM.has(c.fieldtype) && 'w-36', alignRight(c) && 'text-end',
                    WAREHOUSE_FIELDS.has(c.fieldname) && 'w-48',
                    c.fieldname === 'uom' && 'w-20',
                  )}
                >
                  {c.label}{(c.fieldtype === 'Currency' && currency) ? ` (${currency})` : ''}{c.fieldname === 'item_code' && editing ? ' *' : ''}
                </th>
              ))}
              {editing && <th className="dt-act" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 2} className="dt-empty">No items yet</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.name ?? `new-${i}`} data-row={i} className="group">
                <td className="dt-idx">{i + 1}</td>
                {columns.map((c) => (
                  <td
                    key={c.fieldname}
                    className={cn(alignRight(c) && 'text-end', c.fieldname === 'amount' && 'bg-surface/30 font-semibold')}
                  >
                    {isEditable(c) ? (
                      <GridInput
                        field={c} row={row} warehouseFilters={warehouseFilters} itemFilters={pricing?.itemFilters}
                        onPickItem={(code) => pickItem(i, code)}
                        onChange={(v) => setRow(i, { [c.fieldname]: v })}
                        onKeyDown={onCellKeyDown(i, c.fieldname)}
                      />
                    ) : (
                      <div className={cn('flex min-h-10 flex-col justify-center px-3 py-1.5', alignRight(c) && 'items-end')}>
                        {c.fieldname === 'amount'
                          ? <span className="num">{formatMoney(amountOf(row) ?? 0, currency).replace(`${currency} `, '')}</span>
                          : c.fieldname === 'uom'
                            ? <UomChip uom={row.uom} />
                            : <FieldValue field={c} value={row[c.fieldname]} doc={row} currency={currency} />}
                        {c.fieldname === 'item_code' && row.item_name && row.item_name !== row.item_code && (
                          <span className="truncate text-[11px] leading-tight text-muted">{row.item_name}</span>
                        )}
                      </div>
                    )}
                  </td>
                ))}
                {editing && (
                  <td className="dt-act">
                    <button type="button" tabIndex={-1} onClick={() => removeRow(i)} className="dt-del" aria-label={`Remove row ${i + 1}`}>
                      <Trash2 />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <div className="dt-foot">
            <button type="button" onClick={() => addRow()} className="dt-add">
              <Plus /> Add row
            </button>
            <span className="text-[11px] text-muted">
              Press <kbd className="num rounded border bg-background px-1 py-0.5 text-[10px]">Tab</kbd> on the last cell to add a row
            </span>
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="divide-y md:hidden">
        {rows.length === 0 && (
          <div className="space-y-2 px-4 py-8 text-center text-muted">
            <Package className="mx-auto size-8 stroke-1" />
            <p className="text-xs font-medium">No items yet</p>
          </div>
        )}
        {rows.map((row, i) => (
          <div key={row.name ?? `m-${i}`} className="space-y-3 p-3.5">
            <div className="flex items-start gap-2">
              <span className="num mt-2 shrink-0 text-xs font-semibold text-muted">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <LinkField doctype="Item" value={row.item_code} onChange={(code) => pickItem(i, code)} filters={{ disabled: 0, ...(pricing?.itemFilters ?? {}) }} placeholder="Select item…" />
                ) : (
                  <div className="pt-1.5 font-semibold leading-snug">{row.item_code}</div>
                )}
                {row.item_name && row.item_name !== row.item_code && <div className="mt-0.5 px-0.5 text-[11px] text-muted">{row.item_name}</div>}
              </div>
              {editing && (
                <button type="button" onClick={() => removeRow(i)} className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-rose-500/80 hover:bg-rose-50 hover:text-danger dark:hover:bg-rose-950/40" aria-label={`Remove row ${i + 1}`}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>

            {columns.filter((c) => WAREHOUSE_FIELDS.has(c.fieldname)).map((c) => (
              <div key={c.fieldname} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] font-medium text-muted">{c.label}</span>
                {editing
                  ? <LinkField doctype="Warehouse" value={row[c.fieldname]} onChange={(v) => setRow(i, { [c.fieldname]: v })} filters={warehouseFilters} placeholder="Warehouse" className="min-w-0 flex-1" />
                  : <span className="text-xs">{row[c.fieldname] || '—'}</span>}
              </div>
            ))}

            <div className="flex items-end justify-between gap-3">
              <div className="space-y-1">
                <span className="block text-[10px] font-medium text-muted">Qty</span>
                {editing ? (
                  <div className="inline-flex h-8 items-center overflow-hidden rounded-md border bg-background">
                    <button type="button" onClick={() => setRow(i, { qty: Math.max(0, (Number(row.qty) || 0) - 1) })} className="grid h-full w-8 place-items-center border-e hover:bg-surface-2" aria-label="Decrease quantity"><Minus className="size-3" /></button>
                    <input
                      type="number" inputMode="decimal" value={row.qty ?? ''}
                      onChange={(e) => setRow(i, { qty: e.target.value === '' ? null : Number(e.target.value) })}
                      className="num h-full w-12 bg-transparent text-center text-xs font-semibold outline-none"
                      aria-label="Quantity"
                    />
                    <button type="button" onClick={() => setRow(i, { qty: (Number(row.qty) || 0) + 1 })} className="grid h-full w-8 place-items-center border-s hover:bg-surface-2" aria-label="Increase quantity"><Plus className="size-3" /></button>
                  </div>
                ) : (
                  <div className="num flex h-8 items-center gap-1 rounded-md border bg-surface px-2.5 text-xs font-semibold">{formatNumber(row.qty, 3)} <span className="text-[10px] font-normal text-muted">{row.uom}</span></div>
                )}
              </div>
              {columns.some((c) => c.fieldname === 'rate' || c.fieldname === 'basic_rate') && (
                <div className="space-y-1">
                  <span className="block text-[10px] font-medium text-muted">Rate</span>
                  {editing ? (
                    <input
                      type="number" inputMode="decimal" value={row.rate ?? row.basic_rate ?? ''}
                      onChange={(e) => setRow(i, { [itemsConfig.basicDetails ? 'basic_rate' : 'rate']: e.target.value === '' ? null : Number(e.target.value) })}
                      className="input num h-8 w-24 text-xs"
                      aria-label="Rate"
                    />
                  ) : (
                    <div className="num flex h-8 items-center rounded-md border bg-surface px-2 text-xs">{formatNumber(row.rate ?? row.basic_rate, 2)}</div>
                  )}
                </div>
              )}
              {hasAmount && (
                <div className="ms-auto space-y-1 text-end">
                  <span className="block text-[10px] font-medium text-muted">Amount</span>
                  <div className="num flex h-8 items-center text-sm font-semibold">{formatMoney(amountOf(row) ?? 0, currency)}</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {editing && (
          <div className="dt-foot">
            <button type="button" onClick={() => addRow(false)} className="dt-add">
              <Plus /> Add item
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function UomChip({ uom }) {
  if (!uom) return <span className="text-muted">—</span>
  return <span className="num rounded border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-zinc-400">{uom}</span>
}

/** Borderless input that fills a grid cell. */
function GridInput({ field, row, onChange, onPickItem, onKeyDown, warehouseFilters, itemFilters }) {
  if (field.fieldname === 'item_code') {
    return (
      <div onKeyDown={onKeyDown}>
        <LinkField bare doctype="Item" value={row.item_code} onChange={onPickItem} filters={{ disabled: 0, ...(itemFilters ?? {}) }} placeholder="Select item…" />
        {row.item_name && row.item_name !== row.item_code && <div className="-mt-2 truncate px-3 pb-1 text-[11px] leading-tight text-muted">{row.item_name}</div>}
      </div>
    )
  }
  if (WAREHOUSE_FIELDS.has(field.fieldname)) {
    return (
      <div onKeyDown={onKeyDown}>
        <LinkField bare doctype="Warehouse" value={row[field.fieldname]} onChange={onChange} filters={warehouseFilters} placeholder="Warehouse" />
      </div>
    )
  }
  if (field.fieldtype === 'Date') {
    return <input type="date" value={row[field.fieldname] ?? ''} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} className="cell-input num" />
  }
  return (
    <input
      type="number" step="any" min={0} inputMode="decimal" value={row[field.fieldname] ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      onKeyDown={onKeyDown}
      className="cell-input num"
      aria-label={field.label}
    />
  )
}
