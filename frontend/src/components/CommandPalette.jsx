import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { ArrowLeft, ArrowRight, CornerDownLeft, FileText, Loader2, Search } from 'lucide-react'
import { useBoot } from '../app/boot-context.js'
import { visibleNav } from '../lib/nav.js'
import { docRoute } from '../lib/docRoute.js'
import { cn } from '../lib/utils.js'
import { useLayer } from '../lib/useLayer.js'

/** Debounce a value (search as you type without a request per key). */
function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/**
 * Ctrl+K / ⌘K: jump to any menu page or find documents (customers, items, invoices, employees …).
 * ↑ ↓ to move, Enter to open, Esc to close.
 */
export default function CommandPalette({ open, onClose }) {
  const boot = useBoot()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef(null)
  const term = useDebounced(q.trim(), 200)
  const { data, isLoading } = useFrappeGetCall('karya_erp.api.search', term.length >= 2 ? { text: term } : undefined, open && term.length >= 2 ? `search:${term}` : null, { revalidateOnFocus: false, keepPreviousData: true })

  const pages = useMemo(() => {
    const all = visibleNav(boot).flatMap((g) => (g.items ? g.items.map((i) => ({ ...i, group: g.label })) : [{ ...g, group: '' }]))
    const s = q.trim().toLowerCase()
    return (s ? all.filter((p) => `${p.label} ${p.group}`.toLowerCase().includes(s)) : all.slice(0, 8)).slice(0, 8)
  }, [boot, q])
  const docs = useMemo(() => (term.length >= 2 ? (data?.message ?? []).filter((d) => docRoute(boot, d.doctype, d.name)) : []), [data, term, boot])
  const items = useMemo(() => [
    ...pages.map((p) => ({ key: `p:${p.to}`, kind: 'page', icon: p.icon, title: p.label, subtitle: p.group, to: p.to })),
    ...docs.map((d) => ({ key: `d:${d.doctype}:${d.name}`, kind: 'doc', icon: FileText, title: d.title, subtitle: `${d.doctype}${d.title !== d.name ? ` · ${d.name}` : ''}${d.subtitle ? ` · ${d.subtitle}` : ''}`, to: docRoute(boot, d.doctype, d.name) })),
  ], [pages, docs, boot])
  const current = Math.min(active, Math.max(0, items.length - 1))

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  useLayer(open, onClose)
  if (!open) return null
  const go = (it) => { if (!it) return; onClose(); setQ(''); navigate(it.to) }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[current]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let lastKind = null
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-0 sm:p-3 sm:pt-[12vh]" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm dark:bg-black/70" onPointerDown={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Search" className="relative z-10 flex max-h-[100dvh] w-full max-w-xl animate-dialog-in flex-col overflow-hidden border-b bg-background shadow-2xl max-sm:h-[100dvh] sm:rounded-xl sm:border">
        <div className="flex shrink-0 items-center gap-2.5 border-b px-3 sm:px-4">
          <button type="button" onClick={onClose} aria-label="Close search" className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 sm:hidden"><ArrowLeft className="size-5" /></button>
          {isLoading && term.length >= 2 ? <Loader2 className="size-4 shrink-0 animate-spin text-muted" /> : <Search className="size-4 shrink-0 text-muted" />}
          <input
            autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} onKeyDown={onKey}
            placeholder="Search pages, customers, items, invoices, employees…"
            className="h-12 flex-1 bg-transparent text-sm outline-none" aria-label="Search"
          />
          <kbd className="hidden rounded border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 sm:max-h-[55vh] sm:flex-none" role="listbox">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-xs text-muted">{term.length >= 2 && !isLoading ? `Nothing found for “${term}”.` : 'Type to search.'}</li>
          )}
          {items.map((it, i) => {
            const header = it.kind !== lastKind ? (it.kind === 'page' ? 'Pages' : 'Documents') : null
            lastKind = it.kind
            const Icon = it.icon ?? FileText
            return (
              <li key={it.key}>
                {header && <p className="px-2.5 pb-1 pt-2 text-xs font-semibold text-muted">{header}</p>}
                <button
                  type="button" data-index={i} role="option" aria-selected={i === current}
                  onMouseMove={() => setActive(i)} onClick={() => go(it)}
                  className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start text-xs', i === current ? 'bg-surface-2 dark:bg-zinc-800' : '')}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-surface text-muted"><Icon className="size-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.title}</span>
                    {it.subtitle && <span className="block truncate text-[11px] text-muted">{it.subtitle}</span>}
                  </span>
                  {i === current ? <CornerDownLeft className="size-3.5 shrink-0 text-muted" /> : <ArrowRight className="size-3.5 shrink-0 text-muted/40" />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
