import { Building2, Landmark, Package, Receipt, Truck, UserCheck, Warehouse } from 'lucide-react'

/**
 * Quick-create popups (list "New", "+ Create" in dropdowns, top-bar + menu), modelled on the
 * e-envoicing CustomerModal / ItemModal.
 *
 * size:  'full'  -> compact 2-column card with fixed height (party masters, with tabs)
 *        'large' -> wide centred card (item, warehouse, small setup doctypes)
 * tabs:  [{ key, label, icon, fields }]  or  fields: [...]
 * field: 'fieldname' | { field, label, hint, wide, placeholder, readOnly, filters, type, options, virtual }
 *        virtual: not a DocType field — ERPNext reads it on insert (address_line1 … -> primary Address,
 *        mobile_no / email_id -> primary Contact).
 */
const address = [
  { field: 'address_line1', label: 'Street address (line 1)', type: 'Data', virtual: true, placeholder: 'e.g. Office 1204, Al Reem Tower' },
  { field: 'address_line2', label: 'Building / unit (line 2)', type: 'Data', virtual: true },
  { field: 'city', label: 'City', type: 'Data', virtual: true, placeholder: 'e.g. Dubai' },
  { field: 'state', label: 'Emirate / state', type: 'Data', virtual: true, placeholder: 'e.g. Sharjah' },
  { field: 'pincode', label: 'Postal / P.O. box', type: 'Data', virtual: true },
  { field: 'country', label: 'Country', type: 'Link', options: 'Country', virtual: true },
]

export const QUICK_CREATE = {
  Customer: {
    icon: UserCheck, tone: 'emerald', size: 'full',
    subtitle: 'Create a client account for quotations, sales orders and invoices',
    tabs: [
      {
        key: 'details', label: 'General Details',
        fields: [
          'customer_type',
          { field: 'customer_name', placeholder: 'e.g. Al Noor Trading LLC' },
          { field: 'tax_id', label: 'TRN / VAT number', hint: 'Tax registration' },
          { field: 'mobile_no', label: 'Phone number', readOnly: false, type: 'Data', virtual: true, hint: 'Creates contact', placeholder: '+971 50 000 0000' },
          { field: 'email_id', label: 'Email address', readOnly: false, type: 'Data', virtual: true, placeholder: 'accounts@company.ae' },
          { field: 'default_currency', label: 'Billing currency', hint: 'Default' },
          'customer_group',
          'territory',
          { field: 'payment_terms', label: 'Payment terms' },
          { field: 'default_price_list', label: 'Price list', hint: 'Used at the till & in sales', filters: { selling: 1, enabled: 1 } },
        ],
      },
      { key: 'address', label: 'Address & Location', fields: address },
    ],
    defaults: (boot) => ({ customer_type: 'Company', country: 'United Arab Emirates', default_currency: boot.currency, default_price_list: boot.selling_price_list || undefined }),
    titleField: 'customer_name',
    footerTag: 'Customer Master',
  },
  Supplier: {
    icon: Truck, tone: 'blue', size: 'full',
    subtitle: 'Create a vendor profile for purchase orders, receipts and bills',
    tabs: [
      {
        key: 'details', label: 'General Details',
        fields: [
          'supplier_type',
          { field: 'supplier_name', placeholder: 'e.g. Gulf Steel Supplies' },
          { field: 'tax_id', label: 'TRN / VAT number', hint: 'Tax registration' },
          { field: 'mobile_no', label: 'Phone number', readOnly: false, type: 'Data', virtual: true, hint: 'Creates contact', placeholder: '+971 50 000 0000' },
          { field: 'email_id', label: 'Email address', readOnly: false, type: 'Data', virtual: true, placeholder: 'sales@vendor.ae' },
          { field: 'default_currency', label: 'Billing currency', hint: 'Default' },
          'supplier_group',
          'country',
          { field: 'payment_terms', label: 'Payment terms' },
        ],
      },
      { key: 'address', label: 'Address & Location', fields: address.filter((f) => f.field !== 'country') },
    ],
    defaults: (boot) => ({ supplier_type: 'Company', country: 'United Arab Emirates', default_currency: boot.currency }),
    titleField: 'supplier_name',
    footerTag: 'Supplier Master',
  },
  Item: {
    icon: Package, tone: 'blue', size: 'large',
    subtitle: 'Configure item group, unit of measure and default rates',
    fields: [
      { field: 'item_group', label: 'Item group' },
      { field: 'item_name', reqd: true, placeholder: 'e.g. Dell Latitude 5530 Laptop' },
      { field: 'item_code', reqd: false, label: 'Item code / SKU', hint: 'Unique ID · blank = name', placeholder: 'e.g. ITM-DELL-5530', mono: true },
      { field: 'stock_uom', label: 'Unit of measure (UOM)' },
      { field: 'item_tax_template', label: 'Tax template', type: 'Link', options: 'Item Tax Template', virtual: true, hint: 'VAT / zero-rated / exempt', filters: { disabled: 0 } },
      { field: 'valuation_rate', label: 'Standard buying rate', hint: 'Valuation' },
      { field: 'standard_rate', label: 'Standard selling price', hint: 'Creates item price' },
      { field: 'is_stock_item', label: 'Maintain stock', hint: 'Track quantity' },
      { field: 'description', wide: true, hint: 'Specifications / notes', placeholder: 'Item description, specifications or notes…' },
    ],
    defaults: { is_stock_item: 1, stock_uom: 'Nos' },
    titleField: 'item_name',
    footerTag: 'Item Master',
    // ERPNext names items by item_code; copy the name across when no code is typed.
    beforeSave: ({ item_tax_template: tax, ...d }) => ({ ...d, item_code: d.item_code || d.item_name, ...(tax ? { taxes: [{ item_tax_template: tax }] } : {}) }),
  },
  // A ledger account, e.g. a new VAT / excise / freight account while setting up a tax template.
  Account: {
    icon: Landmark, tone: 'amber', size: 'large',
    subtitle: 'Add an account to your chart of accounts',
    fields: [
      { field: 'account_name', placeholder: 'e.g. VAT 5%' },
      { field: 'parent_account', label: 'Under (group account)', hint: 'e.g. Duties and Taxes', filters: (d) => ({ is_group: 1, ...(d.company ? { company: d.company } : {}) }) },
      { field: 'account_type', label: 'Account type', hint: 'Tax for VAT / excise' },
      { field: 'tax_rate', label: 'Tax rate %', hint: 'Tax accounts only' },
    ],
    defaults: (boot) => ({ company: boot.company }),
    titleField: 'account_name',
    footerTag: 'Chart of accounts',
  },
  'Item Tax Template': {
    icon: Receipt, tone: 'blue', size: 'large',
    subtitle: 'How an item is taxed: VAT 5%, zero-rated, exempt, excise …',
    fields: [
      { field: 'title', label: 'Template name', placeholder: 'e.g. UAE VAT 5%' },
      { field: 'tax_type', label: 'Tax account', type: 'Link', options: 'Account', virtual: true, reqd: true, hint: 'Same account as the invoice tax row', filters: (d) => ({ is_group: 0, ...(d.company ? { company: d.company } : {}) }) },
      { field: 'tax_rate', label: 'Tax rate %', type: 'Percent', virtual: true, hint: '0 for zero-rated' },
      { field: 'not_applicable', label: 'Not applicable (exempt)', type: 'Check', virtual: true, hint: 'No tax on this account' },
    ],
    defaults: (boot) => ({ company: boot.company, tax_rate: 5 }),
    titleField: 'title',
    footerTag: 'Item Tax Template',
    beforeSave: ({ tax_type: taxType, tax_rate: rate, not_applicable: na, ...d }) => ({ ...d, taxes: [{ tax_type: taxType, tax_rate: na ? 0 : Number(rate) || 0, not_applicable: na ? 1 : 0 }] }),
  },
  Warehouse: {
    icon: Warehouse, tone: 'amber', size: 'large',
    subtitle: 'Add a store, branch or transit location for stock',
    fields: [
      { field: 'warehouse_name', placeholder: 'e.g. Sharjah Main Store' },
      { field: 'parent_warehouse', hint: 'Group', filters: (d) => ({ is_group: 1, ...(d.company ? { company: d.company } : {}) }) },
      'warehouse_type',
      { field: 'is_group', label: 'Group warehouse', hint: 'Holds other warehouses' },
    ],
    defaults: (boot) => ({ company: boot.company }),
    titleField: 'warehouse_name',
    footerTag: 'Warehouse',
  },
}

/** Small setup doctypes that get an automatic form (their required fields). */
export const SIMPLE_CREATE = new Set(['Customer Group', 'Supplier Group', 'Item Group', 'Territory', 'UOM', 'Brand'])
export const SIMPLE_ICON = Building2

export const canQuickCreate = (doctype) => Boolean(QUICK_CREATE[doctype]) || SIMPLE_CREATE.has(doctype)
