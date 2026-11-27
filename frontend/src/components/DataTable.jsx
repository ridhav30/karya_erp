import { ArrowDown, ArrowUp, Heart } from 'lucide-react'
import FieldValue from './fields/FieldValue.jsx'
import { cn } from '../lib/utils.js'

const RIGHT = new Set(['Currency', 'Int', 'Float', 'Percent'])

/**
 * Plain, fast table for list views.
 * columns: resolved fields ({ fieldname, label, fieldtype, options })
 * Nothing is ever cut: each column is as wide as its content; the table fills the screen and
 * scrolls sideways only when the columns need more room (keep the default column set small).
 */
export default function DataTable({ columns, rows, loading, sort, onSort, onRowClick, currency, empty, toolbar, wish }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-lg border bg-background">
      {toolbar}
      <table className="dt w-max min-w-full">
        <thead>
          <tr>
            {wish && <th className="w-8" aria-label="Wishlist" />}
            {columns.map((c) => {
              const active = sort?.field === c.fieldname
              return (
                <th key={c.fieldname} className={cn(RIGHT.has(c.fieldtype) && 'text-end')}>
                  <button
                    type="button"
                    disabled={!onSort}
                    onClick={() => onSort?.(c.fieldname)}
                    className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', active && 'text-foreground')}
                  >
                    {c.label}
                    {active && (sort.order === 'asc' ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <tr key={`s${i}`}>
              {wish && <td />}
              {columns.map((c) => (
                <td key={c.fieldname}><span className="block h-4 w-24 animate-pulse rounded bg-surface-2" /></td>
              ))}
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={columns.length + (wish ? 1 : 0)} className="dt-empty">{empty ?? 'Nothing here yet.'}</td></tr>
          )}
          {!loading && rows.map((row) => (
            <tr
              key={row.name}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'dt-click')}
            >
              {wish && (
                <td className="w-8 !pe-0">
                  <button
                    type="button" onClick={(e) => { e.stopPropagation(); wish.toggle(row.name) }}
                    title={wish.has(row.name) ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={wish.has(row.name)}
                    className="grid size-6 place-items-center rounded text-muted hover:text-wishlist"
                  >
                    <Heart className={cn('size-3.5', wish.has(row.name) && 'fill-wishlist text-wishlist')} />
                  </button>
                </td>
              )}
              {columns.map((c, i) => (
                <td key={c.fieldname} className={cn('whitespace-nowrap', RIGHT.has(c.fieldtype) && 'dt-num', i === 0 && 'font-medium')}>
                  <FieldValue field={c} value={row[c.fieldname]} doc={row} currency={row.currency || currency} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
