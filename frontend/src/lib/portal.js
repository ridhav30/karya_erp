// Which panel a person is looking at: Employee (their own HR pages) or User (the full menu). It is remembered for the tab, and
// opening <app>/employee (the employee sign-in address) starts it on Employee. Signing out forgets it.
const KEY = 'master:menu'
const onEmployeeAddress = () => /\/employee\/?$/.test(window.location.pathname)

export function storedMenuView() {
  try {
    if (onEmployeeAddress()) sessionStorage.setItem(KEY, 'employee')
    return sessionStorage.getItem(KEY)
  } catch { return onEmployeeAddress() ? 'employee' : null }
}

export function storeMenuView(view) {
  try { if (view) sessionStorage.setItem(KEY, view); else sessionStorage.removeItem(KEY) } catch { /* storage not available */ }
}

export const leaveEmployeePortal = () => storeMenuView(null)

/** The app's own address prefix: nothing in dev, "/<app>" once built (the router's basename). */
export const appBase = () => (import.meta.env.DEV ? '' : `/${window.location.pathname.split('/')[1] ?? ''}`)
