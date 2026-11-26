/** Helpers for the document Activity footer. */
import { serverMs } from './serverTime.js'

export function ago(iso) {
  const t = serverMs(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return String(iso).slice(0, 10)
}

export function fileSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Comment / info HTML → plain text (never rendered as HTML). */
export function plainText(html) {
  const src = String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
  const doc = new DOMParser().parseFromString(src, 'text/html')
  return (doc.body.textContent ?? '').trim()
}

/** Upload one file (Frappe's upload_file; private by default). With doctype + docname it is attached to that document. */
export async function uploadFile(file, doctype, docname, isPrivate = true) {
  const body = new FormData()
  body.append('file', file, file.name)
  if (doctype && docname) {
    body.append('doctype', doctype)
    body.append('docname', docname)
  }
  body.append('is_private', isPrivate ? '1' : '0')
  const headers = { Accept: 'application/json' }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}') headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const res = await fetch('/api/method/upload_file', { method: 'POST', body, headers, credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    let msg = data.exception || data.message || `Upload failed (${res.status})`
    try { msg = JSON.parse(JSON.parse(data._server_messages)[0]).message } catch { /* keep msg */ }
    throw new Error(String(msg).replace(/<[^>]+>/g, ''))
  }
  return data.message
}
