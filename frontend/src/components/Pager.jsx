import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Prev / Next for a server-paged list. start is the first row's offset, total the number of rows overall. */
export default function Pager({ start, pageLength, total, onChange }) {
  if (!total || total <= pageLength) return null
  const from = start + 1
  const to = Math.min(start + pageLength, total)
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted">
      <span className="num">{from}–{to} of {total}</span>
      <div className="flex gap-1">
        <button type="button" className="pressable flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40" disabled={start <= 0} onClick={() => onChange(Math.max(0, start - pageLength))}>
          <ChevronLeft className="size-3" /><span className="hidden sm:inline">Prev</span>
        </button>
        <button type="button" className="pressable flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40" disabled={to >= total} onClick={() => onChange(start + pageLength)}>
          <span className="hidden sm:inline">Next</span><ChevronRight className="size-3" />
        </button>
      </div>
    </div>
  )
}
