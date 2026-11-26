import { useState } from 'react'
import { useSWRConfig } from 'frappe-react-sdk'
import { GitBranch } from 'lucide-react'
import Button from '../Button.jsx'
import StatusBadge from '../StatusBadge.jsx'
import ReasonDialog from './ReasonDialog.jsx'
import { actionIcon as ICON, actionVariant as VARIANT, needsReason } from '../../lib/workflow.js'
import { useCall } from '../../lib/useCall.js'
import { errorText } from '../../lib/errors.js'
import { useToast } from '../../app/toast-context.js'


/**
 * Workflow bar on a saved document: current approval state + the actions this user may take
 * (from Frappe's get_transitions, so roles / conditions / self-approval match Desk).
 * Renders nothing when the doctype has no active workflow.
 */
export default function ApprovalBar({ doctype, name, workflow, onDone }) {
  const call = useCall()
  const toast = useToast()
  const { mutate: globalMutate } = useSWRConfig()
  const [busy, setBusy] = useState('')
  const [asking, setAsking] = useState(null)

  if (!workflow) return null
  const { state, actions } = workflow

  async function run(action, reason) {
    setBusy(action)
    try {
      await call.post('karya_erp.approvals.apply', { doctype, name, action, reason: reason || undefined })
      toast({ tone: 'success', title: action, description: `${name} updated` })
      setAsking(null)
      globalMutate('dashboard') // badge count
      globalMutate((k) => typeof k === 'string' && k.startsWith('approvals:'))
      await onDone?.()
    } catch (e) {
      toast({ tone: 'error', title: `Could not ${action.toLowerCase()}`, description: errorText(e) })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-xs">
        <GitBranch className="size-4 text-amber-600 dark:text-amber-400" />
        <span className="font-medium">Approval</span>
        <StatusBadge status={state} />
        {!actions.length && <span className="text-muted">No action needed from you.</span>}
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {actions.map((a) => (
            <Button
              key={a} icon={ICON(a)} variant={VARIANT(a)} loading={busy === a} disabled={Boolean(busy)}
              onClick={() => (needsReason(a) ? setAsking(a) : run(a))}
            >
              {a}
            </Button>
          ))}
        </div>
      )}
      <ReasonDialog
        open={Boolean(asking)} action={asking ?? ''} required busy={busy === asking}
        onCancel={() => setAsking(null)} onConfirm={(reason) => run(asking, reason)}
      />
    </div>
  )
}
