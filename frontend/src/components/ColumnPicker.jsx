import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Columns3, RotateCcw, Search, X } from 'lucide-react'
import { cn } from '../lib/utils.js'

/**
 * "Columns" button: show / hide / reorder table columns. Columns are never cut; when they don't
 * fit, the table scrolls sideways.
 * Works with useColumnPrefs; every change is saved at once.
 */
export default function ColumnPicker({ all, settings, className }) {
  const id = useId()
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [q, setQ] = useState('')
  const { prefs, setVisible, move, reset, isDefault } = settings

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.min(320, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12))
    const below = window.innerHeight - r.bottom
    const up = below < 360 && r.top > below
    setPos({ left, width: w, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined, maxHeight: Math.max(260, (up ? r.top : below) - 18) })
  }

  useEffect(() => {
    if (!open) return
    const outside = (e) => { if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    const reposition = (e) => { if (!(e?.target instanceof Node && panelRef.current?.contains(e.target))) place() }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  const visible = prefs.visible
  const term = q.trim().toLowerCase()
  const hidden = all.filter((c) => !visible.includes(c.fieldname) && (!term || c.label.toLowerCase().includes(term)))
  const shown = visible.map((f) => all.find((c) => c.fieldname === f)).filter((c) => c && (!term || c.label.toLowerCase().includes(term)))

  return (
    <>
      <button
        ref={btnRef} type="button"
        onClick={() => { if (!open) { setQ(''); place() } setOpen((o) => !o) }}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
        title="Configure columns"
        className={cn(
          'pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
          !isDefault || open ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-background hover:bg-surface-2',
          className,
        )}
      >
        <Columns3 className="size-3.5" />
        <span className="hidden sm:inline">Columns</span>
        <span className="num text-[10px] opacity-70">{visible.length}/{all.length}</span>
      </button>

      {open && pos && createPortal(
        <div
          id={id} ref={panelRef} role="dialog" aria-label="Table columns"
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, zIndex: 9000 }}
          className={cn('flex animate-pop-in flex-col overflow-hidden rounded-lg border bg-background text-xs', pos.top != null ? 'origin-top-right' : 'origin-bottom-right')}
        >
          <div className="flex shrink-0 items-center justify-between border-b bg-surface px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300">
              <Columns3 className="size-3.5 text-primary" /> Columns
            </span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close"><X className="size-3.5" /></button>
          </div>

          {all.length > 8 && (
            <div className="shrink-0 border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a column…" className="w-full rounded-md border bg-background py-1.5 ps-7 pe-2 text-xs outline-none focus:border-primary" />
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            <p className="px-1.5 pb-1 pt-0.5 text-xs font-semibold text-muted">Shown · in order</p>
            {shown.map((c) => {
              const i = visible.indexOf(c.fieldname)
              return (
                <div key={c.fieldname} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
                  <input
                    type="checkbox" checked disabled={visible.length === 1}
                    onChange={() => setVisible(c.fieldname, false)}
                    className="size-3.5 accent-[var(--primary)]" aria-label={`Hide ${c.label}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                  <button type="button" disabled={i === 0} onClick={() => move(c.fieldname, -1)} className="rounded p-0.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-30" aria-label={`Move ${c.label} left`}><ArrowUp className="size-3" /></button>
                  <button type="button" disabled={i === visible.length - 1} onClick={() => move(c.fieldname, 1)} className="rounded p-0.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-30" aria-label={`Move ${c.label} right`}><ArrowDown className="size-3" /></button>
                </div>
              )
            })}
            {hidden.length > 0 && <p className="mt-1.5 border-t px-1.5 pb-1 pt-2 text-xs font-semibold text-muted">More columns</p>}
            {hidden.map((c) => (
              <label key={c.fieldname} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-muted hover:bg-surface-2 hover:text-foreground">
                <input type="checkbox" checked={false} onChange={() => setVisible(c.fieldname, true)} className="size-3.5 accent-[var(--primary)]" />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
              </label>
            ))}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t bg-surface px-3 py-2">
            <button type="button" disabled={isDefault} onClick={reset} className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-foreground disabled:opacity-40">
              <RotateCcw className="size-3" /> Reset to default
            </button>
            <span className="text-[11px] text-muted">Saved in this browser</span>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
