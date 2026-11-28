import LinkField from './LinkField.jsx'
import Combobox from './Combobox.jsx'
import AttachInput from './AttachInput.jsx'
import StarRating from './StarRating.jsx'
import { cn } from '../../lib/utils.js'

const TEXTAREA = new Set(['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code', 'Markdown Editor'])
const NUMBER = new Set(['Int', 'Float', 'Currency', 'Percent'])

/** Edit control for one field, chosen by ERPNext fieldtype. */
export default function FieldInput({ field, value, onChange, doc, invalid, className }) {
  const t = field.fieldtype
  const filters = typeof field.filters === 'function' ? field.filters(doc) : field.filters

  if (t === 'Link') {
    return <LinkField doctype={field.options} value={value} onChange={onChange} filters={filters} invalid={invalid} className={className} placeholder={field.placeholder} show={field.show} />
  }
  if (t === 'Dynamic Link') {
    const target = doc?.[field.options]
    return <LinkField doctype={target} value={value} onChange={onChange} disabled={!target} invalid={invalid} className={className} placeholder={target ? undefined : 'Choose type first'} />
  }
  if (t === 'Select') {
    const all = String(field.options ?? '').split('\n')
    return (
      <Combobox
        options={all.filter((o) => o !== '')} value={value ?? ''} onChange={(v) => onChange(v)}
        clearable={all.includes('')} invalid={invalid} className={className}
        placeholder={field.placeholder ?? `Select ${field.label ?? ''}…`}
      />
    )
  }
  if (t === 'Attach' || t === 'Attach Image') {
    return <AttachInput value={value} onChange={onChange} invalid={invalid} className={className} accept={t === 'Attach Image' ? 'image/*' : undefined} />
  }
  if (t === 'Rating') {
    return <div className="flex h-9 items-center"><StarRating value={value} onChange={onChange} label={field.label} /></div>
  }
  if (t === 'Check') {
    return (
      <label className="flex h-9 items-center gap-2">
        <input type="checkbox" checked={Boolean(Number(value))} onChange={(e) => onChange(e.target.checked ? 1 : 0)} className="size-4 accent-[var(--primary)]" />
        <span className="text-muted">{Number(value) ? 'Yes' : 'No'}</span>
      </label>
    )
  }
  if (t === 'Date') {
    return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cn('input', invalid && 'border-danger', className)} />
  }
  if (t === 'Time') {
    return <input type="time" value={String(value ?? '').slice(0, 5)} onChange={(e) => onChange(e.target.value ? `${e.target.value}:00` : null)} className={cn('input num', invalid && 'border-danger', className)} />
  }
  if (t === 'Datetime') {
    return <input type="datetime-local" value={(value ?? '').replace(' ', 'T').slice(0, 16)} onChange={(e) => onChange(e.target.value.replace('T', ' '))} className={cn('input', invalid && 'border-danger', className)} />
  }
  if (NUMBER.has(t)) {
    return (
      <input
        type="number" step={t === 'Int' ? 1 : 'any'} value={value ?? ''} placeholder={field.placeholder ?? (t === 'Currency' ? '0.00' : undefined)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={cn('input num', invalid && 'border-danger', className)}
      />
    )
  }
  if (TEXTAREA.has(t)) {
    return <textarea rows={3} value={stripHtml(value)} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={cn('input h-auto py-2', invalid && 'border-danger', className)} />
  }
  return <input value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={cn('input', invalid && 'border-danger', className)} />
}

function stripHtml(v) {
  if (!v) return ''
  return String(v).includes('<') ? String(v).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim() : v
}
