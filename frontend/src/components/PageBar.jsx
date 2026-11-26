import { ChevronLeft, ChevronRight } from 'lucide-react'
import Combobox from './fields/Combobox.jsx'
import { cn } from '../lib/utils.js'

const SIZES = [10, 20, 50, 100]

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const sorted = [...new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total))].sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => { if (i && p - sorted[i - 1] > 1) out.push('…'); out.push(p) })
  return out
}

/** Page controls for a server-paged table: range, rows per page, Prev / page numbers / Next. Always shown once there are rows. */
export default function PageBar({ start, pageSize, total, onStart, onSize }) {
  if (!total) return null
  const page = Math.floor(start / pageSize)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const to = Math.min(start + pageSize, total)
  const go = (p) => onStart(Math.max(0, Math.min(pages - 1, p)) * pageSize)
  const btn = 'pressable flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40'
  return (
    <div className="flex flex-col gap-2 border-t px-4 py-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
      <span className="num">{start + 1}–{to} of {total}</span>
      <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
        {onSize && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">Rows</span>
            <Combobox className="w-16" minDropdownWidth={80} searchable={false} options={SIZES.map((n) => ({ value: n, label: String(n) }))} value={pageSize} onChange={(v) => onSize(Number(v) || 20)} />
          </div>
        )}
        <div className="flex items-center gap-1">
          <button type="button" className={btn} disabled={page === 0} onClick={() => go(page - 1)} title="Previous page"><ChevronLeft className="size-3" /><span className="hidden sm:inline">Prev</span></button>
          {pageNumbers(page + 1, pages).map((p, i) => (
            p === '…'
              ? <span key={`d${i}`} className="num grid h-7 w-5 place-items-center text-muted">…</span>
              : <button key={p} type="button" onClick={() => go(p - 1)} className={cn('num grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs font-medium', p === page + 1 ? 'bg-strong font-semibold text-strong-foreground' : 'border bg-background text-foreground hover:bg-surface-2')}>{p}</button>
          ))}
          <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => go(page + 1)} title="Next page"><span className="hidden sm:inline">Next</span><ChevronRight className="size-3" /></button>
        </div>
      </div>
    </div>
  )
}
