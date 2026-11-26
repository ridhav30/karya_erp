import { Link, useNavigate } from 'react-router'
import { useFrappeGetDocList } from 'frappe-react-sdk'
import { Plus } from 'lucide-react'
import Button from './Button.jsx'
import FieldValue from './fields/FieldValue.jsx'
import { resolveField, useMeta } from '../lib/meta.js'
import { DOCTYPES } from '../lib/doctypes.js'

/**
 * Records of another doctype that link to this document (e.g. an Employee's documents).
 * rel: { title, slug, field, columns: [...], orderBy?, prefill?(doc), empty? }
 */
export default function RelatedList({ rel, doc }) {
  const navigate = useNavigate()
  const target = DOCTYPES[rel.slug]
  const { meta } = useMeta(target.doctype)
  const cols = (rel.columns ?? []).map((c) => resolveField(meta, c)).filter(Boolean)
  const { data, isLoading } = useFrappeGetDocList(target.doctype, {
    fields: ['name', ...cols.map((c) => c.fieldname)],
    filters: [[rel.field, '=', doc.name]],
    orderBy: rel.orderBy ?? { field: 'modified', order: 'desc' },
    limit: 50,
  }, `related:${target.doctype}:${rel.field}:${doc.name}`)
  const rows = data ?? []

  return (
    <section className="card overflow-hidden">
      <div className="dt-bar">
        <h3 className="dt-title">{rel.title ?? target.title} <span className="num font-normal text-muted">{rows.length || ''}</span></h3>
        <Button size="sm" icon={Plus} onClick={() => navigate(`/${rel.slug}/new`, { state: { defaults: { [rel.field]: doc.name, ...(rel.prefill?.(doc) ?? {}) } } })}>
          Add
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-surface-2" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted">{rel.empty ?? 'Nothing added yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="dt w-max min-w-full">
            <thead>
              <tr>{cols.map((c) => <th key={c.fieldname}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="cursor-pointer hover:bg-surface-2/60" onClick={() => navigate(`/${rel.slug}/${encodeURIComponent(r.name)}`)}>
                  {cols.map((c, i) => (
                    <td key={c.fieldname} className="whitespace-nowrap">
                      {i === 0
                        ? <Link to={`/${rel.slug}/${encodeURIComponent(r.name)}`} className="font-medium hover:text-primary hover:underline">{r[c.fieldname] || r.name}</Link>
                        : <FieldValue field={c} value={r[c.fieldname]} doc={r} linkable={false} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
