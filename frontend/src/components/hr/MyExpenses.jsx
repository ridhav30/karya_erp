import { useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { HandCoins, Paperclip, Plus, Receipt, Send, Trash2, Undo2 } from 'lucide-react'
import Button from '../Button.jsx'
import Modal from '../Modal.jsx'
import StatusBadge from '../StatusBadge.jsx'
import Combobox from '../fields/Combobox.jsx'
import { useBoot } from '../../app/boot-context.js'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { uploadFile } from '../../lib/activity.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { confirm } from '../../lib/dialogs.js'

const todayIso = () => new Date().toLocaleDateString('en-CA')

function Dialog({ title, icon, tone = 'blue', onClose, busy, children, footer, onSubmit }) {
  return (
    <Modal as="form" onSubmit={onSubmit} size="max-w-3xl" icon={icon} tone={tone} title={title} subtitle="Goes to your expense approver"
      onClose={() => !busy && onClose()} bodyClassName="space-y-3.5" footer={footer}>
      {children}
    </Modal>
  )
}

function ClaimDialog({ onClose, onDone }) {
  const call = useCall()
  const toast = useToast()
  const boot = useBoot()
  const { data } = useFrappeGetCall('karya_erp.expenses.expense_types', undefined, 'expense-types', { revalidateOnFocus: false })
  const types = data?.message ?? []
  const [lines, setLines] = useState([{ expense_date: todayIso(), expense_type: '', description: '', amount: '' }])
  const [remark, setRemark] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const valid = lines.some((l) => l.expense_type && Number(l.amount) > 0)
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  async function submit(e) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      const res = await call.post('karya_erp.expenses.claim', { lines: JSON.stringify(lines), remark: remark || undefined })
      const name = res?.message?.name
      for (const f of files) {
        try { await uploadFile(f, 'Expense Claim', name) } catch (err) { toast({ tone: 'error', title: `Receipt ${f.name} not attached`, description: errorText(err) }) }
      }
      toast({ tone: 'success', title: 'Expense claim sent', description: `${name} · ${formatMoney(total, boot.currency)}` })
      onDone?.()
      onClose()
    } catch (err) {
      toast({ tone: 'error', title: 'Could not send claim', description: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Claim expense" icon={Receipt} onClose={onClose} busy={busy} onSubmit={submit}
      footer={<><span className="me-auto self-center text-xs">Total <b className="num">{formatMoney(total, boot.currency)}</b></span><Button type="button" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!valid}>Send claim</Button></>}>
      {lines.map((l, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">Expense {i + 1}</span>
            {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove expense" className="pressable grid size-6 place-items-center rounded text-muted hover:text-danger"><Trash2 className="size-3.5" /></button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Combobox options={types} value={l.expense_type} onChange={(v) => setLine(i, { expense_type: v })} placeholder="Type…" emptyText="No expense types — ask HR." />
            <input type="number" step="0.01" min="0" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} placeholder="Amount" className="input num" />
            <input type="date" value={l.expense_date} max={todayIso()} onChange={(e) => setLine(i, { expense_date: e.target.value })} className="input" />
            <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="What for?" className="input" />
          </div>
        </div>
      ))}
      <Button type="button" size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, { expense_date: todayIso(), expense_type: '', description: '', amount: '' }])}>Add expense</Button>
      <label className="block space-y-1.5">
        <span className="label">Receipts</span>
        <input type="file" multiple accept="image/*,application/pdf" capture="environment" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="block w-full text-xs file:me-3 file:rounded-md file:border file:bg-surface file:px-3 file:py-1.5 file:text-xs" />
        {files.length > 0 && <span className="flex items-center gap-1 text-[11px] text-muted"><Paperclip className="size-3" />{files.map((f) => f.name).join(', ')}</span>}
      </label>
      <label className="block space-y-1.5">
        <span className="label">Note</span>
        <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} className="input h-auto resize-none py-2" placeholder="Optional" />
      </label>
    </Dialog>
  )
}

function AdvanceDialog({ onClose, onDone }) {
  const call = useCall()
  const toast = useToast()
  const boot = useBoot()
  const [f, setF] = useState({ purpose: '', amount: '', required_by: '' })
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await call.post('karya_erp.expenses.request_advance', { purpose: f.purpose, amount: f.amount, required_by: f.required_by || undefined })
      toast({ tone: 'success', title: 'Advance requested', description: `${res?.message?.name} · ${formatMoney(f.amount, boot.currency)}` })
      onDone?.()
      onClose()
    } catch (err) {
      toast({ tone: 'error', title: 'Could not request advance', description: errorText(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="Request advance" icon={HandCoins} tone="amber" onClose={onClose} busy={busy} onSubmit={submit}
      footer={<><Button type="button" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!f.purpose || !(Number(f.amount) > 0)}>Request</Button></>}>
      <label className="block space-y-1.5"><span className="label">Purpose <span className="text-danger">*</span></span><input value={f.purpose} onChange={(e) => setF((x) => ({ ...x, purpose: e.target.value }))} className="input" placeholder="e.g. Business trip to Abu Dhabi" autoFocus /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5"><span className="label">Amount ({boot.currency}) <span className="text-danger">*</span></span><input type="number" step="0.01" min="0" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} className="input num" /></label>
        <label className="block space-y-1.5"><span className="label">Needed by</span><input type="date" min={todayIso()} value={f.required_by} onChange={(e) => setF((x) => ({ ...x, required_by: e.target.value }))} className="input" /></label>
      </div>
      <p className="text-[11px] text-muted">HR / accounts review the request and pay it. Unused amounts are returned or recovered from salary.</p>
    </Dialog>
  )
}

/** My HR card: expense claims and advances, with buttons to claim / request. */
export default function MyExpenses() {
  const call = useCall()
  const toast = useToast()
  const boot = useBoot()
  const { data, isLoading, mutate } = useFrappeGetCall('karya_erp.expenses.mine', undefined, 'my-expenses', { revalidateOnFocus: false })
  const [dialog, setDialog] = useState(null)
  const claims = data?.message?.claims ?? []
  const advances = data?.message?.advances ?? []
  const items = [
    ...claims.map((c) => ({ key: c.name, doctype: 'Expense Claim', name: c.name, title: 'Expense claim', date: c.posting_date, amount: c.total_claimed_amount, status: c.docstatus === 0 ? (c.approval_status === 'Draft' ? 'Pending' : c.approval_status) : c.docstatus === 2 ? 'Cancelled' : c.approval_status === 'Rejected' ? 'Rejected' : c.status, can: c.can_withdraw })),
    ...advances.map((a) => ({ key: a.name, doctype: 'Employee Advance', name: a.name, title: a.purpose || 'Advance', date: a.posting_date, amount: a.advance_amount, status: a.docstatus === 0 ? 'Pending' : a.status, can: a.can_withdraw })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8)

  async function withdraw(it) {
    if (!(await confirm({ title: 'Withdraw request?', message: `Withdraw ${it.name}?`, confirmLabel: 'Withdraw', tone: 'danger' }))) return
    try {
      await call.post('karya_erp.expenses.withdraw', { doctype: it.doctype, name: it.name })
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not withdraw', description: errorText(e) })
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="dt-bar">
        <h3 className="dt-title flex items-center gap-2"><Receipt className="size-3.5 text-muted" />Expenses & advances</h3>
        <div className="flex gap-1.5">
          <Button size="sm" icon={HandCoins} onClick={() => setDialog('advance')}>Advance</Button>
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog('claim')}>Claim</Button>
        </div>
      </div>
      {isLoading ? <div className="h-20 animate-pulse" /> : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">No claims or advances yet.</p>
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3 px-4 py-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{it.title}</p>
                <p className="num text-[11px] text-muted">{formatDate(it.date)} · {formatMoney(it.amount, boot.currency)}</p>
              </div>
              <StatusBadge status={it.status} />
              {it.can && (
                <button type="button" onClick={() => withdraw(it)} title="Withdraw" aria-label={`Withdraw ${it.name}`} className="pressable grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"><Undo2 className="size-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog === 'claim' && <ClaimDialog onClose={() => setDialog(null)} onDone={mutate} />}
      {dialog === 'advance' && <AdvanceDialog onClose={() => setDialog(null)} onDone={mutate} />}
    </section>
  )
}
