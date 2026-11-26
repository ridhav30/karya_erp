import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FilePlus2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils.js'

/**
 * "Create ▾" menu on a submitted document — ERPNext's Create button
 * (Sales Order → Delivery Note / Sales Invoice / Payment …).
 */
export default function CreateMenu({ actions, onPick, busy }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  if (!actions.length) return null
  const working = actions.some((a) => busy === a.label)

  return (
    <div ref={ref} className="relative">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="pressable inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-surface-2"
      >
        {working ? <Loader2 className="size-3.5 animate-spin" /> : <FilePlus2 className="size-3.5" />}
        Create
        <ChevronDown className={cn('size-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-30 mt-1.5 w-52 origin-top-right rtl:origin-top-left animate-pop-in rounded-lg border bg-background p-1 text-xs">
          {actions.map((a) => (
            <button
              key={a.label} type="button" role="menuitem" disabled={working}
              onClick={() => { setOpen(false); onPick(a) }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-start transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              <FilePlus2 className="size-3.5 text-muted" /> {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
