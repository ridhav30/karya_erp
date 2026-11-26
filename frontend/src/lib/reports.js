import { Activity, BarChart3, BookText, Boxes, FileBarChart, Hourglass, Landmark, PackageSearch, Receipt, ScrollText, Scale, ShoppingBag, ShoppingCart, TrendingUp, Wallet, Warehouse, Waves } from 'lucide-react'

/**
 * ERPNext query reports shown under Accounts > Financial Reports.
 * They run through frappe.desk.query_report.run, so numbers are exactly what Desk shows.
 *
 * filter: { field, label, type, options, reqd, multi (sent as a list), hidden, width }
 * defaults(ctx): ctx = karya_erp.accounts.context() -> { company, today, fiscal_year: { name, start, end } }
 */
const fyStart = (ctx) => ctx.fiscal_year?.start ?? `${ctx.today.slice(0, 4)}-01-01`
const fyEnd = (ctx) => ctx.fiscal_year?.end ?? `${ctx.today.slice(0, 4)}-12-31`

// Not shown in the filters for now: reports use the default company (boot / context).
const company = { field: 'company', label: 'Company', type: 'Link', options: 'Company', reqd: true, hidden: true }
const periodicity = { field: 'periodicity', label: 'Periodicity', type: 'Select', options: 'Monthly\nQuarterly\nHalf-Yearly\nYearly' }

const costCenter = { field: 'cost_center', label: 'Cost center', type: 'Link', options: 'Cost Center', multi: true }

/** P&L, Balance Sheet and Cash Flow share the financial-statement filters. */
const statement = (extra = {}) => ({
  filters: [
    company,
    { field: 'period_start_date', label: 'From', type: 'Date', reqd: true },
    { field: 'period_end_date', label: 'To', type: 'Date', reqd: true },
    periodicity,
    costCenter,
    { field: 'filter_based_on', hidden: true },
    { field: 'from_fiscal_year', hidden: true },
    { field: 'to_fiscal_year', hidden: true },
    { field: 'accumulated_values', hidden: true },
  ],
  defaults: (ctx) => ({
    company: ctx.company, filter_based_on: 'Date Range',
    period_start_date: fyStart(ctx), period_end_date: ctx.today,
    from_fiscal_year: ctx.fiscal_year?.name, to_fiscal_year: ctx.fiscal_year?.name,
    periodicity: 'Yearly', accumulated_values: extra.accumulated ? 1 : 0,
  }),
  tree: true,
})

const ageing = (partyType) => ({
  filters: [
    company,
    { field: 'report_date', label: 'As on', type: 'Date', reqd: true },
    { field: 'party', label: partyType, type: 'Link', options: partyType, multi: true },
    { field: 'ageing_based_on', label: 'Ageing based on', type: 'Select', options: 'Due Date\nPosting Date' },
    { field: 'age_as_on', label: 'Age as on', type: 'Select', options: 'Today\nReport Date' },
    { field: 'party_type', hidden: true },
    { field: partyType.toLowerCase(), hidden: true },
    { field: 'range1', hidden: true }, { field: 'range2', hidden: true }, { field: 'range3', hidden: true }, { field: 'range4', hidden: true },
    { field: 'range', hidden: true },
  ],
  defaults: (ctx) => ({
    company: ctx.company, report_date: ctx.today, ageing_based_on: 'Due Date', age_as_on: 'Today', party_type: partyType,
    // v15 uses range1-4, v16 a single "range" string — send both.
    range1: 30, range2: 60, range3: 90, range4: 120, range: '30, 60, 90, 120',
  }),
  // Older versions filter by customer/supplier instead of party.
  map: (f) => ({ ...f, [partyType.toLowerCase()]: Array.isArray(f.party) ? f.party[0] : f.party }),
  // one page of open items / parties at a time from the server (SQL on the Payment Ledger)
  paged: true, api: 'karya_erp.ledger_reports.run',
})

export const REPORTS = [
  {
    key: 'profit-and-loss', report: 'Profit and Loss Statement', title: 'Profit & Loss', group: 'Statements', icon: TrendingUp,
    description: 'Income, expenses and net profit for a period.', ...statement(),
  },
  {
    key: 'balance-sheet', report: 'Balance Sheet', title: 'Balance Sheet', group: 'Statements', icon: Scale,
    description: 'Assets, liabilities and equity on a date.', ...statement({ accumulated: true }),
  },
  {
    key: 'cash-flow', report: 'Cash Flow', title: 'Cash Flow', group: 'Statements', icon: Waves,
    description: 'Cash from operating, investing and financing activities.', ...statement(),
  },
  {
    columns: ['account', 'opening_debit', 'opening_credit', 'debit', 'credit', 'closing_debit', 'closing_credit'],
    key: 'trial-balance', report: 'Trial Balance', title: 'Trial Balance', group: 'Statements', icon: BarChart3,
    description: 'Opening, debit, credit and closing for every account.',
    filters: [
      company,
      { field: 'fiscal_year', label: 'Fiscal year', type: 'Link', options: 'Fiscal Year', reqd: true },
      { field: 'from_date', label: 'From', type: 'Date', reqd: true },
      { field: 'to_date', label: 'To', type: 'Date', reqd: true },
      { field: 'show_zero_values', label: 'Show zero rows', type: 'Check' },
      { field: 'show_net_values', label: 'Net debit / credit', type: 'Check' },
      { field: 'with_period_closing_entry_for_current_period', hidden: true },
    ],
    defaults: (ctx) => ({
      company: ctx.company, fiscal_year: ctx.fiscal_year?.name, from_date: fyStart(ctx), to_date: fyEnd(ctx),
      show_zero_values: 0, show_net_values: 1, with_period_closing_entry_for_current_period: 1,
    }),
    tree: true,
  },
  {
    key: 'general-ledger', report: 'General Ledger', title: 'General Ledger', group: 'Ledgers', icon: BookText,
    // Shown by default (fits the screen); the rest can be added from "Columns".
    columns: ['posting_date', 'account', 'debit', 'credit', 'balance', 'voucher_type', 'voucher_no', 'party'],
    description: 'Every posting by account, party or voucher, with running balance.',
    filters: [
      company,
      { field: 'from_date', label: 'From', type: 'Date', reqd: true },
      { field: 'to_date', label: 'To', type: 'Date', reqd: true },
      { field: 'account', label: 'Account', type: 'Link', options: 'Account', multi: true },
      { field: 'party_type', label: 'Party type', type: 'Link', options: 'Party Type' },
      { field: 'party', label: 'Party', type: 'Dynamic Link', options: 'party_type', multi: true },
      { field: 'voucher_no', label: 'Voucher no', type: 'Data' },
      { field: 'group_by', label: 'Group by', type: 'Select', options: '\nGroup by Voucher\nGroup by Voucher (Consolidated)\nGroup by Account\nGroup by Party' },
      costCenter,
    ],
    defaults: (ctx) => ({ company: ctx.company, from_date: fyStart(ctx), to_date: ctx.today, group_by: 'Group by Voucher (Consolidated)' }),
    // paged on the server except the subtotal views (by account / by party), which ERPNext builds
    paged: (f) => !['Group by Account', 'Group by Party'].includes(f.group_by), api: 'karya_erp.ledger_reports.run',
  },
  {
    payAction: 'receive', key: 'accounts-receivable', report: 'Accounts Receivable', columns: ['posting_date', 'party', 'voucher_no', 'due_date', 'invoiced', 'paid', 'outstanding', 'age'], title: 'Accounts Receivable', group: 'Receivables & payables', icon: Wallet,
    description: 'Open customer invoices with ageing buckets.', ...ageing('Customer'),
  },
  {
    columns: ['party', 'invoiced', 'paid', 'outstanding', 'range1', 'range2', 'range3', 'range4'],
    payAction: 'receive', key: 'accounts-receivable-summary', report: 'Accounts Receivable Summary', title: 'Receivable Summary', group: 'Receivables & payables', icon: Wallet,
    description: 'What each customer owes, by ageing bucket.', ...ageing('Customer'),
  },
  {
    payAction: 'pay', key: 'accounts-payable', report: 'Accounts Payable', columns: ['posting_date', 'party', 'voucher_no', 'due_date', 'invoiced', 'paid', 'outstanding', 'age'], title: 'Accounts Payable', group: 'Receivables & payables', icon: Landmark,
    description: 'Open supplier bills with ageing buckets.', ...ageing('Supplier'),
  },
  {
    columns: ['party', 'invoiced', 'paid', 'outstanding', 'range1', 'range2', 'range3', 'range4'],
    payAction: 'pay', key: 'accounts-payable-summary', report: 'Accounts Payable Summary', title: 'Payable Summary', group: 'Receivables & payables', icon: Landmark,
    description: 'What you owe each supplier, by ageing bucket.', ...ageing('Supplier'),
  },
  {
    key: 'uae-vat-201', report: 'UAE VAT 201', title: 'UAE VAT 201 (ERPNext)', group: 'Tax', icon: FileBarChart,
    description: 'ERPNext’s regional VAT 201 report, by emirate. Needs the UAE regional setup.',
    filters: [
      company,
      { field: 'from_date', label: 'From', type: 'Date', reqd: true },
      { field: 'to_date', label: 'To', type: 'Date', reqd: true },
    ],
    defaults: (ctx) => ({ company: ctx.company, from_date: `${ctx.today.slice(0, 8)}01`, to_date: ctx.today }),
  },
]

// ---------------------------------------------------------------- operational reports (Reports hub)
const monthStart = (ctx) => `${ctx.today.slice(0, 8)}01`
const ops = (r) => ({ backTo: '/reports', backTitle: 'All reports', ...r })
const stockFilters = [
  company,
  { field: 'from_date', label: 'From', type: 'Date', reqd: true },
  { field: 'to_date', label: 'To', type: 'Date', reqd: true },
  { field: 'warehouse', label: 'Warehouse', type: 'Link', options: 'Warehouse' },
  { field: 'item_code', label: 'Item', type: 'Link', options: 'Item' },
  { field: 'item_group', label: 'Item group', type: 'Link', options: 'Item Group' },
]
const analytics = (docType) => ({
  filters: [
    company,
    { field: 'from_date', label: 'From', type: 'Date', reqd: true },
    { field: 'to_date', label: 'To', type: 'Date', reqd: true },
    { field: 'tree_type', label: 'By', type: 'Select', options: docType === 'Sales Invoice' ? 'Customer\nCustomer Group\nTerritory\nItem\nItem Group\nOrder Type\nProject' : 'Supplier\nSupplier Group\nItem\nItem Group\nProject', reqd: true },
    { field: 'value_quantity', label: 'Show', type: 'Select', options: 'Value\nQuantity', reqd: true },
    { field: 'range', label: 'Periods', type: 'Select', options: 'Weekly\nMonthly\nQuarterly\nYearly', reqd: true },
    { field: 'doc_type', hidden: true },
  ],
  defaults: (ctx) => ({
    company: ctx.company, from_date: fyStart(ctx), to_date: ctx.today, doc_type: docType,
    tree_type: docType === 'Sales Invoice' ? 'Customer' : 'Supplier', value_quantity: 'Value', range: 'Monthly',
  }),
  tree: true,
  // One page of customers / suppliers / items / projects at a time from the server; the group views (small trees) use ERPNext's report.
  paged: (f) => ['Customer', 'Supplier', 'Item', 'Project'].includes(f.tree_type),
  api: 'karya_erp.analytics_reports.run',
})

export const OPS_REPORTS = [
  ops({
    key: 'stock-ledger', report: 'Stock Ledger', title: 'Stock Ledger', group: 'Stock', icon: ScrollText, paged: true,
    description: 'Every stock movement with running quantity and value.',
    columns: ['date', 'item_code', 'warehouse', 'in_qty', 'out_qty', 'qty_after_transaction', 'voucher_type', 'voucher_no'],
    filters: stockFilters, defaults: (ctx) => ({ company: ctx.company, from_date: monthStart(ctx), to_date: ctx.today }),
  }),
  ops({
    key: 'stock-balance-report', report: 'Stock Balance', title: 'Stock Balance (period)', group: 'Stock', icon: Boxes, paged: true,
    description: 'Opening, in, out and closing quantity and value per item and warehouse.',
    columns: ['item_code', 'item_name', 'warehouse', 'opening_qty', 'in_qty', 'out_qty', 'bal_qty', 'bal_val'],
    filters: [...stockFilters, { field: 'include_zero_stock_items', label: 'Include zero stock', type: 'Check' }], defaults: (ctx) => ({ company: ctx.company, from_date: monthStart(ctx), to_date: ctx.today }),
  }),
  ops({
    key: 'stock-projected-qty', report: 'Stock Projected Qty', title: 'Projected Quantity', group: 'Stock', icon: PackageSearch, paged: true,
    columns: ['item_code', 'item_name', 'warehouse', 'actual_qty', 'ordered_qty', 'reserved_qty', 'projected_qty', 'shortage_qty'],
    description: 'On hand, ordered, reserved and projected quantity — what to reorder.',
    filters: [company, { field: 'warehouse', label: 'Warehouse', type: 'Link', options: 'Warehouse' }, { field: 'item_code', label: 'Item', type: 'Link', options: 'Item' }, { field: 'item_group', label: 'Item group', type: 'Link', options: 'Item Group' }],
    defaults: (ctx) => ({ company: ctx.company }),
  }),
  ops({
    key: 'stock-ageing', report: 'Stock Ageing', title: 'Stock Ageing', group: 'Stock', icon: Hourglass,
    description: 'How long stock has been sitting, by age bucket.',
    filters: [company, { field: 'to_date', label: 'As on', type: 'Date', reqd: true }, { field: 'warehouse', label: 'Warehouse', type: 'Link', options: 'Warehouse' }, { field: 'item_code', label: 'Item', type: 'Link', options: 'Item' },
      { field: 'range1', hidden: true }, { field: 'range2', hidden: true }, { field: 'range3', hidden: true }, { field: 'range', hidden: true }],
    defaults: (ctx) => ({ company: ctx.company, to_date: ctx.today, range1: 30, range2: 60, range3: 90, range: '30, 60, 90' }),
  }),
  ops({
    key: 'warehouse-wise-stock-balance', report: 'Warehouse Wise Stock Balance', title: 'Stock Value by Warehouse', group: 'Stock', icon: Warehouse,
    description: 'Total stock value held in each warehouse.',
    filters: [company], defaults: (ctx) => ({ company: ctx.company }),
  }),
  ops({ key: 'sales-analytics', report: 'Sales Analytics', title: 'Sales Analytics', group: 'Selling', icon: TrendingUp, description: 'Sales by customer, item or territory per period.', ...analytics('Sales Invoice') }),
  ops({
    key: 'item-wise-sales-register', report: 'Item-wise Sales Register', title: 'Item-wise Sales', group: 'Selling', icon: ShoppingCart,
    paged: true, api: 'karya_erp.analytics_reports.run',
    columns: ['posting_date', 'invoice', 'customer_name', 'item_code', 'item_name', 'stock_qty', 'amount', 'total'],
    description: 'Every invoiced item line with quantity, rate, amount and tax.',
    filters: [company, { field: 'from_date', label: 'From', type: 'Date', reqd: true }, { field: 'to_date', label: 'To', type: 'Date', reqd: true }, { field: 'customer', label: 'Customer', type: 'Link', options: 'Customer' }, { field: 'item_code', label: 'Item', type: 'Link', options: 'Item' }],
    defaults: (ctx) => ({ company: ctx.company, from_date: monthStart(ctx), to_date: ctx.today }),
  }),
  ops({
    key: 'sales-order-analysis', report: 'Sales Order Analysis', title: 'Sales Order Status', group: 'Selling', icon: Activity,
    description: 'Open orders: what is still to deliver and to bill.',
    filters: [company, { field: 'from_date', label: 'From', type: 'Date', reqd: true }, { field: 'to_date', label: 'To', type: 'Date', reqd: true }],
    defaults: (ctx) => ({ company: ctx.company, from_date: fyStart(ctx), to_date: ctx.today }),
  }),
  ops({ key: 'purchase-analytics', report: 'Purchase Analytics', title: 'Purchase Analytics', group: 'Buying', icon: BarChart3, description: 'Purchases by supplier or item per period.', ...analytics('Purchase Invoice') }),
  ops({
    key: 'item-wise-purchase-register', report: 'Item-wise Purchase Register', title: 'Item-wise Purchases', group: 'Buying', icon: ShoppingBag,
    paged: true, api: 'karya_erp.analytics_reports.run',
    columns: ['posting_date', 'invoice', 'supplier_name', 'item_code', 'item_name', 'stock_qty', 'amount', 'total'],
    description: 'Every purchased item line with quantity, rate and amount.',
    filters: [company, { field: 'from_date', label: 'From', type: 'Date', reqd: true }, { field: 'to_date', label: 'To', type: 'Date', reqd: true }, { field: 'supplier', label: 'Supplier', type: 'Link', options: 'Supplier' }, { field: 'item_code', label: 'Item', type: 'Link', options: 'Item' }],
    defaults: (ctx) => ({ company: ctx.company, from_date: monthStart(ctx), to_date: ctx.today }),
  }),
  ops({
    key: 'purchase-order-analysis', report: 'Purchase Order Analysis', title: 'Purchase Order Status', group: 'Buying', icon: Activity,
    description: 'Open orders: what is still to receive and to bill.',
    filters: [company, { field: 'from_date', label: 'From', type: 'Date', reqd: true }, { field: 'to_date', label: 'To', type: 'Date', reqd: true }],
    defaults: (ctx) => ({ company: ctx.company, from_date: fyStart(ctx), to_date: ctx.today }),
  }),
]
export const OPS_GROUPS = ['Stock', 'Selling', 'Buying']

/** Our own summary page (not an ERPNext report) listed alongside them. */
export const VAT_RETURN_CARD = {
  key: 'vat-return', to: '/vat-return', title: 'VAT Return', group: 'Tax', icon: Receipt,
  description: 'Output VAT, input VAT and net VAT due for a quarter, from submitted invoices.',
}

export const REPORT_GROUPS = ['Statements', 'Ledgers', 'Receivables & payables', 'Tax']
export const reportByKey = (key) => REPORTS.find((r) => r.key === key) ?? OPS_REPORTS.find((r) => r.key === key)
