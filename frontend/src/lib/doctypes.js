/**
 * Screen configuration for every ERPNext doctype the UI shows.
 * Labels / field types / options come from ERPNext meta, so configs only list WHICH fields to show.
 *
 * list:     columns in the list view
 * tabs:     status tabs (each has its own filters + count)
 * search:   fields searched by the list search box
 * sections: form layout (fields that don't exist in your ERPNext version are skipped)
 * items:    editable child table (transactions)
 * pricing:  context for erpnext get_item_details (rates, UOM, warehouse)
 * taxes:    template field -> tax rows are loaded when the template changes
 */

import { MAKE } from './mappers.js'
import { Banknote as BanknoteIcon, Calculator, Check, Scale, ListPlus, FileCheck2, FileDown, Flag, KeyRound, PlayCircle, Sparkles, Users as UsersIcon, X as XIcon } from 'lucide-react'
import PaymentReferencesToolbar from '../components/accounts/PaymentReferencesToolbar.jsx'
import { fifoReferences } from './fifo.js'
import WeeklyOffToolbar from '../components/hr/WeeklyOffToolbar.jsx'
import StockReconToolbar from '../components/stock/StockReconToolbar.jsx'
import { confirm, promptText } from './dialogs.js'

const today = () => new Date().toLocaleDateString('en-CA')

const docstatusTabs = [
  { label: 'All', filters: [] },
  { label: 'Draft', filters: [['docstatus', '=', 0]] },
  { label: 'Submitted', filters: [['docstatus', '=', 1]] },
  { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
]
const statusTabs = (...statuses) => [
  { label: 'All', filters: [] },
  ...statuses.map((s) => ({ label: s, filters: [['status', '=', s]] })),
]
const activeTabs = [
  { label: 'All', filters: [] },
  { label: 'Active', filters: [['disabled', '=', 0]] },
  { label: 'Disabled', filters: [['disabled', '=', 1]] },
]

const companyDefaults = (boot) => ({ company: boot.company, currency: boot.currency, conversion_rate: 1 })
const warehouseFilter = (doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) })

const sellingTotals = ['total', 'total_taxes_and_charges', 'discount_amount', 'grand_total', 'rounded_total']

export const DOCTYPES = {
  /* ---------------- Masters ---------------- */
  customers: {
    doctype: 'Customer', title: 'Customers', single: 'Customer', titleField: 'customer_name', statusFromDisabled: true, partyAccount: true,
    list: ['customer_name', 'customer_group', 'territory', 'mobile_no', { field: 'disabled', type: 'Active' }],
    columns: ['customer_name', 'customer_type', 'customer_group', 'territory', 'mobile_no', 'email_id', 'default_price_list', 'default_currency', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'customer_name', 'mobile_no'],
    sections: [
      { tab: 'General Details', title: 'Customer', fields: ['customer_name', 'customer_type', 'customer_group', 'territory'] },
      { tab: 'General Details', title: 'Tax & payment', fields: [{ field: 'tax_id', label: 'TRN / VAT number' }, 'default_currency', { field: 'default_price_list', filters: { selling: 1, enabled: 1 } }, 'payment_terms', 'disabled'] },
      ...partyContactAddress(),
    ],
    address: { primaryField: 'customer_primary_address' },
    // Every new customer starts on the standard selling price list; change it for wholesale / special customers.
    defaults: (boot) => ({ customer_type: 'Company', default_price_list: boot.selling_price_list || undefined }),
  },
  suppliers: {
    doctype: 'Supplier', title: 'Suppliers', single: 'Supplier', titleField: 'supplier_name', statusFromDisabled: true, partyAccount: true,
    list: ['supplier_name', 'supplier_group', 'country', { field: 'disabled', type: 'Active' }],
    columns: ['supplier_name', 'supplier_type', 'supplier_group', 'country', 'mobile_no', 'email_id', 'default_currency', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'supplier_name'],
    sections: [
      { tab: 'General Details', title: 'Supplier', fields: ['supplier_name', 'supplier_type', 'supplier_group'] },
      { tab: 'General Details', title: 'Tax & payment', fields: [{ field: 'tax_id', label: 'TRN / VAT number' }, 'default_currency', 'payment_terms', 'disabled'] },
      ...partyContactAddress(),
    ],
    address: { primaryField: 'supplier_primary_address' },
    defaults: () => ({ supplier_type: 'Company' }),
  },
  items: {
    doctype: 'Item', title: 'Items', single: 'Item', titleField: 'item_name', statusFromDisabled: true,
    list: ['item_code', 'item_name', 'item_group', 'stock_uom', { field: 'is_stock_item', label: 'Stock item' }, { field: 'disabled', type: 'Active' }],
    columns: ['item_code', 'item_name', 'item_group', 'stock_uom', 'is_stock_item', 'brand', 'disabled'], // the item's own valuation rate is only an opening figure, so it is not a default column; up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'item_name', 'item_group'],
    sections: [
      // One default tax per item (stored as the item's first row in its Taxes table); invoices pick it up when the item is added.
      { title: 'Item', fields: ['item_code', 'item_name', 'item_group', 'stock_uom', { field: 'image', label: 'Picture (shown on POS cards)' }, { field: 'item_tax_template', child: 'taxes', type: 'Link', options: 'Item Tax Template', label: 'Tax template', filters: { disabled: 0 } }, 'description'] },
      { title: 'Settings', fields: ['is_stock_item', 'is_sales_item', 'is_purchase_item', { field: 'is_sub_contracted_item', label: 'Made by a subcontractor' }, { field: 'standard_rate', onlyNew: true }, { field: 'valuation_rate', label: 'Opening valuation rate (used only until there is stock)' }, 'disabled'] },
      { title: 'Fixed asset', collapsed: true, fields: ['is_fixed_asset', { field: 'asset_category', when: (d) => Number(d.is_fixed_asset) }, { field: 'auto_create_assets', when: (d) => Number(d.is_fixed_asset) }] },
    ],
    // A fixed asset is never a stock item.
    onChange: (field, value) => (field === 'is_fixed_asset' && Number(value) ? { is_stock_item: 0 } : null),
    defaults: () => ({ is_stock_item: 1, is_sales_item: 1, is_purchase_item: 1, stock_uom: 'Nos' }),
  },
  warehouses: {
    doctype: 'Warehouse', title: 'Warehouses', single: 'Warehouse', titleField: 'warehouse_name', statusFromDisabled: true,
    list: ['warehouse_name', 'parent_warehouse', 'company', { field: 'is_group', label: 'Group' }, { field: 'disabled', type: 'Active' }],
    columns: ['warehouse_name', 'warehouse_type', 'parent_warehouse', 'company', 'is_group', 'account', 'city', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'warehouse_name'],
    sections: [
      { title: 'Warehouse', fields: ['warehouse_name', 'company', { field: 'parent_warehouse', filters: (d) => ({ is_group: 1, ...(d.company ? { company: d.company } : {}) }) }, 'warehouse_type', 'is_group', 'disabled'] },
    ],
    defaults: (boot) => ({ company: boot.company }),
  },

  /* ---------------- Pricing ---------------- */
  'price-lists': {
    doctype: 'Price List', title: 'Price Lists', single: 'Price List', titleField: 'price_list_name',
    list: ['price_list_name', 'currency', { field: 'selling', label: 'Selling' }, { field: 'buying', label: 'Buying' }, { field: 'enabled', label: 'Enabled' }],
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Selling', filters: [['selling', '=', 1]] },
      { label: 'Buying', filters: [['buying', '=', 1]] },
      { label: 'Disabled', filters: [['enabled', '=', 0]] },
    ],
    search: ['name', 'price_list_name'],
    sections: [{ title: 'Price list', fields: ['price_list_name', 'currency', 'selling', 'buying', 'price_not_uom_dependent', 'enabled'] }],
    defaults: (boot) => ({ currency: boot.currency, selling: 1, enabled: 1 }),
  },
  'item-prices': {
    doctype: 'Item Price', title: 'Item Prices', single: 'Item Price', titleField: 'item_code',
    list: ['item_code', 'item_name', 'price_list', 'price_list_rate', 'uom', 'valid_from'],
    columns: ['item_code', 'item_name', 'price_list', 'price_list_rate', 'currency', 'uom', 'customer', 'valid_from'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Selling', filters: [['selling', '=', 1]] },
      { label: 'Buying', filters: [['buying', '=', 1]] },
    ],
    search: ['item_code', 'item_name', 'price_list'],
    sort: 'item_code asc',
    sections: [
      { title: 'Price', fields: ['item_code', { field: 'item_name', readOnly: true }, 'price_list', 'price_list_rate', 'uom', { field: 'currency', readOnly: true }] },
      { title: 'Only for', fields: ['customer', 'supplier', 'batch_no', 'valid_from', 'valid_upto', 'lead_time_days', 'note'], collapsed: true },
    ],
    defaults: (boot) => ({ price_list: boot.selling_price_list, valid_from: today() }),
  },
  'pricing-rules': {
    doctype: 'Pricing Rule', title: 'Pricing Rules', single: 'Pricing Rule', titleField: 'title', statusFromDisabled: true,
    list: ['title', 'apply_on', 'rate_or_discount', 'discount_percentage', 'min_qty', 'valid_upto', { field: 'disable', type: 'Active' }],
    columns: ['title', 'apply_on', 'applicable_for', 'rate_or_discount', 'discount_percentage', 'rate', 'min_qty', 'valid_upto'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Selling', filters: [['selling', '=', 1]] },
      { label: 'Buying', filters: [['buying', '=', 1]] },
      { label: 'Disabled', filters: [['disable', '=', 1]] },
    ],
    search: ['name', 'title'],
    sort: 'priority desc',
    sections: [
      { title: 'Rule', fields: ['title', 'apply_on', 'selling', 'buying', 'company', 'priority', 'disable'] },
      { title: 'Who gets it', fields: ['applicable_for', { field: 'customer', when: (d) => d.applicable_for === 'Customer' }, { field: 'customer_group', when: (d) => d.applicable_for === 'Customer Group' }, { field: 'territory', when: (d) => d.applicable_for === 'Territory' }, { field: 'supplier', when: (d) => d.applicable_for === 'Supplier' }, { field: 'supplier_group', when: (d) => d.applicable_for === 'Supplier Group' }] },
      { title: 'When', fields: ['min_qty', 'max_qty', 'min_amt', 'max_amt', 'valid_from', 'valid_upto'] },
      { title: 'Price / discount', fields: ['rate_or_discount', { field: 'rate', when: (d) => d.rate_or_discount === 'Rate' }, { field: 'discount_percentage', when: (d) => d.rate_or_discount === 'Discount Percentage' }, { field: 'discount_amount', when: (d) => d.rate_or_discount === 'Discount Amount' }, 'currency'] },
    ],
    tables: [
      { field: 'items', title: 'Items', when: (d) => d.apply_on === 'Item Code', columns: [{ field: 'item_code', reqd: true }, 'uom'], newRow: () => ({}) },
      { field: 'item_groups', title: 'Item groups', when: (d) => d.apply_on === 'Item Group', columns: [{ field: 'item_group', reqd: true }], newRow: () => ({}) },
      { field: 'brands', title: 'Brands', when: (d) => d.apply_on === 'Brand', columns: [{ field: 'brand', reqd: true }], newRow: () => ({}) },
    ],
    defaults: (boot) => ({ apply_on: 'Item Code', price_or_product_discount: 'Price', selling: 1, rate_or_discount: 'Discount Percentage', company: boot.company, currency: boot.currency, valid_from: today(), items: [{}] }),
  },

  /* ---------------- Stock (more) ---------------- */
  // Recipe / formula: what goes into making one finished item. ERPNext fills each row's unit and rate and the costs on save.
  'bill-of-materials': {
    doctype: 'BOM', title: 'Bills of Materials', single: 'Bill of Materials', titleField: 'item_name',
    list: ['name', 'item', 'quantity', 'uom', 'total_cost', { field: 'is_default', label: 'Default' }, { field: 'is_active', label: 'Active' }, { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['name', 'item', 'item_name', 'quantity', 'uom', 'raw_material_cost', 'total_cost', 'is_default', 'is_active', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Draft', filters: [['docstatus', '=', 0]] },
      { label: 'Active', filters: [['docstatus', '=', 1], ['is_active', '=', 1]] },
      { label: 'Inactive', filters: [['docstatus', '=', 1], ['is_active', '=', 0]] },
      { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
    ],
    search: ['name', 'item', 'item_name'],
    sections: [
      { title: 'Finished item', fields: ['item', 'quantity', { field: 'uom', readOnly: true }, 'company', 'is_active', 'is_default', 'with_operations', { field: 'transfer_material_against', label: 'Send materials against', when: (d) => Number(d.with_operations) }] },
      { title: 'Costing', fields: ['currency', 'rm_cost_as_per', { field: 'buying_price_list', when: (d) => d.rm_cost_as_per === 'Price List' }, { field: 'raw_material_cost', readOnly: true }, { field: 'operating_cost', readOnly: true }, { field: 'total_cost', readOnly: true }] },
    ],
    tables: [
      {
        field: 'items', title: 'Raw materials — what goes into the quantity above',
        columns: [{ field: 'item_code', reqd: true }, { field: 'qty', reqd: true }, { field: 'uom', reqd: false }, { field: 'rate', reqd: false }, { field: 'amount', readOnly: true }],
        sum: ['amount'], startRows: 1, newRow: () => ({ qty: 1 }),
        empty: 'Add every item used. The unit and rate are filled when you save (from the cost basis above).',
      },
      {
        field: 'operations', title: 'Operations', when: (d) => Number(d.with_operations),
        columns: [{ field: 'operation', reqd: true }, 'workstation', 'time_in_mins', { field: 'operating_cost', readOnly: true }],
        sum: ['operating_cost'], newRow: () => ({}),
      },
    ],
    make: [MAKE.bomToWorkOrder],
    validate: (d) => ((d.items ?? []).some((r) => r.item_code) ? ((d.items ?? []).some((r) => r.item_code === d.item) ? 'The finished item cannot also be one of its own raw materials.' : null) : 'Add at least one raw material.'),
    defaults: (boot) => ({ company: boot.company, currency: boot.currency, quantity: 1, is_active: 1, is_default: 1, rm_cost_as_per: 'Valuation Rate' }),
  },
  // Production: make N of an item from its BOM. Transfer the materials to work in progress, then finish to book the goods into stock.
  'work-orders': {
    doctype: 'Work Order', title: 'Work Orders', single: 'Work Order', titleField: 'item_name',
    list: ['name', 'production_item', 'qty', 'produced_qty', 'planned_start_date', { field: 'status', type: 'Status' }],
    columns: ['name', 'production_item', 'item_name', 'qty', 'material_transferred_for_manufacturing', 'produced_qty', 'planned_start_date', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Draft', filters: [['docstatus', '=', 0]] },
      { label: 'Not Started', filters: [['status', '=', 'Not Started']] },
      { label: 'In Process', filters: [['status', '=', 'In Process']] },
      { label: 'Completed', filters: [['status', '=', 'Completed']] },
      { label: 'Stopped', filters: [['status', 'in', ['Stopped', 'Closed']]] },
    ],
    search: ['name', 'production_item', 'item_name'],
    sort: 'creation desc',
    sections: [
      { title: 'What to make', fields: ['production_item', { field: 'bom_no', filters: (d) => ({ item: d.production_item, docstatus: 1, is_active: 1 }) }, 'qty', 'company', 'planned_start_date', 'expected_delivery_date', { field: 'transfer_material_against', label: 'Send materials against', when: (d) => (d.operations?.length ?? 0) > 0 }] },
      { title: 'Warehouses', fields: [{ field: 'source_warehouse', filters: warehouseFilter }, { field: 'wip_warehouse', filters: warehouseFilter }, { field: 'fg_warehouse', filters: warehouseFilter }, 'skip_transfer'] },
      { title: 'Progress', when: (d) => Number(d.docstatus) > 0, fields: [{ field: 'material_transferred_for_manufacturing', readOnly: true }, { field: 'produced_qty', readOnly: true }, { field: 'status', readOnly: true }, { field: 'actual_start_date', readOnly: true }, { field: 'actual_end_date', readOnly: true }] },
    ],
    tables: [
      {
        field: 'required_items', title: 'Raw materials needed',
        columns: [{ field: 'item_code', reqd: true }, 'source_warehouse', { field: 'required_qty', reqd: true }, { field: 'available_qty_at_source_warehouse', label: 'In stock', readOnly: true }, { field: 'transferred_qty', label: 'Transferred', readOnly: true }, { field: 'consumed_qty', label: 'Used', readOnly: true }],
        newRow: () => ({}), empty: 'Pick the item and BOM above: the raw materials load by themselves.',
      },
      {
        field: 'operations', title: 'Operations', when: (d) => (d.operations?.length ?? 0) > 0,
        columns: [{ field: 'operation', readOnly: true }, { field: 'workstation', readOnly: true }, { field: 'time_in_mins', label: 'Minutes', readOnly: true }, { field: 'completed_qty', label: 'Done', readOnly: true }, { field: 'status', readOnly: true }],
        addRows: false,
      },
    ],
    // Choosing the item brings its default BOM; the item, BOM or quantity brings the raw materials of the whole run.
    onChange: async (field, value, doc, { call }) => {
      const patch = {}
      let item = doc.production_item
      let bom = doc.bom_no
      if (field === 'production_item') {
        if (!value) return { bom_no: null, required_items: [] }
        item = value
        try {
          const r = await call.get('erpnext.manufacturing.doctype.work_order.work_order.get_item_details', { item: value })
          const m = r?.message ?? {}
          bom = m.bom_no || null
          Object.assign(patch, { bom_no: bom, stock_uom: m.stock_uom, description: m.description })
        } catch { /* the form shows what is missing on save */ }
      } else if (!['bom_no', 'qty'].includes(field)) return null
      else if (field === 'bom_no') bom = value
      const qty = field === 'qty' ? value : doc.qty
      if (!item || !bom || !(Number(qty) > 0)) return Object.keys(patch).length ? patch : null
      try {
        const r = await call.post('erpnext.manufacturing.doctype.work_order.work_order.make_work_order', { bom_no: bom, item, qty, company: doc.company })
        const wo = r?.message ?? {}
        patch.required_items = (wo.required_items ?? []).map((x) => ({ item_code: x.item_code, item_name: x.item_name, source_warehouse: x.source_warehouse, required_qty: x.required_qty, stock_uom: x.stock_uom, operation: x.operation, include_item_in_manufacturing: x.include_item_in_manufacturing, allow_alternative_item: x.allow_alternative_item }))
        // The BOM's operations come with it (workstation, minutes, order), stripped of the row identity of the preview.
        patch.operations = (wo.operations ?? []).map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !['name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus', 'parent', 'parentfield', 'parenttype'].includes(k) && !k.startsWith('__'))))
        // The company's default warehouses for production (set on the company), unless the person already chose.
        try {
          const dw = (await call.get('erpnext.manufacturing.doctype.work_order.work_order.get_default_warehouse', { company: doc.company }))?.message ?? {}
          if (dw.wip_warehouse && !doc.wip_warehouse && !Number(doc.skip_transfer)) patch.wip_warehouse = dw.wip_warehouse
          if (dw.fg_warehouse && !doc.fg_warehouse) patch.fg_warehouse = dw.fg_warehouse
        } catch { /* fall back to what the BOM brought */ }
        if (wo.fg_warehouse && !doc.fg_warehouse && !patch.fg_warehouse) patch.fg_warehouse = wo.fg_warehouse
        if (wo.wip_warehouse && !doc.wip_warehouse && !patch.wip_warehouse) patch.wip_warehouse = wo.wip_warehouse
        if (!patch.wip_warehouse && !doc.wip_warehouse && !Number(doc.skip_transfer)) {
          // The company has no default work-in-progress warehouse set: use its "Work In Progress" warehouse, if there is one.
          const w = await call.get('frappe.client.get_value', { doctype: 'Warehouse', filters: JSON.stringify({ company: doc.company, name: ['like', 'Work In Progress%'], is_group: 0 }), fieldname: 'name' })
          if (w?.message?.name) patch.wip_warehouse = w.message.name
        }
      } catch { /* keep what the person typed */ }
      return patch
    },
    make: [MAKE.workOrderTransfer, MAKE.workOrderFinish],
    docActions: [
      {
        // ERPNext makes one job card per operation when the work order is submitted; this just opens them.
        label: 'Job cards', icon: ListPlus,
        when: (doc) => Number(doc.docstatus) === 1 && (doc.operations?.length ?? 0) > 0,
        run: async ({ doc, navigate }) => navigate('/job-cards?q=' + encodeURIComponent(doc.name)),
      },
      {
        label: 'Stop', icon: XIcon, success: 'Work order stopped', tone: 'danger',
        when: (doc) => Number(doc.docstatus) === 1 && ['Not Started', 'In Process', 'Stock Reserved', 'Stock Partially Reserved'].includes(doc.status),
        run: async ({ doc, call, mutate }) => { await call.post('erpnext.manufacturing.doctype.work_order.work_order.stop_unstop', { work_order: doc.name, status: 'Stopped' }); await mutate() },
      },
      {
        label: 'Resume', icon: PlayCircle, success: 'Work order resumed',
        when: (doc) => Number(doc.docstatus) === 1 && doc.status === 'Stopped',
        run: async ({ doc, call, mutate }) => { await call.post('erpnext.manufacturing.doctype.work_order.work_order.stop_unstop', { work_order: doc.name, status: 'Resumed' }); await mutate() },
      },
    ],
    validate: (d) => (!(Number(d.qty) > 0) ? 'Enter the quantity to make.' : (d.required_items ?? []).some((r) => r.item_code) ? null : 'Pick the item and its BOM so the raw materials load.'),
    defaults: (boot) => ({ company: boot.company, qty: 1, planned_start_date: new Date().toLocaleString('sv-SE').replace('T', ' ') }),
  },
  'job-cards': {
    doctype: 'Job Card', title: 'Job Cards', single: 'Job Card', titleField: 'operation',
    list: ['name', 'work_order', 'production_item', 'operation', 'workstation', 'for_quantity', 'total_completed_qty', { field: 'status', type: 'Status' }],
    columns: ['name', 'work_order', 'production_item', 'operation', 'workstation', 'for_quantity', 'total_completed_qty', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Open', filters: [['status', '=', 'Open']] },
      { label: 'In progress', filters: [['status', 'in', ['Work In Progress', 'Material Transferred']]] },
      { label: 'On hold', filters: [['status', '=', 'On Hold']] },
      { label: 'Completed', filters: [['status', '=', 'Completed']] },
    ],
    search: ['name', 'work_order', 'production_item', 'operation'],
    sort: 'creation desc',
    sections: [
      { title: 'Job', fields: [{ field: 'work_order', reqd: true }, { field: 'operation', reqd: true }, { field: 'workstation', reqd: true }, 'company', 'posting_date', 'for_quantity', 'wip_warehouse'] },
      { title: 'Result', fields: [{ field: 'total_completed_qty', readOnly: true }, { field: 'total_time_in_mins', readOnly: true }, { field: 'status', readOnly: true }, 'remarks'] },
    ],
    tables: [
      {
        field: 'time_logs', title: 'Time spent — one row each time work is done',
        columns: [{ field: 'from_time', reqd: true }, 'to_time', 'completed_qty', { field: 'time_in_mins', label: 'Minutes', readOnly: true }],
        newRow: () => ({ from_time: new Date().toLocaleString('sv-SE') }), empty: 'Add a row when work starts; fill the end time and the quantity done. Submit when the full quantity is done.',
      },
      {
        field: 'items', title: 'Raw materials for this operation', when: (d) => (d.items?.length ?? 0) > 0,
        columns: [{ field: 'item_code', readOnly: true }, 'source_warehouse', { field: 'required_qty', readOnly: true }, { field: 'transferred_qty', label: 'Sent', readOnly: true }, { field: 'consumed_qty', label: 'Used', readOnly: true }],
        addRows: false,
      },
    ],
    make: [MAKE.jobCardTransfer],
    defaults: (boot) => ({ company: boot.company, posting_date: today() }),
  },
  operations: {
    doctype: 'Operation', title: 'Operations', single: 'Operation', titleField: 'name',
    list: ['name', 'workstation', 'description'],
    search: ['name', 'workstation'],
    sort: 'name asc',
    sections: [{ title: 'Operation', fields: [{ field: '__newname', type: 'Data', label: 'Operation name', reqd: true, onlyNew: true, placeholder: 'e.g. Cutting, Mixing, Packing', when: (d) => !d.creation }, 'workstation', 'description'] }],
    tabs: [{ label: 'All', filters: [] }],
  },
  workstations: {
    doctype: 'Workstation', title: 'Workstations', single: 'Workstation', titleField: 'workstation_name', statusFromDisabled: true,
    list: ['workstation_name', 'hour_rate', 'production_capacity', 'warehouse', { field: 'disabled', type: 'Active' }],
    tabs: activeTabs,
    search: ['name', 'workstation_name'],
    sections: [{ title: 'Workstation', fields: ['workstation_name', 'production_capacity', { field: 'hour_rate', label: 'Cost per hour' }, 'warehouse', 'description', 'disabled'] }],
    defaults: () => ({ production_capacity: 1 }),
  },
  // Plan several work orders (and the raw material requests behind them) at once, from sales orders or material requests.
  'production-plans': {
    doctype: 'Production Plan', title: 'Production Plans', single: 'Production Plan', titleField: 'name',
    list: ['name', 'posting_date', 'total_planned_qty', 'total_produced_qty', { field: 'status', type: 'Status' }],
    columns: ['name', 'posting_date', 'company', 'total_planned_qty', 'total_produced_qty', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Draft', filters: [['docstatus', '=', 0]] },
      { label: 'Not Started', filters: [['status', '=', 'Not Started']] },
      { label: 'In Process', filters: [['status', '=', 'In Process']] },
      { label: 'Completed', filters: [['status', '=', 'Completed']] },
    ],
    search: ['name'],
    sort: 'creation desc',
    sections: [
      { title: 'Plan', fields: ['company', 'posting_date', 'get_items_from', { field: 'customer', when: (d) => d.get_items_from === 'Sales Order' }, 'item_code', 'from_date', 'to_date', 'warehouse'] },
      { title: 'Options', collapsed: true, fields: ['for_warehouse', 'include_non_stock_items', 'include_subcontracted_items', 'ignore_existing_ordered_qty', 'combine_items'] },
    ],
    tables: [
      { field: 'sales_orders', title: 'Sales orders to plan for', when: (d) => d.get_items_from === 'Sales Order', columns: [{ field: 'sales_order', reqd: true }, { field: 'sales_order_date', readOnly: true }, { field: 'customer', readOnly: true }, { field: 'grand_total', readOnly: true }], newRow: () => ({}), empty: 'Set the filters above, save the plan, then use “Get sales orders” — or add them by hand.' },
      { field: 'material_requests', title: 'Material requests to plan for', when: (d) => d.get_items_from === 'Material Request', columns: [{ field: 'material_request', reqd: true }, { field: 'material_request_date', readOnly: true }], newRow: () => ({}), empty: 'Save the plan, then use “Get material requests” — or add them by hand.' },
      {
        field: 'po_items', title: 'Items to make',
        columns: [{ field: 'item_code', reqd: true }, { field: 'bom_no', reqd: true, filters: (row) => ({ item: row.item_code, docstatus: 1, is_active: 1 }) }, { field: 'planned_qty', reqd: true }, { field: 'planned_start_date', reqd: true }, 'warehouse', { field: 'ordered_qty', label: 'Ordered', readOnly: true }, { field: 'produced_qty', label: 'Made', readOnly: true }],
        newRow: () => ({ planned_qty: 1, planned_start_date: new Date().toLocaleString('sv-SE') }), empty: 'Save the plan, then use “Get items to make” — or add an item with its BOM.',
      },
      {
        field: 'mr_items', title: 'Raw materials to request', when: (d) => (d.mr_items?.length ?? 0) > 0,
        columns: [{ field: 'item_code', readOnly: true }, 'warehouse', { field: 'material_request_type', label: 'Request type' }, { field: 'quantity', label: 'Qty to request' }, { field: 'actual_qty', label: 'In stock', readOnly: true }, 'schedule_date'],
        addRows: false,
      },
    ],
    docActions: [
      { label: 'Get sales orders', icon: ListPlus, success: 'Sales orders loaded', when: (doc) => Number(doc.docstatus) === 0 && doc.get_items_from === 'Sales Order', run: planStep('get_open_sales_orders') },
      { label: 'Get material requests', icon: ListPlus, success: 'Material requests loaded', when: (doc) => Number(doc.docstatus) === 0 && doc.get_items_from === 'Material Request', run: planStep('get_pending_material_requests') },
      { label: 'Get items to make', icon: ListPlus, success: 'Items loaded', when: (doc) => Number(doc.docstatus) === 0 && Boolean(doc.get_items_from), run: planStep('get_items') },
      {
        label: 'Get raw materials', icon: ListPlus, success: 'Raw materials worked out',
        when: (doc) => Number(doc.docstatus) === 0 && (doc.po_items?.length ?? 0) > 0,
        run: async ({ doc, call, mutate }) => {
          const r = await call.post('erpnext.manufacturing.doctype.production_plan.production_plan.get_items_for_material_requests', { doc: JSON.stringify(doc), warehouses: JSON.stringify([]) })
          const rows = (r?.message ?? []).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'name')))
          await call.post('frappe.client.save', { doc: JSON.stringify({ ...doc, doctype: 'Production Plan', mr_items: rows }) })
          await mutate()
        },
      },
      {
        label: 'Make work orders', icon: PlayCircle, success: 'Work orders created',
        when: (doc) => Number(doc.docstatus) === 1 && (doc.po_items ?? []).some((i) => (Number(i.planned_qty) || 0) > (Number(i.ordered_qty) || 0)),
        run: async ({ doc, call, mutate, navigate }) => { await call.post('run_doc_method', { dt: 'Production Plan', dn: doc.name, method: 'make_work_order' }); await mutate(); navigate('/work-orders') },
      },
      {
        label: 'Make material requests', icon: ListPlus, success: 'Material requests created',
        when: (doc) => Number(doc.docstatus) === 1 && (doc.mr_items?.length ?? 0) > 0,
        run: async ({ doc, call, mutate, navigate }) => { await call.post('run_doc_method', { dt: 'Production Plan', dn: doc.name, method: 'make_material_request' }); await mutate(); navigate('/material-requests') },
      },
    ],
    defaults: (boot) => ({ company: boot.company, posting_date: today(), get_items_from: 'Sales Order' }),
  },
  'subcontracting-boms': {
    doctype: 'Subcontracting BOM', title: 'Subcontracting BOMs', single: 'Subcontracting BOM', titleField: 'finished_good',
    list: ['name', 'finished_good', 'finished_good_qty', 'service_item', 'service_item_qty', { field: 'is_active', label: 'Active' }],
    search: ['name', 'finished_good', 'service_item'],
    tabs: [{ label: 'All', filters: [] }, { label: 'Active', filters: [['is_active', '=', 1]] }, { label: 'Inactive', filters: [['is_active', '=', 0]] }],
    sections: [
      { title: 'Finished good', fields: [{ field: 'finished_good', reqd: true }, { field: 'finished_good_qty', reqd: true }, { field: 'finished_good_bom', reqd: true, filters: (d) => ({ item: d.finished_good, docstatus: 1, is_active: 1 }) }] },
      { title: 'Service the supplier does', fields: [{ field: 'service_item', reqd: true, filters: { is_stock_item: 0 } }, { field: 'service_item_qty', reqd: true }, { field: 'service_item_uom', reqd: true }, 'is_active'] },
    ],
    defaults: () => ({ is_active: 1, finished_good_qty: 1, service_item_qty: 1 }),
  },
  'subcontracting-orders': {
    doctype: 'Subcontracting Order', title: 'Subcontracting Orders', single: 'Subcontracting Order', titleField: 'supplier_name',
    list: ['name', 'supplier_name', 'purchase_order', 'transaction_date', 'total', { field: 'per_received', label: 'Received' }, { field: 'status', type: 'Status' }],
    columns: ['name', 'supplier_name', 'purchase_order', 'transaction_date', 'total', 'per_received', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Open', 'Partially Received', 'Completed', 'Cancelled'),
    search: ['name', 'supplier_name', 'purchase_order'],
    sort: 'creation desc',
    sections: [
      { title: 'Order', fields: [{ field: 'purchase_order', readOnly: true }, { field: 'supplier', readOnly: true }, 'transaction_date', 'company', { field: 'supplier_warehouse', reqd: true, filters: warehouseFilter }, { field: 'set_warehouse', label: 'Receive finished goods in', filters: warehouseFilter }] },
    ],
    tables: [
      { field: 'items', title: 'Finished goods to receive', columns: [{ field: 'item_code', readOnly: true }, { field: 'qty', readOnly: true }, { field: 'received_qty', label: 'Received', readOnly: true }, { field: 'bom', label: 'BOM' }, 'warehouse'], addRows: false },
      { field: 'service_items', title: 'Service', columns: [{ field: 'item_code', readOnly: true }, { field: 'qty', readOnly: true }, { field: 'rate', readOnly: true }, { field: 'amount', readOnly: true }, { field: 'fg_item', label: 'Makes', readOnly: true }], addRows: false },
      { field: 'supplied_items', title: 'Raw materials the supplier needs', when: (d) => (d.supplied_items?.length ?? 0) > 0, columns: [{ field: 'main_item_code', label: 'For', readOnly: true }, { field: 'rm_item_code', label: 'Raw material', readOnly: true }, { field: 'required_qty', readOnly: true }, { field: 'supplied_qty', label: 'Sent', readOnly: true }, { field: 'consumed_qty', label: 'Used', readOnly: true }], addRows: false },
    ],
    make: [MAKE.subcontractingSendMaterials, MAKE.subcontractingReceive],
    defaults: (boot) => ({ company: boot.company, transaction_date: today() }),
  },
  'subcontracting-receipts': {
    doctype: 'Subcontracting Receipt', title: 'Subcontracting Receipts', single: 'Subcontracting Receipt', titleField: 'supplier_name',
    list: ['name', 'supplier_name', 'posting_date', 'total_qty', 'total', { field: 'status', type: 'Status' }],
    columns: ['name', 'supplier_name', 'posting_date', 'set_warehouse', 'total_qty', 'total', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Completed', 'Return', 'Cancelled'),
    search: ['name', 'supplier_name'],
    sort: 'creation desc',
    sections: [
      { title: 'Receipt', fields: [{ field: 'supplier', readOnly: true }, 'posting_date', 'company', { field: 'set_warehouse', filters: warehouseFilter }, { field: 'supplier_warehouse', filters: warehouseFilter }, 'bill_no', 'bill_date', 'remarks'] },
    ],
    tables: [
      { field: 'items', title: 'Finished goods received', columns: [{ field: 'item_code', readOnly: true }, { field: 'qty', label: 'Received now' }, { field: 'rejected_qty', label: 'Rejected' }, { field: 'rate', readOnly: true }, { field: 'amount', readOnly: true }, 'warehouse'], addRows: false },
      { field: 'supplied_items', title: 'Raw materials used', when: (d) => (d.supplied_items?.length ?? 0) > 0, columns: [{ field: 'main_item_code', label: 'For', readOnly: true }, { field: 'rm_item_code', label: 'Raw material', readOnly: true }, { field: 'consumed_qty', readOnly: true }], addRows: false },
    ],
    defaults: (boot) => ({ company: boot.company, posting_date: today() }),
  },
  'stock-reconciliations': {
    doctype: 'Stock Reconciliation', title: 'Stock Reconciliations', single: 'Stock Reconciliation', titleField: 'name',
    list: ['name', 'purpose', 'posting_date', 'set_warehouse', 'cost_center', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['name', 'purpose', 'posting_date', 'set_warehouse', 'cost_center', 'difference_amount', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name'],
    sort: 'posting_date desc',
    sections: [
      { title: 'Count', fields: ['purpose', 'company', 'posting_date', 'posting_time', 'set_posting_time', 'set_warehouse', 'expense_account', { field: 'cost_center', reqd: true, filters: (d) => ({ is_group: 0, ...(d.company ? { company: d.company } : {}) }) }, { field: 'difference_amount', readOnly: true }] },
    ],
    tables: [
      {
        field: 'items', title: 'Items — counted quantity and valuation rate',
        columns: [{ field: 'item_code', reqd: true }, { field: 'warehouse', reqd: true, filters: (row, doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }) }, 'qty', 'valuation_rate', { field: 'current_qty', readOnly: true }, { field: 'current_valuation_rate', readOnly: true }],
        newRow: (doc) => ({ warehouse: doc.set_warehouse }), toolbar: StockReconToolbar,
        empty: 'Pick a warehouse above and use “Fetch stock”, or add lines. For the very first count choose purpose “Opening Stock”.',
      },
    ],
    // Opening stock must post against a balance-sheet account (ERPNext's "Temporary Opening").
    // The cost center is always filled: the company's own, whenever the company changes.
    onChange: async (field, value, doc, { call }) => {
      if (!['purpose', 'company'].includes(field)) return null
      const company = field === 'company' ? value : doc.company
      if (!company) return null
      const patch = {}
      if (field === 'company') {
        const cc = await call.get('frappe.client.get_value', { doctype: 'Company', filters: company, fieldname: 'cost_center' })
        patch.cost_center = cc?.message?.cost_center || null
      }
      const purpose = field === 'purpose' ? value : doc.purpose
      if (purpose !== 'Opening Stock') {
        if (field === 'purpose') patch.expense_account = null
        return Object.keys(patch).length ? patch : null
      }
      const res = await call.get('frappe.client.get_value', { doctype: 'Account', filters: JSON.stringify({ company, account_type: 'Temporary', is_group: 0 }), fieldname: 'name' })
      if (res?.message?.name) patch.expense_account = res.message.name
      return Object.keys(patch).length ? patch : null
    },
    defaults: (boot) => ({ purpose: 'Stock Reconciliation', company: boot.company, posting_date: today(), set_warehouse: boot.default_warehouse, cost_center: boot.cost_center }),
  },
  'landed-costs': {
    doctype: 'Landed Cost Voucher', title: 'Landed Costs', single: 'Landed Cost Voucher', titleField: 'name',
    list: ['name', 'posting_date', 'total_taxes_and_charges', 'distribute_charges_based_on', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    tabs: docstatusTabs,
    search: ['name'],
    sort: 'posting_date desc',
    sections: [{ title: 'Landed cost', fields: ['company', 'posting_date', 'distribute_charges_based_on', { field: 'total_taxes_and_charges', readOnly: true }] }],
    tables: [
      { field: 'purchase_receipts', title: 'Receipts / bills the cost applies to', columns: [{ field: 'receipt_document_type', reqd: true }, { field: 'receipt_document', reqd: true }, { field: 'supplier', readOnly: true }, { field: 'grand_total', readOnly: true }], newRow: () => ({ receipt_document_type: 'Purchase Receipt' }) },
      { field: 'taxes', title: 'Costs (freight, customs, insurance…)', columns: [{ field: 'expense_account', reqd: true, filters: (row, doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }) }, 'description', { field: 'amount', reqd: true }], newRow: () => ({}), sum: ['amount'] },
      { field: 'items', title: 'Items (from the receipts)', columns: [{ field: 'item_code', readOnly: true }, { field: 'qty', readOnly: true }, { field: 'amount', readOnly: true }, 'applicable_charges'], addRows: false, empty: 'Save, then use “Get items from receipts”.' },
    ],
    docActions: [
      {
        label: 'Get items from receipts', icon: ListPlus, success: 'Items loaded — submit to add the cost to stock value',
        when: (doc) => Number(doc.docstatus) === 0,
        run: async ({ doc, call, mutate }) => {
          await call.post('run_doc_method', { dt: 'Landed Cost Voucher', dn: doc.name, method: 'get_items_from_purchase_receipts' })
          await mutate()
        },
      },
    ],
    defaults: (boot) => ({ company: boot.company, posting_date: today(), distribute_charges_based_on: 'Amount' }),
  },
  batches: {
    doctype: 'Batch', title: 'Batches', single: 'Batch', titleField: 'batch_id', statusFromDisabled: true,
    list: ['batch_id', 'item', 'batch_qty', 'manufacturing_date', 'expiry_date', { field: 'disabled', type: 'Active' }],
    tabs: [
      { label: 'All', filters: [] },
      { label: 'In stock', filters: [['batch_qty', '>', 0]] },
      { label: 'Expired', filters: [['expiry_date', '<', today()]] },
    ],
    search: ['name', 'batch_id', 'item'],
    sort: 'expiry_date asc',
    sections: [{ title: 'Batch', fields: ['batch_id', 'item', { field: 'batch_qty', readOnly: true }, 'manufacturing_date', 'expiry_date', 'supplier', 'description', 'disabled'] }],
  },
  'serial-nos': {
    doctype: 'Serial No', title: 'Serial Numbers', single: 'Serial No', titleField: 'serial_no',
    list: ['serial_no', 'item_code', 'warehouse', 'status', 'warranty_expiry_date'],
    tabs: statusTabs('Active', 'Inactive', 'Delivered', 'Expired'),
    search: ['name', 'serial_no', 'item_code'],
    sections: [{ title: 'Serial number', fields: ['serial_no', 'item_code', { field: 'warehouse', readOnly: true }, { field: 'status', readOnly: true }, 'batch_no', 'warranty_period', 'warranty_expiry_date', 'amc_expiry_date', 'description'] }],
  },

  /* ---------------- CRM ---------------- */
  leads: {
    doctype: 'Lead', title: 'Leads', single: 'Lead', titleField: 'lead_name', customFields: true, crmActivities: true,
    list: ['lead_name', 'company_name', 'status', 'lead_temperature', 'lead_score', 'mobile_no', 'email_id', 'lead_owner'],
    columns: ['lead_name', 'company_name', 'status', 'lead_temperature', 'lead_score', 'mobile_no', 'email_id', 'utm_source', 'territory', 'lead_owner'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Lead', 'Open', 'Replied', 'Interested', 'Opportunity', 'Quotation', 'Converted'),
    search: ['name', 'lead_name', 'company_name', 'mobile_no', 'email_id'],
    sort: 'modified desc',
    sections: [
      { title: 'Person', fields: ['salutation', 'first_name', 'last_name', 'job_title', 'mobile_no', 'whatsapp_no', 'email_id', 'phone'] },
      { title: 'Company', fields: ['company_name', 'industry', 'no_of_employees', 'annual_revenue', 'website', 'territory', 'city', 'country'] },
      { title: 'Follow-up', fields: ['status', 'lead_owner', 'request_type', 'type', 'qualification_status', 'utm_source', 'company'] },
      { title: 'Score', fields: [{ field: 'lead_temperature', readOnly: true }, { field: 'lead_score', readOnly: true }, { field: 'lead_score_reason', readOnly: true }] },
    ],
    make: [
      { label: 'Opportunity', method: 'erpnext.crm.doctype.lead.lead.make_opportunity', args: (doc) => ({ source_name: doc.name }), target: 'opportunities', when: (doc) => !['Converted', 'Opportunity', 'Quotation'].includes(doc.status) },
      { label: 'Quotation', method: 'erpnext.crm.doctype.lead.lead.make_quotation', args: (doc) => ({ source_name: doc.name }), target: 'quotations', when: (doc) => doc.status !== 'Converted' },
      { label: 'Customer', method: 'erpnext.crm.doctype.lead.lead.make_customer', args: (doc) => ({ source_name: doc.name }), target: 'customers', when: (doc) => doc.status !== 'Converted' && !doc.customer },
    ],
    defaults: (boot) => ({ status: 'Lead', company: boot.company, lead_owner: boot.user, country: 'United Arab Emirates' }),
  },
  opportunities: {
    doctype: 'Opportunity', title: 'Opportunities', single: 'Opportunity', titleField: 'title', customFields: true, crmActivities: true,
    list: ['name', 'customer_name', 'opportunity_from', 'sales_stage', 'opportunity_amount', 'expected_closing', 'status'],
    columns: ['name', 'customer_name', 'opportunity_from', 'sales_stage', 'probability', 'opportunity_amount', 'expected_closing', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Open', 'Replied', 'Quotation', 'Converted', 'Lost', 'Closed'),
    search: ['name', 'customer_name', 'party_name', 'title'],
    sort: 'expected_closing asc',
    sections: [
      { title: 'Opportunity', fields: ['opportunity_from', 'party_name', { field: 'customer_name', readOnly: true }, 'opportunity_type', 'status', 'opportunity_owner', 'company', 'transaction_date'] },
      { title: 'Pipeline', fields: ['sales_stage', 'probability', 'expected_closing', 'opportunity_amount', 'currency', 'order_lost_reason'] },
      { title: 'Contact', fields: ['contact_person', 'contact_email', 'contact_mobile', 'territory', 'industry'], collapsed: true },
    ],
    tables: [
      { field: 'items', title: 'Items of interest', columns: [{ field: 'item_code', reqd: true }, 'qty', 'rate', { field: 'amount', readOnly: true }], newRow: () => ({ qty: 1 }), sum: ['amount'] },
    ],
    make: [
      { label: 'Quotation', method: 'erpnext.crm.doctype.opportunity.opportunity.make_quotation', args: (doc) => ({ source_name: doc.name }), target: 'quotations', when: (doc) => !['Lost', 'Closed', 'Converted'].includes(doc.status) },
    ],
    defaults: (boot) => ({ opportunity_from: 'Lead', status: 'Open', company: boot.company, currency: boot.currency, transaction_date: today(), opportunity_owner: boot.user, opportunity_type: 'Sales' }),
  },

  /* ---------------- Selling ---------------- */
  quotations: {
    doctype: 'Quotation', title: 'Quotations', single: 'Quotation', titleField: 'customer_name',
    list: ['name', 'customer_name', 'transaction_date', 'valid_till', 'grand_total', 'status'],
    columns: ['name', 'customer_name', 'transaction_date', 'valid_till', 'order_type', 'total_qty', 'grand_total', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Open', 'Ordered', 'Lost', 'Expired'),
    search: ['name', 'customer_name', 'party_name'],
    sections: [
      { title: 'Details', fields: ['quotation_to', 'party_name', 'transaction_date', 'valid_till', 'order_type', 'company'] },
      { title: 'Pricing', fields: ['currency', 'selling_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount'] },
    pricing: { partyField: 'party_name', partyKey: 'customer', priceList: 'selling_price_list', dateField: 'transaction_date', itemFilters: { is_sales_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Sales Taxes and Charges Template' },
    totals: sellingTotals,
    make: [MAKE.quotationToOrder],
    defaults: (boot) => ({ ...companyDefaults(boot), quotation_to: 'Customer', order_type: 'Sales', transaction_date: today(), selling_price_list: boot.selling_price_list }),
  },
  'sales-orders': {
    doctype: 'Sales Order', title: 'Sales Orders', single: 'Sales Order', titleField: 'customer_name',
    list: ['name', 'customer_name', 'transaction_date', 'delivery_date', 'grand_total', { field: 'per_delivered', label: 'Delivered' }, 'status'],
    columns: ['name', 'customer_name', 'transaction_date', 'delivery_date', 'grand_total', 'per_delivered', 'per_billed', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'To Deliver and Bill', 'To Deliver', 'To Bill', 'Completed', 'Closed', 'Cancelled'),
    search: ['name', 'customer_name', 'po_no'],
    sections: [
      { title: 'Details', fields: [{ field: 'customer', filters: { disabled: 0 } }, 'transaction_date', 'delivery_date', 'po_no', 'company', { field: 'set_warehouse', filters: warehouseFilter }] },
      { title: 'Pricing', fields: ['currency', 'selling_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount', 'warehouse'], dateField: 'delivery_date' },
    pricing: { partyField: 'customer', partyKey: 'customer', priceList: 'selling_price_list', dateField: 'transaction_date', itemFilters: { is_sales_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Sales Taxes and Charges Template' },
    totals: [...sellingTotals, 'per_delivered', 'per_billed'],
    make: [MAKE.orderToDelivery, MAKE.orderToInvoice, MAKE.advance('Sales Order')],
    defaults: (boot) => ({ ...companyDefaults(boot), transaction_date: today(), selling_price_list: boot.selling_price_list, set_warehouse: boot.default_warehouse }),
  },
  'delivery-notes': {
    doctype: 'Delivery Note', title: 'Delivery Notes', single: 'Delivery Note', titleField: 'customer_name',
    list: ['name', 'customer_name', 'posting_date', 'grand_total', { field: 'per_billed', label: 'Billed' }, 'status'],
    columns: ['name', 'customer_name', 'posting_date', 'set_warehouse', 'total_qty', 'grand_total', 'per_billed', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'To Bill', 'Completed', 'Return Issued', 'Cancelled'),
    search: ['name', 'customer_name'],
    sections: [
      { title: 'Details', fields: [{ field: 'customer', filters: { disabled: 0 } }, 'posting_date', 'company', { field: 'set_warehouse', filters: warehouseFilter }] },
      { title: 'Pricing', fields: ['currency', 'selling_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount', 'warehouse'] },
    pricing: { partyField: 'customer', partyKey: 'customer', priceList: 'selling_price_list', dateField: 'posting_date', itemFilters: { is_sales_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Sales Taxes and Charges Template' },
    totals: [...sellingTotals, 'per_billed'],
    make: [MAKE.deliveryToInvoice],
    defaults: (boot) => ({ ...companyDefaults(boot), posting_date: today(), selling_price_list: boot.selling_price_list, set_warehouse: boot.default_warehouse }),
  },
  'sales-invoices': {
    doctype: 'Sales Invoice', title: 'Sales Invoices', single: 'Sales Invoice', titleField: 'customer_name',
    list: ['name', 'customer_name', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status'],
    columns: ['name', 'customer_name', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'is_return', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Unpaid', 'Overdue', 'Partly Paid', 'Paid', 'Return', 'Cancelled'),
    search: ['name', 'customer_name'],
    sections: [
      { title: 'Details', fields: [{ field: 'customer', filters: { disabled: 0 } }, 'posting_date', 'due_date', 'company'] },
      { title: 'Pricing', fields: ['currency', 'selling_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount'] },
    pricing: { partyField: 'customer', partyKey: 'customer', priceList: 'selling_price_list', dateField: 'posting_date', itemFilters: { is_sales_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Sales Taxes and Charges Template' },
    totals: [...sellingTotals, 'outstanding_amount'],
    make: [
      MAKE.payment('Sales Invoice'), MAKE.creditNote,
      { label: 'Dunning letter', method: 'erpnext.accounts.doctype.sales_invoice.sales_invoice.create_dunning', args: (doc) => ({ source_name: doc.name }), target: 'dunnings', when: (doc) => Number(doc.docstatus) === 1 && /Overdue/.test(doc.status ?? '') },
    ],
    docActions: [
      {
        label: 'E-invoice XML', icon: FileDown,
        when: (doc) => Number(doc.docstatus) === 1,
        run: async ({ doc, call, toast }) => {
          const r = (await call.get('karya_erp.einvoice.invoice', { name: doc.name })).message
          const errors = r.issues.filter((i) => i.level === 'error').map((i) => i.message)
          const warnings = r.issues.filter((i) => i.level === 'warning').map((i) => i.message)
          if (!r.ready) { toast({ tone: 'error', title: 'Not ready for e-invoicing', description: errors.join('\n') }); return }
          const url = URL.createObjectURL(new Blob([r.xml], { type: 'application/xml' }))
          Object.assign(document.createElement('a'), { href: url, download: r.filename }).click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
          toast({ tone: 'success', title: 'PINT AE XML downloaded', description: warnings.length ? `Check: ${warnings.join('; ')}` : 'Hand it to your accredited service provider (ASP).' })
        },
      },
    ],
    defaults: (boot) => ({ update_stock: 1, ...companyDefaults(boot), posting_date: today(), selling_price_list: boot.selling_price_list }),
  },

  /* ---------------- Buying ---------------- */
  'material-requests': {
    doctype: 'Material Request', title: 'Material Requests', single: 'Material Request', titleField: 'name',
    list: ['name', 'material_request_type', 'transaction_date', 'schedule_date', { field: 'per_ordered', label: 'Ordered' }, 'status'],
    columns: ['name', 'material_request_type', 'transaction_date', 'schedule_date', 'set_warehouse', 'per_ordered', 'per_received', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Pending', 'Partially Ordered', 'Ordered', 'Received', 'Stopped', 'Cancelled'),
    search: ['name'],
    sections: [
      { title: 'Details', fields: ['material_request_type', 'transaction_date', 'schedule_date', 'company', { field: 'set_warehouse', filters: warehouseFilter }] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'warehouse'], dateField: 'schedule_date' },
    pricing: { dateField: 'transaction_date', itemFilters: { is_purchase_item: 1 } },
    totals: ['per_ordered', 'per_received'],
    make: [MAKE.requestToRfq, MAKE.requestToOrder],
    defaults: (boot) => ({ company: boot.company, material_request_type: 'Purchase', transaction_date: today(), set_warehouse: boot.default_warehouse }),
  },
  'request-for-quotations': {
    doctype: 'Request for Quotation', title: 'Requests for Quotation', single: 'Request for Quotation', titleField: 'subject',
    list: ['name', 'subject', 'transaction_date', 'schedule_date', 'status'],
    columns: ['name', 'subject', 'transaction_date', 'schedule_date', 'company', 'status'],
    tabs: statusTabs('Draft', 'Submitted', 'Cancelled'),
    search: ['name', 'subject'],
    sections: [
      { title: 'Request', fields: ['subject', 'transaction_date', 'schedule_date', 'company', 'message_for_supplier'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'warehouse'], dateField: 'schedule_date' },
    pricing: { dateField: 'transaction_date', itemFilters: { is_purchase_item: 1 } },
    tables: [
      { field: 'suppliers', title: 'Suppliers to ask', columns: [{ field: 'supplier', reqd: true, filters: { disabled: 0 } }, 'email_id', 'send_email', { field: 'quote_status', readOnly: true }], newRow: () => ({ send_email: 1 }), empty: 'Add at least one supplier.' },
    ],
    docActions: [
      { label: 'Compare quotes', icon: Scale, when: (doc) => Number(doc.docstatus) === 1, run: async ({ doc, navigate }) => navigate(`/quote-comparison?rfq=${encodeURIComponent(doc.name)}`) },
    ],
    defaults: (boot) => ({ company: boot.company, transaction_date: today(), message_for_supplier: 'Please quote your best price and delivery time for the items below.', suppliers: [{ send_email: 1 }] }),
  },
  'supplier-quotations': {
    doctype: 'Supplier Quotation', title: 'Supplier Quotations', single: 'Supplier Quotation', titleField: 'supplier_name',
    list: ['name', 'supplier_name', 'transaction_date', 'valid_till', 'grand_total', 'status'],
    columns: ['name', 'supplier_name', 'transaction_date', 'valid_till', 'grand_total', 'status'],
    tabs: statusTabs('Draft', 'Submitted', 'Ordered', 'Expired', 'Cancelled'),
    search: ['name', 'supplier_name'],
    sections: [
      { title: 'Details', fields: [{ field: 'supplier', filters: { disabled: 0 } }, 'transaction_date', 'valid_till', 'company'] },
      { title: 'Pricing', fields: ['currency', 'buying_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount'] },
    pricing: { partyField: 'supplier', partyKey: 'supplier', priceList: 'buying_price_list', dateField: 'transaction_date', itemFilters: { is_purchase_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Purchase Taxes and Charges Template' },
    totals: sellingTotals,
    make: [MAKE.quotationToPurchaseOrder],
    defaults: (boot) => ({ ...companyDefaults(boot), transaction_date: today(), buying_price_list: boot.buying_price_list }),
  },
  'purchase-orders': {
    doctype: 'Purchase Order', title: 'Purchase Orders', single: 'Purchase Order', titleField: 'supplier_name',
    list: ['name', 'supplier_name', 'transaction_date', 'schedule_date', 'grand_total', { field: 'per_received', label: 'Received' }, 'status'],
    columns: ['name', 'supplier_name', 'transaction_date', 'schedule_date', 'grand_total', 'per_received', 'per_billed', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'To Receive and Bill', 'To Receive', 'To Bill', 'Completed', 'Closed', 'Cancelled'),
    search: ['name', 'supplier_name'],
    sections: [
      { title: 'Details', fields: [{ field: 'supplier', filters: { disabled: 0 } }, 'transaction_date', 'schedule_date', 'company', { field: 'set_warehouse', filters: warehouseFilter }] },
      { title: 'Pricing', fields: ['currency', 'buying_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount', 'warehouse'], dateField: 'schedule_date' },
    pricing: { partyField: 'supplier', partyKey: 'supplier', priceList: 'buying_price_list', dateField: 'transaction_date', itemFilters: { is_purchase_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Purchase Taxes and Charges Template' },
    totals: [...sellingTotals, 'per_received', 'per_billed'],
    make: [MAKE.orderToReceipt, MAKE.orderToBill, MAKE.advance('Purchase Order')],
    defaults: (boot) => ({ ...companyDefaults(boot), transaction_date: today(), buying_price_list: boot.buying_price_list, set_warehouse: boot.default_warehouse }),
  },
  'purchase-receipts': {
    doctype: 'Purchase Receipt', title: 'Purchase Receipts', single: 'Purchase Receipt', titleField: 'supplier_name',
    list: ['name', 'supplier_name', 'posting_date', 'grand_total', { field: 'per_billed', label: 'Billed' }, 'status'],
    columns: ['name', 'supplier_name', 'posting_date', 'set_warehouse', 'total_qty', 'grand_total', 'per_billed', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'To Bill', 'Completed', 'Return Issued', 'Cancelled'),
    search: ['name', 'supplier_name'],
    sections: [
      { title: 'Details', fields: [{ field: 'supplier', filters: { disabled: 0 } }, 'posting_date', 'company', { field: 'set_warehouse', filters: warehouseFilter }] },
      { title: 'Pricing', fields: ['currency', 'buying_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount', 'warehouse'] },
    pricing: { partyField: 'supplier', partyKey: 'supplier', priceList: 'buying_price_list', dateField: 'posting_date', itemFilters: { is_purchase_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Purchase Taxes and Charges Template' },
    totals: [...sellingTotals, 'per_billed'],
    make: [MAKE.receiptToBill],
    defaults: (boot) => ({ ...companyDefaults(boot), posting_date: today(), buying_price_list: boot.buying_price_list, set_warehouse: boot.default_warehouse }),
  },
  'purchase-invoices': {
    doctype: 'Purchase Invoice', title: 'Purchase Invoices', single: 'Purchase Invoice', titleField: 'supplier_name',
    list: ['name', 'supplier_name', 'bill_no', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status'],
    columns: ['name', 'supplier_name', 'bill_no', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Unpaid', 'Overdue', 'Partly Paid', 'Paid', 'Return', 'Cancelled'),
    search: ['name', 'supplier_name', 'bill_no'],
    sections: [
      { title: 'Details', fields: [{ field: 'supplier', filters: { disabled: 0 } }, 'bill_no', 'bill_date', 'posting_date', 'due_date', 'company'] },
      { title: 'Pricing', fields: ['currency', 'buying_price_list', 'taxes_and_charges'] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount'] },
    pricing: { partyField: 'supplier', partyKey: 'supplier', priceList: 'buying_price_list', dateField: 'posting_date', itemFilters: { is_purchase_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Purchase Taxes and Charges Template' },
    totals: [...sellingTotals, 'outstanding_amount'],
    make: [MAKE.payment('Purchase Invoice'), MAKE.debitNote],
    defaults: (boot) => ({ update_stock: 1, ...companyDefaults(boot), posting_date: today(), buying_price_list: boot.buying_price_list }),
  },

  /* ---------------- Stock ---------------- */
  'stock-entries': {
    doctype: 'Stock Entry', title: 'Stock Entries', single: 'Stock Entry', titleField: 'stock_entry_type',
    list: ['name', 'stock_entry_type', 'posting_date', 'from_warehouse', 'to_warehouse', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['name', 'stock_entry_type', 'purpose', 'posting_date', 'from_warehouse', 'to_warehouse', 'total_amount', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name', 'stock_entry_type'],
    sections: [
      { title: 'Details', fields: ['stock_entry_type', 'posting_date', 'company', { field: 'from_warehouse', filters: warehouseFilter }, { field: 'to_warehouse', filters: warehouseFilter }] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', { field: 's_warehouse', label: 'From' }, { field: 't_warehouse', label: 'To' }, 'basic_rate'], basicDetails: true, sourceWarehouse: 'from_warehouse', targetWarehouse: 'to_warehouse' },
    totals: ['total_outgoing_value', 'total_incoming_value', 'value_difference'],
    defaults: (boot) => ({ company: boot.company, stock_entry_type: 'Material Receipt', posting_date: today() }),
  },
  'stock-balance': {
    doctype: 'Bin', title: 'Stock Balance', single: 'Stock', readOnly: true, noDocPage: true,
    list: ['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'ordered_qty', 'projected_qty'],
    columns: ['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'ordered_qty', 'indented_qty', 'projected_qty', 'stock_value'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'In stock', filters: [['actual_qty', '>', 0]] },
      { label: 'Out of stock', filters: [['actual_qty', '<=', 0]] },
      { label: 'Below zero projected', filters: [['projected_qty', '<', 0]] },
    ],
    search: ['item_code', 'warehouse'],
    sort: 'item_code asc',
  },

  /* ---------------- Accounts ---------------- */
  payments: {
    doctype: 'Payment Entry', title: 'Payments', single: 'Payment Entry', titleField: 'party_name',
    list: ['name', 'payment_type', 'party_name', 'posting_date', 'mode_of_payment', 'paid_amount', { field: 'unallocated_amount', label: 'Unallocated' }, 'status'],
    columns: ['name', 'payment_type', 'party_name', 'posting_date', 'mode_of_payment', 'paid_amount', 'unallocated_amount', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      ...statusTabs('Draft', 'Submitted', 'Cancelled'),
      { label: 'Received', filters: [['payment_type', '=', 'Receive'], ['docstatus', '=', 1]] },
      { label: 'Paid out', filters: [['payment_type', '=', 'Pay'], ['docstatus', '=', 1]] },
    ],
    search: ['name', 'party_name', 'reference_no'],
    sections: [
      { title: 'Payment', fields: ['payment_type', 'posting_date', 'mode_of_payment', 'company'] },
      {
        title: 'Party', fields: [
          { field: 'party_type', when: notTransfer },
          { field: 'party', reqd: true, when: notTransfer },
          { field: 'party_name', readOnly: true, when: (d) => notTransfer(d) && d.party_name && d.party_name !== d.party },
        ],
      },
      {
        title: 'Accounts', fields: [
          { field: 'paid_from', label: 'Paid from (credit)', reqd: true, filters: accountFilter },
          { field: 'paid_to', label: 'Paid to (debit)', reqd: true, filters: accountFilter },
        ],
      },
      { title: 'Accounting dimensions', collapsed: true, fields: [{ field: 'cost_center', filters: (d) => ({ is_group: 0, ...(d.company ? { company: d.company } : {}) }) }] },
      {
        title: 'Amount', fields: [
          { field: 'paid_amount', reqd: true },
          { field: 'received_amount', when: (d) => d.paid_from_account_currency && d.paid_to_account_currency && d.paid_from_account_currency !== d.paid_to_account_currency },
          { field: 'unallocated_amount', readOnly: true, when: (d) => Number(d.docstatus) > 0 },
          { field: 'reference_no', label: 'Cheque / reference no' },
          { field: 'reference_date', label: 'Reference date' },
          'remarks',
        ],
      },
    ],
    tables: [
      {
        field: 'references', title: 'Allocated to invoices', when: notTransfer,
        columns: [
          { field: 'reference_doctype', label: 'Type', readOnly: true },
          { field: 'reference_name', label: 'Invoice', readOnly: true },
          { field: 'due_date', readOnly: true },
          { field: 'total_amount', label: 'Invoice total', readOnly: true },
          { field: 'outstanding_amount', label: 'Outstanding', readOnly: true },
          { field: 'allocated_amount', label: 'Allocate' },
        ],
        sum: ['outstanding_amount', 'allocated_amount'],
        addRows: false,
        empty: 'Not allocated yet — use “Get outstanding invoices”, or leave empty for an advance payment.',
        toolbar: PaymentReferencesToolbar,
      },
    ],
    headerTotal: (d) => d.paid_amount, headerTotalLabel: 'Amount',
    onChange: paymentEntryChange,
    validate: (d) => {
      if (!(Number(d.paid_amount) > 0)) return 'Enter the amount.'
      const allocated = (d.references ?? []).reduce((s, r) => s + (Number(r.allocated_amount) || 0), 0)
      if (allocated - Number(d.paid_amount) > 0.005) return `Allocated ${allocated.toFixed(2)} is more than the amount ${Number(d.paid_amount).toFixed(2)}.`
      if (d.payment_type === 'Internal Transfer' && d.paid_from === d.paid_to) return 'Choose two different accounts for a transfer.'
      return null
    },
    defaults: (boot) => ({
      company: boot.company, payment_type: 'Receive', party_type: 'Customer', posting_date: today(), cost_center: boot.cost_center,
      source_exchange_rate: 1, target_exchange_rate: 1, paid_from_account_currency: boot.currency, paid_to_account_currency: boot.currency,
    }),
  },
  'journal-entries': {
    doctype: 'Journal Entry', title: 'Journal Entries', single: 'Journal Entry', titleField: 'title',
    list: ['name', 'voucher_type', 'posting_date', 'total_debit', 'cheque_no', 'user_remark', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['name', 'voucher_type', 'posting_date', 'total_debit', 'total_credit', 'cheque_no', 'user_remark', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      ...docstatusTabs,
      { label: 'Bank / Cash', filters: [['voucher_type', 'in', ['Bank Entry', 'Cash Entry']]] },
      { label: 'Opening', filters: [['voucher_type', '=', 'Opening Entry']] },
    ],
    search: ['name', 'title', 'cheque_no', 'user_remark'],
    sections: [
      { title: 'Entry', fields: ['voucher_type', 'posting_date', 'company'] },
      {
        title: 'Reference', fields: [
          { field: 'cheque_no', label: 'Reference / cheque no', reqd: false },
          { field: 'cheque_date', label: 'Reference date' },
          { field: 'user_remark', label: 'Remark' },
        ],
      },
    ],
    tables: [
      {
        field: 'accounts', title: 'Accounting entries', startRows: 2,
        columns: [
          { field: 'account', width: 260, reqd: true, filters: (row, doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }) },
          { field: 'party_type', width: 130, clears: ['party'] },
          { field: 'party', width: 200 },
          { field: 'debit_in_account_currency', label: 'Debit', width: 140, clears: ['credit_in_account_currency'] },
          { field: 'credit_in_account_currency', label: 'Credit', width: 140, clears: ['debit_in_account_currency'] },
        ],
        // Like ERPNext: cost center is not a grid column; it's in each line's details ("Accounting dimensions").
        details: [
          { field: 'cost_center', filters: (row, doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }) },
          { field: 'user_remark', label: 'Line remark', type: 'Small Text' },
        ],
        sum: ['debit_in_account_currency', 'credit_in_account_currency'],
        balance: ['debit_in_account_currency', 'credit_in_account_currency'],
        // A new line suggests the amount that balances the entry, on the opposite side.
        newRow: (doc, rows = [], boot) => {
          const diff = rows.reduce((s, r) => s + (Number(r.debit_in_account_currency) || 0) - (Number(r.credit_in_account_currency) || 0), 0)
          // ERPNext: a new line copies the first line's cost center (else the company default).
          const costCenter = rows.find((r) => r.cost_center)?.cost_center || boot?.cost_center
          return {
            exchange_rate: 1,
            ...(costCenter ? { cost_center: costCenter } : {}),
            debit_in_account_currency: diff < 0 ? round2(-diff) : 0,
            credit_in_account_currency: diff > 0 ? round2(diff) : 0,
          }
        },
      },
    ],
    headerTotal: (d) => (Number(d.docstatus) > 0 || d.total_debit ? d.total_debit : (d.accounts ?? []).reduce((s, r) => s + (Number(r.debit_in_account_currency) || 0), 0)),
    headerTotalLabel: 'Debit',
    validate: (d) => {
      const lines = (d.accounts ?? []).filter((r) => r.account)
      if (lines.length < 2) return 'A journal entry needs at least two account lines.'
      const dr = lines.reduce((s, r) => s + (Number(r.debit_in_account_currency) || 0), 0)
      const cr = lines.reduce((s, r) => s + (Number(r.credit_in_account_currency) || 0), 0)
      if (!(dr > 0)) return 'Enter the debit and credit amounts.'
      if (Math.abs(dr - cr) > 0.005) return `Debit (${dr.toFixed(2)}) and credit (${cr.toFixed(2)}) must be equal.`
      if (lines.some((r) => Number(r.debit_in_account_currency) > 0 && Number(r.credit_in_account_currency) > 0)) return 'A line can have a debit or a credit, not both.'
      if (d.voucher_type === 'Bank Entry' && (!d.cheque_no || !d.cheque_date)) return 'Bank entries need a reference number and date.'
      return null
    },
    defaults: (boot) => ({ company: boot.company, voucher_type: 'Journal Entry', posting_date: today() }),
  },
  'credit-notes': {
    doctype: 'Sales Invoice', alias: true, title: 'Credit Notes', single: 'Credit Note', titleField: 'customer_name',
    list: ['name', 'customer_name', 'return_against', 'posting_date', 'grand_total', 'outstanding_amount', 'status'],
    columns: ['name', 'customer_name', 'return_against', 'posting_date', 'total_qty', 'grand_total', 'outstanding_amount', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: withBase([['is_return', '=', 1]], docstatusTabs),
    search: ['name', 'customer_name', 'return_against'],
    sections: [
      { title: 'Details', fields: [{ field: 'customer', readOnly: true }, { field: 'return_against', label: 'Against invoice', readOnly: true }, 'posting_date', 'company', 'update_stock'] },
      { title: 'Pricing', fields: [{ field: 'currency', readOnly: true }, 'selling_price_list', 'taxes_and_charges'] },
      { title: 'Reason', fields: [{ field: 'remarks', label: 'Reason for credit' }] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount'] },
    pricing: { partyField: 'customer', partyKey: 'customer', priceList: 'selling_price_list', dateField: 'posting_date', itemFilters: { is_sales_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Sales Taxes and Charges Template' },
    totals: [...sellingTotals, 'outstanding_amount'],
    createFrom: {
      title: 'New credit note', label: 'Sales invoice to credit', doctype: 'Sales Invoice',
      filters: { docstatus: 1, is_return: 0 },
      method: MAKE.creditNote.method, args: (name) => ({ source_name: name }),
      hint: 'ERPNext copies the invoice lines with negative quantities. Remove lines or reduce quantities for a partial credit.',
    },
    make: [{ ...MAKE.payment('Sales Invoice'), label: 'Refund' }],
  },
  'debit-notes': {
    doctype: 'Purchase Invoice', alias: true, title: 'Debit Notes', single: 'Debit Note', titleField: 'supplier_name',
    list: ['name', 'supplier_name', 'return_against', 'posting_date', 'grand_total', 'outstanding_amount', 'status'],
    columns: ['name', 'supplier_name', 'return_against', 'posting_date', 'total_qty', 'grand_total', 'outstanding_amount', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: withBase([['is_return', '=', 1]], docstatusTabs),
    search: ['name', 'supplier_name', 'return_against', 'bill_no'],
    sections: [
      { title: 'Details', fields: [{ field: 'supplier', readOnly: true }, { field: 'return_against', label: 'Against invoice', readOnly: true }, 'bill_no', 'posting_date', 'company', 'update_stock'] },
      { title: 'Pricing', fields: [{ field: 'currency', readOnly: true }, 'buying_price_list', 'taxes_and_charges'] },
      { title: 'Reason', fields: [{ field: 'remarks', label: 'Reason for debit' }] },
    ],
    items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount'] },
    pricing: { partyField: 'supplier', partyKey: 'supplier', priceList: 'buying_price_list', dateField: 'posting_date', itemFilters: { is_purchase_item: 1 } },
    taxes: { field: 'taxes_and_charges', template: 'Purchase Taxes and Charges Template' },
    totals: [...sellingTotals, 'outstanding_amount'],
    createFrom: {
      title: 'New debit note', label: 'Purchase invoice to debit', doctype: 'Purchase Invoice',
      filters: { docstatus: 1, is_return: 0 },
      method: MAKE.debitNote.method, args: (name) => ({ source_name: name }),
      hint: 'ERPNext copies the bill lines with negative quantities. Remove lines or reduce quantities for a partial return.',
    },
    make: [{ ...MAKE.payment('Purchase Invoice'), label: 'Receive refund' }],
  },

  /* ---------------- HR (Frappe HR) ---------------- */
  employees: {
    doctype: 'Employee', title: 'Employees', single: 'Employee', titleField: 'employee_name',
    list: ['employee_name', 'designation', 'department', 'branch', 'date_of_joining', 'status'],
    columns: ['employee_name', 'designation', 'department', 'branch', 'date_of_joining', 'cell_number', 'company_email', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Active', 'Inactive', 'Suspended', 'Left'),
    search: ['name', 'employee_name', 'cell_number', 'company_email'],
    sort: 'employee_name asc',
    sections: [
      { tab: 'Overview', title: 'Employee', fields: ['first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth', 'image'] },
      {
        tab: 'Overview', title: 'Job', fields: [
          'company', 'date_of_joining', 'status', 'employment_type',
          { field: 'department', filters: (d) => (d.company ? { company: d.company } : {}) },
          'designation', 'branch', 'grade',
          { field: 'reports_to', filters: (d) => ({ status: 'Active', ...(d.name ? { name: ['!=', d.name] } : {}) }) },
        ],
      },
      { tab: 'Overview', title: 'Login', fields: [{ field: 'user_id', readOnly: true }] },
      { tab: 'Contact', title: 'Contact', fields: ['cell_number', 'company_email', 'personal_email', 'prefered_contact_email', 'current_address', 'permanent_address'] },
      { tab: 'Contact', title: 'Emergency contact', fields: ['person_to_be_contacted', 'emergency_phone_number', 'relation'] },
      { tab: 'Attendance & Leave', title: 'Attendance & leave', fields: ['holiday_list', 'default_shift', 'attendance_device_id', 'leave_approver', 'expense_approver', 'shift_request_approver'] },
      { tab: 'Salary', title: 'Salary', fields: ['ctc', 'salary_currency', 'salary_mode', 'payroll_cost_center'] },
      { tab: 'Salary', title: 'Bank', fields: ['bank_name', 'bank_ac_no', 'iban'] },
      { tab: 'Personal', title: 'Personal', fields: ['marital_status', 'blood_group', 'family_background', 'health_details'] },
      { tab: 'Personal', title: 'Passport', fields: ['passport_number', 'date_of_issue', 'valid_upto', 'place_of_issue'] },
      { tab: 'Exit', title: 'Exit', fields: ['resignation_letter_date', 'relieving_date', 'reason_for_leaving', 'leave_encashed', 'encashment_date'] },
    ],
    related: [
      {
        slug: 'employee-documents', field: 'employee', title: 'Documents',
        columns: ['document_type', 'document_number', 'expiry_date', 'status'],
        orderBy: { field: 'expiry_date', order: 'asc' },
        empty: 'No visa, Emirates ID, labour card or other documents yet.',
      },
    ],
    docActions: [
      {
        label: 'Final settlement', icon: Calculator,
        when: (doc, boot) => boot.is_hr && (Boolean(doc.relieving_date) || doc.status === 'Left'),
        run: async ({ doc, navigate }) => navigate(`/final-settlement?employee=${encodeURIComponent(doc.name)}`),
      },
      {
        label: 'Create login', icon: KeyRound,
        when: (doc, boot) => boot.is_hr && !doc.user_id && doc.status === 'Active',
        run: async ({ doc, call, mutate, toast }) => {
          const res = await call.post('karya_erp.hr.create_login', { employee: doc.name })
          await mutate()
          toast({ tone: 'success', title: 'Login created', description: `${res?.message?.user} will get an email to set a password.` })
        },
      },
    ],
    defaults: (boot) => ({ company: boot.company, status: 'Active', date_of_joining: today(), salary_currency: boot.currency }),
  },
  'employee-documents': {
    doctype: 'Karya Erp Employee Document', title: 'Employee Documents', single: 'Karya Erp Employee Document', titleField: 'employee_name',
    list: ['employee_name', 'document_type', 'document_number', 'expiry_date', 'status'],
    columns: ['employee_name', 'document_type', 'document_number', 'issue_date', 'expiry_date', 'status', 'department'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Expiring Soon', 'Expired', 'Valid', 'No Expiry'),
    search: ['name', 'employee_name', 'document_number'],
    sort: 'expiry_date asc',
    sections: [
      { title: 'Document', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'document_type', 'document_number'] },
      { title: 'Validity', fields: ['issue_date', 'expiry_date', 'place_of_issue', 'issuing_authority'] },
      { title: 'File', fields: ['attachment', 'remarks'] },
    ],
  },
  'salary-history': {
    doctype: 'Karya Erp Salary History', title: 'Karya Erp Salary History', single: 'Salary record', titleField: 'employee_name',
    list: ['employee_name', 'month_start', 'gross_pay', 'deductions', 'net_pay'],
    columns: ['employee_name', 'month_start', 'gross_pay', 'deductions', 'net_pay', 'department'],
    search: ['name', 'employee_name'],
    sort: 'month_start desc',
    sections: [
      { title: 'Salary', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'month_start', 'gross_pay', 'deductions', { field: 'net_pay', readOnly: true }, 'remarks'] },
    ],
  },
  departments: {
    doctype: 'Department', title: 'Departments', single: 'Department', titleField: 'department_name', statusFromDisabled: true,
    list: ['department_name', 'parent_department', 'company', { field: 'is_group', label: 'Group' }, { field: 'disabled', type: 'Active' }],
    columns: ['department_name', 'parent_department', 'company', 'is_group', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'department_name'],
    sort: 'department_name asc',
    sections: [
      { title: 'Department', fields: ['department_name', 'company', { field: 'parent_department', filters: (d) => ({ is_group: 1, ...(d.company ? { company: d.company } : {}) }) }, 'is_group', 'disabled'] },
    ],
    tables: [
      { field: 'leave_approvers', title: 'Leave approvers', columns: [{ field: 'approver', reqd: true }], newRow: () => ({}), empty: 'Employees of this department without their own leave approver use these.' },
      { field: 'expense_approvers', title: 'Expense approvers', columns: [{ field: 'approver', reqd: true }], newRow: () => ({}) },
    ],
    defaults: (boot) => ({ company: boot.company }),
  },
  designations: {
    doctype: 'Designation', title: 'Designations', single: 'Designation', titleField: 'designation_name',
    list: ['designation_name', 'description'],
    search: ['name', 'designation_name'],
    sort: 'designation_name asc',
    sections: [{ title: 'Designation', fields: ['designation_name', 'description'] }],
  },
  companies: {
    doctype: 'Company', title: 'Companies', single: 'Company', titleField: 'company_name', noStatus: true,
    list: ['company_name', 'abbr', 'default_currency', 'country', 'tax_id', { field: 'is_group', label: 'Group' }],
    columns: ['company_name', 'abbr', 'default_currency', 'country', 'tax_id', 'is_group', 'parent_company', 'phone_no'],
    search: ['name', 'company_name', 'abbr', 'tax_id'],
    sort: 'company_name asc',
    sections: [
      { title: 'Company', fields: ['company_name', 'abbr', 'country', 'default_currency', 'tax_id', 'date_of_establishment', 'is_group', 'parent_company'] },
      { title: 'Chart of accounts', fields: ['create_chart_of_accounts_based_on', 'chart_of_accounts', 'existing_company'], collapsed: true },
      { title: 'Contact', fields: ['phone_no', 'email', 'website'], collapsed: true },
    ],
    defaults: () => ({ country: 'United Arab Emirates', default_currency: 'AED', create_chart_of_accounts_based_on: 'Standard Template' }),
  },
  branches: {
    doctype: 'Branch', title: 'Branches', single: 'Branch', titleField: 'branch', noStatus: true,
    list: ['branch'],
    search: ['name', 'branch'],
    sort: 'branch asc',
    sections: [{ title: 'Branch', fields: ['branch'] }],
  },
  'holiday-list-assignments': {
    doctype: 'Holiday List Assignment', title: 'Holiday List Assignments', single: 'Holiday List Assignment', titleField: 'assigned_to',
    list: ['assigned_to', 'applicable_for', 'holiday_list', 'from_date', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    tabs: docstatusTabs,
    search: ['name', 'assigned_to', 'holiday_list'],
    sort: 'from_date desc',
    sections: [{ title: 'Assignment', fields: ['applicable_for', 'assigned_to', { field: 'employee_name', readOnly: true }, 'holiday_list', 'from_date'] }],
    defaults: (boot) => ({ applicable_for: 'Company', assigned_to: boot.company, from_date: `${new Date().getFullYear()}-01-01` }),
  },
  'holiday-lists': {
    doctype: 'Holiday List', title: 'Holiday Lists', single: 'Holiday List', titleField: 'holiday_list_name',
    list: ['holiday_list_name', 'from_date', 'to_date', 'total_holidays'],
    search: ['name', 'holiday_list_name'],
    sort: 'from_date desc',
    sections: [{ title: 'Holiday list', fields: ['holiday_list_name', 'from_date', 'to_date', { field: 'total_holidays', readOnly: true }, 'color'] }],
    docActions: [
      {
        label: 'Assign to company', icon: Check, success: 'Holiday list assigned to the company',
        when: (doc, boot) => boot.is_hr,
        run: async ({ doc, call, boot, mutate }) => {
          await call.post('karya_erp.hr.assign_holiday_list', { holiday_list: doc.name, company: boot.company, from_date: doc.from_date })
          await mutate()
        },
      },
    ],
    tables: [
      {
        field: 'holidays', title: 'Holidays',
        columns: [{ field: 'holiday_date', reqd: true }, 'description', { field: 'weekly_off', label: 'Weekly off' }],
        newRow: () => ({}), toolbar: WeeklyOffToolbar,
        empty: 'Add weekly offs with the button above, then add public holidays as rows.',
      },
    ],
    defaults: () => {
      const y = new Date().getFullYear()
      return { holiday_list_name: `UAE ${y}`, from_date: `${y}-01-01`, to_date: `${y}-12-31` }
    },
  },

  attendance: {
    doctype: 'Attendance', title: 'Attendance', single: 'Attendance', titleField: 'employee_name',
    list: ['employee_name', 'attendance_date', 'status', 'leave_type', 'department'],
    columns: ['employee_name', 'attendance_date', 'status', 'leave_type', 'department', 'shift', 'late_entry', 'early_exit'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [['docstatus', '<', 2]] },
      ...['Present', 'Absent', 'Half Day', 'On Leave', 'Work From Home'].map((st) => ({ label: st, filters: [['status', '=', st], ['docstatus', '=', 1]] })),
      { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
    ],
    search: ['name', 'employee_name', 'employee'],
    sort: 'attendance_date desc',
    sections: [
      { title: 'Attendance', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'attendance_date', 'status', { field: 'leave_type', when: (d) => d.status === 'On Leave' || d.status === 'Half Day' }, 'company'] },
      { title: 'Shift', fields: ['shift', 'late_entry', 'early_exit', 'attendance_request'], collapsed: true },
    ],
    defaults: (boot) => ({ company: boot.company, attendance_date: today(), status: 'Present' }),
  },
  checkins: {
    doctype: 'Employee Checkin', title: 'Check-ins', single: 'Check-in', titleField: 'employee_name',
    list: ['employee_name', 'log_type', 'time', 'device_id'],
    columns: ['employee_name', 'log_type', 'time', 'device_id', 'shift', 'latitude', 'longitude', 'skip_auto_attendance'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'In', filters: [['log_type', '=', 'IN']] },
      { label: 'Out', filters: [['log_type', '=', 'OUT']] },
    ],
    search: ['name', 'employee_name', 'employee'],
    sort: 'time desc',
    sections: [
      { title: 'Check-in', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'log_type', 'time', 'device_id', 'skip_auto_attendance'] },
      { title: 'Location', fields: [{ field: 'latitude', readOnly: true }, { field: 'longitude', readOnly: true }] },
      { title: 'Shift', fields: [{ field: 'shift', readOnly: true }, { field: 'attendance', readOnly: true }], collapsed: true },
    ],
  },

  'shift-types': {
    doctype: 'Shift Type', title: 'Shift Types', single: 'Shift Type', titleField: 'name',
    list: ['name', 'start_time', 'end_time', { field: 'enable_auto_attendance', label: 'Auto attendance' }, 'holiday_list'],
    columns: ['name', 'start_time', 'end_time', 'enable_auto_attendance', 'holiday_list', 'late_entry_grace_period', 'early_exit_grace_period'], // up to 8 shown by default; the rest via “Columns”
    search: ['name'],
    sort: 'start_time asc',
    sections: [
      // Shift Type is named by hand (autoname: Prompt) → sent as __newname on create.
      { title: 'Shift', fields: [{ field: '__newname', type: 'Data', label: 'Shift name', reqd: true, onlyNew: true, placeholder: 'e.g. General 9–6', when: (d) => !d.creation }, 'start_time', 'end_time', 'holiday_list', 'color'] },
      {
        title: 'Auto attendance from check-ins', fields: [
          'enable_auto_attendance',
          ...['determine_check_in_and_check_out', 'working_hours_calculation_based_on', 'begin_check_in_before_shift_start_time',
            'allow_check_out_after_shift_end_time', 'working_hours_threshold_for_half_day', 'working_hours_threshold_for_absent',
            'process_attendance_after', 'last_sync_of_checkin', 'mark_auto_attendance_on_holidays',
          ].map((f) => ({ field: f, when: (d) => Boolean(Number(d.enable_auto_attendance)) })),
        ],
      },
      {
        title: 'Late entry & early exit', fields: [
          'enable_late_entry_marking', { field: 'late_entry_grace_period', when: (d) => Boolean(Number(d.enable_late_entry_marking)) },
          'enable_early_exit_marking', { field: 'early_exit_grace_period', when: (d) => Boolean(Number(d.enable_early_exit_marking)) },
        ],
      },
    ],
    docActions: [
      {
        label: 'Mark attendance now', icon: PlayCircle, success: 'Attendance processed from check-ins',
        when: (doc, boot) => boot.is_hr && Boolean(Number(doc.enable_auto_attendance)),
        run: async ({ doc, call, mutate }) => {
          await call.post('karya_erp.shifts.process_now', { shift_type: doc.name })
          await mutate()
        },
      },
    ],
    defaults: () => ({ start_time: '09:00:00', end_time: '18:00:00' }),
  },
  'shift-assignments': {
    doctype: 'Shift Assignment', title: 'Shift Assignments', single: 'Shift Assignment', titleField: 'employee_name',
    list: ['employee_name', 'shift_type', 'start_date', 'end_date', 'status'],
    columns: ['employee_name', 'shift_type', 'start_date', 'end_date', 'status', 'department', 'company'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [['docstatus', '<', 2]] },
      { label: 'Active', filters: [['status', '=', 'Active'], ['docstatus', '=', 1]] },
      { label: 'Inactive', filters: [['status', '=', 'Inactive'], ['docstatus', '=', 1]] },
      { label: 'Draft', filters: [['docstatus', '=', 0]] },
      { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
    ],
    search: ['name', 'employee_name', 'employee', 'shift_type'],
    sort: 'start_date desc',
    sections: [
      { title: 'Assignment', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'shift_type', 'start_date', 'end_date', 'status', 'company', 'shift_location'] },
    ],
    defaults: (boot) => ({ company: boot.company, start_date: today(), status: 'Active' }),
  },
  'shift-requests': {
    doctype: 'Shift Request', title: 'Shift Requests', single: 'Shift Request', titleField: 'employee_name',
    list: ['employee_name', 'shift_type', 'from_date', 'to_date', 'status'],
    columns: ['employee_name', 'shift_type', 'from_date', 'to_date', 'status', 'approver', 'department'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [['docstatus', '<', 2]] },
      { label: 'Draft', filters: [['status', '=', 'Draft'], ['docstatus', '=', 0]] },
      { label: 'Approved', filters: [['status', '=', 'Approved'], ['docstatus', '=', 1]] },
      { label: 'Rejected', filters: [['status', '=', 'Rejected']] },
      { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
    ],
    search: ['name', 'employee_name', 'employee'],
    sort: 'from_date desc',
    sections: [
      { title: 'Request', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'shift_type', 'from_date', 'to_date', 'company'] },
      { title: 'Approval', fields: ['approver', 'status'] },
    ],
    defaults: (boot) => ({ company: boot.company, from_date: today(), status: 'Draft' }),
  },

  'leave-applications': {
    doctype: 'Leave Application', title: 'Leave Applications', single: 'Leave Application', titleField: 'employee_name',
    list: ['employee_name', 'leave_type', 'from_date', 'to_date', 'total_leave_days', 'status'],
    columns: ['employee_name', 'leave_type', 'from_date', 'to_date', 'total_leave_days', 'status', 'leave_approver_name', 'department'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Open', filters: [['status', '=', 'Open'], ['docstatus', '=', 0]] },
      { label: 'Approved', filters: [['status', '=', 'Approved'], ['docstatus', '=', 1]] },
      { label: 'Rejected', filters: [['status', '=', 'Rejected']] },
      { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
    ],
    search: ['name', 'employee_name', 'employee', 'leave_type'],
    sort: 'from_date desc',
    sections: [
      { title: 'Leave', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'leave_type', 'from_date', 'to_date', 'half_day', { field: 'half_day_date', when: (d) => Boolean(Number(d.half_day)) && d.from_date !== d.to_date }, { field: 'total_leave_days', readOnly: true }, { field: 'leave_balance', readOnly: true }, 'description'] },
      { title: 'Approval', fields: ['leave_approver', { field: 'leave_approver_name', readOnly: true }, 'status', 'posting_date', 'company'] },
    ],
    docActions: [
      ...[['Approve', Check, 'accent'], ['Reject', XIcon, 'danger']].map(([action, icon, variant]) => ({
        label: action, icon, variant,
        when: (doc, boot) => doc.status === 'Open' && Number(doc.docstatus) === 0 && doc.employee !== boot.employee && (boot.is_hr || doc.leave_approver === boot.user),
        run: async ({ doc, call, mutate, toast }) => {
          const reason = action === 'Reject' ? await promptText({ title: 'Reject', message: 'Why is it rejected?', label: 'Reason (sent to the employee)', confirmLabel: 'Reject' }) : null
          if (action === 'Reject' && reason === null) return
          await call.post('karya_erp.leave.decide', { name: doc.name, action, reason: reason || undefined })
          await mutate()
          toast({ tone: 'success', title: action === 'Approve' ? 'Leave approved' : 'Leave rejected' })
        },
      })),
    ],
    defaults: (boot) => ({ company: boot.company, from_date: today(), to_date: today(), posting_date: today(), status: 'Open' }),
  },
  'leave-allocations': {
    doctype: 'Leave Allocation', title: 'Leave Allocations', single: 'Leave Allocation', titleField: 'employee_name',
    list: ['employee_name', 'leave_type', 'from_date', 'to_date', 'total_leaves_allocated', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['employee_name', 'leave_type', 'from_date', 'to_date', 'new_leaves_allocated', 'unused_leaves', 'total_leaves_allocated', 'department'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name', 'employee_name', 'employee', 'leave_type'],
    sort: 'from_date desc',
    sections: [
      { title: 'Allocation', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'leave_type', 'from_date', 'to_date', 'new_leaves_allocated', 'carry_forward', { field: 'unused_leaves', readOnly: true }, { field: 'total_leaves_allocated', readOnly: true }, 'description'] },
    ],
    defaults: () => {
      const y = new Date().getFullYear()
      return { from_date: `${y}-01-01`, to_date: `${y}-12-31` }
    },
  },
  'leave-types': {
    doctype: 'Leave Type', title: 'Leave Types', single: 'Leave Type', titleField: 'leave_type_name',
    list: ['leave_type_name', 'max_leaves_allowed', { field: 'is_lwp', label: 'Unpaid' }, { field: 'is_carry_forward', label: 'Carry forward' }, { field: 'is_earned_leave', label: 'Earned' }],
    columns: ['leave_type_name', 'max_leaves_allowed', 'max_continuous_days_allowed', 'applicable_after', 'is_lwp', 'is_carry_forward', 'is_earned_leave', 'include_holiday'], // up to 8 shown by default; the rest via “Columns”
    search: ['name', 'leave_type_name'],
    sort: 'leave_type_name asc',
    sections: [
      { title: 'Leave type', fields: ['leave_type_name', 'max_leaves_allowed', 'applicable_after', 'max_continuous_days_allowed', 'include_holiday', 'is_optional_leave', 'allow_negative', 'allow_over_allocation'] },
      { title: 'Pay', fields: ['is_lwp', 'is_ppl', { field: 'fraction_of_daily_salary_per_leave', when: (d) => Boolean(Number(d.is_ppl)) }, 'is_compensatory'] },
      { title: 'Carry forward', fields: ['is_carry_forward', { field: 'maximum_carry_forwarded_leaves', when: (d) => Boolean(Number(d.is_carry_forward)) }, { field: 'expire_carry_forwarded_leaves_after_days', when: (d) => Boolean(Number(d.is_carry_forward)) }] },
      { title: 'Earned leave', fields: ['is_earned_leave', ...['earned_leave_frequency', 'allocate_on_day', 'rounding'].map((f) => ({ field: f, when: (d) => Boolean(Number(d.is_earned_leave)) }))], collapsed: true },
      { title: 'Encashment', fields: ['allow_encashment', ...['max_encashable_leaves', 'non_encashable_leaves', 'earning_component'].map((f) => ({ field: f, when: (d) => Boolean(Number(d.allow_encashment)) }))], collapsed: true },
    ],
  },
  'leave-periods': {
    doctype: 'Leave Period', title: 'Leave Periods', single: 'Leave Period', titleField: 'name',
    list: ['name', 'from_date', 'to_date', 'company', { field: 'is_active', label: 'Active' }],
    search: ['name'],
    sort: 'from_date desc',
    sections: [{ title: 'Leave period', fields: ['from_date', 'to_date', 'is_active', 'company', 'optional_holiday_list'] }],
    defaults: (boot) => {
      const y = new Date().getFullYear()
      return { from_date: `${y}-01-01`, to_date: `${y}-12-31`, is_active: 1, company: boot.company }
    },
  },
  'attendance-requests': {
    doctype: 'Attendance Request', title: 'Attendance Requests', single: 'Attendance Request', titleField: 'employee_name',
    list: ['employee_name', 'reason', 'from_date', 'to_date', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['employee_name', 'reason', 'from_date', 'to_date', 'half_day', 'department'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name', 'employee_name', 'employee'],
    sort: 'from_date desc',
    sections: [
      { title: 'Request', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'reason', 'from_date', 'to_date', 'half_day', { field: 'half_day_date', when: (d) => Boolean(Number(d.half_day)) }, 'include_holidays', 'explanation', 'company'] },
    ],
    defaults: (boot) => ({ company: boot.company, from_date: today(), to_date: today(), reason: 'Work From Home' }),
  },

  /* ---------------- Payroll & expenses (Frappe HR) ---------------- */
  'salary-components': {
    doctype: 'Salary Component', title: 'Salary Components', single: 'Salary Component', titleField: 'salary_component', statusFromDisabled: true,
    list: ['salary_component', 'salary_component_abbr', 'type', { field: 'depends_on_payment_days', label: 'Pro-rated' }, { field: 'disabled', type: 'Active' }],
    columns: ['salary_component', 'salary_component_abbr', 'type', 'depends_on_payment_days', 'is_tax_applicable', 'amount_based_on_formula', 'formula', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Earnings', filters: [['type', '=', 'Earning']] },
      { label: 'Deductions', filters: [['type', '=', 'Deduction']] },
    ],
    search: ['name', 'salary_component', 'salary_component_abbr'],
    sort: 'type asc',
    sections: [
      { title: 'Component', fields: ['salary_component', 'salary_component_abbr', 'type', 'description', 'disabled'] },
      { title: 'Calculation', fields: ['depends_on_payment_days', 'is_tax_applicable', 'round_to_the_nearest_integer', 'do_not_include_in_total', 'statistical_component', 'amount_based_on_formula', { field: 'formula', when: (d) => Boolean(Number(d.amount_based_on_formula)) }, { field: 'amount', when: (d) => !Number(d.amount_based_on_formula) }, 'condition'] },
    ],
    tables: [
      { field: 'accounts', title: 'Account per company', columns: [{ field: 'company', reqd: true }, { field: 'account', filters: (row) => ({ is_group: 0, ...(row.company ? { company: row.company } : {}) }) }], newRow: () => ({}) },
    ],
    defaults: (boot) => ({ type: 'Earning', depends_on_payment_days: 0, accounts: boot.company ? [{ company: boot.company }] : [] }),
  },
  'salary-structures': {
    doctype: 'Salary Structure', title: 'Salary Structures', single: 'Salary Structure', titleField: 'name',
    list: ['name', 'company', 'payroll_frequency', 'is_active', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['name', 'company', 'payroll_frequency', 'currency', 'is_active', 'total_earning', 'net_pay', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name'],
    sections: [
      // Named by hand (autoname: Prompt).
      { title: 'Structure', fields: [{ field: '__newname', type: 'Data', label: 'Structure name', reqd: true, onlyNew: true, placeholder: 'e.g. UAE Standard', when: (d) => !d.creation }, 'company', 'payroll_frequency', 'currency', 'is_active', 'leave_encashment_amount_per_day', 'max_benefits'] },
    ],
    tables: [
      {
        field: 'earnings', title: 'Earnings  ·  formulas can use base, payment_days, total_working_days (UAE: base * share * (30 - (total_working_days - payment_days)) / 30)',
        columns: [{ field: 'salary_component', reqd: true, filters: { type: 'Earning' } }, { field: 'abbr', readOnly: true }, 'amount_based_on_formula', 'formula', 'amount', 'depends_on_payment_days'],
        newRow: () => ({ amount_based_on_formula: 1, depends_on_payment_days: 0 }),
      },
      {
        field: 'deductions', title: 'Deductions',
        columns: [{ field: 'salary_component', reqd: true, filters: { type: 'Deduction' } }, { field: 'abbr', readOnly: true }, 'amount_based_on_formula', 'formula', 'amount', 'depends_on_payment_days'],
        newRow: () => ({ amount_based_on_formula: 1, depends_on_payment_days: 0 }),
      },
    ],
    defaults: (boot) => ({ company: boot.company, payroll_frequency: 'Monthly', currency: boot.currency, is_active: 'Yes' }),
  },
  'salary-assignments': {
    doctype: 'Salary Structure Assignment', title: 'Salary Assignments', single: 'Salary Assignment', titleField: 'employee_name',
    list: ['employee_name', 'salary_structure', 'from_date', 'base', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['employee_name', 'salary_structure', 'from_date', 'base', 'variable', 'department', 'currency', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name', 'employee_name', 'employee', 'salary_structure'],
    sort: 'from_date desc',
    sections: [
      { title: 'Assignment', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, { field: 'salary_structure', filters: (d) => ({ docstatus: 1, is_active: 'Yes', ...(d.company ? { company: d.company } : {}) }) }, 'from_date', { field: 'base', label: 'Monthly package (base)' }, 'variable', 'company', 'currency', 'payroll_payable_account'] },
    ],
    defaults: (boot) => ({ company: boot.company, currency: boot.currency, from_date: today() }),
  },
  'payroll-runs': {
    doctype: 'Payroll Entry', title: 'Payroll Runs', single: 'Payroll Run', titleField: 'name',
    list: ['name', 'start_date', 'end_date', 'number_of_employees', { field: 'salary_slips_submitted', label: 'Slips submitted' }, { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['name', 'start_date', 'end_date', 'posting_date', 'number_of_employees', 'department', 'branch', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name'],
    sort: 'start_date desc',
    sections: [
      { title: 'Period', fields: ['company', 'posting_date', 'payroll_frequency', 'start_date', 'end_date', 'currency', 'exchange_rate'] },
      { title: 'Employees (optional filters)', fields: ['branch', 'department', 'designation', 'number_of_employees', 'validate_attendance'] },
      { title: 'Accounting & payment', fields: ['payroll_payable_account', 'cost_center', { field: 'payment_account', filters: (d) => ({ is_group: 0, account_type: ['in', ['Bank', 'Cash']], ...(d.company ? { company: d.company } : {}) }) }, 'bank_account'] },
    ],
    tables: [
      { field: 'employees', title: 'Employees in this run', columns: [{ field: 'employee', readOnly: true }, { field: 'employee_name', readOnly: true }, { field: 'department', readOnly: true }, { field: 'designation', readOnly: true }], addRows: false, empty: 'Save, then use “Get employees”.' },
    ],
    related: [
      { slug: 'salary-slips', field: 'payroll_entry', title: 'Salary slips', columns: ['employee_name', 'payment_days', 'gross_pay', 'total_deduction', 'net_pay', 'status'], orderBy: { field: 'employee_name', order: 'asc' }, empty: 'Submit the run to create salary slips.' },
    ],
    docActions: [
      {
        label: 'Get employees', icon: UsersIcon, when: (doc, boot) => boot.is_hr && Number(doc.docstatus) === 0,
        run: async ({ doc, call, mutate, toast }) => {
          const res = await call.post('karya_erp.payroll.run_action', { name: doc.name, action: 'get_employees' })
          await mutate()
          toast({ tone: 'success', title: `${res?.message?.employees ?? 0} employees added`, description: 'Check the list, then Submit to create salary slips.' })
        },
      },
      {
        label: 'Create salary slips', icon: FileCheck2, success: 'Salary slips created',
        when: (doc, boot) => boot.is_hr && Number(doc.docstatus) === 1 && !Number(doc.salary_slips_created),
        run: async ({ doc, call, mutate }) => { await call.post('karya_erp.payroll.run_action', { name: doc.name, action: 'create_slips' }); await mutate() },
      },
      {
        label: 'Submit salary slips', icon: FileCheck2, variant: 'accent', success: 'Salary slips submitted and accrual posted',
        when: (doc, boot) => boot.is_hr && Number(doc.docstatus) === 1 && Number(doc.salary_slips_created) && !Number(doc.salary_slips_submitted),
        run: async ({ doc, call, mutate }) => {
          if (!(await confirm({ title: 'Submit all salary slips?', message: 'Submit all salary slips of this run? This posts the payroll accrual.', confirmLabel: 'Submit slips' }))) return
          await call.post('karya_erp.payroll.run_action', { name: doc.name, action: 'submit_slips' }); await mutate()
        },
      },
      {
        label: 'WPS file', icon: FileDown,
        when: (doc, boot) => boot.is_hr && Number(doc.docstatus) === 1 && Number(doc.salary_slips_submitted),
        run: async ({ doc, call, toast }) => {
          const res = await call.get('karya_erp.payroll.wps_file', { payroll_entry: doc.name })
          const f = res?.message
          if (!f) return
          if (f.records > 0) {
            const url = URL.createObjectURL(new Blob([f.content], { type: 'text/plain' }))
            Object.assign(document.createElement('a'), { href: url, download: f.filename }).click()
            URL.revokeObjectURL(url)
          }
          const missing = f.problems ?? []
          toast({
            tone: missing.length ? 'error' : 'success',
            title: `${f.filename}: ${f.records} employee${f.records === 1 ? '' : 's'}${missing.length ? `, ${missing.length} left out` : ''}`,
            description: missing.slice(0, 4).map((p) => `${p.employee_name}: ${p.issues.join(', ')}`).join(' · ') || undefined,
          })
        },
      },
      {
        label: 'Make bank entry', icon: BanknoteIcon,
        when: (doc, boot) => boot.is_hr && Number(doc.docstatus) === 1 && Number(doc.salary_slips_submitted),
        run: async ({ doc, call, mutate, toast, navigate }) => {
          const res = await call.post('karya_erp.payroll.run_action', { name: doc.name, action: 'bank_entry' })
          await mutate()
          const je = res?.message?.journal_entry
          toast({ tone: 'success', title: 'Bank entry created', description: je || 'Open Journal Entries to submit it.' })
          if (je) navigate(`/journal-entries/${encodeURIComponent(je)}`)
        },
      },
    ],
    defaults: (boot) => {
      const d = new Date()
      const iso = (x) => x.toLocaleDateString('en-CA')
      return {
        company: boot.company, currency: boot.currency, exchange_rate: 1, payroll_frequency: 'Monthly', posting_date: today(),
        start_date: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end_date: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
        cost_center: boot.cost_center,
      }
    },
  },
  'salary-slips': {
    doctype: 'Salary Slip', title: 'Salary Slips', single: 'Salary Slip', titleField: 'employee_name',
    list: ['employee_name', 'start_date', 'payment_days', 'gross_pay', 'net_pay', 'status'],
    columns: ['employee_name', 'start_date', 'end_date', 'payment_days', 'gross_pay', 'total_deduction', 'net_pay', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Submitted', 'Withheld', 'Cancelled'),
    search: ['name', 'employee_name', 'employee'],
    sort: 'start_date desc',
    sections: [
      { title: 'Slip', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'posting_date', 'start_date', 'end_date', 'salary_structure', 'payroll_entry', 'company', 'currency'] },
      { title: 'Days', fields: [{ field: 'total_working_days', readOnly: true }, { field: 'payment_days', readOnly: true }, { field: 'leave_without_pay', readOnly: true }, { field: 'absent_days', readOnly: true }] },
      { title: 'Totals', fields: [{ field: 'gross_pay', readOnly: true }, { field: 'total_deduction', readOnly: true }, { field: 'net_pay', readOnly: true }, { field: 'rounded_total', readOnly: true }] },
    ],
    tables: [
      { field: 'earnings', title: 'Earnings', columns: [{ field: 'salary_component', reqd: true }, 'amount'], newRow: () => ({}) },
      { field: 'deductions', title: 'Deductions', columns: [{ field: 'salary_component', reqd: true }, 'amount'], newRow: () => ({}) },
    ],
    defaults: (boot) => ({ company: boot.company, posting_date: today() }),
  },
  'additional-salary': {
    doctype: 'Additional Salary', title: 'Additional Salary', single: 'Additional Salary', titleField: 'employee_name',
    list: ['employee_name', 'salary_component', 'amount', 'payroll_date', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['employee_name', 'salary_component', 'type', 'amount', 'payroll_date', 'is_recurring', 'department', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name', 'employee_name', 'employee', 'salary_component'],
    sort: 'payroll_date desc',
    sections: [
      { title: 'Bonus / deduction', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'salary_component', { field: 'type', readOnly: true }, 'amount', 'payroll_date', 'overwrite_salary_structure_amount', 'company', 'currency'] },
      { title: 'Recurring', fields: ['is_recurring', { field: 'from_date', when: (d) => Boolean(Number(d.is_recurring)) }, { field: 'to_date', when: (d) => Boolean(Number(d.is_recurring)) }], collapsed: true },
    ],
    defaults: (boot) => ({ company: boot.company, currency: boot.currency, payroll_date: today(), overwrite_salary_structure_amount: 1 }),
  },
  'expense-claims': {
    doctype: 'Expense Claim', title: 'Expense Claims', single: 'Expense Claim', titleField: 'employee_name',
    list: ['employee_name', 'posting_date', 'total_claimed_amount', 'total_sanctioned_amount', 'approval_status', 'status'],
    columns: ['employee_name', 'posting_date', 'total_claimed_amount', 'total_sanctioned_amount', 'approval_status', 'status', 'expense_approver', 'department'], // up to 8 shown by default; the rest via “Columns”
    tabs: [
      { label: 'All', filters: [] },
      { label: 'To approve', filters: [['approval_status', '=', 'Draft'], ['docstatus', '=', 0]] },
      { label: 'Unpaid', filters: [['status', '=', 'Unpaid'], ['docstatus', '=', 1]] },
      { label: 'Paid', filters: [['status', '=', 'Paid']] },
      { label: 'Rejected', filters: [['approval_status', '=', 'Rejected']] },
      { label: 'Cancelled', filters: [['docstatus', '=', 2]] },
    ],
    search: ['name', 'employee_name', 'employee'],
    sort: 'posting_date desc',
    sections: [
      { title: 'Claim', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'posting_date', 'expense_approver', 'approval_status', 'company', 'remark'] },
      { title: 'Accounting', fields: ['payable_account', 'cost_center', { field: 'total_claimed_amount', readOnly: true }, { field: 'total_sanctioned_amount', readOnly: true }, { field: 'total_amount_reimbursed', readOnly: true }], collapsed: true },
    ],
    tables: [
      {
        field: 'expenses', title: 'Expenses',
        columns: [{ field: 'expense_date', reqd: true }, { field: 'expense_type', reqd: true }, 'description', { field: 'amount', reqd: true }, 'sanctioned_amount'],
        newRow: () => ({ expense_date: today() }), sum: ['amount', 'sanctioned_amount'],
      },
    ],
    docActions: [
      ...[['Approve', Check, 'accent'], ['Reject', XIcon, 'danger']].map(([action, icon, variant]) => ({
        label: action, icon, variant,
        when: (doc, boot) => doc.approval_status === 'Draft' && Number(doc.docstatus) === 0 && doc.employee !== boot.employee && (boot.is_hr || doc.expense_approver === boot.user),
        run: async ({ doc, call, mutate, toast }) => {
          const reason = action === 'Reject' ? await promptText({ title: 'Reject', message: 'Why is it rejected?', label: 'Reason (sent to the employee)', confirmLabel: 'Reject' }) : null
          if (action === 'Reject' && reason === null) return
          await call.post('karya_erp.expenses.decide', { name: doc.name, action, reason: reason || undefined })
          await mutate()
          toast({ tone: 'success', title: action === 'Approve' ? 'Claim approved' : 'Claim rejected' })
        },
      })),
    ],
    make: [
      {
        label: 'Payment', method: 'hrms.overrides.employee_payment_entry.get_payment_entry_for_employee',
        args: (doc) => ({ dt: 'Expense Claim', dn: doc.name }), target: 'payments',
        when: (doc) => Number(doc.docstatus) === 1 && doc.approval_status === 'Approved' && doc.status !== 'Paid',
      },
    ],
    defaults: (boot) => ({ company: boot.company, posting_date: today(), approval_status: 'Draft', expenses: [{ expense_date: today() }] }),
  },
  'employee-advances': {
    doctype: 'Employee Advance', title: 'Employee Advances', single: 'Employee Advance', titleField: 'employee_name',
    list: ['employee_name', 'purpose', 'posting_date', 'advance_amount', 'paid_amount', 'status'],
    columns: ['employee_name', 'purpose', 'posting_date', 'advance_amount', 'paid_amount', 'claimed_amount', 'return_amount', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Draft', 'Unpaid', 'Paid', 'Claimed', 'Returned', 'Partly Claimed and Returned', 'Cancelled'),
    search: ['name', 'employee_name', 'employee', 'purpose'],
    sort: 'posting_date desc',
    sections: [
      { title: 'Advance', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'purpose', 'advance_amount', 'posting_date', 'company', 'currency'] },
      { title: 'Accounting', fields: ['advance_account', 'mode_of_payment', 'repay_unclaimed_amount_from_salary', { field: 'paid_amount', readOnly: true }, { field: 'claimed_amount', readOnly: true }, { field: 'return_amount', readOnly: true }] },
    ],
    make: [
      {
        label: 'Payment', method: 'hrms.overrides.employee_payment_entry.get_payment_entry_for_employee',
        args: (doc) => ({ dt: 'Employee Advance', dn: doc.name }), target: 'payments',
        when: (doc) => Number(doc.docstatus) === 1 && Number(doc.paid_amount) < Number(doc.advance_amount),
      },
    ],
    defaults: (boot) => ({ company: boot.company, currency: boot.currency, exchange_rate: 1, posting_date: today() }),
  },
  'expense-claim-types': {
    doctype: 'Expense Claim Type', title: 'Expense Claim Types', single: 'Expense Claim Type', titleField: 'expense_type',
    list: ['expense_type', 'description'],
    search: ['name', 'expense_type'],
    sort: 'expense_type asc',
    sections: [{ title: 'Expense type', fields: ['expense_type', 'description'] }],
    tables: [
      { field: 'accounts', title: 'Expense account per company', columns: [{ field: 'company', reqd: true }, { field: 'default_account', filters: (row) => ({ is_group: 0, root_type: 'Expense', ...(row.company ? { company: row.company } : {}) }) }], newRow: () => ({}) },
    ],
    defaults: (boot) => ({ accounts: boot.company ? [{ company: boot.company }] : [] }),
  },

  'wps-settings': {
    doctype: 'Karya Erp WPS Settings', title: 'Karya Erp WPS Settings', single: 'Karya Erp WPS Settings', titleField: 'company',
    list: ['company', 'employer_id', 'employer_bank_routing_code'],
    search: ['name', 'company'],
    sections: [
      { title: 'Employer', fields: ['company', 'employer_id', 'employer_bank_routing_code', 'employer_reference'] },
    ],
    tables: [
      {
        field: 'bank_routing', title: 'Employee banks — routing code per bank name (as typed on Employee → Bank Name)',
        columns: [{ field: 'bank_name', reqd: true }, { field: 'routing_code', reqd: true }], newRow: () => ({}),
        empty: 'Add each bank your employees are paid into, with its 9-digit routing code.',
      },
    ],
    defaults: (boot) => ({ company: boot.company }),
  },

  /* ---------------- Performance (Frappe HR) ---------------- */
  'appraisal-cycles': {
    doctype: 'Appraisal Cycle', title: 'Appraisal Cycles', single: 'Appraisal Cycle', titleField: 'cycle_name',
    list: ['cycle_name', 'start_date', 'end_date', 'kra_evaluation_method', 'status'],
    tabs: statusTabs('Not Started', 'In Progress', 'Completed'),
    search: ['name', 'cycle_name'],
    sort: 'start_date desc',
    sections: [
      { title: 'Cycle', fields: ['cycle_name', 'company', 'start_date', 'end_date', 'kra_evaluation_method', { field: 'status', readOnly: true }, 'description'] },
      { title: 'Who is appraised (filters)', fields: ['branch', 'department', 'designation'], collapsed: true },
    ],
    tables: [
      { field: 'appraisees', title: 'Appraisees', columns: [{ field: 'employee', reqd: true }, { field: 'employee_name', readOnly: true }, 'appraisal_template', { field: 'department', readOnly: true }], newRow: () => ({}), empty: 'Save, then use “Get employees”. Each needs an appraisal template.' },
    ],
    docActions: [
      {
        label: 'Get employees', icon: UsersIcon, when: (doc, boot) => boot.is_hr && doc.status !== 'Completed',
        run: async ({ doc, call, mutate, toast }) => {
          const res = await call.post('karya_erp.performance.cycle_action', { cycle: doc.name, action: 'get_employees' })
          await mutate()
          toast({ tone: 'success', title: `${res?.message?.appraisees ?? 0} employees in this cycle`, description: 'Check each has an appraisal template, then Start cycle.' })
        },
      },
      {
        label: 'Start cycle', icon: Sparkles, variant: 'accent', success: 'Appraisals created — employees can start their self-appraisal',
        when: (doc, boot) => boot.is_hr && doc.status === 'Not Started',
        run: async ({ doc, call, mutate }) => { await call.post('karya_erp.performance.cycle_action', { cycle: doc.name, action: 'create_appraisals' }); await mutate() },
      },
      {
        label: 'Complete cycle', icon: Flag, success: 'Cycle completed',
        when: (doc, boot) => boot.is_hr && doc.status === 'In Progress',
        run: async ({ doc, call, mutate }) => {
          if (!(await confirm({ title: 'Complete this cycle?', message: 'Complete this cycle? Appraisals can no longer be changed.', confirmLabel: 'Complete cycle' }))) return
          await call.post('karya_erp.performance.cycle_action', { cycle: doc.name, action: 'complete' }); await mutate()
        },
      },
    ],
    defaults: (boot) => {
      const y = new Date().getFullYear()
      return { cycle_name: `Annual Review ${y}`, company: boot.company, start_date: `${y}-01-01`, end_date: `${y}-12-31` }
    },
  },
  appraisals: {
    doctype: 'Appraisal', title: 'Appraisals', single: 'Appraisal', titleField: 'employee_name',
    list: ['employee_name', 'appraisal_cycle', 'self_score', 'avg_feedback_score', 'final_score', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['employee_name', 'appraisal_cycle', 'appraisal_template', 'department', 'self_score', 'avg_feedback_score', 'total_score', 'final_score'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name', 'employee_name', 'employee', 'appraisal_cycle'],
    sort: 'creation desc',
    sections: [
      { title: 'Appraisal', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'appraisal_cycle', 'appraisal_template', 'rate_goals_manually'] },
      { title: 'Scores (1–5)', fields: [{ field: 'total_score', readOnly: true }, { field: 'self_score', readOnly: true }, { field: 'avg_feedback_score', readOnly: true }, { field: 'final_score', readOnly: true }] },
      { title: 'Reflections', fields: ['reflections'] },
    ],
    tables: [
      { field: 'goals', title: 'KRA scores (0–5, manual rating)', when: (d) => Boolean(Number(d.rate_goals_manually)), columns: [{ field: 'kra', readOnly: true }, { field: 'per_weightage', readOnly: true }, 'score', { field: 'score_earned', readOnly: true }], addRows: false },
      { field: 'appraisal_kra', title: 'KRAs (from goal progress)', when: (d) => !Number(d.rate_goals_manually), columns: [{ field: 'kra', readOnly: true }, { field: 'per_weightage', readOnly: true }, { field: 'goal_completion', readOnly: true }, { field: 'goal_score', readOnly: true }], addRows: false },
      { field: 'self_ratings', title: 'Self ratings', columns: [{ field: 'criteria', readOnly: true }, { field: 'per_weightage', readOnly: true }, 'rating'], addRows: false },
    ],
    related: [
      { slug: 'performance-feedback', field: 'appraisal', title: 'Feedback', columns: ['reviewer_name', 'total_score', 'docstatus'], empty: 'No feedback yet.' },
    ],
  },
  'appraisal-templates': {
    doctype: 'Appraisal Template', title: 'Appraisal Templates', single: 'Appraisal Template', titleField: 'template_title',
    list: ['template_title', 'description'],
    search: ['name', 'template_title'],
    sections: [{ title: 'Template', fields: ['template_title', 'description'] }],
    tables: [
      { field: 'goals', title: 'KRAs (weights must total 100%)', columns: [{ field: 'key_result_area', reqd: true }, { field: 'per_weightage', reqd: true }], newRow: () => ({}), sum: ['per_weightage'] },
      { field: 'rating_criteria', title: 'Rating criteria — rated 1–5 by the employee and manager (weights total 100%)', columns: [{ field: 'criteria', reqd: true }, { field: 'per_weightage', reqd: true }], newRow: () => ({}), sum: ['per_weightage'] },
    ],
  },
  kras: {
    doctype: 'KRA', title: 'KRAs', single: 'KRA', titleField: 'title',
    list: ['title', 'description'],
    search: ['name', 'title'],
    sections: [{ title: 'Key result area', fields: ['title', 'description'] }],
  },
  'feedback-criteria': {
    doctype: 'Employee Feedback Criteria', title: 'Rating Criteria', single: 'Rating Criterion', titleField: 'criteria',
    list: ['criteria'],
    search: ['name', 'criteria'],
    sections: [{ title: 'Criterion', fields: ['criteria'] }],
  },
  goals: {
    doctype: 'Goal', title: 'Goals', single: 'Goal', titleField: 'goal_name',
    list: ['goal_name', 'employee_name', 'kra', 'progress', 'end_date', 'status'],
    columns: ['goal_name', 'employee_name', 'appraisal_cycle', 'kra', 'progress', 'start_date', 'end_date', 'status'], // up to 8 shown by default; the rest via “Columns”
    tabs: statusTabs('Pending', 'In Progress', 'Completed', 'Archived', 'Closed'),
    search: ['name', 'goal_name', 'employee_name'],
    sort: 'end_date asc',
    sections: [
      { title: 'Goal', fields: ['goal_name', { field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'appraisal_cycle', 'kra', 'is_group', 'parent_goal', 'progress', 'status', 'start_date', 'end_date', 'description'] },
    ],
    defaults: () => ({ start_date: today(), progress: 0 }),
  },
  'performance-feedback': {
    doctype: 'Employee Performance Feedback', title: 'Performance Feedback', single: 'Feedback', titleField: 'employee_name',
    list: ['employee_name', 'reviewer_name', 'appraisal_cycle', 'total_score', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    tabs: docstatusTabs,
    search: ['name', 'employee_name', 'reviewer_name'],
    sort: 'creation desc',
    sections: [
      { title: 'Feedback', fields: [{ field: 'employee', filters: { status: 'Active' } }, { field: 'employee_name', readOnly: true }, 'reviewer', { field: 'reviewer_name', readOnly: true }, 'appraisal', 'appraisal_cycle', { field: 'total_score', readOnly: true }, 'feedback'] },
    ],
    tables: [
      { field: 'feedback_ratings', title: 'Ratings', columns: [{ field: 'criteria', readOnly: true }, { field: 'per_weightage', readOnly: true }, 'rating'], addRows: false },
    ],
  },

  /* ---------------- Banking & closing ---------------- */
  'bank-accounts': {
    doctype: 'Bank Account', title: 'Bank Accounts', single: 'Bank Account', titleField: 'account_name', statusFromDisabled: true,
    list: ['account_name', 'bank', 'account', 'iban', { field: 'is_default', label: 'Default' }, { field: 'disabled', type: 'Active' }],
    tabs: [
      { label: 'Company', filters: [['is_company_account', '=', 1]] },
      { label: 'Parties', filters: [['is_company_account', '=', 0]] },
      { label: 'All', filters: [] },
    ],
    search: ['name', 'account_name', 'iban', 'bank_account_no'],
    sections: [
      { title: 'Bank account', fields: ['account_name', 'bank', 'is_company_account', 'company', { field: 'account', label: 'Ledger account', filters: (d) => ({ account_type: ['in', ['Bank', 'Cash']], is_group: 0, ...(d.company ? { company: d.company } : {}) }) }, 'is_default', 'disabled'] },
      { title: 'Numbers', fields: ['iban', 'bank_account_no', 'branch_code', 'account_type'] },
      { title: 'Belongs to (party accounts)', fields: ['party_type', 'party'], collapsed: true },
    ],
    defaults: (boot) => ({ is_company_account: 1, company: boot.company }),
  },
  banks: {
    doctype: 'Bank', title: 'Banks', single: 'Bank', titleField: 'bank_name',
    list: ['bank_name', 'swift_number', 'website'],
    search: ['name', 'bank_name', 'swift_number'],
    sections: [{ title: 'Bank', fields: ['bank_name', 'swift_number', 'website'] }],
  },
  'period-closing': {
    doctype: 'Period Closing Voucher', title: 'Period Closing', single: 'Period Closing Voucher', titleField: 'name',
    list: ['name', 'fiscal_year', 'period_end_date', 'closing_account_head', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    tabs: docstatusTabs,
    search: ['name', 'fiscal_year'],
    sort: 'period_end_date desc',
    sections: [
      { title: 'Close the year', fields: ['company', 'fiscal_year', 'period_start_date', 'period_end_date', 'transaction_date', { field: 'closing_account_head', label: 'Move profit / loss to (retained earnings)', filters: (d) => ({ root_type: ['in', ['Liability', 'Equity']], is_group: 0, ...(d.company ? { company: d.company } : {}) }) }, 'remarks'] },
    ],
    defaults: (boot) => ({ company: boot.company, transaction_date: today(), remarks: 'Year-end closing' }),
  },
  budgets: {
    doctype: 'Budget', title: 'Budgets', single: 'Budget', titleField: 'account',
    list: ['account', 'cost_center', 'from_fiscal_year', 'budget_amount', 'action_if_annual_budget_exceeded', { field: 'docstatus', type: 'DocStatus', label: 'Status' }],
    columns: ['account', 'budget_against', 'cost_center', 'project', 'from_fiscal_year', 'to_fiscal_year', 'budget_amount', 'docstatus'], // up to 8 shown by default; the rest via “Columns”
    tabs: docstatusTabs,
    search: ['name', 'account', 'cost_center'],
    sections: [
      { title: 'Budget', fields: ['company', 'budget_against', { field: 'cost_center', when: (d) => d.budget_against !== 'Project', filters: (d) => ({ is_group: 0, ...(d.company ? { company: d.company } : {}) }) }, { field: 'project', when: (d) => d.budget_against === 'Project' }, { field: 'account', filters: (d) => ({ root_type: 'Expense', is_group: 0, ...(d.company ? { company: d.company } : {}) }) }, 'budget_amount', 'from_fiscal_year', 'to_fiscal_year', 'distribution_frequency', 'distribute_equally'] },
      { title: 'When exceeded', fields: ['applicable_on_booking_actual_expenses', 'action_if_annual_budget_exceeded', 'action_if_accumulated_monthly_budget_exceeded', 'applicable_on_purchase_order', 'action_if_annual_budget_exceeded_on_po', 'applicable_on_material_request', 'action_if_annual_budget_exceeded_on_mr'] },
    ],
    defaults: (boot) => ({ company: boot.company, budget_against: 'Cost Center', cost_center: boot.cost_center, distribution_frequency: 'Monthly', distribute_equally: 1, applicable_on_booking_actual_expenses: 1, action_if_annual_budget_exceeded: 'Warn', action_if_accumulated_monthly_budget_exceeded: 'Warn' }),
  },
  dunnings: {
    doctype: 'Dunning', title: 'Dunning', single: 'Dunning', titleField: 'customer_name',
    list: ['name', 'customer_name', 'posting_date', 'dunning_type', 'grand_total', 'status'],
    tabs: statusTabs('Draft', 'Unresolved', 'Resolved', 'Cancelled'),
    search: ['name', 'customer_name'],
    sort: 'posting_date desc',
    sections: [
      { title: 'Reminder', fields: [{ field: 'customer', readOnly: true }, { field: 'customer_name', readOnly: true }, 'posting_date', 'dunning_type', 'company', 'currency'] },
      { title: 'Charges', fields: ['rate_of_interest', { field: 'total_interest', readOnly: true }, 'dunning_fee', { field: 'total_outstanding', readOnly: true }, { field: 'grand_total', readOnly: true }, 'income_account', 'cost_center'] },
      { title: 'Letter', fields: ['body_text', 'closing_text'], collapsed: true },
    ],
    tables: [
      { field: 'overdue_payments', title: 'Overdue invoices', columns: [{ field: 'sales_invoice', readOnly: true }, { field: 'due_date', readOnly: true }, { field: 'overdue_days', readOnly: true }, { field: 'outstanding', readOnly: true }, { field: 'interest', readOnly: true }], addRows: false },
    ],
  },
  'dunning-types': {
    doctype: 'Dunning Type', title: 'Dunning Types', single: 'Dunning Type', titleField: 'dunning_type',
    list: ['dunning_type', 'company', 'dunning_fee', 'rate_of_interest', { field: 'is_default', label: 'Default' }],
    search: ['name', 'dunning_type'],
    sections: [{ title: 'Dunning type', fields: ['dunning_type', 'company', 'is_default', 'dunning_fee', 'rate_of_interest', 'income_account', 'cost_center'] }],
    defaults: (boot) => ({ company: boot.company, cost_center: boot.cost_center }),
  },

  /* ---------------- Accounts setup ---------------- */
  'payment-terms': {
    doctype: 'Payment Term', title: 'Payment Terms', single: 'Payment Term', titleField: 'payment_term_name', noStatus: true,
    list: ['payment_term_name', 'invoice_portion', 'due_date_based_on', 'credit_days', 'credit_months', 'mode_of_payment'],
    search: ['name', 'payment_term_name', 'description'],
    sort: 'payment_term_name asc',
    sections: [
      { title: 'Payment term', fields: ['payment_term_name', 'invoice_portion', 'mode_of_payment', 'due_date_based_on', 'credit_days', 'credit_months', 'description'] },
      { title: 'Early payment discount', collapsed: true, fields: ['discount_type', 'discount', 'discount_validity_based_on', 'discount_validity'] },
    ],
    defaults: () => ({ invoice_portion: 100, due_date_based_on: 'Day(s) after invoice date', credit_days: 30 }),
  },
  'payment-terms-templates': {
    doctype: 'Payment Terms Template', title: 'Payment Terms Templates', single: 'Payment Terms Template', titleField: 'template_name', noStatus: true,
    list: ['template_name', 'allocate_payment_based_on_payment_terms'],
    search: ['name', 'template_name'],
    sort: 'template_name asc',
    sections: [{ title: 'Template', fields: ['template_name', 'allocate_payment_based_on_payment_terms'] }],
    tables: [
      {
        field: 'terms', title: 'Terms (the portions must add up to 100%)', layout: 'cards', rowLabel: 'Term',
        columns: ['payment_term', { field: 'invoice_portion', reqd: true }, { field: 'due_date_based_on', reqd: true }, 'credit_days', 'credit_months', 'mode_of_payment', 'discount_type', 'discount', 'discount_validity_based_on', 'discount_validity'],
        newRow: () => ({ invoice_portion: 100, due_date_based_on: 'Day(s) after invoice date', credit_days: 30 }),
        sum: ['invoice_portion'],
      },
    ],
  },
  'finance-books': {
    doctype: 'Finance Book', title: 'Finance Books', single: 'Finance Book', titleField: 'finance_book_name', noStatus: true,
    list: ['finance_book_name'],
    search: ['name', 'finance_book_name'],
    sort: 'finance_book_name asc',
    sections: [{ title: 'Finance book', fields: ['finance_book_name'] }],
  },
  'chart-of-accounts': {
    doctype: 'Account', title: 'Chart of Accounts', single: 'Account', titleField: 'account_name', statusFromDisabled: true,
    listView: 'chart-of-accounts',
    list: ['account_name', 'account_number', 'parent_account', 'root_type', 'account_type', { field: 'disabled', type: 'Active' }],
    sections: [
      { title: 'Account', fields: ['account_name', 'account_number', { field: 'parent_account', reqd: true, filters: (d) => ({ is_group: 1, ...(d.company ? { company: d.company } : {}) }) }, 'company'] },
      { title: 'Type', fields: ['is_group', 'account_type', { field: 'root_type', readOnly: true }, { field: 'report_type', readOnly: true }, 'account_currency', 'freeze_account', 'disabled'] },
    ],
    defaults: (boot) => ({ company: boot.company }),
  },
  'cost-centers': {
    doctype: 'Cost Center', title: 'Cost Centers', single: 'Cost Center', titleField: 'cost_center_name', statusFromDisabled: true,
    list: ['cost_center_name', 'cost_center_number', 'parent_cost_center', 'company', { field: 'is_group', label: 'Group' }, { field: 'disabled', type: 'Active' }],
    columns: ['cost_center_name', 'cost_center_number', 'parent_cost_center', 'company', 'is_group', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'cost_center_name'],
    sections: [
      { title: 'Cost center', fields: ['cost_center_name', 'cost_center_number', { field: 'parent_cost_center', reqd: true, filters: (d) => ({ is_group: 1, ...(d.company ? { company: d.company } : {}) }) }, 'company', 'is_group', 'disabled'] },
    ],
    defaults: (boot) => ({ company: boot.company }),
  },
  'modes-of-payment': {
    doctype: 'Mode of Payment', title: 'Modes of Payment', single: 'Mode of Payment', titleField: 'mode_of_payment',
    list: ['mode_of_payment', 'type', { field: 'enabled', label: 'Enabled' }],
    tabs: [
      { label: 'All', filters: [] },
      { label: 'Enabled', filters: [['enabled', '=', 1]] },
      { label: 'Disabled', filters: [['enabled', '=', 0]] },
    ],
    search: ['name', 'mode_of_payment'],
    sort: 'mode_of_payment asc',
    sections: [{ title: 'Mode of payment', fields: ['mode_of_payment', 'type', 'enabled'] }],
    tables: [
      {
        field: 'accounts', title: 'Default account per company',
        columns: [
          { field: 'company', reqd: true },
          { field: 'default_account', label: 'Bank / cash account', filters: (row) => ({ is_group: 0, account_type: ['in', ['Bank', 'Cash']], ...(row.company ? { company: row.company } : {}) }) },
        ],
        newRow: () => ({}),
        empty: 'Add the bank or cash account payments of this type go to.',
      },
    ],
    defaults: (boot) => ({ enabled: 1, type: 'Bank', accounts: boot.company ? [{ company: boot.company }] : [] }),
  },
  'sales-tax-templates': {
    doctype: 'Sales Taxes and Charges Template', title: 'Sales Tax Templates', single: 'Sales Tax Template', titleField: 'title', statusFromDisabled: true,
    list: ['title', 'company', { field: 'is_default', label: 'Default' }, 'tax_category', { field: 'disabled', type: 'Active' }],
    columns: ['title', 'company', 'is_default', 'tax_category', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'title'],
    sections: [{ title: 'Template', fields: ['title', 'company', 'tax_category', 'is_default', 'disabled'] }],
    tables: [taxRowsTable('Sales')],
    defaults: (boot) => ({ company: boot.company, taxes: [vatRow()] }),
  },
  'purchase-tax-templates': {
    doctype: 'Purchase Taxes and Charges Template', title: 'Purchase Tax Templates', single: 'Purchase Tax Template', titleField: 'title', statusFromDisabled: true,
    list: ['title', 'company', { field: 'is_default', label: 'Default' }, 'tax_category', { field: 'disabled', type: 'Active' }],
    columns: ['title', 'company', 'is_default', 'tax_category', 'disabled'], // up to 8 shown by default; the rest via “Columns”
    tabs: activeTabs,
    search: ['name', 'title'],
    sections: [{ title: 'Template', fields: ['title', 'company', 'tax_category', 'is_default', 'disabled'] }],
    tables: [taxRowsTable('Purchase')],
    defaults: (boot) => ({ company: boot.company, taxes: [{ ...vatRow(), category: 'Total', add_deduct_tax: 'Add' }] }),
  },
  'item-tax-templates': {
    doctype: 'Item Tax Template', title: 'Item Tax Templates', single: 'Item Tax Template', titleField: 'title', statusFromDisabled: true,
    list: ['title', 'company', { field: 'disabled', type: 'Active' }],
    columns: ['title', 'company', 'disabled'],
    tabs: activeTabs,
    search: ['name', 'title'],
    sections: [{ title: 'Template', fields: ['title', 'company', 'disabled'] }],
    // Use the same tax account as the invoice's tax row, otherwise the row's own rate still applies to the item.
    tables: [{
      field: 'taxes', title: 'Tax rate for this treatment',
      columns: [
        { field: 'tax_type', reqd: true, filters: (row, doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }) },
        'tax_rate', 'not_applicable',
      ],
    }],
    defaults: (boot) => ({ company: boot.company, taxes: [{ tax_rate: 5 }] }),
  },
  'fiscal-years': {
    doctype: 'Fiscal Year', title: 'Fiscal Years', single: 'Fiscal Year', titleField: 'year', statusFromDisabled: true,
    list: ['year', 'year_start_date', 'year_end_date', { field: 'disabled', type: 'Active' }],
    tabs: activeTabs,
    search: ['name', 'year'],
    sort: 'year_start_date desc',
    sections: [{ title: 'Fiscal year', fields: ['year', 'year_start_date', 'year_end_date', 'disabled'] }],
    tables: [
      { field: 'companies', title: 'Companies (leave empty for all)', columns: [{ field: 'company' }], newRow: () => ({}) },
    ],
    defaults: () => {
      const y = new Date().getFullYear()
      return { year: String(y), year_start_date: `${y}-01-01`, year_end_date: `${y}-12-31` }
    },
  },
}

/* ---------------- Party helpers ---------------- */

/**
 * Contact (phone / email) and primary-address sections for Customer and Supplier.
 * On a new party ERPNext turns these values into a primary Contact and Address on insert;
 * on an existing one DocPage edits the linked primary Address (config.address).
 */
function partyContactAddress() {
  return [
    {
      tab: 'General Details', title: 'Contact', fields: [
        { field: 'mobile_no', label: 'Phone number', type: 'Data', readOnly: false, onlyNew: true, placeholder: '+971 50 000 0000' },
        { field: 'email_id', label: 'Email address', type: 'Data', readOnly: false, onlyNew: true, placeholder: 'accounts@company.ae' },
      ],
    },
    {
      tab: 'Address & Location', title: 'Primary address', fields: [
        { field: 'address_line1', label: 'Street address (line 1)', type: 'Data', virtual: true, placeholder: 'e.g. Office 1204, Al Reem Tower' },
        { field: 'address_line2', label: 'Building / unit (line 2)', type: 'Data', virtual: true },
        { field: 'city', label: 'City', type: 'Data', virtual: true, placeholder: 'e.g. Dubai' },
        { field: 'state', label: 'Emirate / state', type: 'Data', virtual: true, placeholder: 'e.g. Sharjah' },
        { field: 'pincode', label: 'Postal / P.O. box', type: 'Data', virtual: true },
        { field: 'country', label: 'Country', type: 'Link', options: 'Country', virtual: true },
      ],
    },
  ]
}

/* ---------------- Accounts helpers ---------------- */

function notTransfer(d) { return d.payment_type !== 'Internal Transfer' }
function round2(n) { return Math.round(n * 100) / 100 }
function accountFilter(d) { return { is_group: 0, ...(d.company ? { company: d.company } : {}) } }

/** Prepend fixed filters (e.g. is_return = 1) to every tab. */
/** A Production Plan button that runs one of its server methods (which fill tables in memory), then saves the result. */
function planStep(method) {
  return async ({ doc, call, mutate }) => {
    const r = await call.post('run_doc_method', { dt: 'Production Plan', dn: doc.name, method })
    const d = r?.docs?.[0]
    if (d) await call.post('frappe.client.save', { doc: JSON.stringify(d) })
    await mutate()
  }
}

function withBase(base, tabs) {
  return tabs.map((t) => ({ ...t, filters: [...base, ...t.filters] }))
}

function vatRow() {
  return { charge_type: 'On Net Total', description: 'VAT 5%', rate: 5 }
}

function taxRowsTable(kind) {
  return {
    field: 'taxes', title: 'Tax rows',
    columns: [
      { field: 'charge_type', width: 170 },
      { field: 'account_head', label: 'Tax account', width: 240, reqd: true, filters: (row, doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }) },
      { field: 'description', width: 200 },
      { field: 'rate', width: 100 },
      ...(kind === 'Purchase' ? [{ field: 'category', width: 140 }, { field: 'add_deduct_tax', label: 'Add / deduct', width: 120 }] : []),
    ],
    newRow: () => (kind === 'Purchase' ? { ...vatRow(), category: 'Total', add_deduct_tax: 'Add' } : vatRow()),
  }
}

/**
 * Payment Entry form logic (what Desk's payment_entry.js does):
 * payment type -> party type, party -> its receivable/payable account, mode of payment -> bank/cash account.
 */
async function paymentEntryChange(field, value, doc, { call }) {
  const receive = doc.payment_type === 'Receive'
  const bankSide = receive ? 'paid_to' : 'paid_from'
  const partySide = receive ? 'paid_from' : 'paid_to'

  const accountCurrency = async (account) => {
    if (!account) return null
    const r = await call.post('erpnext.accounts.doctype.payment_entry.payment_entry.get_account_details', { account, date: doc.posting_date })
    return r?.message?.account_currency ?? null
  }
  const bankAccount = async (mode) => {
    if (!mode || !doc.company) return null
    const r = await call.post('erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account', { mode_of_payment: mode, company: doc.company })
    return r?.message?.account ?? null
  }

  if (field === 'payment_type') {
    if (value === 'Internal Transfer') {
      return { party_type: null, party: null, party_name: null, paid_from: null, paid_to: null, references: [] }
    }
    const patch = { party_type: value === 'Receive' ? 'Customer' : 'Supplier', party: null, party_name: null, paid_from: null, paid_to: null, references: [] }
    const acc = await bankAccount(doc.mode_of_payment)
    if (acc) patch[value === 'Receive' ? 'paid_to' : 'paid_from'] = acc
    return patch
  }

  if (field === 'party_type') return { party: null, party_name: null, [partySide]: null, references: [] }

  if (field === 'party') {
    if (!value) return { party_name: null, [partySide]: null, references: [] }
    const r = await call.post('erpnext.accounts.doctype.payment_entry.payment_entry.get_party_details', {
      company: doc.company, party_type: doc.party_type, party: value, date: doc.posting_date,
    })
    const p = r?.message ?? {}
    const patch = {
      party_name: p.party_name ?? value,
      [partySide]: p.party_account ?? null,
      [`${partySide}_account_currency`]: p.party_account_currency ?? undefined,
      references: [],
    }
    return patch
  }

  if (field === 'mode_of_payment') {
    const acc = await bankAccount(value)
    if (!acc) return null
    const target = doc.payment_type === 'Internal Transfer' ? 'paid_from' : bankSide
    return { [target]: acc, [`${target}_account_currency`]: (await accountCurrency(acc)) ?? undefined }
  }

  if (field === 'paid_from' || field === 'paid_to') {
    const cur = await accountCurrency(value)
    return cur ? { [`${field}_account_currency`]: cur } : null
  }

  if (field === 'paid_amount') {
    const patch = {}
    // Same-currency payments: what leaves one account arrives in the other.
    if (!doc.paid_from_account_currency || doc.paid_from_account_currency === doc.paid_to_account_currency) patch.received_amount = value
    // Invoices are only allocated once "Get outstanding invoices" has been used; with none listed the amount is an advance.
    // From then on, changing the amount re-spreads it oldest first.
    if (doc.payment_type !== 'Internal Transfer' && (doc.references ?? []).length) patch.references = fifoReferences(doc.references, Number(value) || 0)
    return Object.keys(patch).length ? patch : null
  }
  return null
}

/* ---------------- Fixed assets ---------------- */
DOCTYPES['asset-categories'] = {
  doctype: 'Asset Category', title: 'Asset Categories', single: 'Asset Category', titleField: 'name',
  list: ['name', 'enable_cwip_accounting'],
  search: ['name'],
  sections: [{ title: 'Category', fields: ['asset_category_name', 'enable_cwip_accounting'] }],
  tables: [
    { field: 'finance_books', title: 'Depreciation', columns: ['finance_book', { field: 'depreciation_method', reqd: true }, { field: 'total_number_of_depreciations', reqd: true }, { field: 'frequency_of_depreciation', reqd: true }], newRow: () => ({ depreciation_method: 'Straight Line', total_number_of_depreciations: 5, frequency_of_depreciation: 12 }) },
    { field: 'accounts', title: 'Accounts', columns: [{ field: 'company_name', reqd: true }, { field: 'fixed_asset_account', reqd: true }, { field: 'accumulated_depreciation_account', reqd: true }, { field: 'depreciation_expense_account', reqd: true }], newRow: (doc, rows, boot) => ({ company_name: boot?.company }) },
  ],
  defaults: () => ({ finance_books: [{ depreciation_method: 'Straight Line', total_number_of_depreciations: 5, frequency_of_depreciation: 12 }] }),
}
DOCTYPES.locations = {
  doctype: 'Location', title: 'Locations', single: 'Location', titleField: 'location_name',
  list: ['location_name', 'parent_location', { field: 'is_group', label: 'Group' }],
  search: ['name', 'location_name'],
  sections: [{ title: 'Location', fields: ['location_name', { field: 'parent_location', filters: () => ({ is_group: 1 }) }, 'is_group'] }],
}
DOCTYPES.assets = {
  doctype: 'Asset', title: 'Fixed Assets', single: 'Asset', titleField: 'asset_name',
  list: ['name', 'asset_name', 'asset_category', 'location', 'purchase_date', 'net_purchase_amount', 'value_after_depreciation', 'status'],
  columns: ['name', 'asset_name', 'asset_category', 'location', 'custodian', 'purchase_date', 'net_purchase_amount', 'value_after_depreciation', 'status'],
  tabs: [
    { label: 'All', filters: [] },
    { label: 'Draft', filters: [['status', '=', 'Draft']] },
    { label: 'In use', filters: [['status', 'in', ['Submitted', 'Partially Depreciated']]] },
    { label: 'Fully depreciated', filters: [['status', '=', 'Fully Depreciated']] },
    { label: 'Scrapped / sold', filters: [['status', 'in', ['Scrapped', 'Sold']]] },
  ],
  search: ['name', 'asset_name', 'item_code', 'asset_category'],
  sort: 'purchase_date desc',
  sections: [
    { title: 'Asset', fields: [{ field: 'item_code', reqd: true, filters: () => ({ is_fixed_asset: 1, is_stock_item: 0, disabled: 0 }) }, 'asset_name', 'asset_category', 'company', 'location', 'custodian', 'department', 'cost_center'] },
    { title: 'Purchase', fields: ['purchase_date', 'available_for_use_date', 'net_purchase_amount', 'purchase_invoice', 'supplier'] },
    { title: 'Depreciation', fields: ['calculate_depreciation', { field: 'opening_accumulated_depreciation', when: (d) => Number(d.calculate_depreciation) }, { field: 'opening_number_of_booked_depreciations', when: (d) => Number(d.calculate_depreciation) }, 'value_after_depreciation'] },
  ],
  tables: [
    { field: 'finance_books', title: 'Depreciation schedule setup', when: (d) => Number(d.calculate_depreciation), columns: ['finance_book', { field: 'depreciation_method', reqd: true }, { field: 'total_number_of_depreciations', reqd: true }, { field: 'frequency_of_depreciation', reqd: true }, 'depreciation_start_date', 'expected_value_after_useful_life'], newRow: () => ({ depreciation_method: 'Straight Line', frequency_of_depreciation: 12 }) },
  ],
  onChange: async (field, value, doc, { call }) => {
    if (field === 'item_code' && value) {
      const item = (await call.post('frappe.client.get_value', { doctype: 'Item', filters: JSON.stringify({ name: value }), fieldname: JSON.stringify(['item_name', 'asset_category']) }))?.message ?? {}
      return { asset_name: item.item_name, asset_category: item.asset_category, finance_books: [] }
    }
    if (field === 'asset_category' || field === 'net_purchase_amount') {
      if (!doc.item_code || !doc.asset_category) return null
      const d = (await call.post('erpnext.assets.doctype.asset.asset.get_item_details', { item_code: doc.item_code, asset_category: doc.asset_category, net_purchase_amount: doc.net_purchase_amount || 0 }))?.message ?? []
      return d.length ? { calculate_depreciation: 1, finance_books: d.map((r) => ({ ...r, depreciation_start_date: r.depreciation_start_date ?? doc.available_for_use_date })) } : { calculate_depreciation: 0 }
    }
    return null
  },
  make: [MAKE.assetMove, MAKE.assetSale],
  docActions: [
    {
      label: 'Scrap', icon: XIcon, variant: 'danger', success: 'Asset scrapped',
      when: (doc) => Number(doc.docstatus) === 1 && ['Submitted', 'Partially Depreciated', 'Fully Depreciated'].includes(doc.status),
      run: async ({ doc, call, mutate }) => { await call.post('erpnext.assets.doctype.asset.depreciation.scrap_asset', { asset_name: doc.name }); await mutate() },
    },
    {
      label: 'Restore', icon: PlayCircle, success: 'Asset restored',
      when: (doc) => Number(doc.docstatus) === 1 && doc.status === 'Scrapped',
      run: async ({ doc, call, mutate }) => { await call.post('erpnext.assets.doctype.asset.depreciation.restore_asset', { asset_name: doc.name }); await mutate() },
    },
  ],
  defaults: (boot) => ({ company: boot.company, purchase_date: today(), available_for_use_date: today(), calculate_depreciation: 1, finance_books: [] }),
}
DOCTYPES['asset-movements'] = {
  doctype: 'Asset Movement', title: 'Asset Movements', single: 'Asset Movement', titleField: 'name',
  list: ['name', 'purpose', 'transaction_date', 'company', 'docstatus'],
  tabs: docstatusTabs,
  search: ['name', 'purpose'],
  sort: 'transaction_date desc',
  sections: [{ title: 'Movement', fields: ['purpose', 'company', 'transaction_date', 'reference_doctype', 'reference_name'] }],
  tables: [
    { field: 'assets', title: 'Assets', columns: [{ field: 'asset', reqd: true }, 'source_location', { field: 'target_location' }, 'from_employee', 'to_employee'], newRow: () => ({}) },
  ],
  defaults: (boot) => ({ company: boot.company, purpose: 'Transfer', transaction_date: new Date().toLocaleString('sv-SE') }),
}

/* ---------------- Recruitment ---------------- */
DOCTYPES['job-openings'] = {
  doctype: 'Job Opening', title: 'Job Openings', single: 'Job Opening', titleField: 'job_title',
  list: ['job_title', 'designation', 'department', 'vacancies', 'closes_on', 'status'],
  tabs: statusTabs('Open', 'Closed'),
  search: ['name', 'job_title', 'designation'],
  sections: [
    { title: 'Opening', fields: ['job_title', 'company', 'status', 'designation', 'department', 'employment_type', 'location', 'vacancies', 'closes_on', 'description'] },
    { title: 'Salary range', collapsed: true, fields: ['currency', 'lower_range', 'upper_range', 'salary_per'] },
    { title: 'Website', collapsed: true, fields: ['publish', 'publish_applications_received', 'prevent_duplicate_applicant'] },
  ],
  defaults: (boot) => ({ company: boot.company, status: 'Open', currency: boot.currency, salary_per: 'Month', vacancies: 1 }),
}
DOCTYPES['job-applicants'] = {
  doctype: 'Job Applicant', title: 'Job Applicants', single: 'Applicant', titleField: 'applicant_name',
  list: ['applicant_name', 'job_title', 'designation', 'source', 'applicant_rating', 'status'],
  tabs: statusTabs('Open', 'Replied', 'Shortlisted', 'Hold', 'Rejected', 'Accepted'),
  search: ['name', 'applicant_name', 'email_id', 'phone_number'],
  sort: 'creation desc',
  sections: [
    { title: 'Applicant', fields: ['applicant_name', 'email_id', 'phone_number', 'country', 'job_title', 'designation', 'status', 'applicant_rating'] },
    { title: 'Source', fields: ['source', 'source_name', 'employee_referral', 'resume_attachment', 'resume_link', 'notes'] },
    { title: 'Salary expectation', collapsed: true, fields: ['currency', 'lower_range', 'upper_range'] },
    { title: 'Cover letter', collapsed: true, fields: ['cover_letter'] },
  ],
  onChange: async (field, value, doc, { call }) => {
    if (field !== 'job_title' || !value) return null
    const o = (await call.post('frappe.client.get_value', { doctype: 'Job Opening', filters: JSON.stringify({ name: value }), fieldname: JSON.stringify(['designation']) }))?.message
    return o?.designation ? { designation: o.designation } : null
  },
  make: [{
    label: 'Employee', method: 'hrms.hr.doctype.job_applicant.job_applicant.make_employee', args: (doc) => ({ source_name: doc.name }), target: 'employees',
    when: (d) => d.status === 'Accepted',
  }],
  docActions: [
    { label: 'Shortlist', icon: Check, success: 'Shortlisted', when: (d) => ['Open', 'Replied', 'Hold'].includes(d.status), run: async ({ doc, call, mutate }) => { await call.post('karya_erp.recruitment.set_status', { applicant: doc.name, status: 'Shortlisted' }); await mutate() } },
    { label: 'Reject', icon: XIcon, variant: 'danger', success: 'Rejected', when: (d) => !['Rejected', 'Accepted'].includes(d.status), run: async ({ doc, call, mutate }) => { await call.post('karya_erp.recruitment.set_status', { applicant: doc.name, status: 'Rejected' }); await mutate() } },
    {
      label: 'Make offer', icon: FileCheck2, when: (d) => !['Rejected', 'Accepted'].includes(d.status),
      run: async ({ doc, navigate, boot }) => navigate('/job-offers/new', { state: { prefill: { job_applicant: doc.name, applicant_name: doc.applicant_name, applicant_email: doc.email_id, designation: doc.designation, company: boot.company, offer_date: new Date().toLocaleDateString('en-CA'), status: 'Awaiting Response' } } }),
    },
  ],
  defaults: () => ({ status: 'Open' }),
}
DOCTYPES.interviews = {
  doctype: 'Interview', title: 'Interviews', single: 'Interview', titleField: 'job_applicant',
  list: ['name', 'job_applicant', 'interview_type', 'scheduled_on', 'from_time', 'average_rating', 'status'],
  tabs: statusTabs('Pending', 'Under Review', 'Cleared', 'Rejected'),
  search: ['name', 'job_applicant', 'interview_type'],
  sort: 'scheduled_on desc',
  sections: [
    { title: 'Interview', fields: ['job_applicant', 'job_opening', 'designation', 'interview_type', 'status', 'scheduled_on', 'from_time', 'to_time'] },
    { title: 'Result', fields: ['average_rating', 'expected_average_rating', 'interview_summary', 'resume_link'] },
  ],
  tables: [
    { field: 'interview_details', title: 'Interviewers', columns: [{ field: 'interviewer', reqd: true }], newRow: () => ({}) },
  ],
  defaults: () => ({ status: 'Pending' }),
}
DOCTYPES['job-offers'] = {
  doctype: 'Job Offer', title: 'Job Offers', single: 'Job Offer', titleField: 'applicant_name',
  list: ['name', 'applicant_name', 'designation', 'offer_date', 'status'],
  tabs: statusTabs('Awaiting Response', 'Accepted', 'Rejected'),
  search: ['name', 'applicant_name', 'applicant_email'],
  sort: 'offer_date desc',
  sections: [
    { title: 'Offer', fields: ['job_applicant', { field: 'applicant_name', readOnly: true }, { field: 'applicant_email', readOnly: true }, 'designation', 'company', 'offer_date', 'status'] },
    { title: 'Terms', fields: ['job_offer_term_template', 'select_terms', 'terms', 'letter_head'] },
  ],
  tables: [
    { field: 'offer_terms', title: 'Offer terms (salary, notice, probation…)', columns: [{ field: 'offer_term', reqd: true }, { field: 'value', reqd: true }], newRow: () => ({}) },
  ],
  onChange: async (field, value, doc, { call }) => {
    if (field !== 'job_applicant' || !value) return null
    const a = (await call.post('frappe.client.get_value', { doctype: 'Job Applicant', filters: JSON.stringify({ name: value }), fieldname: JSON.stringify(['applicant_name', 'email_id', 'designation']) }))?.message ?? {}
    return { applicant_name: a.applicant_name, applicant_email: a.email_id, designation: a.designation }
  },
  make: [{ label: 'Employee', method: 'hrms.hr.doctype.job_offer.job_offer.make_employee', args: (doc) => ({ source_name: doc.name }), target: 'employees', when: (d) => Number(d.docstatus) === 1 && d.status === 'Accepted' }],
  defaults: (boot) => ({ company: boot.company, offer_date: today(), status: 'Awaiting Response' }),
}
DOCTYPES['interview-types'] = {
  doctype: 'Interview Type', title: 'Interview Types', single: 'Interview Type', titleField: 'interview_type_name',
  list: ['interview_type_name', 'designation'],
  search: ['name'],
  sections: [{ title: 'Interview type', fields: ['interview_type_name', 'designation', 'expected_average_rating', 'description'] }],
  tables: [{ field: 'expected_skill_set', title: 'Skills assessed', columns: [{ field: 'skill', reqd: true }], newRow: () => ({}) }],
}
DOCTYPES['applicant-sources'] = {
  doctype: 'Job Applicant Source', title: 'Applicant Sources', single: 'Source', titleField: 'source_name',
  list: ['source_name'], search: ['name'],
  sections: [{ title: 'Source', fields: ['source_name'] }],
}
DOCTYPES.skills = {
  doctype: 'Skill', title: 'Skills', single: 'Skill', titleField: 'skill_name',
  list: ['skill_name'], search: ['name'],
  sections: [{ title: 'Skill', fields: ['skill_name', 'description'] }],
}

/* ---------------- Restaurant ---------------- */
// The purchase order for the service a supplier does: its items are the service, each pointing at the finished good the supplier makes.
DOCTYPES['subcontract-purchase-orders'] = {
  ...DOCTYPES['purchase-orders'], alias: true, title: 'Subcontract POs', single: 'Subcontract PO',
  tabs: withBase([['is_subcontracted', '=', 1]], DOCTYPES['purchase-orders'].tabs),
  sections: [
    { title: 'Details', fields: [{ field: 'supplier', filters: { disabled: 0 } }, 'transaction_date', 'schedule_date', 'company', { field: 'supplier_warehouse', label: 'Supplier warehouse (materials go here)', reqd: true, filters: warehouseFilter }, { field: 'set_warehouse', label: 'Receive finished goods in', filters: warehouseFilter }] },
    { title: 'Pricing', fields: ['currency', 'buying_price_list', 'taxes_and_charges'] },
  ],
  items: { columns: ['item_code', 'qty', 'uom', 'rate', 'amount', { field: 'fg_item', label: 'Makes', reqd: true }, { field: 'fg_item_qty', label: 'Makes qty', reqd: true }], dateField: 'schedule_date' },
  make: [MAKE.orderToSubcontracting, MAKE.orderToBill, MAKE.advance('Purchase Order')],
  defaults: (boot) => ({ ...DOCTYPES['purchase-orders'].defaults(boot), is_subcontracted: 1 }),
}
/* ---------------- Point of sale ---------------- */
DOCTYPES['pos-profiles'] = {
  doctype: 'POS Profile', title: 'POS Counters', single: 'POS Counter', titleField: 'name', statusFromDisabled: true,
  list: ['name', 'company', 'warehouse', 'selling_price_list', { field: 'disabled', type: 'Active' }],
  tabs: activeTabs,
  search: ['name'],
  sections: [
    // POS Profile is named by hand (autoname: Prompt) → sent as __newname on create.
    { title: 'Till', fields: [{ field: '__newname', type: 'Data', label: 'Counter name', reqd: true, onlyNew: true, placeholder: 'e.g. Main Counter', when: (d) => !d.creation }, 'company', 'customer', 'warehouse', 'selling_price_list', 'currency', 'taxes_and_charges', 'disabled'] },
    { title: 'Behaviour', fields: ['update_stock', 'allow_discount_change', 'allow_rate_change', 'allow_partial_payment', 'hide_unavailable_items', 'ignore_pricing_rule'] },
    { title: 'Accounts', collapsed: true, fields: [
      { field: 'income_account', filters: (d) => ({ root_type: 'Income', is_group: 0, ...(d.company ? { company: d.company } : {}) }) },
      { field: 'expense_account', filters: (d) => ({ root_type: 'Expense', is_group: 0, ...(d.company ? { company: d.company } : {}) }) },
      { field: 'cost_center', filters: (d) => ({ is_group: 0, ...(d.company ? { company: d.company } : {}) }) },
      // ERPNext refuses anything but a Profit and Loss account here ("Write Off Account must be a Profit and Loss account").
      { field: 'write_off_account', filters: (d) => ({ report_type: 'Profit and Loss', is_group: 0, ...(d.company ? { company: d.company } : {}) }) },
      { field: 'write_off_cost_center', filters: (d) => ({ is_group: 0, ...(d.company ? { company: d.company } : {}) }) },
      { field: 'account_for_change_amount', filters: (d) => ({ is_group: 0, ...(d.company ? { company: d.company } : {}) }) },
      'write_off_limit'] },
    { title: 'Printing', collapsed: true, fields: ['print_format', 'letter_head', 'tc_name'] },
  ],
  tables: [
    { field: 'payments', title: 'Payment methods', columns: [{ field: 'mode_of_payment', reqd: true }, 'default', 'allow_in_returns'], newRow: () => ({}) },
    { field: 'applicable_for_users', title: 'Cashiers who may use this counter (empty = managers only)', columns: [{ field: 'user', reqd: true }, 'default'], newRow: () => ({}) },
    { field: 'item_groups', title: 'Only these item groups (empty = all)', columns: [{ field: 'item_group', reqd: true }], newRow: () => ({}) },
  ],
  defaults: (boot) => ({ company: boot.company, currency: boot.currency, update_stock: 1, allow_discount_change: 1 }),
}
DOCTYPES['pos-closing-entries'] = {
  doctype: 'POS Closing Entry', title: 'Shift Closings', single: 'Shift Closing', titleField: 'name', readOnly: true,
  list: ['name', 'pos_profile', 'user', 'period_start_date', 'period_end_date', 'grand_total', 'status'],
  tabs: docstatusTabs,
  search: ['name', 'pos_profile', 'user'],
  sort: 'period_end_date desc',
  sections: [{ title: 'Shift', fields: ['pos_profile', 'user', 'period_start_date', 'period_end_date', 'grand_total', 'net_total', 'total_taxes_and_charges', 'total_quantity', 'status'] }],
  tables: [
    { field: 'payment_reconciliation', title: 'Cash up', columns: [{ field: 'mode_of_payment', readOnly: true }, { field: 'opening_amount', readOnly: true }, { field: 'expected_amount', readOnly: true }, { field: 'closing_amount', readOnly: true }, { field: 'difference', readOnly: true }], addRows: false },
  ],
}

/* ---------------- Projects ---------------- */
DOCTYPES.projects = {
  doctype: 'Project', title: 'Projects', single: 'Project', titleField: 'project_name',
  list: ['name', 'project_name', 'customer', 'expected_end_date', 'percent_complete', 'status'],
  columns: ['name', 'project_name', 'customer', 'project_type', 'expected_start_date', 'expected_end_date', 'estimated_costing', 'percent_complete', 'status'],
  tabs: statusTabs('Open', 'On hold', 'Completed', 'Cancelled'),
  search: ['name', 'project_name', 'customer'],
  sections: [
    { title: 'Project', fields: ['project_name', 'customer', 'company', 'project_type', 'status', 'priority', 'department', 'sales_order'] },
    { title: 'Plan', fields: ['expected_start_date', 'expected_end_date', 'actual_start_date', 'actual_end_date', 'estimated_costing', 'percent_complete_method', 'percent_complete', 'cost_center'] },
    { title: 'Results', fields: [{ field: 'total_costing_amount', readOnly: true }, { field: 'total_expense_claim', readOnly: true }, { field: 'total_purchase_cost', readOnly: true }, { field: 'total_billable_amount', readOnly: true }, { field: 'total_billed_amount', readOnly: true }, { field: 'gross_margin', readOnly: true }, { field: 'per_gross_margin', readOnly: true }] },
    { title: 'Notes', collapsed: true, fields: ['notes'] },
  ],
  tables: [{ field: 'users', title: 'People with access', columns: [{ field: 'user', reqd: true }, 'welcome_email_sent'], newRow: () => ({}) }],
  docActions: [{ label: 'Project board', icon: Flag, run: async ({ doc, navigate }) => navigate(`/project-board?project=${encodeURIComponent(doc.name)}`) }],
  defaults: (boot) => ({ company: boot.company, status: 'Open', priority: 'Medium', percent_complete_method: 'Task Completion' }),
}
DOCTYPES.tasks = {
  doctype: 'Task', title: 'Tasks', single: 'Task', titleField: 'subject',
  list: ['subject', 'project', 'priority', 'exp_end_date', 'progress', 'status'],
  tabs: statusTabs('Open', 'Working', 'Pending Review', 'Overdue', 'Completed'),
  search: ['name', 'subject', 'project'],
  sort: 'exp_end_date asc',
  sections: [
    { title: 'Task', fields: ['subject', 'project', 'status', 'priority', 'parent_task', 'type', 'is_milestone', 'task_weight', 'description'] },
    { title: 'Schedule', fields: ['exp_start_date', 'exp_end_date', 'expected_time', 'progress', 'act_start_date', 'act_end_date', 'completed_on'] },
    { title: 'Costs', collapsed: true, fields: [{ field: 'actual_time', readOnly: true }, { field: 'total_costing_amount', readOnly: true }, { field: 'total_billing_amount', readOnly: true }] },
  ],
  tables: [{ field: 'depends_on', title: 'Depends on', columns: [{ field: 'task', reqd: true }], newRow: () => ({}) }],
  defaults: (boot) => ({ status: 'Open', priority: 'Medium', company: boot.company }),
}
DOCTYPES.timesheets = {
  doctype: 'Timesheet', title: 'Timesheets', single: 'Timesheet', titleField: 'employee_name',
  list: ['name', 'employee_name', 'start_date', 'total_hours', 'total_billable_amount', 'status'],
  tabs: statusTabs('Draft', 'Submitted', 'Partially Billed', 'Billed'),
  search: ['name', 'employee_name', 'parent_project'],
  sort: 'start_date desc',
  sections: [
    { title: 'Timesheet', fields: ['employee', { field: 'employee_name', readOnly: true }, 'company', 'parent_project', 'customer', 'currency'] },
    { title: 'Totals', fields: [{ field: 'total_hours', readOnly: true }, { field: 'total_billable_hours', readOnly: true }, { field: 'total_billable_amount', readOnly: true }, { field: 'total_costing_amount', readOnly: true }, { field: 'per_billed', readOnly: true }] },
  ],
  tables: [{
    field: 'time_logs', title: 'Time logs',
    columns: [{ field: 'activity_type', reqd: true }, { field: 'project' }, { field: 'task', filters: (row) => (row.project ? { project: row.project } : {}) }, { field: 'from_time', reqd: true }, { field: 'hours', reqd: true }, 'is_billable', 'description'],
    newRow: () => ({ is_billable: 1 }),
  }],
  defaults: (boot) => ({ company: boot.company, employee: boot.employee, currency: boot.currency }),
}
DOCTYPES['project-types'] = {
  doctype: 'Project Type', title: 'Project Types', single: 'Project Type', titleField: 'project_type',
  list: ['project_type', 'description'], search: ['name'],
  sections: [{ title: 'Project type', fields: ['project_type', 'description'] }],
}
DOCTYPES['activity-types'] = {
  doctype: 'Activity Type', title: 'Activity Types', single: 'Activity Type', titleField: 'activity_type', statusFromDisabled: true,
  list: ['activity_type', 'costing_rate', 'billing_rate', { field: 'disabled', type: 'Active' }],
  tabs: activeTabs, search: ['name'],
  sections: [{ title: 'Activity type', fields: ['activity_type', 'costing_rate', 'billing_rate', 'disabled'] }],
}

/** Doctype -> its main screen. Alias screens (credit notes = Sales Invoice) don't take over the link. */
// Opening balances = Journal Entries of type "Opening Entry" (same form, its own list and defaults).
DOCTYPES['opening-entries'] = {
  ...DOCTYPES['journal-entries'], alias: true, title: 'Opening Balances', single: 'Opening Entry',
  tabs: withBase([['voucher_type', '=', 'Opening Entry']], docstatusTabs),
  defaults: (boot) => ({ ...(DOCTYPES['journal-entries'].defaults?.(boot) ?? {}), voucher_type: 'Opening Entry', is_opening: 'Yes', user_remark: 'Opening balances' }),
  make: [],
}

export const ROUTE_OF = Object.fromEntries(Object.entries(DOCTYPES).filter(([, c]) => !c.alias).map(([slug, c]) => [c.doctype, `/${slug}`]))
