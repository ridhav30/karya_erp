import { useContext } from 'react'
import { FrappeContext } from 'frappe-react-sdk'

/** Imperative API access: const call = useCall(); await call.get(method, params) / call.post(...) */
export function useCall() {
  return useContext(FrappeContext).call
}
