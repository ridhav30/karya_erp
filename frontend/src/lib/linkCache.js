/** Shared cache for LinkField searches (frappe.desk.search.search_link). */

export const TTL = 60_000
export const cache = new Map() // key -> { at, results }
export const labels = new Map() // `${doctype}|${value}` -> option (for showing the picked label)
const inflight = new Map() // key -> Promise

export const keyOf = (doctype, filtersKey, txt, show = '') => `${doctype}|${filtersKey}|${txt.trim().toLowerCase()}|${show}`
export const labelKey = (doctype, value, show = '') => `${doctype}|${show}|${value}`

function toOption(doctype, r, show = '') {
  const label = r.label && r.label !== r.value ? r.label : r.value
  const opt = {
    value: r.value,
    label,
    badge: label !== r.value ? r.value : undefined,
    description: r.description ? String(r.description).replace(/<[^>]+>/g, '').trim() : undefined,
  }
  labels.set(labelKey(doctype, r.value, show), opt)
  return opt
}

export const PAGE = 20 // options per step
export const MAX = 300 // never ask for more than this at once; type to narrow down beyond it

/**
 * One search, `size` results (the server also says whether more follow). Asking for a bigger `size` re-runs the
 * same search from the top, so the list is always one consistent result set (no repeats or gaps between "pages").
 * Resolves to { at, results, hasMore, size }.
 */
export function searchLink(call, doctype, filtersKey, txt, size = PAGE, show = '') {
  const key = keyOf(doctype, filtersKey, txt, show)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL && hit.size >= size) return Promise.resolve(hit)
  const flight = `${key}|${size}`
  if (inflight.has(flight)) return inflight.get(flight)
  const p = call.get('karya_erp.api.link_search', {
    doctype, txt, page_length: size,
    filters: filtersKey === '{}' ? undefined : filtersKey,
    show: show || undefined,
  })
    .then((res) => {
      const m = res?.message ?? {}
      const entry = { at: Date.now(), results: (m.results ?? []).map((r) => toOption(doctype, r, show)), hasMore: Boolean(m.has_more), size }
      cache.set(key, entry)
      return entry
    })
    .finally(() => inflight.delete(flight))
  inflight.set(flight, p)
  return p
}

/** Drop cached searches for a doctype (after creating a record). */
export function invalidateLinkCache(doctype) {
  for (const k of cache.keys()) if (k.startsWith(`${doctype}|`)) cache.delete(k)
}
