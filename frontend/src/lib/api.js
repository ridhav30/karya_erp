import { leaveEmployeePortal } from './portal.js'
/**
 * Small helpers for calls that need full-page reloads (login/logout),
 * so the page is re-rendered by Frappe with a fresh CSRF token.
 * Everything else goes through frappe-react-sdk hooks.
 */
async function post(path, body) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}') headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body ?? {}), credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.message || data.exc_type || `Request failed (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return data
}

export async function login(usr, pwd) {
  await post('/api/method/login', { usr, pwd })
  window.location.reload()
}

export async function logout() {
  try { await post('/api/method/logout') } finally { leaveEmployeePortal(); window.location.reload() }
}
