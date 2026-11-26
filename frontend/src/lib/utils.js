import { clsx } from 'clsx'

export const cn = (...args) => clsx(...args)

/** URL to open a document or list in Frappe Desk. */
export function deskUrl(doctype, name) {
  const slug = doctype.toLowerCase().replace(/ /g, '-')
  return name ? `/app/${slug}/${encodeURIComponent(name)}` : `/app/${slug}`
}
