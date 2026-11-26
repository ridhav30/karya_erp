/** Print preview / PDF URLs (Frappe's /printview and download_pdf) and per-doctype picker memory. */

export function printUrls({ doctype, name, format, letterhead }) {
  const q = new URLSearchParams({ doctype, name, format: format || 'Standard', no_letterhead: letterhead ? '0' : '1' })
  if (letterhead) q.set('letterhead', letterhead)
  const pdf = new URLSearchParams(q)
  q.set('trigger_print', '0')
  return {
    preview: `/printview?${q.toString()}`,
    pdf: `/api/method/frappe.utils.print_format.download_pdf?${pdf.toString()}`,
  }
}

const KEY = (doctype) => `karya_erp:print:${doctype}`

export function readPrintPrefs(doctype) {
  try { return JSON.parse(localStorage.getItem(KEY(doctype)) || '{}') } catch { return {} }
}

export function savePrintPrefs(doctype, prefs) {
  try { localStorage.setItem(KEY(doctype), JSON.stringify(prefs)) } catch { /* private mode */ }
}

/** Documents that get the "Send" (email / WhatsApp) button. */
export const SENDABLE = new Set([
  'Quotation', 'Sales Order', 'Delivery Note', 'Sales Invoice', 'Payment Entry', 'Dunning',
  'Request for Quotation', 'Supplier Quotation', 'Purchase Order', 'Purchase Invoice', 'Salary Slip',
])
