/** Turn a Frappe/axios error into a readable message (uses _server_messages when present). */
export function errorText(err, fallback = 'Something went wrong') {
  if (!err) return fallback
  try {
    if (err._server_messages) {
      const msgs = JSON.parse(err._server_messages)
        .map((m) => { try { return JSON.parse(m).message } catch { return m } })
        .filter(Boolean)
      if (msgs.length) return stripHtml(msgs.join('\n'))
    }
  } catch { /* fall through */ }
  if (err.exception && typeof err.exception === 'string') {
    const line = err.exception.split('\n').filter(Boolean).pop()
    if (line && line.includes(':')) return stripHtml(line.split(':').slice(1).join(':').trim())
  }
  return stripHtml(typeof err.message === 'string' ? err.message : fallback)
}

function stripHtml(s) {
  return String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
}
