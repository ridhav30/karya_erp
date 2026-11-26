import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilePlus2, X } from 'lucide-react'
import Button from './Button.jsx'
import LinkField from './fields/LinkField.jsx'

/**
 * "New credit note" -> pick the invoice it reverses. config:
 *   { title, label, hint, doctype, filters, method, args: (name) => ({}) }
 */
export default function SourcePicker({ open, config, onClose, onPick, busy }) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e) => { if (e.key === 'Escape' && !busy && !e.defaultPrevented) onClose() }
    document.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc) }
  }, [open, busy, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm dark:bg-black/80" onClick={() => !busy && onClose()} aria-hidden="true" />
      <form
        role="dialog" aria-modal="true" aria-label={config.title}
        onSubmit={(e) => { e.preventDefault(); if (value) onPick(value) }}
        className="relative z-10 w-full max-w-md animate-dialog-in overflow-hidden rounded-xl border bg-background"
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md border bg-primary-soft text-primary"><FilePlus2 className="size-4" /></span>
            <h3 className="text-sm font-semibold">{config.title}</h3>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="pressable rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="space-y-1.5 p-5">
          <label className="label">{config.label}</label>
          <LinkField doctype={config.doctype} value={value} onChange={(v) => setValue(v ?? '')} filters={config.filters} autoFocus />
          {config.hint && <p className="pt-1 text-[11px] leading-relaxed text-muted">{config.hint}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t bg-surface px-5 py-3">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" icon={FilePlus2} loading={busy} disabled={!value}>Continue</Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
