import { useMemo } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { t } from './i18n.js'

/**
 * Loads DocType meta (fields, labels, types, options) from ERPNext,
 * including child table metas. Cached per doctype for the session.
 */
export function useMeta(doctype) {
  const { data, error, isLoading } = useFrappeGetCall(
    'frappe.desk.form.load.getdoctype', { doctype }, doctype ? `meta:${doctype}` : null,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 10 * 60_000 },
  )

  return useMemo(() => {
    const docs = data?.docs ?? []
    const byName = Object.fromEntries(docs.map((d) => [d.name, indexMeta(d)]))
    return { meta: byName[doctype], metaOf: (dt) => byName[dt], error, isLoading }
  }, [data, error, isLoading, doctype])
}

function indexMeta(m) {
  const fields = Object.fromEntries((m.fields ?? []).map((f) => [f.fieldname, f]))
  return { ...m, fieldMap: fields }
}

/** Merge a config entry (string or object) with meta info. Returns null if the field doesn't exist. */
export function resolveField(meta, entry) {
  const cfg = typeof entry === 'string' ? { field: entry } : entry
  const mf = meta?.fieldMap?.[cfg.field]
  if (!mf && !cfg.type && cfg.field !== 'name') return null
  return {
    ...cfg,
    fieldname: cfg.field,
    label: t(cfg.label ?? mf?.label ?? (cfg.field === 'name' ? 'ID' : cfg.field)),
    fieldtype: cfg.type ?? mf?.fieldtype ?? 'Data',
    options: cfg.options ?? mf?.options,
    reqd: cfg.reqd ?? Boolean(mf?.reqd),
    read_only: cfg.readOnly ?? Boolean(mf?.read_only),
    default: mf?.default,
  }
}
