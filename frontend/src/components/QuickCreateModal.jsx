import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFrappeCreateDoc } from 'frappe-react-sdk'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileText, MapPin, X } from 'lucide-react'
import Button from './Button.jsx'
import FieldInput from './fields/FieldInput.jsx'
import { Spinner } from './Spinner.jsx'
import { useBoot } from '../app/boot-context.js'
import { QuickCreateContext } from '../app/quick-create-context.js'
import { useToast } from '../app/toast-context.js'
import { resolveField, useMeta } from '../lib/meta.js'
import { QUICK_CREATE, SIMPLE_ICON } from '../lib/quickCreate.js'
import { errorText } from '../lib/errors.js'
import { cn } from '../lib/utils.js'

const SIMPLE_TYPES = new Set(['Data', 'Link', 'Select', 'Check', 'Int', 'Float', 'Currency', 'Percent', 'Date', 'Small Text'])
const WIDE_TYPES = new Set(['Small Text', 'Text', 'Text Editor', 'Long Text'])
const TAB_ICONS = { details: FileText, address: MapPin }
const TONES = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-400',
  blue: 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-400',
  amber: 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-400',
  gray: 'border bg-surface-2 text-muted',
}

/**
 * Quick-create popup in the e-envoicing style:
 * icon header, optional "General Details / Address & Location" step tabs, 2-column form,
 * fixed footer with step navigation + Cancel / Create.
 */
export default function QuickCreateModal({ doctype, initial, onClose, onCreated, embedded = false, minHeight }) {
  const boot = useBoot()
  const toast = useToast()
  const { meta, isLoading, error: metaError } = useMeta(doctype)
  const { createDoc, loading } = useFrappeCreateDoc()
  const cfg = QUICK_CREATE[doctype]
  const [doc, setDoc] = useState(null)
  const [invalid, setInvalid] = useState([])
  const [tabIndex, setTabIndex] = useState(0)
  const [formError, setFormError] = useState('')
  // A popup opened from this one (new Item -> new Tax Template) takes over this popup's body until it is created or cancelled.
  const [child, setChild] = useState(null)
  const formRef = useRef(null)
  // The popup keeps the size of the one it replaces, so nothing jumps.
  const inner = useMemo(() => ({ openQuickCreate: (o) => setChild({ ...o, minHeight: formRef.current?.offsetHeight }) }), [])

  // Resolve config tabs/fields against ERPNext meta (fields missing in this version are dropped).
  const tabs = useMemo(() => {
    if (!meta) return []
    const resolve = (list) => list.map((f) => {
      const r = resolveField(meta, f)
      return r && { ...r, hint: f.hint, wide: f.wide || WIDE_TYPES.has(r.fieldtype), mono: f.mono, virtual: f.virtual }
    }).filter(Boolean)
    if (cfg?.tabs) return cfg.tabs.map((t) => ({ ...t, fields: resolve(t.fields) }))
    if (cfg?.fields) return [{ key: 'details', label: 'Details', fields: resolve(cfg.fields) }]
    // Generic setup doctype: its required simple fields
    const req = (meta.fields ?? []).filter((f) => f.reqd && !f.hidden && !f.read_only && SIMPLE_TYPES.has(f.fieldtype))
    const list = req.length ? req : (meta.fields ?? []).filter((f) => f.fieldtype === 'Data' && !f.hidden).slice(0, 1)
    return [{ key: 'details', label: 'Details', fields: resolve(list.map((f) => f.fieldname)) }]
  }, [meta, cfg])

  const allFields = tabs.flatMap((t) => t.fields)
  const tab = tabs[tabIndex] ?? tabs[0]
  const isLast = tabIndex >= tabs.length - 1

  // Starting values once meta is loaded: meta defaults -> config defaults -> typed text.
  if (meta && !doc) {
    const start = {}
    for (const f of meta.fields ?? []) {
      if (f.default != null && f.default !== '' && !String(f.default).startsWith(':') && f.fieldtype !== 'Table' && f.default !== 'Today') {
        start[f.fieldname] = ['Check', 'Int', 'Float', 'Currency'].includes(f.fieldtype) ? Number(f.default) : f.default
      }
    }
    const defs = typeof cfg?.defaults === 'function' ? cfg.defaults(boot) : cfg?.defaults
    Object.assign(start, defs ?? {})
    if (typeof initial === 'string' && initial) {
      const titleField = cfg?.titleField ?? tabs[0]?.fields[0]?.fieldname
      if (titleField) start[titleField] = initial
    } else if (initial && typeof initial === 'object') {
      Object.assign(start, initial)
    }
    setDoc(start)
  }

  // Scroll lock + Escape
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !child) onClose() } // an open dropdown handles its own Esc
    document.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc) }
  }, [onClose, child])

  const setField = (name, v) => {
    setDoc((d) => ({ ...d, [name]: v }))
    setInvalid((l) => l.filter((x) => x !== name))
    setFormError('')
  }

  async function submit(e) {
    e.preventDefault()
    const missing = allFields.filter((f) => f.reqd && (doc[f.fieldname] == null || doc[f.fieldname] === ''))
    setInvalid(missing.map((f) => f.fieldname))
    if (missing.length) {
      // Jump to the step that holds the first missing field.
      const at = tabs.findIndex((t) => t.fields.some((f) => f.fieldname === missing[0].fieldname))
      if (at >= 0) setTabIndex(at)
      setFormError(`Please fill: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    try {
      let payload = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== '' && v != null))
      if (cfg?.beforeSave) payload = cfg.beforeSave(payload)
      const created = await createDoc(doctype, payload)
      toast({ tone: 'success', title: `${doctype} created`, description: created?.name })
      onCreated?.(created?.name, created)
      onClose()
    } catch (err) {
      setFormError(errorText(err))
    }
  }

  const full = cfg?.size === 'full'
  const Icon = cfg?.icon ?? SIMPLE_ICON

  const form = (
      <form
        ref={formRef} onSubmit={submit} style={child ? { display: 'none' } : minHeight ? { minHeight } : undefined}
        role="dialog" aria-modal="true" aria-label={`New ${doctype}`}
        className={cn(
          'relative z-10 flex w-full animate-dialog-in flex-col overflow-hidden rounded-xl border bg-background',
          full ? 'h-[min(640px,92dvh)] max-w-3xl' : 'max-h-[92dvh] max-w-4xl lg:max-w-5xl',
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-surface/60 px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn('grid size-8 shrink-0 place-items-center rounded-md border', TONES[cfg?.tone ?? 'gray'])}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">New {doctype}</h2>
              <p className="truncate text-[11px] text-muted">{cfg?.subtitle ?? `Quick entry — more details can be added in the full form`}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title="Close (Esc)" className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {/* Step tabs */}
        {tabs.length > 1 && (
          <div className="flex shrink-0 items-center justify-between border-b bg-surface/60 px-5 py-2.5 sm:px-6">
            <div className="inline-flex rounded-md border bg-surface-2 p-0.5 dark:bg-zinc-900">
              {tabs.map((t, i) => {
                const TabIcon = TAB_ICONS[t.key] ?? FileText
                const active = i === tabIndex
                const hasError = t.fields.some((f) => invalid.includes(f.fieldname))
                return (
                  <button
                    key={t.key} type="button" onClick={() => setTabIndex(i)}
                    className={cn(
                      'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors',
                      active ? 'bg-background font-semibold text-foreground dark:bg-zinc-800' : 'font-medium text-muted hover:text-foreground',
                    )}
                  >
                    <TabIcon className={cn('size-3.5', t.key === 'address' ? 'text-emerald-500' : 'text-blue-500')} />
                    <span>{t.label}</span>
                    {hasError && <span className="size-1.5 rounded-full bg-danger" />}
                  </button>
                )
              })}
            </div>
            <span className="num hidden text-[11px] text-muted sm:inline">Step {tabIndex + 1} of {tabs.length}</span>
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {formError && (
            <div className={cn('mb-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300')}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
              <span className="whitespace-pre-line">{formError}</span>
            </div>
          )}

          {isLoading || !doc ? (
            <div className="grid place-items-center py-16"><Spinner /></div>
          ) : metaError ? (
            <p className="text-xs text-danger">{errorText(metaError)}</p>
          ) : (
            <div className={cn('grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2')}>
              {tab.fields.map((f) => (
                <div key={f.fieldname} className={cn('min-w-0 space-y-1.5', f.wide && 'sm:col-span-full')}>
                  <div className="flex h-5 items-center justify-between gap-2">
                    <label className="label truncate">{f.label}{f.reqd && <span className="text-rose-500"> *</span>}</label>
                    {f.hint && <span className="num truncate text-[10px] text-muted/80">{f.hint}</span>}
                  </div>
                  {f.fieldtype === 'Check' ? (
                    <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md border bg-background px-3">
                      <input type="checkbox" checked={Boolean(Number(doc[f.fieldname]))} onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0)} className="size-4 accent-[var(--primary)]" />
                      <span className="text-xs">{Number(doc[f.fieldname]) ? 'Yes' : 'No'}</span>
                    </label>
                  ) : (
                    <FieldInput
                      field={f} value={doc[f.fieldname]} doc={doc} invalid={invalid.includes(f.fieldname)}
                      className={f.mono ? 'num' : undefined}
                      onChange={(v) => setField(f.fieldname, v)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-surface/80 px-5 py-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {tabs.length > 1 ? (
              isLast ? (
                <button type="button" onClick={() => setTabIndex(tabIndex - 1)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground">
                  <ArrowLeft className="size-3.5" /> Back<span className="hidden sm:inline"> to details</span>
                </button>
              ) : (
                <button type="button" onClick={() => setTabIndex(tabIndex + 1)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft">
                  {tabs[tabIndex + 1].label.split(' ')[0]}<span className="hidden sm:inline"> details</span> <ArrowRight className="size-3.5" />
                </button>
              )
            ) : (
              cfg?.footerTag && <span className="num hidden text-[11px] text-muted sm:inline">{cfg.footerTag}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" variant="primary" icon={Check} loading={loading} disabled={!doc}>
              {loading ? 'Saving…' : `Create ${doctype}`}
            </Button>
          </div>
        </div>
      </form>
  )

  const content = (
    <QuickCreateContext value={inner}>
      {form}
      {child && <QuickCreateModal key={child.doctype} embedded minHeight={child.minHeight} doctype={child.doctype} initial={child.initial} onCreated={child.onCreated} onClose={() => setChild(null)} />}
    </QuickCreateContext>
  )
  if (embedded) return content

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm dark:bg-black/80" onClick={onClose} aria-hidden="true" />
      {content}
    </div>,
    document.body,
  )
}
