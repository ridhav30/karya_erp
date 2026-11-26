import { useSyncExternalStore } from 'react'

// Install-as-app support. The browser fires beforeinstallprompt once, early, so this module is imported
// from main.jsx and keeps the event until the user chooses "Install app".
let deferred = null
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit() })
window.addEventListener('appinstalled', () => { deferred = null; emit() })

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/karya_erp_sw.js', { scope: '/karya_erp/' }).catch(() => {})
  })
}

const snapshot = () => (isStandalone() ? 'none' : deferred ? 'prompt' : isIos() ? 'ios' : 'none')
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }

/** 'prompt' = Android/desktop Chrome one-tap install, 'ios' = show Add-to-Home-Screen steps, 'none' = nothing to offer. */
export function useInstallMode() {
  return useSyncExternalStore(subscribe, snapshot, () => 'none')
}

export async function promptInstall() {
  if (!deferred) return
  const e = deferred
  deferred = null
  emit()
  await e.prompt()
}
