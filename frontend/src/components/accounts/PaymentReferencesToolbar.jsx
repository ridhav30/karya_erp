import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import Button from '../Button.jsx'
import { errorText } from '../../lib/errors.js'
import { formatMoney } from '../../lib/format.js'
import { byAge, fifoReferences, fetchOpenReferences } from '../../lib/fifo.js'

/**
 * "Get outstanding invoices" for a Payment Entry: loads the party's open invoices from ERPNext and
 * allocates the paid amount oldest-first (or fills the paid amount when it is still empty).
 */
export default function PaymentReferencesToolbar({ doc, editing, onChange, patchDoc, call, toast }) {
  const [loading, setLoading] = useState(false)
  if (!editing || doc.payment_type === 'Internal Transfer') return null

  const partyAccount = doc.payment_type === 'Receive' ? doc.paid_from : doc.paid_to
  const ready = doc.party && partyAccount && doc.company

  async function load() {
    setLoading(true)
    try {
      const open = await fetchOpenReferences(call, doc)
      if (!open.length) {
        toast({ tone: 'info', title: 'Nothing outstanding', description: `${doc.party} has no open invoices.` })
        onChange([])
        return
      }
      const amount = Number(doc.paid_amount) || 0
      const fill = !amount // no amount typed yet -> pay everything
      const rows = fill ? open.sort(byAge).map((r) => ({ ...r, allocated_amount: r.outstanding_amount })) : fifoReferences(open, amount)
      onChange(rows)
      if (fill) {
        const total = rows.reduce((s, r) => s + r.allocated_amount, 0)
        patchDoc({ paid_amount: total, received_amount: total })
      }
    } catch (e) {
      toast({ tone: 'error', title: 'Could not load invoices', description: errorText(e) })
    } finally {
      setLoading(false)
    }
  }

  const paid = Number(doc.paid_amount) || 0
  const allocated = (doc.references ?? []).reduce((s, r) => s + (Number(r.allocated_amount) || 0), 0)
  const advance = Math.round((paid - allocated) * 100) / 100
  return (
    <div className="flex flex-wrap items-center gap-2">
      {paid > 0 && (doc.references ?? []).length > 0 && advance > 0.005 && (
        <span className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1 text-[11.5px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <b className="num">{formatMoney(advance, doc.paid_from_account_currency || doc.paid_to_account_currency)}</b> is more than the invoices: kept as an advance on {doc.party_name || doc.party}
        </span>
      )}
      <Button size="sm" icon={ListChecks} onClick={load} loading={loading} disabled={!ready} title={ready ? undefined : 'Pick the party first'}>
        Get outstanding invoices
      </Button>
    </div>
  )
}
