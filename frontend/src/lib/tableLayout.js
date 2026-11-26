/** Column choices for configurable tables. */

const SIMPLE = new Set(['Data', 'Link', 'Dynamic Link', 'Select', 'Date', 'Datetime', 'Int', 'Float', 'Currency', 'Percent', 'Check', 'Small Text', 'Read Only', 'Phone', 'Duration', 'Rating', 'Time'])

/**
 * Columns a user can pick for a list: only what ERPNext itself recommends for list views —
 * the screen's configured columns, then fields marked "In List View" or "In Standard Filter"
 * in the doctype (Customize Form), plus "Last updated". `resolve` = (entry) => resolved column.
 */
export function listColumnChoices(meta, configured, resolve) {
  if (!meta) return configured
  const seen = new Set(configured.map((c) => c.fieldname))
  const extra = (meta.fields ?? [])
    .filter((f) => SIMPLE.has(f.fieldtype) && !f.hidden && f.label && !seen.has(f.fieldname) && (f.in_list_view || f.in_standard_filter))
    .map((f) => resolve(f.fieldname))
    .filter(Boolean)
  const std = seen.has('modified') ? [] : [resolve({ field: 'modified', label: 'Last updated', type: 'Datetime' })]
  return [...configured, ...extra, ...std.filter(Boolean)]
}
