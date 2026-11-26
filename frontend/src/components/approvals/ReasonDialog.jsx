import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquareText, X } from 'lucide-react'
import Button from '../Button.jsx'

/** Asks for a reason before a workflow action (always for Reject-type actions). */
export default function ReasonDialog({ open, action, count = 1, required, busy, onCancel, onConfirm }) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    const esc = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, busy, onCancel])

  if (!open) return null
  const danger = /reject|decline|cancel/i.test(action)
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm dark:bg-black/80" onClick={() => !busy && onCancel()} aria-hidden="true" />
      <form
        role="dialog" aria-modal="true" aria-label={action}
        onSubmit={(e) => { e.preventDefault(); if (!required || text.trim()) onConfirm(text.trim()) }}
        className="relative z-10 w-full max-w-md animate-dialog-in overflow-hidden rounded-xl border bg-background"
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md border bg-surface text-muted"><MessageSquareText className="size-4" /></span>
            <h3 className="text-sm font-semibold">{action}{count > 1 ? ` · ${count} documents` : ''}</h3>
          </div>
          <button type="button" onClick={() => !busy && onCancel()} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="space-y-1.5 p-5">
          <label className="label">{required ? 'Reason' : 'Note (optional)'}{required && <span className="text-danger"> *</span>}</label>
          <textarea
            autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={required ? 'Why? The requester will see this in the document timeline.' : 'Added to the document timeline'}
            className="input h-auto py-2"
          />
        </div>
        <div className="flex justify-end gap-2 border-t bg-surface px-5 py-3">
          <Button onClick={onCancel} disabled={busy}>Back</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={required && !text.trim()}>{action}</Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

