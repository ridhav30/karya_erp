import { Link } from 'react-router'
import StatusBadge from '../StatusBadge.jsx'
import StarRating from './StarRating.jsx'
import { formatDate, formatMoney, formatNumber } from '../../lib/format.js'
import { docRoute } from '../../lib/docRoute.js'
import { useBoot } from '../../app/boot-context.js'

const DOCSTATUS = { 0: 'Draft', 1: 'Submitted', 2: 'Cancelled' }

/** Read-only display of one field value, chosen by fieldtype. */
export default function FieldValue({ field, value, doc, currency, linkable = true }) {
  const boot = useBoot()
  const t = field.fieldtype
  const empty = value == null || value === ''

  if (field.fieldname === 'lead_temperature') return empty ? <Dash /> : <StatusBadge status={value} />
  if (t === 'Status' || field.fieldname === 'status') return empty ? <Dash /> : <StatusBadge status={value} />
  if (t === 'DocStatus') return <StatusBadge status={DOCSTATUS[value] ?? 'Draft'} />
  if (t === 'Active') return <StatusBadge status={Number(value) ? 'Disabled' : 'Active'} />
  if (t === 'Rating') return <StarRating value={value} size="sm" label={field.label} />
  if (t === 'Check') return <span>{Number(value) ? 'Yes' : 'No'}</span>
  if (empty) return <Dash />
  if (t === 'Attach' || t === 'Attach Image') {
    return (
      <a href={value} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="truncate text-primary hover:underline">
        {decodeURIComponent(String(value).split('/').pop())}
      </a>
    )
  }
  if (t === 'Date') return <span className="num">{formatDate(value)}</span>
  if (t === 'Time') return <span className="num">{String(value).slice(0, 5)}</span>
  if (t === 'Datetime') return <span className="num">{formatDate(value)} {String(value).slice(11, 16)}</span>
  if (t === 'Currency') return <span className="num">{formatMoney(value, currency || doc?.currency)}</span>
  if (t === 'Percent') return <Progress value={value} />
  if (t === 'Int' || t === 'Float') return <span className="num">{formatNumber(value, t === 'Int' ? 0 : 3)}</span>
  const linkTo = t === 'Link' && linkable ? docRoute(boot, field.options, value) : null // only when this person may open it
  if (linkTo) {
    return (
      <Link to={linkTo} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
        {value}
      </Link>
    )
  }
  if (t === 'Text Editor' || t === 'Small Text' || t === 'Text' || t === 'Long Text') {
    return <span className="whitespace-pre-line">{String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim()}</span>
  }
  return <span>{String(value)}</span>
}

function Dash() {
  return <span className="text-muted">—</span>
}

export function Progress({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <span className="inline-flex min-w-24 items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${v >= 100 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${v}%` }} />
      </span>
      <span className="num text-xs text-muted">{Math.round(v)}%</span>
    </span>
  )
}
