import { useFrappeGetCall } from 'frappe-react-sdk'

/** KPI numbers + badge counts, shared by Dashboard, Sidebar and Topbar (one request, cached). */
export function useDashboard() {
  const { data, ...rest } = useFrappeGetCall(
    'karya_erp.api.dashboard', undefined, 'dashboard',
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )
  return { data: data?.message, ...rest }
}
