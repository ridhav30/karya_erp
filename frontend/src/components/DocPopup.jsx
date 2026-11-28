import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFrappeCreateDoc, useFrappeDeleteDoc, useFrappeGetDoc, useFrappeUpdateDoc } from 'frappe-react-sdk'
import { AlertTriangle, Check, FileText, Trash2, X } from 'lucide-react'
import Button from './Button.jsx'
import FieldInput from './fields/FieldInput.jsx'
import { Spinner } from './Spinner.jsx'
import { useBoot } from '../app/boot-context.js'
import { useToast } from '../app/toast-context.js'
import { resolveField, useMeta } from '../lib/meta.js'
import { confirm } from '../lib/dialogs.js'
import { errorText } from '../lib/errors.js'
import { cn } from '../lib/utils.js'

const WIDE = new Set(['Small Text', 'Text', 'Text Editor', 'Long Text'])
const SIMPLE = new Set(['Data', 'Link', 'Select', 'Check', 'Int', 'Float', 'Currency', 'Percent', 'Date', 'Datetime', 'Small Text', 'Text', 'Long Text'])

/**
 * Add / edit one record in a popup (a screen whose config says `popup: true`), instead of the full page:
 * every plain field of the screen's sections, Save, and Delete when editing. `name` empty = a new record.
 */
export default function DocPopup({ config, name, onClose, onSaved }) {
  const boot = useBoot()
  const toast = useToast()
  const { meta } = useMeta(config.doctype)
  const { data: saved, error: loadError } = useFrappeGetDoc(config.doctype, name || undefined, name ? undefined : null)
  const { createDoc, loading: creating } = useFrappeCreateDoc()
  const { updateDoc, loading: updating } = useFrappeUpdateDoc()
  const { deleteDoc } = useFrappeDeleteDoc()
  const [doc, setDoc] = useState(null)
  const [invalid, setInvalid] = useState([])
  const [formError, setFormError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const isNew = !name

  const fields = useMemo(() => {
    if (!meta) return []
    return (config.sections ?? []).flatMap((s) => s.fields ?? []).map((f) => resolveField(meta, f))
      .filter((f) => f && SIMPLE.has(f.fieldtype) && f.fieldname !== 'name')
      .map((f) => ({ ...f, wide: WIDE.has(f.fieldtype) }))
  }, [meta, config.sections])

  // Starting values (adjusting state during render once what is needed has arrived).
  if (meta && !doc && (isNew || saved)) {
    if (isNew) {
      const start = {}
      for (const f of meta.fields ?? []) {
        if (f.default != null && f.default !== '' && !String(f.default).startsWith(':') && f.fieldtype !== 'Table' && f.default !== 'Today') {
          start[f.fieldname] = ['Check', 'Int', 'Float', 'Currency'].includes(f.fieldtype) ? Number(f.default) : f.default
        }
      }
      setDoc({ ...start, ...(config.defaults?.(boot) ?? {}) })
    } else setDoc({ ...saved })
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose() }
    document.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc) }
  }, [onClose])

  const setField = (field, v) => { setDoc((d) => ({ ...d, [field]: v })); setInvalid((l) => l.filter((x) => x !== field)); setFormError('') }

  async function submit(e) {
    e.preventDefault()
    const missing = fields.filter((f) => f.reqd && (doc[f.fieldname] == null || doc[f.fieldname] === ''))
    setInvalid(missing.map((f) => f.fieldname))
    if (missing.length) { setFormError(`Please fill: ${missing.map((f) => f.label).join(', ')}`); return }
    try {
      const values = Object.fromEntries(fields.map((f) => [f.fieldname, doc[f.fieldname] === '' ? null : doc[f.fieldname]]))
      const out = isNew ? await createDoc(config.doctype, Object.fromEntries(Object.entries(values).filter(([, v]) => v != null))) : await updateDoc(config.doctype, name, values)
      toast({ tone: 'success', title: `${config.single} ${isNew ? 'created' : 'saved'}`, description: out?.name })
      onSaved?.(out)
    } catch (err) {
      setFormError(errorText(err))
    }
  }

  async function remove() {
    if (!(await confirm({ title: `Delete ${config.single}?`, message: `Delete ${name}?`, confirmLabel: 'Delete', tone: 'danger' }))) return
    setDeleting(true)
    try {
      await deleteDoc(config.doctype, name)
      toast({ tone: 'success', title: `${config.single} deleted`, description: name })
      onSaved?.(null)
    } catch (err) {
      setFormError(errorText(err))
      setDeleting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm dark:bg-black/80" onClick={onClose} aria-hidden="true" />
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={isNew ? `New ${config.single}` : `Edit ${config.single}`}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl animate-dialog-in flex-col overflow-hidden rounded-xl border bg-background">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-surface/60 px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-md border bg-surface-2 text-muted"><FileText className="size-4" /></div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{isNew ? `New ${config.single}` : `${config.single}`}</h2>
              <p className="num truncate text-[11px] text-muted">{isNew ? 'Fill the details and save' : name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title="Close (Esc)" className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {formError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" /><span className="whitespace-pre-line">{formError}</span>
            </div>
          )}
          {loadError ? <p className="text-xs text-danger">{errorText(loadError)}</p> : !doc ? <div className="grid place-items-center py-16"><Spinner /></div> : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.fieldname} className={cn('min-w-0 space-y-1.5', f.wide && 'sm:col-span-full')}>
                  <label className="label block truncate">{f.label}{f.reqd && <span className="text-rose-500"> *</span>}</label>
                  {f.fieldtype === 'Check' ? (
                    <label className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md border bg-background px-3">
                      <input type="checkbox" checked={Boolean(Number(doc[f.fieldname]))} onChange={(e) => setField(f.fieldname, e.target.checked ? 1 : 0)} className="size-4 accent-[var(--primary)]" />
                      <span className="text-xs">{Number(doc[f.fieldname]) ? 'Yes' : 'No'}</span>
                    </label>
                  ) : (
                    <FieldInput field={f} value={doc[f.fieldname]} doc={doc} invalid={invalid.includes(f.fieldname)} onChange={(v) => setField(f.fieldname, v)} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-surface/80 px-5 py-3 sm:px-6">
          {!isNew ? <Button variant="danger" icon={Trash2} onClick={remove} loading={deleting} disabled={creating || updating}>Delete</Button> : <span />}
          <div className="flex items-center gap-2">
            <Button onClick={onClose} disabled={creating || updating}>Cancel</Button>
            <Button type="submit" variant="primary" icon={Check} loading={creating || updating} disabled={!doc}>{isNew ? `Create ${config.single}` : 'Save'}</Button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  )
}
