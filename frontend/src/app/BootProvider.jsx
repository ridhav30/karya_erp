import { useFrappeGetCall } from 'frappe-react-sdk'
import { BootContext } from './boot-context.js'
import { FullPageSpinner } from '../components/Spinner.jsx'
import Login from '../pages/Login.jsx'
import Setup from '../pages/Setup.jsx'
import { setServerTimeZone } from '../lib/serverTime.js'

export function BootProvider({ children }) {
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
  return <BootContext value={{ ...boot, refresh: mutate }}>{children}</BootContext>
}
