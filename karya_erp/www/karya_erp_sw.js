// Karya Erp service worker — registered with scope /karya_erp/.
// Only caches the app's own hashed build files (fast start, works on a weak connection).
// Pages, API calls and documents always go to the server, so nothing stale or private is stored.
const VERSION = 'v1'
const STATIC = `karya-erp-static-${VERSION}`
const BUILD = '/assets/karya_erp/frontend/assets/'

const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#111827;text-align:center;padding:24px}
button{margin-top:16px;padding:10px 18px;border:0;border-radius:8px;background:#111827;color:#fff;font-size:14px}p{color:#6b7280;font-size:14px;max-width:320px}</style></head>
<body><div><h2>You're offline</h2><p>Karya Erp needs a connection to load your data. Check your network and try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('karya-erp-') && key !== STATIC) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Hashed build files never change under the same name → cache first.
  if (url.pathname.startsWith(BUILD)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) cache.put(req, res.clone())
      return res
    })())
    return
  }

  // App pages: always from the server (they carry the session token); friendly message when offline.
  if (req.mode === 'navigate' && url.pathname.startsWith('/karya_erp')) {
    event.respondWith(fetch(req).catch(() => new Response(OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
  }
})
