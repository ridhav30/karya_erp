import { useState } from 'react'
import { DownloadCloud } from 'lucide-react'
import Button from '../Button.jsx'
import LinkField from '../fields/LinkField.jsx'
import { errorText } from '../../lib/errors.js'

/**
 * Stock Reconciliation: "Fetch stock" loads every item in a warehouse with its current quantity and
 * valuation (ERPNext's own get_items), so you only change the counted quantities.
 */
export default function StockReconToolbar({ doc, editing, onChange, rows, call, toast }) {
  const [warehouse, setWarehouse] = useState(doc.set_warehouse || '')
  const [busy, setBusy] = useState(false)
  if (!editing) return null

  async function fetchStock() {
    setBusy(true)
    try {
      const res = await call.post('erpnext.stock.doctype.stock_reconciliation.stock_reconciliation.get_items', {
        warehouse, posting_date: doc.posting_date, posting_time: doc.posting_time || '23:59:59', company: doc.company, ignore_empty_stock: 0,
      })
      const got = (res?.message ?? []).map((r) => ({
        item_code: r.item_code, warehouse: r.warehouse || warehouse, qty: r.qty, valuation_rate: r.valuation_rate,
        current_qty: r.current_qty ?? r.qty, current_valuation_rate: r.current_valuation_rate ?? r.valuation_rate,
      }))
      if (!got.length) {
        toast({ tone: 'info', title: 'No stock items found in this warehouse' })
        return
      }
      const have = new Set((rows ?? []).filter((r) => r.item_code).map((r) => `${r.item_code}|${r.warehouse}`))
      const added = got.filter((r) => !have.has(`${r.item_code}|${r.warehouse}`))
      onChange([...(rows ?? []).filter((r) => r.item_code), ...added])
      toast({ tone: 'success', title: `${added.length} item${added.length === 1 ? '' : 's'} loaded`, description: 'Change the counted quantity on each line.' })
    } catch (e) {
      toast({ tone: 'error', title: 'Could not fetch stock', description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-48"><LinkField doctype="Warehouse" value={warehouse} onChange={setWarehouse} filters={{ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }} placeholder="Warehouse…" /></div>
      <Button size="sm" icon={DownloadCloud} onClick={fetchStock} loading={busy} disabled={!warehouse || !doc.company}>Fetch stock</Button>
    </div>
  )
}
