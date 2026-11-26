import { useState } from 'react'
import Button from './Button.jsx'
import LinkField from './fields/LinkField.jsx'
import { t } from '../lib/i18n.js'

/** Taxes & Charges tab: pick one Item Tax Template and put it on every item line (lines can still be changed one by one). */
export default function ItemTaxToolbar({ doc, rows, onChange, editing, toast }) {
  const [tpl, setTpl] = useState('')
  if (!editing) return null
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-56"><LinkField doctype="Item Tax Template" value={tpl} onChange={setTpl} filters={{ disabled: 0, ...(doc.company ? { company: doc.company } : {}) }} placeholder={t('Item tax template')} clearable /></div>
      <Button size="sm" disabled={!tpl || !rows?.length} onClick={() => { onChange(rows.map((r) => ({ ...r, item_tax_template: tpl }))); toast({ tone: 'success', title: `${t('Applied to')} ${rows.length} ${t('items')}` }) }}>{t('Apply to all items')}</Button>
    </div>
  )
}
