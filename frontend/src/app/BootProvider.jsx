import { useFrappeGetCall } from 'frappe-react-sdk'
import { BootContext } from './boot-context.js'
import { FullPageSpinner } from '../components/Spinner.jsx'
import Login from '../pages/Login.jsx'
import Setup from '../pages/Setup.jsx'
import { setServerTimeZone } from '../lib/serverTime.js'
import { useState } from 'react'
import { menuViews } from '../lib/nav.js'
import { storedMenuView, storeMenuView } from '../lib/portal.js'

export function BootProvider({ children }) {
  const [stored, setStored] = useState(() => storedMenuView())
  const { data, error, isLoading, mutate } = useFrappeGetCall(
    'karya_erp.api.boot', undefined, 'boot',
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  if (isLoading) return <FullPageSpinner />

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="font-medium text-danger">Could not reach the server.</p>
          <p className="mt-1 text-muted">{error.message || 'Check that bench is running.'}</p>
          <button className="mt-4 rounded-lg border px-3 py-1.5 hover:bg-surface-2" onClick={() => mutate()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const boot = data?.message
  if (!boot || boot.user === 'Guest') return <Login />

  if (boot.needs_setup) return <Setup boot={boot} onDone={() => window.location.reload()} />

  setServerTimeZone(boot.time_zone)
  // The panel being shown: Employee or User, as chosen for this tab (or by the employee address), when this person has it; else the full menu.
  const views = menuViews(boot)
  const menu_view = views.includes(stored) ? stored : views.includes('all') ? 'all' : views[0]
  const setMenuView = (v) => { storeMenuView(v); setStored(v) }
  return <BootContext value={{ ...boot, menu_view, menu_views: views, employee_portal: menu_view === 'employee', setMenuView, refresh: mutate }}>{children}</BootContext>
}
