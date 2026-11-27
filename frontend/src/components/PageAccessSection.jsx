import { useState } from 'react'
import { Check, Lock, Minus, Search } from 'lucide-react'
import Button from './Button.jsx'
import { MODULES, OTHER, hasAnyAccess, withChildren } from '../lib/pageAccess.js'
import { cn } from '../lib/utils.js'

function Tick({ state }) {
  return (
    <span className={cn('grid size-4 shrink-0 place-items-center rounded border transition-colors', state ? 'border-strong bg-strong text-strong-foreground' : 'bg-background')}>
      {state === 'some' ? <Minus className="size-3" strokeWidth={3} /> : state ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  )
}

function ModuleBlock({ module, checked, toggle, toggleMany, query }) {
  const pages = module.pages.filter((p) => !query || `${module.label} ${p.label} ${p.doctype ?? ''}`.toLowerCase().includes(query))
  if (!pages.length) return null
  const on = module.pages.filter((p) => checked.has(p.to)).length
  const state = on === 0 ? false : on === module.pages.length ? true : 'some'
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-surface/60 px-4 py-2.5">
        <button type="button" onClick={() => toggleMany(module.pages.map((p) => p.to), state !== true)} className="flex min-w-0 flex-1 items-center gap-3 text-start" aria-label={`${state === true ? 'Remove' : 'Allow'} every feature in ${module.label}`}>
          <Tick state={state} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{module.label}</span>
            <span className="block text-[11px] text-muted">{module.whole ? 'Tick the module for all its features (including ones added later), or pick them one by one' : 'Pick the features one by one'}</span>
          </span>
        </button>
        <span className="num rounded bg-surface-2 px-1.5 text-[11px] text-muted">{on}/{module.pages.length}</span>
      </div>
      <ul className="grid gap-x-3 px-2 py-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((p) => (
          <li key={p.to}>
            <button type="button" onClick={() => toggle(p.to)} className="pressable flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs hover:bg-surface-2">
              <Tick state={checked.has(p.to)} />
              <span className="min-w-0">
                <span className="block truncate">{p.label}{p.item.requires?.length > 0 && <span className="ms-1 text-[10px] text-muted" title="Also gives its set-up pages">+{p.item.requires.length}</span>}</span>
                {p.doctype && <span className="block truncate text-[10px] text-muted">{p.doctype}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Which pages a person may open: every page their job roles allow, or only some of them. Only the modules installed in this app
 * and the features the person's job roles allow are listed, so access can narrow what the roles give but never add to it.
 * `allowed` is the set of routes their roles allow.
 */
export default function PageAccessSection({ mode, checked, onMode, onChecked, allowed }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const sections = [
    ...MODULES.map((m) => ({ key: m.label, label: m.label, whole: true, pages: m.pages.filter((p) => allowed.has(p.to)) })),
    { key: '__other', label: 'Other pages', whole: false, pages: OTHER.filter((p) => allowed.has(p.to)) },
  ].filter((m) => m.pages.length)
  const all = sections.flatMap((m) => m.pages.map((p) => p.to))
  // Ticking a feature also ticks the set-up pages it needs (POS → counters, shift closings); unticking leaves them as they are.
  const toggle = (to) => { const n = new Set(checked); if (n.has(to)) n.delete(to); else n.add(to); onChecked(withChildren(n, allowed)) }
  const toggleMany = (tos, on) => { const n = new Set(checked); tos.forEach((t) => (on ? n.add(t) : n.delete(t))); onChecked(on ? withChildren(n, allowed) : n) }
  const whole = sections.filter((m) => m.whole && m.pages.every((p) => checked.has(p.to))).length
  const total = all.filter((r) => checked.has(r)).length

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <p className="text-[13px] font-semibold">Pages and modules</p>
        <div className="inline-flex rounded-md border bg-surface-2 p-0.5">
          {[['All', 'All pages their job roles allow'], ['Custom', 'Only chosen features']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => onMode(k)} className={cn('rounded px-3 py-1.5 text-xs', mode === k ? 'bg-background font-semibold' : 'font-medium text-muted hover:text-foreground')}>{l}</button>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          {mode === 'All'
            ? `No limit: the menu shows every page their job roles allow (${all.length} ${all.length === 1 ? 'feature' : 'features'} in ${sections.length} ${sections.length === 1 ? 'module' : 'modules'}).`
            : 'Start from what their job roles allow and untick what they should not open. Only the ticked features appear in their menu and search; any other page shows “no access”. Home and the self-service pages are always available.'}
        </p>
      </div>

      {mode === 'Custom' && (all.length === 0
        ? <p className="card p-4 text-xs text-muted">Their job roles give no pages yet. Choose job roles above first: this list follows them.</p>
        : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <input className="input h-9 ps-8" placeholder="Search modules, features or documents" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <Button size="sm" onClick={() => toggleMany(all, true)}>Select all</Button>
              <Button size="sm" onClick={() => onChecked(new Set())}>Clear</Button>
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="num font-medium text-foreground">{whole} whole {whole === 1 ? 'module' : 'modules'} · {total} of {all.length} features ticked</span>
              <span className="inline-flex items-center gap-1"><Lock className="size-3" /> only modules installed in this app and features their job roles allow are listed</span>
              {!hasAnyAccess(checked) && <span className="text-danger">Tick at least one feature.</span>}
            </p>
            <div className="space-y-3">
              {sections.map((m) => <ModuleBlock key={m.key} module={m} checked={checked} toggle={toggle} toggleMany={toggleMany} query={q} />)}
            </div>
          </>
        ))}
    </div>
  )
}
