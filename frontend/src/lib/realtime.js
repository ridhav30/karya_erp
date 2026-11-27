import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

/**
 * Live updates over Frappe's socket.io server. The server publishes `restaurant_update` whenever an order, table,
 * booking or kitchen changes (see restaurant.notify), and every restaurant screen refetches when it hears it.
 * One shared connection; if it drops, screens fall back to slow polling until it comes back.
 */
let shared = null

function connect() {
  if (shared) return shared
  const bus = new EventTarget()
  const state = { bus, connected: false, event: 'restaurant_update', socket: null }
  shared = state
  fetch('/api/method/karya_erp.restaurant.realtime_info', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`realtime_info ${r.status}`))))
    .then(({ message: info }) => {
      state.event = info.event
      // Same rule as Frappe's own desk: behind nginx (no port in the URL) use the page's origin, otherwise the socket port.
      // The Vite dev server proxies /socket.io itself (vite.config.js), so there too the page's origin is used.
      const base = window.location.port && !import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:${info.port}` : window.location.origin
      const socket = io(`${base}/${info.site}`, { withCredentials: true, reconnectionDelayMax: 5000 })
      state.socket = socket
      socket.on('connect', () => { state.connected = true; bus.dispatchEvent(new Event('state')); bus.dispatchEvent(new Event('update')) }) // refetch once: events may have been missed while offline
      socket.on('disconnect', () => { state.connected = false; bus.dispatchEvent(new Event('state')) })
      socket.on(info.event, () => bus.dispatchEvent(new Event('update')))
    })
    .catch(() => { shared = null; setTimeout(() => { if (!shared) connect() }, 15000) }) // not logged in yet, or the realtime server is down: try again
  return state
}

/** True while the socket is connected. */
export function useSocketConnected() {
  const [on, setOn] = useState(() => connect().connected)
  useEffect(() => {
    const s = connect()
    const sync = () => setOn(s.connected)
    s.bus.addEventListener('state', sync)
    sync()
    return () => s.bus.removeEventListener('state', sync)
  }, [])
  return on
}

/** Run `onUpdate` (e.g. an SWR `mutate`) whenever something changes in the restaurant, at most once per 250 ms. */
export function useRestaurantUpdates(onUpdate) {
  const ref = useRef(onUpdate)
  useEffect(() => { ref.current = onUpdate })
  useEffect(() => {
    const s = connect()
    let timer = null
    const fire = () => { if (timer) return; timer = setTimeout(() => { timer = null; ref.current?.() }, 250) }
    s.bus.addEventListener('update', fire)
    return () => { s.bus.removeEventListener('update', fire); if (timer) clearTimeout(timer) }
  }, [])
}

/** SWR refresh interval: none while live, a slow poll when the socket is down. */
export const fallbackInterval = (connected) => (connected ? 0 : 15000)
