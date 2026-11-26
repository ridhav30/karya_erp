import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Filter, RotateCcw, X } from 'lucide-react'
import Button from './Button.jsx'
import FieldInput from './fields/FieldInput.jsx'
import { formatDate } from '../lib/format.js'
import { cn } from '../lib/utils.js'

/**
 * The one filter control used across the app: a "Filters" button with a count badge that opens a
 * popover; changes apply on "Apply" (or Enter). Active filters show as removable chips next to it.
 *
 * fields: [{ field, label, type, options, reqd, range (Date: from/to pair), wide }]
 *   type: Link | Dynamic Link | Select | Date | Check | Data
 *   range dates store `${field}` = [from, to]
 * values / defaults: { [field]: value }   onApply(nextValues)
 * extra: optional ({ draft, setDraft }) => node rendered above the fields (presets, search, status …)
 */
export default function FilterPopover({ fields, values, defaults = {}, onApply, extra, title = 'Filters', chips = true, align = 'end', className, width = 600 }) {
  const id = useId()
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(values)
  const [pos, setPos] = useState(null)

  const isSet = (f, v) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.some(Boolean))) return false
    return JSON.stringify(v) !== JSON.stringify(defaults[f.field] ?? null)
  }
  const active = fields.filter((f) => isSet(f, values[f.field]))
  // Required filters (company, report dates …) always show as a chip so you can see what you're looking at.
  const shown = [...fields.filter((f) => f.range || f.type === 'Date'), ...fields.filter((f) => !(f.range || f.type === 'Date'))]
    .filter((f) => active.includes(f) || (f.reqd && values[f.field] != null && values[f.field] !== '' && !(Array.isArray(values[f.field]) && !values[f.field].some(Boolean))))

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.min(width, window.innerWidth - 24)
    let left = align === 'end' ? r.right - w : r.left
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12))
    const below = window.innerHeight - r.bottom
    const up = below < 320 && r.top > below
    setPos({ left, width: w, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined, maxHeight: Math.max(240, (up ? r.top : below) - 18) })
  }

  const openPanel = () => {
    setDraft(values)
    place()
    setOpen(true)
  }
  const apply = (next = draft) => { onApply(next); setOpen(false) }

  useEffect(() => {
    if (!open) return
    const outside = (e) => {
      const t = e.target
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      if (t.closest?.('[data-combobox-dropdown]')) return // a dropdown opened from inside the popover
      setOpen(false)
    }
    const esc = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { setOpen(false); btnRef.current?.focus() } }
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
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (field, v) => setDraft((d) => {
    const next = { ...d, [field]: v }
    // A Dynamic Link's target changed: its value no longer fits.
    for (const f of fields) if (f.type === 'Dynamic Link' && f.options === field) next[f.field] = null
    return next
  })

  const isDate = (f) => f.range || f.type === 'Date'
  const dateFields = fields.filter(isDate)
  const otherFields = fields.filter((f) => !isDate(f))

  const renderField = (f) => (
    <div key={f.field} className={cn('min-w-0 space-y-1.5', (f.range || f.wide) && 'sm:col-span-2')}>
      <label className="label">{f.label}{f.reqd && <span className="text-danger"> *</span>}</label>
      {f.range ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {[0, 1].map((i) => (
            <Fragment key={i}>
              {i === 1 && <span className="text-xs text-muted">to</span>}
              <input
                type="date" aria-label={`${f.label} ${i ? 'to' : 'from'}`}
                value={draft[f.field]?.[i] ?? ''}
                min={i === 1 ? draft[f.field]?.[0] || undefined : undefined}
                max={i === 0 ? draft[f.field]?.[1] || undefined : undefined}
                onChange={(e) => { const r = [...(draft[f.field] ?? ['', ''])]; r[i] = e.target.value; setField(f.field, r) }}
                className="input"
              />
            </Fragment>
          ))}
        </div>
      ) : f.type === 'Check' ? (
        <FieldInput field={{ fieldname: f.field, fieldtype: 'Select', options: '\nYes\nNo', label: f.label }}
          value={draft[f.field] == null || draft[f.field] === '' ? '' : Number(draft[f.field]) ? 'Yes' : 'No'}
          onChange={(v) => setField(f.field, v === '' || v == null ? null : v === 'Yes' ? 1 : 0)} />
      ) : (
        <FieldInput
          field={{ fieldname: f.field, fieldtype: f.type ?? 'Data', options: f.options, label: f.label, placeholder: f.placeholder, filters: f.filters }}
          value={draft[f.field]} doc={draft} invalid={f.reqd && !draft[f.field]}
          onChange={(v) => setField(f.field, v)}
        />
      )}
    </div>
  )

  const chipText = (f, v) => {
    if (f.range) return `${v?.[0] ? formatDate(v[0]) : '…'} – ${v?.[1] ? formatDate(v[1]) : '…'}`
    if (f.type === 'Date') return formatDate(v)
    if (f.type === 'Check') return Number(v) ? 'Yes' : 'No'
    return Array.isArray(v) ? v.join(', ') : String(v)
  }

  const chipsBlock = chips && shown.map((f) => (
          <span key={f.field} className="inline-flex h-7 max-w-64 animate-fade-in items-center gap-1 rounded-md border bg-background ps-2 pe-1 text-[11px]">
            <span className="text-muted">{f.label}:</span>
            <span className="truncate font-medium">{chipText(f, values[f.field])}</span>
            {!f.reqd && (
              <button
                type="button" onClick={() => onApply({ ...values, [f.field]: defaults[f.field] ?? (f.range ? [] : null) })}
                className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Remove ${f.label} filter`}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', align === 'end' && 'justify-end', className)}>
      {align === 'end' && chipsBlock}
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          'pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
          active.length || open
            ? 'border-blue-200 bg-blue-50 font-semibold text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300'
            : 'bg-background hover:bg-surface-2',
        )}
      >
        <Filter className="size-3.5" />
        {title}
        {active.length > 0 && <span className="num grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-white">{active.length}</span>}
      </button>
      {align !== 'end' && chipsBlock}

      {open && pos && createPortal(
        <form
          id={id} ref={panelRef} role="dialog" aria-label={title}
          onSubmit={(e) => { e.preventDefault(); apply() }}
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, zIndex: 9000 }}
          className={cn('flex animate-pop-in flex-col overflow-hidden rounded-lg border bg-background text-xs', pos.top != null ? 'origin-top' : 'origin-bottom')}
        >
          <div className="flex shrink-0 items-center justify-between border-b bg-surface px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300">
              <Filter className="size-3.5 text-primary" /> {title}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close filters"><X className="size-3.5" /></button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3.5">
            {extra?.({ draft, setDraft, apply })}
            {/* Dates always first, in their own section */}
            {dateFields.length > 0 && (
              <section className="space-y-2.5 rounded-md border bg-surface/60 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><CalendarDays className="size-3.5" /> Date</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {dateFields.map(renderField)}
                </div>
              </section>
            )}
            {otherFields.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {otherFields.map(renderField)}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-surface px-3.5 py-2.5">
            <button type="button" onClick={() => apply({ ...defaults })} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
              <RotateCcw className="size-3" /> Reset
            </button>
            <div className="flex items-center gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" icon={Filter}>Apply</Button>
            </div>
          </div>
        </form>,
        document.body,
      )}
    </div>
  )
}
