import { useState } from 'react'
import { CheckCircle2, Printer, Wallet } from 'lucide-react'
import Button from '../Button.jsx'
import Modal from '../Modal.jsx'
import Combobox from '../fields/Combobox.jsx'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { printUrls } from '../../lib/print.js'
import { t } from '../../lib/i18n.js'

export const Err = ({ error }) => <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error)}</div>

export function Row({ label, value }) {
  return <div className="flex items-center justify-between text-muted"><span>{t(label)}</span><span className="num">{value}</span></div>
}


export function PayModal({ profile, total, money, onClose, onPay }) {
  const toast = useToast()
  const [method, setMethod] = useState(profile.payments.find((p) => p.default)?.mode_of_payment ?? profile.payments[0]?.mode_of_payment)
  const [amount, setAmount] = useState(String(total))
  const [busy, setBusy] = useState(false)
  const paid = Number(amount) || 0
  const change = Math.max(0, paid - total)
  const short = Math.max(0, total - paid)

  async function go() {
    setBusy(true)
    try { await onPay([{ mode_of_payment: method, amount: paid }]) } catch (e) {
      toast({ tone: 'error', title: 'Could not complete the sale', description: errorText(e) })
      setBusy(false)
    }
  }

  return (
    <Modal title="Payment" subtitle={`${t('Total')} ${money(total)}`} icon={Wallet} tone="emerald" size="md" onClose={onClose}
      footer={<><Button onClick={onClose}>Back</Button><Button variant="primary" loading={busy} disabled={paid <= 0 || (short > 0.004 && !profile.allow_partial_payment)} onClick={go}>Complete sale</Button></>}>
      <div className="space-y-4 text-sm">
        <label className="block"><span className="mb-1 block text-xs font-medium">{t('Payment method')}</span>
          <Combobox options={profile.payments.map((p) => p.mode_of_payment)} value={method} onChange={(v) => v && setMethod(v)} searchable={false} />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium">{t('Amount')}</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" autoFocus className="input num h-11 w-full text-end text-lg font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        {short > 0.004 ? <p className="flex justify-between text-danger"><span>{t('Still to pay')}</span><span className="num font-semibold">{money(short)}</span></p>
          : change > 0 && <p className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400"><span>{t('Change due')}</span><span className="num text-base">{money(change)}</span></p>}
      </div>
    </Modal>
  )
}

export function Done({ sale, money, onClose }) {
  const urls = printUrls({ doctype: sale.doctype, name: sale.name })
  return (
    <Modal title="Sale complete" subtitle={sale.name} icon={CheckCircle2} tone="emerald" size="sm" onClose={onClose}
      footer={<><a href={urls.preview} target="_blank" rel="noreferrer"><Button icon={Printer}>Print receipt</Button></a><Button variant="primary" onClick={onClose}>New sale</Button></>}>
      <div className="space-y-1 text-center">
        {sale.token_no ? <p className="mb-2 text-4xl font-black">{t('Token')} #{sale.token_no}<span className="block text-xs font-medium text-muted">{sale.order_type}</span></p> : null}
        <p className="num text-2xl font-bold">{money(sale.rounded_total || sale.grand_total)}</p>
        <p className="text-muted">{sale.customer_name}</p>
        {sale.change > 0 && <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{t('Change due')}: <span className="num">{money(sale.change)}</span></p>}
      </div>
    </Modal>
  )
}

