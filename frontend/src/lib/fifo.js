/**
 * Oldest-first (FIFO) allocation of a payment over open invoices.
 * Age = due date, then posting date, then document number, so what is most overdue is settled first.
 */
const ageKey = (r) => [String(r.due_date || r.posting_date || ''), String(r.posting_date || ''), String(r.name || r.reference_name || r.voucher_no || '')]

export function byAge(a, b) {
  const x = ageKey(a), y = ageKey(b)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100

/** { key: amount } — each open row (outstanding > 0) gets min(outstanding, what is left), oldest first. */
export function fifoShares(rows, amount, keyOf, outOf) {
  const out = {}
  let left = cents(amount)
  for (const r of [...rows].filter((r) => outOf(r) > 0).sort(byAge)) {
    if (left <= 0) break
    const take = Math.min(left, cents(outOf(r)))
    if (take > 0) { out[keyOf(r)] = cents(take); left = cents(left - take) }
  }
  return out
}

/** Payment Entry reference rows with allocated_amount filled oldest-first for `amount`. */
export function fifoReferences(refs, amount) {
  const share = fifoShares(refs, amount, (r) => `${r.reference_name}::${r.payment_term ?? ''}`, (r) => Number(r.outstanding_amount) || 0)
  return [...refs].sort(byAge).map((r) => ({ ...r, allocated_amount: share[`${r.reference_name}::${r.payment_term ?? ''}`] ?? 0 }))
}

/** The party's open invoices as Payment Entry reference rows (allocated_amount 0), oldest first. */
export async function fetchOpenReferences(call, doc) {
  const partyAccount = doc.payment_type === 'Receive' ? doc.paid_from : doc.paid_to
  const args = {
    posting_date: doc.posting_date, company: doc.company, party_type: doc.party_type, payment_type: doc.payment_type,
    party: doc.party, party_account: partyAccount, get_outstanding_invoices: true, get_orders_to_be_billed: false,
  }
  const res = await call.post('erpnext.accounts.doctype.payment_entry.payment_entry.get_outstanding_reference_documents', { args: JSON.stringify(args) })
  return (res?.message ?? [])
    .filter((r) => (Number(r.outstanding_amount) || 0) > 0.005)
    .map((r) => ({
      reference_doctype: r.voucher_type, reference_name: r.voucher_no, due_date: r.due_date,
      total_amount: r.invoice_amount, outstanding_amount: Number(r.outstanding_amount) || 0, allocated_amount: 0,
      exchange_rate: r.exchange_rate || 1, ...(r.payment_term ? { payment_term: r.payment_term } : {}),
    }))
}
