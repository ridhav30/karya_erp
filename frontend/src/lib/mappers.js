/**
 * "Make next document" helpers (same as Desk's Create buttons).
 * ERPNext mapper methods return an unsaved doc; we clean it and open it in the form as a prefill.
 */

const DROP = new Set(['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'idx', 'parent', 'parentfield', 'parenttype'])

function clean(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (DROP.has(k) || k.startsWith('__')) continue
    out[k] = Array.isArray(v) ? v.map((row) => (row && typeof row === 'object' ? clean(row) : row)) : v
  }
  return out
}

/** Call an ERPNext mapper and return a clean, unsaved doc ready for the form. */
export async function makeDoc(call, method, args) {
  const res = await call.post(method, args)
  const doc = res?.message
  if (!doc || typeof doc !== 'object') throw new Error('ERPNext returned no document')
  return { ...clean(doc), doctype: doc.doctype }
}

const submitted = (doc) => Number(doc.docstatus) === 1
const open = (doc) => !['Closed', 'On Hold', 'Completed', 'Cancelled', 'Stopped'].includes(doc.status)
const pct = (v) => Number(v) || 0
const mapper = (label, method, target, when) => ({ label, method, args: (doc) => ({ source_name: doc.name }), target, when })

/** ERPNext "Create" mappers (same as Desk's Create menu). */
export const MAKE = {
  // Selling
  quotationToOrder: mapper('Sales Order', 'erpnext.selling.doctype.quotation.quotation.make_sales_order', 'sales-orders',
    (d) => submitted(d) && !['Ordered', 'Lost', 'Expired', 'Cancelled'].includes(d.status)),
  orderToDelivery: mapper('Delivery Note', 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note', 'delivery-notes',
    (d) => submitted(d) && open(d) && pct(d.per_delivered) < 100),
  orderToInvoice: mapper('Sales Invoice', 'erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice', 'sales-invoices',
    (d) => submitted(d) && open(d) && pct(d.per_billed) < 100),
  deliveryToInvoice: mapper('Sales Invoice', 'erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice', 'sales-invoices',
    (d) => submitted(d) && !Number(d.is_return) && pct(d.per_billed) < 100 && d.status !== 'Closed'),
  // Buying
  requestToOrder: mapper('Purchase Order', 'erpnext.stock.doctype.material_request.material_request.make_purchase_order', 'purchase-orders',
    (d) => submitted(d) && d.material_request_type === 'Purchase' && open(d) && pct(d.per_ordered) < 100),
  requestToRfq: mapper('Request for Quotation', 'erpnext.stock.doctype.material_request.material_request.make_request_for_quotation', 'request-for-quotations',
    (d) => submitted(d) && d.material_request_type === 'Purchase' && open(d) && pct(d.per_ordered) < 100),
  quotationToPurchaseOrder: mapper('Purchase Order', 'erpnext.buying.doctype.supplier_quotation.supplier_quotation.make_purchase_order', 'purchase-orders',
    (d) => submitted(d) && !['Ordered', 'Expired', 'Stopped', 'Cancelled'].includes(d.status)),
  orderToReceipt: mapper('Purchase Receipt', 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt', 'purchase-receipts',
    (d) => submitted(d) && open(d) && pct(d.per_received) < 100),
  orderToBill: mapper('Purchase Invoice', 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice', 'purchase-invoices',
    (d) => submitted(d) && open(d) && pct(d.per_billed) < 100),
  receiptToBill: mapper('Purchase Invoice', 'erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice', 'purchase-invoices',
    (d) => submitted(d) && !Number(d.is_return) && pct(d.per_billed) < 100 && d.status !== 'Closed'),
  // Manufacturing
  bomToWorkOrder: {
    label: 'Work Order', method: 'erpnext.manufacturing.doctype.work_order.work_order.make_work_order',
    args: (doc) => ({ bom_no: doc.name, item: doc.item, qty: doc.quantity, company: doc.company }), target: 'work-orders',
    when: (d) => submitted(d) && Number(d.is_active) === 1,
  },
  workOrderTransfer: {
    label: 'Transfer materials', method: 'erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry',
    args: (doc) => ({ work_order_id: doc.name, purpose: 'Material Transfer for Manufacture', qty: Math.max(0, (Number(doc.qty) || 0) - (Number(doc.material_transferred_for_manufacturing) || 0)) }), target: 'stock-entries',
    when: (d) => submitted(d) && !Number(d.skip_transfer) && ['Not Started', 'In Process', 'Stock Reserved', 'Stock Partially Reserved'].includes(d.status)
      && (Number(d.material_transferred_for_manufacturing) || 0) < (Number(d.qty) || 0),
  },
  workOrderFinish: {
    label: 'Finish (make goods)', method: 'erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry',
    args: (doc) => ({ work_order_id: doc.name, purpose: 'Manufacture', qty: Math.max(0, (Number(doc.qty) || 0) - (Number(doc.produced_qty) || 0)) }), target: 'stock-entries',
    when: (d) => submitted(d) && ['Not Started', 'In Process', 'Stock Reserved', 'Stock Partially Reserved'].includes(d.status)
      && (Number(d.produced_qty) || 0) < (Number(d.qty) || 0) && (Number(d.skip_transfer) || (Number(d.material_transferred_for_manufacturing) || 0) > 0),
  },
  jobCardTransfer: {
    label: 'Transfer materials', method: 'erpnext.manufacturing.doctype.job_card.job_card.make_stock_entry',
    args: (doc) => ({ source_name: doc.name }), target: 'stock-entries',
    when: (d) => Number(d.docstatus) === 0 && (d.items?.length ?? 0) > 0 && !Number(d.skip_material_transfer) && (Number(d.transferred_qty) || 0) < (Number(d.for_quantity) || 0),
  },
  // Subcontracting: a purchase order for the service, raw materials sent to the supplier, finished goods received back
  orderToSubcontracting: {
    label: 'Subcontracting Order', method: 'erpnext.buying.doctype.purchase_order.purchase_order.make_subcontracting_order',
    args: (doc) => ({ source_name: doc.name }), target: 'subcontracting-orders',
    when: (d) => submitted(d) && Number(d.is_subcontracted) === 1 && open(d) && pct(d.per_received) < 100,
  },
  subcontractingSendMaterials: {
    label: 'Send materials to supplier', method: 'erpnext.controllers.subcontracting_controller.make_rm_stock_entry',
    args: (doc) => ({ subcontract_order: doc.name, order_doctype: 'Subcontracting Order' }), target: 'stock-entries',
    when: (d) => submitted(d) && ['Open', 'Partially Received'].includes(d.status) && (d.supplied_items?.length ?? 0) > 0,
  },
  subcontractingReceive: {
    label: 'Receive finished goods', method: 'erpnext.subcontracting.doctype.subcontracting_order.subcontracting_order.make_subcontracting_receipt',
    args: (doc) => ({ source_name: doc.name }), target: 'subcontracting-receipts',
    when: (d) => submitted(d) && ['Open', 'Partially Received'].includes(d.status) && pct(d.per_received) < 100,
  },
  // Assets
  assetSale: {
    label: 'Sell', method: 'erpnext.assets.doctype.asset.asset.make_sales_invoice',
    args: (doc) => ({ asset: doc.name, item_code: doc.item_code, company: doc.company, sell_qty: 1 }), target: 'sales-invoices',
    when: (d) => submitted(d) && ['Submitted', 'Partially Depreciated', 'Fully Depreciated'].includes(d.status),
  },
  assetMove: {
    label: 'Move / hand over', method: 'erpnext.assets.doctype.asset.asset.make_asset_movement',
    args: (doc) => ({ assets: JSON.stringify([{ name: doc.name }]), purpose: 'Transfer' }), target: 'asset-movements',
    when: (d) => submitted(d) && !['Scrapped', 'Sold'].includes(d.status),
  },
  /** Advance payment against an order (until it's fully billed). */
  advance: (doctype) => ({
    label: 'Payment',
    method: 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
    args: (doc) => ({ dt: doctype, dn: doc.name }),
    target: 'payments',
    when: (d) => submitted(d) && open(d) && pct(d.per_billed) < 100 && pct(d.advance_paid) < pct(d.rounded_total || d.grand_total),
  }),

  payment: (doctype) => ({
    label: 'Record payment',
    method: 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
    args: (doc) => ({ dt: doctype, dn: doc.name }),
    target: 'payments',
    when: (doc) => Number(doc.docstatus) === 1 && Math.abs(Number(doc.outstanding_amount) || 0) > 0.005,
  }),
  creditNote: {
    label: 'Credit note',
    method: 'erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return',
    args: (doc) => ({ source_name: doc.name }),
    target: 'credit-notes',
    when: (doc) => Number(doc.docstatus) === 1 && !Number(doc.is_return),
  },
  debitNote: {
    label: 'Debit note',
    method: 'erpnext.accounts.doctype.purchase_invoice.purchase_invoice.make_debit_note',
    args: (doc) => ({ source_name: doc.name }),
    target: 'debit-notes',
    when: (doc) => Number(doc.docstatus) === 1 && !Number(doc.is_return),
  },
}
