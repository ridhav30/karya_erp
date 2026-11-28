import { ROUTE_OF } from './doctypes.js'
import { canOpen } from './nav.js'

/**
 * Where a document opens, or null when this person must not be sent there: the app has no page for that doctype,
 * they cannot read it, or its page is not in their page access. Callers show plain text for null instead of a link,
 * so nobody clicks into "no access". Use it for every link to a record (list cells, reports, notifications, chat, search).
 */
export function docRoute(boot, doctype, name) {
  const base = ROUTE_OF[doctype]
  if (!base) return null
  if (boot?.can_read && boot.can_read[doctype] === false) return null
  if (boot && !canOpen(boot, base)) return null
  return name == null || name === '' ? base : `${base}/${encodeURIComponent(name)}`
}
