import { useEffect, useId, useRef, useState } from 'react'
import { useQuickCreate } from '../../app/quick-create-context.js'
import { canQuickCreate } from '../../lib/quickCreate.js'
import { useCall } from '../../lib/useCall.js'
import Combobox from './Combobox.jsx'
import { MAX, PAGE, TTL, cache, invalidateLinkCache, keyOf, labels, searchLink } from '../../lib/linkCache.js'

/**
 * Link field picker: the e-invoicing CustomSelect behaviour (see Combobox) on top of
 * frappe.desk.search.search_link — the same search Desk uses, so permissions match ERPNext.
 *
 * Speed: results are cached per doctype + filters + text for 60s and shared by every LinkField,
 * prefetched when the pointer reaches the field, and while a new search is in flight the list is
 * filtered locally from the last results so typing never waits on the network.
 */
export default function LinkField({ doctype, value, onChange, filters, placeholder, disabled, invalid, className, autoFocus, bare, clearable = true }) {
  const call = useCall()
  const quick = useQuickCreate()
  const fieldId = useId()
  const filtersKey = JSON.stringify(filters ?? {})
  const [open, setOpen] = useState(false)
  const [txt, setTxt] = useState('')
  const [results, setResults] = useState(() => cache.get(keyOf(doctype ?? '', filtersKey, ''))?.results ?? [])
  const [loading, setLoading] = useState(false)
  const [size, setSize] = useState(PAGE) // how many results are asked for; grows with "Load more" / scrolling
  const [hasMore, setHasMore] = useState(() => cache.get(keyOf(doctype ?? '', filtersKey, ''))?.hasMore ?? false)
  const reqRef = useRef(0)

  // Fetch while open: empty text immediately, typed text debounced a little.
  useEffect(() => {
    if (!open || !doctype) return
    const id = ++reqRef.current
    const key = keyOf(doctype, filtersKey, txt)
    const hit = cache.get(key)
    const run = () => {
      setLoading(true)
      searchLink(call, doctype, filtersKey, txt, size)
        .then((r) => { if (id === reqRef.current) { setResults(r.results); setHasMore(r.hasMore) } })
        .catch(() => { if (id === reqRef.current) { setResults([]); setHasMore(false) } })
        .finally(() => { if (id === reqRef.current) setLoading(false) })
    }
    if (hit && Date.now() - hit.at < TTL && hit.size >= size) {
      const t = setTimeout(() => { if (id === reqRef.current) { setResults(hit.results); setHasMore(hit.hasMore); setLoading(false) } }, 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(run, txt && size === PAGE ? 150 : 0)
    return () => clearTimeout(t)
  }, [open, txt, doctype, filtersKey, call, size])

  // While the server catches up, narrow the last results locally so typing feels instant.
  const q = txt.trim().toLowerCase()
  const shown = loading && q
    ? results.filter((o) => [o.label, o.value, o.description].some((x) => x && String(x).toLowerCase().includes(q)))
    : results

  const prefetch = () => {
    if (doctype && !disabled) searchLink(call, doctype, filtersKey, '').catch(() => {})
  }

  const allowCreate = Boolean(quick) && canQuickCreate(doctype)
  const startCreate = (term) => {
    quick.openQuickCreate({
      doctype, initial: term,
      onCreated: (name) => {
        invalidateLinkCache(doctype)
        if (!name) return
        onChange(name)
        // Put the cursor back on this field once the popup has closed, now showing the new record.
        setTimeout(() => document.getElementById(fieldId)?.focus(), 150)
      },
    })
  }

  const current = value ? (labels.get(`${doctype}|${value}`) ?? { value, label: value }) : null
  // Keep the selected value in the list so it shows as selected (and toggles off when picked again).
  const options = current && !shown.some((o) => o.value === value) && !q ? [current, ...shown] : shown

  return (
    <Combobox
      id={fieldId}
      variant={bare ? 'cell' : 'default'}
      className={className}
      options={options}
      value={value ?? ''}
      displayValue={current}
      onChange={(v) => { if ((v || '') !== (value || '')) onChange(v) }}
      filterLocally={false}
      searchable
      onSearch={(t) => { setSize(PAGE); setTxt(t) }}
      onOpenChange={(o) => { if (!o) setSize(PAGE); setOpen(o) }}
      hasMore={hasMore && size < MAX}
      onLoadMore={() => { if (!loading) setSize((n) => Math.min(n + PAGE, MAX)) }}
      onPrefetch={prefetch}
      loading={loading}
      disabled={disabled || !doctype}
      invalid={invalid}
      clearable={clearable && !bare}
      autoFocus={autoFocus}
      placeholder={placeholder ?? (doctype ? `Select ${doctype}…` : 'Select…')}
      searchPlaceholder={doctype ? `Search ${doctype.toLowerCase()}…` : 'Search…'}
      emptyText={q ? `No ${doctype ?? 'record'} matches “${txt.trim()}”.` : `No ${doctype ?? 'records'} found.`}
      onQuickCreate={allowCreate ? startCreate : null}
      quickCreateLabel={`New ${doctype}`}
    />
  )
}
