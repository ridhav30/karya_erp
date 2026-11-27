import { Calendar, Eye, FileText, Pencil, Heart, Trash2, UserCheck } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'
import FieldValue from './fields/FieldValue.jsx'
import { Spinner } from './Spinner.jsx'
import { formatDate, formatMoney } from '../lib/format.js'
import { rowStatus } from '../lib/status.js'

const AMOUNT_TYPES = new Set(['Currency'])


/**
 * Phone listing (below md): one card per record.
 *   Row 1: ID (mono) + status    Row 2: party (blue) + date
 *   Amount box: up to two money columns    Footer: View / Edit / Delete
 * Card content is derived from the list columns, so every doctype gets it without extra config.
 */
export default function MobileList({ config, columns, rows, loading, currency, empty, onView, onEdit, onDelete, deleting, wish }) {
  // Masters (e.g. Customer) have no "name" column: their first column is the headline.
  const headline = columns.some((c) => c.fieldname === 'name') ? null : columns[0]
  const titleCol = columns.find((c) => c.fieldname === config.titleField && c.fieldname !== 'name' && c.fieldname !== headline?.fieldname)
  const dateCol = columns.find((c) => c.fieldtype === 'Date')
  const moneyCols = columns.filter((c) => AMOUNT_TYPES.has(c.fieldtype)).slice(0, 2)
  const used = new Set(['name', 'status', 'disabled', 'docstatus', headline?.fieldname, titleCol?.fieldname, dateCol?.fieldname, ...moneyCols.map((c) => c.fieldname)])
  const extraCols = columns.filter((c) => !used.has(c.fieldname) && c.fieldtype !== 'DocStatus' && c.fieldtype !== 'Active').slice(0, moneyCols.length ? 2 : 3)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted">
        <Spinner className="size-5 text-primary" />
        <span>Loading {config.title.toLowerCase()}…</span>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-center">
        <FileText className="size-7 stroke-1 text-muted" />
        <p className="text-xs font-semibold">No {config.title} found</p>
        <p className="px-6 text-[11px] text-muted">{empty}</p>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {rows.map((row) => {
        const status = rowStatus(config, row)
        const isDraft = Number(row.docstatus ?? 0) === 0
        const canEdit = onEdit && !config.readOnly && !config.noDocPage && isDraft
        const canDelete = onDelete && !config.readOnly && !config.noDocPage && isDraft && !config.statusFromDisabled
        const open = config.noDocPage ? undefined : () => onView(row)
        const headText = headline ? row[headline.fieldname] : row.name

        return (
          <div key={row.name} className="space-y-2.5 p-3.5 transition-colors active:bg-surface">
            {/* Row 1: ID + status */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={open}
                disabled={!open}
                className={`min-w-0 truncate text-start text-xs font-semibold hover:text-primary hover:underline disabled:no-underline ${headline ? '' : 'num'}`}
              >
                {headText || row.name}
              </button>
              <span className="flex shrink-0 items-center gap-1.5">
                {status && <StatusBadge status={status} />}
                {wish && (
                  <button type="button" onClick={() => wish.toggle(row.name)} aria-pressed={wish.has(row.name)} title={wish.has(row.name) ? 'Remove from wishlist' : 'Add to wishlist'} className="grid size-6 place-items-center rounded text-muted">
                    <Heart className={`size-4 ${wish.has(row.name) ? 'fill-wishlist text-wishlist' : ''}`} />
                  </button>
                )}
              </span>
            </div>

            {/* Row 2: party + date */}
            {(titleCol || dateCol) && (
              <div className="flex items-center justify-between gap-2">
                {titleCol && row[titleCol.fieldname] ? (
                  <button type="button" onClick={open} className="group flex min-w-0 items-center gap-1.5 text-start text-xs font-medium text-primary hover:underline">
                    <UserCheck className="size-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{row[titleCol.fieldname]}</span>
                  </button>
                ) : <span />}
                {dateCol && (
                  <span className="num flex shrink-0 items-center gap-1 text-[11px] text-muted">
                    <Calendar className="size-3" />{formatDate(row[dateCol.fieldname])}
                  </span>
                )}
              </div>
            )}

            {/* Amount box */}
            {moneyCols.length > 0 && (
              <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface p-2 text-xs">
                {moneyCols.map((c, i) => {
                  const v = Number(row[c.fieldname] ?? 0)
                  const isBalance = c.fieldname === 'outstanding_amount'
                  return (
                    <div key={c.fieldname} className={i === 1 ? 'text-end' : ''}>
                      <span className="block text-[10px] text-muted">{isBalance ? 'Balance due' : c.label}</span>
                      <span className={`num font-semibold ${isBalance ? (v > 0.005 ? 'text-warning' : 'text-muted') : ''}`}>
                        {formatMoney(v, row.currency || currency)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Other columns as small key/value pairs */}
            {extraCols.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {extraCols.map((c) => (
                  <div key={c.fieldname} className="min-w-0">
                    <dt className="truncate text-[10px] text-muted">{c.label}</dt>
                    <dd className="truncate"><FieldValue field={c} value={row[c.fieldname]} doc={row} currency={row.currency || currency} /></dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Actions */}
            {open && (
              <div className="flex items-center justify-end gap-1.5 pt-0.5">
                <button type="button" onClick={open} className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400">
                  <Eye className="size-3 text-emerald-600 dark:text-emerald-400" /> View
                </button>
                {canEdit && (
                  <button type="button" onClick={() => onEdit(row)} className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-surface-2">
                    <Pencil className="size-3 text-primary" /> Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button" onClick={() => onDelete(row)} disabled={deleting === row.name}
                    className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-medium text-gray-600 hover:bg-rose-50 hover:text-danger disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="size-3 text-rose-500" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
