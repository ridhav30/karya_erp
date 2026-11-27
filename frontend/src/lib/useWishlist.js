import { useCallback, useMemo } from 'react'
import { useFrappeGetCall, useSWRConfig } from 'frappe-react-sdk'
import { useCall } from './useCall.js'
import { useToast } from '../app/toast-context.js'
import { errorText } from './errors.js'

/** The signed-in person's starred records of one document type (private to them). */
export function useWishlist(doctype) {
  const call = useCall()
  const toast = useToast()
  const { mutate: globalMutate } = useSWRConfig()
  const key = doctype ? `wishlist:${doctype}` : null
  const { data, mutate } = useFrappeGetCall('karya_erp.wishlist.names', { doctype }, key, { revalidateOnFocus: false })
  const names = useMemo(() => data?.message ?? [], [data])
  const set = useMemo(() => new Set(names), [names])

  const toggle = useCallback(async (name) => {
    const on = !set.has(name)
    // Show the new state at once; the server answer settles it.
    mutate({ message: on ? [...names, name] : names.filter((n) => n !== name) }, { revalidate: false })
    try {
      await call.post('karya_erp.wishlist.toggle', { doctype, name })
      globalMutate((k) => typeof k === 'string' && k.startsWith(`count:${doctype}:`))
    } catch (e) {
      mutate()
      toast({ tone: 'error', title: 'Could not update the wishlist', description: errorText(e) })
    }
  }, [call, doctype, globalMutate, mutate, names, set, toast])

  return { names, has: (n) => set.has(n), toggle }
}
