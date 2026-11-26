import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, Plus, Table2, Trash2 } from 'lucide-react'
import LinkField from './fields/LinkField.jsx'
import Combobox from './fields/Combobox.jsx'
import FieldValue from './fields/FieldValue.jsx'
import { resolveField } from '../lib/meta.js'
import { formatMoney, formatNumber } from '../lib/format.js'
import StarRating from './fields/StarRating.jsx'
import { cn } from '../lib/utils.js'

const RIGHT = new Set(['Currency', 'Float', 'Int', 'Percent'])

/**
 * Editable child table for any ERPNext Table field (Journal Entry accounts, Payment Entry references,
 * tax template rows …). Configured from doctypes.js:
 *
 *   { field: 'accounts', title: 'Accounting entries', columns: ['account', { field: 'debit_in_account_currency', label: 'Debit' }],
 *     newRow: (doc) => ({}), sum: ['debit_in_account_currency'], balance: ['debit…', 'credit…'],
 *     addRows: true, toolbar: Component }
 *
 * column entries accept everything resolveField does, plus readOnly, filters (obj | (row, doc) => obj), width.
 */
export default function ChildTable({ table, rows, onChange, patchDoc, editing, childMeta, doc, currency, call, toast, boot }) {
  const columns = useMemo(
    () => table.columns.map((c) => resolveField(childMeta, c)).filter(Boolean),
    [table.columns, childMeta],
  )
  // Fields kept out of the grid and edited per line, like ERPNext's row form (e.g. cost center).
  const details = useMemo(
    () => (table.details ?? []).map((c) => resolveField(childMeta, c)).filter(Boolean),
    [table.details, childMeta],
  )
  const [openRows, setOpenRows] = useState(() => new Set())
  const toggleRow = (i) => setOpenRows((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const keyField = columns[0]?.fieldname
  const canAdd = editing && table.addRows !== false
  const hasActions = canAdd || details.length > 0
  const Toolbar = table.toolbar

  const setCell = (i, fieldname, value) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [fieldname]: value } : r))
    // Picking a new party type clears the party; a debit amount clears the credit and vice versa.
    const col = columns.find((c) => c.fieldname === fieldname)
    if (col?.clears) for (const f of col.clears) if (value) next[i][f] = col.fieldtype === 'Currency' ? 0 : null
    onChange(next)
  }
  const addRow = () => onChange([...rows, { ...(table.newRow?.(doc, rows, boot) ?? {}) }])
  const removeRow = (i) => {
    onChange(rows.filter((_, j) => j !== i))
    setOpenRows((s) => new Set([...s].filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))))
  }

  const sums = Object.fromEntries((table.sum ?? []).map((f) => [f, rows.reduce((s, r) => s + (Number(r[f]) || 0), 0)]))
  const diff = table.balance ? (sums[table.balance[0]] ?? 0) - (sums[table.balance[1]] ?? 0) : 0
  const filled = rows.filter((r) => r[keyField]).length

  const cellInput = (c, row, i) => {
    const value = row[c.fieldname]
    const t = c.fieldtype
    if (t === 'Link' || t === 'Dynamic Link') {
      const target = t === 'Link' ? c.options : row[c.options]
      const filters = typeof c.filters === 'function' ? c.filters(row, doc) : c.filters
      return (
        <LinkField
          bare doctype={target} value={value} filters={filters} disabled={!target}
          placeholder={target ? undefined : 'Pick type first'}
          onChange={(v) => setCell(i, c.fieldname, v)}
        />
      )
    }
    if (t === 'Select') {
      const all = String(c.options ?? '').split('\n')
      return (
        <Combobox
          variant="cell" options={all.filter((o) => o !== '')} value={value ?? ''}
          onChange={(v) => setCell(i, c.fieldname, v)} placeholder="—"
        />
      )
    }
    if (t === 'Check') {
      return (
        <div className="flex h-10 items-center justify-center">
          <input type="checkbox" checked={Boolean(Number(value))} onChange={(e) => setCell(i, c.fieldname, e.target.checked ? 1 : 0)} className="size-4 accent-[var(--primary)]" />
        </div>
      )
    }
    if (t === 'Rating') return <div className="flex h-10 items-center px-2"><StarRating value={value} size="sm" onChange={(v) => setCell(i, c.fieldname, v)} label={c.label} /></div>
    if (t === 'Date') return <input type="date" value={value ?? ''} onChange={(e) => setCell(i, c.fieldname, e.target.value)} className="cell-input" />
    if (RIGHT.has(t)) {
      return (
        <input
          type="number" step="any" value={value ?? ''} placeholder="0.00"
          onChange={(e) => setCell(i, c.fieldname, e.target.value === '' ? 0 : Number(e.target.value))}
          className="cell-input num text-end"
        />
      )
    }
    return <input value={value ?? ''} onChange={(e) => setCell(i, c.fieldname, e.target.value)} className="cell-input" />
  }

  const cellValue = (c, row) => {
    if (c.fieldtype === 'Currency') {
      const v = row[c.fieldname]
      return <span className="num">{v == null || v === '' ? '—' : formatMoney(v, currency).replace(`${currency} `, '')}</span>
    }
    if (c.fieldtype === 'Dynamic Link') return <FieldValue field={{ ...c, fieldtype: 'Link', options: row[c.options] }} value={row[c.fieldname]} doc={row} currency={currency} />
    return <FieldValue field={c} value={row[c.fieldname]} doc={row} currency={currency} />
  }

  const editableCol = (c) => editing && !c.readOnly && !(c.readOnlyIf?.(doc))

  // layout: 'cards' — one card per line (labels above fields) instead of a wide grid; good for rows with many fields.
  if (table.layout === 'cards') {
    const sumLabel = (c) => (c.fieldtype === 'Currency' ? formatMoney(sums[c.fieldname], currency).replace(`${currency} `, '') : formatNumber(sums[c.fieldname], 2))
    return (
      <div className="card overflow-hidden">
        <div className="dt-bar">
          <div className="flex items-center gap-2">
            <Table2 className="size-4 text-primary" />
            <h3 className="dt-title">{table.title}</h3>
            <span className="dt-count">{filled}</span>
          </div>
          {Toolbar && <Toolbar doc={doc} rows={rows} onChange={onChange} patchDoc={patchDoc} editing={editing} call={call} toast={toast} />}
        </div>
        <div className="space-y-3 p-3">
          {rows.length === 0 && <p className="dt-empty">{table.empty ?? 'No rows yet'}</p>}
          {rows.map((row, i) => (
            <div key={row.name ?? `new-${i}`} className="rounded-lg border bg-surface/40">
              <div className="flex items-center justify-between border-b px-3 py-1.5">
                <span className="text-xs font-semibold text-muted">{table.rowLabel ?? 'Line'} {i + 1}</span>
                {canAdd && (
                  <button type="button" onClick={() => removeRow(i)} className="dt-del" aria-label={`Remove row ${i + 1}`}><Trash2 /></button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
                {columns.map((c) => (
                  <div key={c.fieldname} className={cn('min-w-0 space-y-1', ['Small Text', 'Text'].includes(c.fieldtype) && 'sm:col-span-2')}>
                    <span className="label block">{c.label}{editing && c.reqd && !c.readOnly && <span className="text-danger"> *</span>}</span>
                    {editableCol(c) ? (
                      <div className="overflow-hidden rounded-md border bg-background">{cellInput(c, row, i)}</div>
                    ) : (
                      <div className="flex min-h-9 items-center text-[13px]">{cellValue(c, row)}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {(canAdd || table.sum) && (
          <div className="dt-foot">
            {canAdd ? <button type="button" onClick={addRow} className="dt-add"><Plus /> Add row</button> : <span />}
            {table.sum && rows.length > 0 && (
              <span className="num text-[11px] font-medium">
                {columns.filter((c) => c.fieldname in sums).map((c) => `${c.label}: ${sumLabel(c)}`).join('  ·  ')}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="dt-bar">
        <div className="flex items-center gap-2">
          <Table2 className="size-4 text-primary" />
          <h3 className="dt-title">{table.title}</h3>
          <span className="dt-count">{filled}</span>
        </div>
        {Toolbar && <Toolbar doc={doc} rows={rows} onChange={onChange} patchDoc={patchDoc} editing={editing} call={call} toast={toast} />}
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <table className="dt dt-grid grid-table" style={{ minWidth: `${Math.max(560, columns.length * 150)}px` }}>
          <thead>
            <tr>
              <th className="dt-idx">#</th>
              {columns.map((c) => (
                <th key={c.fieldname} className={cn(RIGHT.has(c.fieldtype) && 'text-end')} style={c.width ? { width: c.width } : undefined}>
                  {c.label}{editing && c.reqd && !c.readOnly && <span className="text-danger"> *</span>}
                </th>
              ))}
              {hasActions && <th className={cn('dt-act', canAdd && details.length > 0 && 'w-20')} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 2} className="dt-empty">{table.empty ?? 'No rows yet'}</td></tr>
            )}
            {rows.map((row, i) => (
              <Fragment key={row.name ?? `new-${i}`}>
              <tr className="group">
                <td className="dt-idx">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.fieldname} className={cn(RIGHT.has(c.fieldtype) && 'text-end')}>
                    {editableCol(c) ? cellInput(c, row, i) : (
                      <div className={cn('flex min-h-10 items-center px-3 py-1.5', RIGHT.has(c.fieldtype) && 'justify-end')}>{cellValue(c, row)}</div>
                    )}
                  </td>
                ))}
                {hasActions && (
                  <td className="dt-act">
                    <div className="flex items-center justify-center gap-0.5">
                      {details.length > 0 && (
                        <button
                          type="button" tabIndex={-1} onClick={() => toggleRow(i)} aria-expanded={openRows.has(i)}
                          className="dt-del hover:!bg-surface-2 hover:!text-foreground" title="Line details" aria-label={`Details of row ${i + 1}`}
                        >
                          <ChevronDown className={cn('transition-transform duration-200', openRows.has(i) && 'rotate-180 text-primary')} />
                        </button>
                      )}
                      {canAdd && (
                        <button type="button" tabIndex={-1} onClick={() => removeRow(i)} className="dt-del" aria-label={`Remove row ${i + 1}`}>
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
              {openRows.has(i) && (
                <tr className="hover:!bg-transparent">
                  <td className="dt-idx" />
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="!p-0">
                    <div className="animate-fade-in border-s-2 border-primary/50 bg-surface/50 px-3 py-3">
                      <p className="mb-2 text-xs font-semibold text-muted">Line {i + 1} details</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {details.map((c) => (
                          <div key={c.fieldname} className={cn('min-w-0 space-y-1', ['Small Text', 'Text'].includes(c.fieldtype) && 'sm:col-span-2')}>
                            <span className="label block">{c.label}</span>
                            {editableCol(c) ? (
                              <div className="overflow-hidden rounded-md border bg-background">{cellInput(c, row, i)}</div>
                            ) : (
                              <div className="flex min-h-9 items-center text-[13px]">{cellValue(c, row)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
          {table.sum && rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="dt-idx" />
                {columns.map((c, ci) => (
                  <td key={c.fieldname} className={cn(RIGHT.has(c.fieldtype) && 'text-end')}>
                    {c.fieldname in sums
                      ? <span className="num">{c.fieldtype === 'Currency' ? formatMoney(sums[c.fieldname], currency).replace(`${currency} `, '') : formatNumber(sums[c.fieldname], 2)}</span>
                      : ci === 0 ? <span className="text-xs text-muted">Total</span> : null}
                  </td>
                ))}
                {hasActions && <td className="dt-act" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {(canAdd || table.balance) && (
        <div className="dt-foot">
          {canAdd ? (
            <button type="button" onClick={addRow} className="dt-add">
              <Plus /> Add row
            </button>
          ) : <span />}
          {table.balance && (
            Math.abs(diff) < 0.005
              ? <span className="text-[11px] font-medium text-success">Balanced</span>
              : <span className="num text-[11px] font-medium text-danger">Difference {formatMoney(Math.abs(diff), currency)} ({diff > 0 ? 'debit' : 'credit'} side higher)</span>
          )}
        </div>
      )}
    </div>
  )
}
