import { useFrappeGetCall } from 'frappe-react-sdk'
import { Check, Send, X } from 'lucide-react'

/** Actions that need a reason (reject / send back). */
export const needsReason = (action) => /reject|decline|return|rework|send back/i.test(action)
export const actionIcon = (a) => (/approve|accept/i.test(a) ? Check : /reject|decline/i.test(a) ? X : Send)
export const actionVariant = (a) => (/approve|accept/i.test(a) ? 'accent' : /reject|decline/i.test(a) ? 'danger' : 'secondary')

/** Current workflow state + allowed actions for a saved document (null when no active workflow). */
export function useWorkflow(doctype, name, enabled) {
  const { data, mutate } = useFrappeGetCall(
    'karya_erp.approvals.transitions', { doctype, name },
    enabled && name ? `wf:${doctype}:${name}` : null, { revalidateOnFocus: false },
  )
  return { workflow: data?.message ?? null, refresh: mutate }
}
