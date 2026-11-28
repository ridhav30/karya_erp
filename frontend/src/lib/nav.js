import {
  Factory, LayoutDashboard, History, CheckSquare, ShoppingCart, Users, FileText, ClipboardList, Truck, Receipt,
  ShoppingBag, Building2, ClipboardCheck, PackageCheck, FileSpreadsheet, Boxes, Package, Warehouse,
  ArrowLeftRight, BarChart3, Wallet, CreditCard, LineChart, PieChart, Network, BookText, FileMinus2, FilePlus2,
  FileBarChart, Settings2, Target, Banknote, Percent, CalendarRange,
  UserRound, Contact, IdCard, FileBadge, Layers, BadgeCheck, MapPin, CalendarDays,
  CalendarCheck, Grid3x3, ListChecks, Fingerprint, Clock, CalendarClock, Repeat,
  Plane, CalendarPlus, Tags, CalendarSearch, Home,
  ArrowDownToLine, ArrowUpFromLine,
  HandCoins, Coins, ScrollText, Sheet, Puzzle, UserCog, Gift, ReceiptText,
  Gauge, GitMerge, Kanban, TrendingUp, SlidersHorizontal, PhoneCall, DoorOpen, Award, Repeat2, Magnet, Lightbulb, Landmark, CalendarCheck2, Link2, Lock, PiggyBank, BellRing, Building, Tag, BadgePercent, ClipboardCheck as ClipboardCheckIcon, Ship, Layers3, Barcode, ScrollText as ScrollTextIcon, ClipboardList as ClipboardListIcon, Target as TargetIcon, Star, MessageSquareQuote, UsersRound, Scale, Armchair, ChefHat, Hash, ConciergeBell, UserPlus, Store, FolderKanban,
} from 'lucide-react'
import { HR_ROLES } from './hr.js'

/**
 * Sidebar menu. `doctype` is used for the permission check (boot.can_read).
 * Groups are hidden when the user can read none of their items.
 */
const ALL_NAV = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  // Leave approvers who are otherwise plain employees still get the inbox.
  { label: 'Approvals', to: '/approvals', icon: CheckSquare, badge: 'pending_approvals', selfService: true, when: (b) => !b.employee_only || b.is_approver },
  // Self-service: every user linked to an Employee. Plain employees see only this (boot.employee_only).
  { label: 'My HR', to: '/my-hr', icon: UserRound, when: (b) => Boolean(b.employee), selfService: true },
  { label: 'My Team', to: '/my-team', icon: UsersRound, when: (b) => Boolean(b.has_reports), selfService: true },
  {
    label: 'CRM', icon: Magnet,
    items: [
      { label: 'Leads', to: '/leads', icon: Magnet, doctype: 'Lead' },
      { label: 'Opportunities', to: '/opportunities', icon: Lightbulb, doctype: 'Opportunity' },
      { label: 'Deal Board', to: '/deal-board', icon: Kanban, doctype: 'Opportunity' },
      { label: 'Sales Forecast', to: '/sales-forecast', icon: TrendingUp, doctype: 'Opportunity' },
      { label: 'Lead Scoring', to: '/lead-scoring', icon: Gauge, doctype: 'Lead' },
      { label: 'Duplicate Leads', to: '/lead-duplicates', icon: GitMerge, doctype: 'Lead' },
      { label: 'CRM Fields', to: '/crm-fields', icon: SlidersHorizontal, doctype: 'Lead' },
      { label: 'Telephony', to: '/telephony', icon: PhoneCall, doctype: 'Lead' },
    ],
  },
  {
    label: 'Selling', icon: ShoppingCart,
    items: [
      { label: 'Point of Sale', to: '/pos', icon: Store, doctype: 'POS Profile', requires: ['/pos-profiles', '/pos-closing-entries'] },
      { label: 'Customers', to: '/customers', icon: Users, doctype: 'Customer' },
      { label: 'Waiter Orders', to: '/waiter', icon: ConciergeBell, doctype: 'Restaurant Order' },
      { label: 'Token Screen', to: '/token-screen', icon: Hash, doctype: 'Restaurant Order' },
      { label: 'Kitchen Display', to: '/kitchen', icon: ChefHat, doctype: 'Kitchen Station' },
      { label: 'Restaurant Orders', to: '/restaurant-orders', icon: ClipboardList, doctype: 'Restaurant Order' },
      { label: 'Table Bookings', to: '/table-bookings', icon: CalendarClock, doctype: 'Table Booking' },
      { label: 'Restaurant Tables', to: '/restaurant-tables', icon: Armchair, doctype: 'Restaurant Table' },
      { label: 'Kitchens', to: '/kitchens', icon: ChefHat, doctype: 'Kitchen Station' },
      { label: 'Quotations', to: '/quotations', icon: FileText, doctype: 'Quotation' },
      { label: 'Sales Orders', to: '/sales-orders', icon: ClipboardList, doctype: 'Sales Order' },
      { label: 'Delivery Notes', to: '/delivery-notes', icon: Truck, doctype: 'Delivery Note' },
      { label: 'Sales Invoices', to: '/sales-invoices', icon: Receipt, doctype: 'Sales Invoice' },
    ],
  },
  {
    label: 'Buying', icon: ShoppingBag,
    items: [
      { label: 'Suppliers', to: '/suppliers', icon: Building2, doctype: 'Supplier' },
      { label: 'Material Requests', to: '/material-requests', icon: ClipboardCheck, doctype: 'Material Request' },
      { label: 'Requests for Quotation', to: '/request-for-quotations', icon: MessageSquareQuote, doctype: 'Request for Quotation' },
      { label: 'Supplier Quotations', to: '/supplier-quotations', icon: FileText, doctype: 'Supplier Quotation' },
      { label: 'Compare Quotes', to: '/quote-comparison', icon: Scale, doctype: 'Supplier Quotation', requires: ['/supplier-quotations', '/request-for-quotations'] },
      { label: 'Purchase Orders', to: '/purchase-orders', icon: ClipboardList, doctype: 'Purchase Order' },
      { label: 'Purchase Receipts', to: '/purchase-receipts', icon: PackageCheck, doctype: 'Purchase Receipt' },
      { label: 'Purchase Invoices', to: '/purchase-invoices', icon: FileSpreadsheet, doctype: 'Purchase Invoice' },
    ],
  },
  {
    label: 'Stock', icon: Boxes,
    items: [
      { label: 'Items', to: '/items', icon: Package, doctype: 'Item' },
      { label: 'Warehouses', to: '/warehouses', icon: Warehouse, doctype: 'Warehouse' },
      { label: 'Racks', to: '/racks', icon: Layers3, doctype: 'Warehouse' },
      { label: 'Stock Entries', to: '/stock-entries', icon: ArrowLeftRight, doctype: 'Stock Entry' },
      { label: 'Stock Balance', to: '/stock-balance', icon: BarChart3, doctype: 'Bin' },
      { label: 'Stock Reconciliation', to: '/stock-reconciliations', icon: ClipboardCheckIcon, doctype: 'Stock Reconciliation' },
      { label: 'Landed Costs', to: '/landed-costs', icon: Ship, doctype: 'Landed Cost Voucher' },
      { label: 'Batches', to: '/batches', icon: Layers3, doctype: 'Batch' },
      { label: 'Serial Numbers', to: '/serial-nos', icon: Barcode, doctype: 'Serial No' },
      { label: 'Stock Ledger', to: '/reports/stock-ledger', icon: ScrollTextIcon, doctype: 'Stock Ledger Entry' },
    ],
  },
  {
    label: 'Manufacturing', icon: Factory,
    items: [
      { label: 'Bill of Materials', to: '/bill-of-materials', icon: Layers3, doctype: 'BOM', requires: ['/operations', '/workstations'] },
      { label: 'Work Orders', to: '/work-orders', icon: ClipboardList, doctype: 'Work Order', requires: ['/bill-of-materials'] },
      { label: 'Job Cards', to: '/job-cards', icon: ListChecks, doctype: 'Job Card', requires: ['/work-orders'] },
      { label: 'Operations', to: '/operations', icon: SlidersHorizontal, doctype: 'Operation' },
      { label: 'Workstations', to: '/workstations', icon: Factory, doctype: 'Workstation' },
      { label: 'Production Plans', to: '/production-plans', icon: CalendarRange, doctype: 'Production Plan', requires: ['/work-orders', '/bill-of-materials'] },
      { label: 'Subcontract POs', to: '/subcontract-purchase-orders', icon: ClipboardList, doctype: 'Purchase Order', requires: ['/subcontracting-orders'] },
      { label: 'Subcontracting Orders', to: '/subcontracting-orders', icon: Truck, doctype: 'Subcontracting Order', requires: ['/subcontract-purchase-orders', '/subcontracting-receipts', '/subcontracting-boms'] },
      { label: 'Subcontracting Receipts', to: '/subcontracting-receipts', icon: PackageCheck, doctype: 'Subcontracting Receipt' },
      { label: 'Subcontracting BOMs', to: '/subcontracting-boms', icon: Layers3, doctype: 'Subcontracting BOM' },
    ],
  },
  {
    label: 'Pricing', icon: Tag,
    items: [
      { label: 'Item Prices', to: '/item-prices', icon: Tag, doctype: 'Item Price' },
      { label: 'Price Lists', to: '/price-lists', icon: FileText, doctype: 'Price List' },
      { label: 'Pricing Rules', to: '/pricing-rules', icon: BadgePercent, doctype: 'Pricing Rule' },
    ],
  },
  {
    label: 'Accounts', icon: Wallet,
    items: [
      { label: 'Overview', to: '/accounts', icon: PieChart, doctype: 'GL Entry' },
      { label: 'Accounts Receivable', to: '/receivable', icon: HandCoins, doctype: 'Sales Invoice' },
      { label: 'Receive Payment', to: '/receive', icon: ArrowDownToLine, doctype: 'Payment Entry' },
      { label: 'Receipt History', to: '/receivable-history', icon: History, doctype: 'Payment Entry' },
      { label: 'Accounts Payable', to: '/payable', icon: Landmark, doctype: 'Purchase Invoice' },
      { label: 'Make Payment', to: '/pay', icon: ArrowUpFromLine, doctype: 'Payment Entry' },
      { label: 'Payment History', to: '/payable-history', icon: History, doctype: 'Payment Entry' },
      { label: 'Payments', to: '/payments', icon: CreditCard, doctype: 'Payment Entry' },
      { label: 'Post-dated Cheques', to: '/cheques', icon: CalendarClock, doctype: 'Payment Entry' },
      { label: 'Journal Entries', to: '/journal-entries', icon: BookText, doctype: 'Journal Entry' },
      { label: 'Credit Notes', to: '/credit-notes', icon: FileMinus2, doctype: 'Sales Invoice' },
      { label: 'Debit Notes', to: '/debit-notes', icon: FilePlus2, doctype: 'Purchase Invoice' },
      { label: 'Chart of Accounts', to: '/chart-of-accounts', icon: Network, doctype: 'GL Entry' },
      { label: 'Financial Reports', to: '/financial-reports', icon: FileBarChart, doctype: 'GL Entry' },
      { label: 'VAT Return', to: '/vat-return', icon: Receipt, doctype: 'Sales Invoice' },
      { label: 'E-invoicing', to: '/e-invoicing', icon: FileSpreadsheet, doctype: 'Sales Invoice' },
      { label: 'Bank Statements', to: '/bank-statement', icon: Landmark, doctype: 'Bank Transaction' },
      { label: 'Bank Reconciliation', to: '/bank-clearance', icon: CalendarCheck2, doctype: 'Payment Entry' },
      { label: 'Payment Reconciliation', to: '/payment-reconciliation', icon: Link2, doctype: 'Payment Entry' },
      { label: 'Dunning', to: '/dunnings', icon: BellRing, doctype: 'Dunning' },
      { label: 'Budgets', to: '/budgets', icon: PiggyBank, doctype: 'Budget' },
      { label: 'Opening Balances', to: '/opening-entries', icon: BookText, doctype: 'Journal Entry' },
      { label: 'Period Closing', to: '/period-closing', icon: Lock, doctype: 'Period Closing Voucher' },
    ],
  },
  {
    label: 'Projects', icon: FolderKanban,
    items: [
      { label: 'Overview', to: '/project-board', icon: Gauge, doctype: 'Project' },
      { label: 'Projects', to: '/projects', icon: ListChecks, doctype: 'Project' },
      { label: 'Tasks', to: '/tasks', icon: CheckSquare, doctype: 'Task' },
      { label: 'Timesheets', to: '/timesheets', icon: Clock, doctype: 'Timesheet' },
      { label: 'Project Types', to: '/project-types', icon: Tags, doctype: 'Project Type' },
      { label: 'Activity Types', to: '/activity-types', icon: Layers, doctype: 'Activity Type' },
    ],
  },
  {
    label: 'Recruitment', icon: UserPlus, roles: HR_ROLES,
    items: [
      { label: 'Hiring Board', to: '/recruitment', icon: Gauge, doctype: 'Job Applicant' },
      { label: 'Job Openings', to: '/job-openings', icon: Tag, doctype: 'Job Opening' },
      { label: 'Applicants', to: '/job-applicants', icon: Users, doctype: 'Job Applicant' },
      { label: 'Interviews', to: '/interviews', icon: CalendarCheck, doctype: 'Interview' },
      { label: 'Job Offers', to: '/job-offers', icon: FileBadge, doctype: 'Job Offer' },
      { label: 'Interview Types', to: '/interview-types', icon: ListChecks, doctype: 'Interview Type' },
      { label: 'Applicant Sources', to: '/applicant-sources', icon: Magnet, doctype: 'Job Applicant Source' },
      { label: 'Skills', to: '/skills', icon: Lightbulb, doctype: 'Skill' },
    ],
  },
  {
    label: 'Assets', icon: Armchair,
    items: [
      { label: 'Fixed Assets', to: '/fixed-assets', icon: Armchair, doctype: 'Asset' },
      { label: 'Asset List', to: '/assets', icon: ListChecks, doctype: 'Asset' },
      { label: 'Asset Movements', to: '/asset-movements', icon: ArrowLeftRight, doctype: 'Asset Movement' },
      { label: 'Asset Categories', to: '/asset-categories', icon: Tags, doctype: 'Asset Category' },
      { label: 'Locations', to: '/locations', icon: MapPin, doctype: 'Location' },
    ],
  },
  {
    label: 'HR', icon: Contact, roles: HR_ROLES,
    items: [
      { label: 'HR Dashboard', to: '/hr-dashboard', icon: Gauge, doctype: 'Employee' },
      { label: 'Employees', to: '/employees', icon: IdCard, doctype: 'Employee' },
      { label: 'Employee Documents', to: '/employee-documents', icon: FileBadge, doctype: 'Karya Erp Employee Document' },
      { label: 'Karya Erp Salary History', to: '/salary-history', icon: Banknote, doctype: 'Karya Erp Salary History' },
      { label: 'Departments', to: '/departments', icon: Layers, doctype: 'Department' },
      { label: 'Designations', to: '/designations', icon: BadgeCheck, doctype: 'Designation' },
      { label: 'Branches', to: '/branches', icon: MapPin, doctype: 'Branch' },
      { label: 'Holidays', to: '/holidays', icon: CalendarDays, doctype: 'Holiday List' },
      { label: 'Holiday Lists', to: '/holiday-lists', icon: CalendarDays, doctype: 'Holiday List' },
      { label: 'Holiday Assignments', to: '/holiday-list-assignments', icon: CalendarCheck, doctype: 'Holiday List Assignment' },
      { label: 'Final Settlement', to: '/final-settlement', icon: DoorOpen, doctype: 'Employee' },
    ],
  },
  {
    label: 'Attendance & Shifts', icon: CalendarCheck, roles: HR_ROLES,
    items: [
      { label: 'Daily Sheet', to: '/attendance-sheet', icon: ListChecks, doctype: 'Attendance' },
      { label: 'Monthly Register', to: '/attendance-register', icon: Grid3x3, doctype: 'Attendance' },
      { label: 'Attendance Records', to: '/attendance', icon: CalendarCheck, doctype: 'Attendance' },
      { label: 'Check-ins', to: '/checkins', icon: Fingerprint, doctype: 'Employee Checkin' },
      { label: 'Shift Roster', to: '/shift-roster', icon: CalendarRange, doctype: 'Shift Assignment' },
      { label: 'Shift Types', to: '/shift-types', icon: Clock, doctype: 'Shift Type' },
      { label: 'Shift Assignments', to: '/shift-assignments', icon: CalendarClock, doctype: 'Shift Assignment' },
      { label: 'Shift Requests', to: '/shift-requests', icon: Repeat, doctype: 'Shift Request' },
    ],
  },
  {
    label: 'Leave', icon: Plane, roles: HR_ROLES,
    items: [
      { label: 'Leave Applications', to: '/leave-applications', icon: Plane, doctype: 'Leave Application' },
      { label: 'Allocate Leave', to: '/allocate-leave', icon: CalendarPlus, doctype: 'Leave Allocation' },
      { label: 'Leave Allocations', to: '/leave-allocations', icon: CalendarSearch, doctype: 'Leave Allocation' },
      { label: 'Leave Types', to: '/leave-types', icon: Tags, doctype: 'Leave Type' },
      { label: 'Leave Periods', to: '/leave-periods', icon: CalendarRange, doctype: 'Leave Period' },
      { label: 'Attendance Requests', to: '/attendance-requests', icon: Home, doctype: 'Attendance Request' },
    ],
  },
  {
    label: 'Payroll', icon: HandCoins, roles: HR_ROLES,
    items: [
      { label: 'Payroll', to: '/payroll', icon: Coins, doctype: 'Payroll Entry' },
      { label: 'Payroll Runs', to: '/payroll-runs', icon: ScrollText, doctype: 'Payroll Entry' },
      { label: 'Salary Slips', to: '/salary-slips', icon: FileText, doctype: 'Salary Slip' },
      { label: 'Salary Register', to: '/salary-register', icon: Sheet, doctype: 'Salary Slip' },
      { label: 'Overtime', to: '/overtime', icon: Clock, roles: HR_ROLES },
      { label: 'Employee Loans', to: '/loans', icon: HandCoins, roles: HR_ROLES },
      { label: 'Air Tickets', to: '/air-tickets', icon: Plane, roles: HR_ROLES },
      { label: 'Provisions', to: '/provisions', icon: PiggyBank, roles: ['HR Manager', 'Accounts Manager', 'System Manager'] },
      { label: 'Salary Structures', to: '/salary-structures', icon: Puzzle, doctype: 'Salary Structure' },
      { label: 'Salary Assignments', to: '/salary-assignments', icon: UserCog, doctype: 'Salary Structure Assignment' },
      { label: 'Salary Components', to: '/salary-components', icon: Layers, doctype: 'Salary Component' },
      { label: 'Additional Salary', to: '/additional-salary', icon: Gift, doctype: 'Additional Salary' },
      { label: 'Karya Erp WPS Settings', to: '/wps-settings', icon: Settings2, doctype: 'Karya Erp WPS Settings' },
    ],
  },
  {
    label: 'Expenses', icon: ReceiptText, roles: [...HR_ROLES, 'Accounts User', 'Accounts Manager'],
    items: [
      { label: 'Expense Claims', to: '/expense-claims', icon: ReceiptText, doctype: 'Expense Claim' },
      { label: 'Employee Advances', to: '/employee-advances', icon: HandCoins, doctype: 'Employee Advance' },
      { label: 'Expense Types', to: '/expense-claim-types', icon: Tags, doctype: 'Expense Claim Type' },
    ],
  },
  {
    label: 'Performance', icon: Award, roles: HR_ROLES,
    items: [
      { label: 'Overview', to: '/performance', icon: Award, doctype: 'Appraisal Cycle' },
      { label: 'Appraisal Cycles', to: '/appraisal-cycles', icon: Repeat2, doctype: 'Appraisal Cycle' },
      { label: 'Appraisals', to: '/appraisals', icon: ClipboardListIcon, doctype: 'Appraisal' },
      { label: 'Goals', to: '/goals', icon: TargetIcon, doctype: 'Goal' },
      { label: 'Feedback', to: '/performance-feedback', icon: MessageSquareQuote, doctype: 'Employee Performance Feedback' },
      { label: 'Appraisal Templates', to: '/appraisal-templates', icon: FileText, doctype: 'Appraisal Template' },
      { label: 'KRAs', to: '/kras', icon: TargetIcon, doctype: 'KRA' },
      { label: 'Rating Criteria', to: '/feedback-criteria', icon: Star, doctype: 'Employee Feedback Criteria' },
    ],
  },
  {
    label: 'Accounts Setup', icon: Settings2,
    items: [
      { label: 'Bank Accounts', to: '/bank-accounts', icon: Landmark, doctype: 'Bank Account' },
      { label: 'Banks', to: '/banks', icon: Building, doctype: 'Bank' },
      { label: 'Cost Centers', to: '/cost-centers', icon: Target, doctype: 'Cost Center' },
      { label: 'Finance Books', to: '/finance-books', icon: BookText, doctype: 'Finance Book' },
      { label: 'Payment Terms', to: '/payment-terms', icon: CalendarClock, doctype: 'Payment Term' },
      { label: 'Payment Term Templates', to: '/payment-terms-templates', icon: CalendarRange, doctype: 'Payment Terms Template' },
      { label: 'Dunning Types', to: '/dunning-types', icon: BellRing, doctype: 'Dunning Type' },
      { label: 'Modes of Payment', to: '/modes-of-payment', icon: Banknote, doctype: 'Mode of Payment' },
      { label: 'Sales Tax Templates', to: '/sales-tax-templates', icon: Percent, doctype: 'Sales Taxes and Charges Template' },
      { label: 'Purchase Tax Templates', to: '/purchase-tax-templates', icon: Percent, doctype: 'Purchase Taxes and Charges Template' },
      { label: 'Item Tax Templates', to: '/item-tax-templates', icon: Percent, doctype: 'Item Tax Template' },
      { label: 'Fiscal Years', to: '/fiscal-years', icon: CalendarRange, doctype: 'Fiscal Year' },
      { label: 'POS Counters', to: '/pos-profiles', icon: Store, doctype: 'POS Profile' },
      { label: 'Shift Closings', to: '/pos-closing-entries', icon: ClipboardCheckIcon, doctype: 'POS Closing Entry' },
    ],
  },
  { label: 'Reports', to: '/reports', icon: LineChart },
  { label: 'Import data', to: '/import', icon: FileSpreadsheet, roles: ['System Manager', 'Accounts Manager', 'HR Manager', 'HR User', 'Stock Manager', 'Item Manager', 'Sales Manager', 'Sales Master Manager', 'Purchase Manager', 'Purchase Master Manager'] },
  { label: 'Audit log', to: '/audit-log', icon: History, roles: ['System Manager', 'Auditor'] },
  { label: 'Users & Access', to: '/users', icon: UserCog, roles: ['System Manager'] },
  { label: 'Settings', to: '/settings', icon: Settings2, roles: ['System Manager', 'Accounts Manager', 'HR Manager'] },
  { label: 'Custom', icon: FileText, items: [
      { label: "Employee programs", to: "/employee-programs", icon: FileText, doctype: "Employee programs" },
    ] },
]

// ---- Menu arranged in the Operator ------------------------------------------------------
// ENABLED: entries the app has.  LABELS: renamed entries (route → name).
// MENU: order and grouping. { to } is a top-level entry; { group, label, items } a group
// ("group" is the source group whose icon and rules it reuses; null for a group made in the Operator).
const ENABLED = new Set([
    "/",
    "/accounts",
    "/audit-log",
    "/batches",
    "/credit-notes",
    "/customers",
    "/employee-programs",
    "/financial-reports",
    "/import",
    "/item-prices",
    "/items",
    "/my-hr",
    "/pay",
    "/payable",
    "/payable-history",
    "/payments",
    "/pos",
    "/pos-closing-entries",
    "/pos-profiles",
    "/price-lists",
    "/pricing-rules",
    "/purchase-invoices",
    "/purchase-orders",
    "/purchase-receipts",
    "/receivable",
    "/receivable-history",
    "/receive",
    "/sales-invoices",
    "/stock-balance",
    "/stock-entries",
    "/stock-reconciliations",
    "/suppliers",
    "/users",
    "/vat-return",
    "/warehouses"
  ])
const LABELS = {}
const MENU = [
    {
      "to": "/"
    },
    {
      "group": "Selling",
      "label": "Sales",
      "items": [
        "/pos",
        "/customers",
        "/sales-invoices"
      ]
    },
    {
      "group": "Buying",
      "label": "Purchase",
      "items": [
        "/suppliers",
        "/purchase-orders",
        "/purchase-receipts",
        "/purchase-invoices"
      ]
    },
    {
      "group": "Stock",
      "label": "Inventory",
      "items": [
        "/items",
        "/warehouses",
        "/stock-entries",
        "/stock-balance",
        "/stock-reconciliations",
        "/batches"
      ]
    },
    {
      "group": "Pricing",
      "label": "Pricing",
      "items": [
        "/item-prices",
        "/price-lists",
        "/pricing-rules"
      ]
    },
    {
      "group": "Accounts",
      "label": "Accounts",
      "items": [
        "/accounts",
        "/receivable",
        "/receive",
        "/receivable-history",
        "/payable",
        "/pay",
        "/payable-history",
        "/payments",
        "/credit-notes",
        "/financial-reports",
        "/vat-return"
      ]
    },
    {
      "to": "/import"
    },
    {
      "to": "/audit-log"
    },
    {
      "to": "/users"
    },
    {
      "group": "Accounts Setup",
      "label": "Accounts Setup",
      "items": [
        "/pos-profiles",
        "/pos-closing-entries"
      ]
    },
    {
      "to": "/my-hr"
    },
    {
      "group": "Custom",
      "label": "Programs",
      "items": [
        "/employee-programs"
      ]
    }
  ]

const ENTRY = {}
const GROUP = {}
for (const g of ALL_NAV) {
  if (g.items) {
    GROUP[g.label] = g
    for (const i of g.items) ENTRY[i.to] = i
  } else ENTRY[g.to] = g
}
const entry = (to) => (ENTRY[to] && ENABLED.has(to) ? (LABELS[to] ? { ...ENTRY[to], label: LABELS[to] } : ENTRY[to]) : null)
export const NAV = MENU
  .map((n) => {
    if (!n.items) return entry(n.to)
    const items = n.items.map(entry).filter(Boolean)
    if (!items.length) return null
    return { ...(GROUP[n.group] ?? { icon: items[0].icon }), label: n.label, items }
  })
  .filter(Boolean)

/** Doctypes the server should check read permission for (kept in sync with karya_erp/api.py). */
export const NAV_DOCTYPES = NAV.flatMap((g) => g.items ?? [g]).map((i) => i.doctype).filter(Boolean)

// child route -> the menu entries that need it (an entry's `requires` lists the child features it cannot work without)
const PARENTS = {}
for (const g of NAV) {
  for (const i of g.items ?? [g]) {
    for (const r of i.requires ?? []) (PARENTS[r] ??= []).push({ to: i.to, group: g.items ? g.label : null })
  }
}

// Pages everyone may open whatever their page access says: home and the self-service pages.
const OPEN_ROUTES = new Set(['/', '/approvals', '/my-hr', '/my-team'])

/**
 * Per-person page access (Users & access): null / "All" = every page their roles allow; "Custom" = only the listed
 * modules (menu groups, including pages added to them later) and pages. An administrator can always open Users & access.
 */
export function pageAllowed(boot, route, groupLabel) {
  const pa = boot?.page_access
  if (!pa || pa.mode !== 'Custom') return true
  if (OPEN_ROUTES.has(route)) return true
  if (route === '/users' && boot.is_system_manager) return true
  const direct = (to, group) => (group != null && (pa.modules ?? []).includes(group)) || (pa.pages ?? []).includes(to)
  // A child feature (POS counters under Point of Sale …) is open whenever a feature that needs it is.
  return direct(route, groupLabel) || (PARENTS[route] ?? []).some((p) => direct(p.to, p.group))
}

/**
 * May this person open the page at `to` right now? False when the app has it in the menu but their roles, or their page access,
 * do not allow it. Use it to leave out links and buttons that would only lead to “no access”.
 */
export function canOpen(boot, to) {
  const m = findNav(String(to).split('?')[0])
  if (!m) return true // a sub-page of something already open, not a menu entry of its own
  const { item, group } = m
  return roleAllows(item, boot) && (!item.when || item.when(boot)) && (!group || (roleAllows(group, boot) && (!group.when || group.when(boot)))) && pageAllowed(boot, item.to, group?.label)
}

/** May this person open the page at `pathname`? Pages with no menu entry are not restricted here. */
export function routeAllowed(boot, pathname) {
  const m = findNav(pathname)
  return !m || pageAllowed(boot, m.item.to, m.group?.label)
}

/** Do these roles / read permissions allow the menu entry? ({ can_read: {doctype: bool}, roles: [...] }) */
export function roleAllows(item, { can_read: canRead = {}, roles = [] } = {}) {
  return (!item.doctype || Boolean(canRead[item.doctype])) && (!item.roles || item.roles.some((r) => roles.includes(r)))
}

/**
 * Filter the menu for this user: read permission (doctype), roles, `when(boot)` and their page access.
 * Employee-only users (no ERP access) get just the self-service entries.
 */
// What an employee with no business role sees: their own HR pages, named "My …". These are the same pages HR staff use, but
// each employee only ever gets their own records (the server restricts them to their own Employee).
const SELF_SERVICE = [
  ['/my-hr', 'Overview'], ['/leave-applications', 'My Leave'], ['/attendance', 'My Attendance'], ['/attendance-requests', 'Attendance Requests'],
  ['/shift-requests', 'Shift Requests'], ['/salary-slips', 'My Payslips'], ['/expense-claims', 'My Expenses'], ['/employee-advances', 'My Advances'],
]

function selfServiceMenu(boot) {
  const all = NAV.flatMap((g) => g.items ?? [g])
  const ok = (i) => roleAllows(i, boot) && (!i.when || i.when(boot)) && pageAllowed(boot, i.to, null)
  const mine = SELF_SERVICE.map(([to, label]) => ({ it: all.find((i) => i.to === to), label }))
    .filter(({ it }) => it && ok(it))
    .map(({ it, label }) => ({ ...it, label }))
  const team = NAV.filter((g) => g.to === '/my-team' && ok(g)) // My Team, when they have people reporting to them (the approvals inbox is not part of the employee menu)
  return [
    ...(mine.length ? [{ label: 'My HR', icon: all.find((i) => i.to === '/my-hr')?.icon, items: mine }] : []),
    ...team,
  ]
}

/** The panels this person can switch between: Employee (their own HR pages; needs an employee record) and User (the full menu their roles allow). */
export function menuViews(boot = {}) {
  const has = (to) => NAV.some((g) => g.to === to || g.items?.some((i) => i.to === to))
  const views = []
  if (boot.employee && has('/my-hr')) views.push('employee')
  if (!boot.employee_only) views.push('all')
  return views
}

export function visibleNav(boot = {}) {
  if (boot.employee_only || boot.menu_view === 'employee') return selfServiceMenu(boot)
  const allowed = (i) => roleAllows(i, boot) && (!i.when || i.when(boot))
  const menu = NAV
  return menu.filter((g) => !g.items || allowed(g))
    .map((g) => (g.items ? { ...g, items: g.items.filter((i) => allowed(i) && pageAllowed(boot, i.to, g.label)) } : g))
    .filter((g) => (g.items ? g.items.length > 0 : allowed(g) && pageAllowed(boot, g.to, null)))
}

/** Find the nav entry for a pathname (for breadcrumbs / titles). */
export function findNav(pathname) {
  // Company pages live under Settings but have their own route.
  if (pathname === '/companies' || pathname.startsWith('/companies/')) return { item: { label: 'Companies', to: '/companies' } }
  if (pathname === '/employee') return { item: { label: 'My HR', to: '/my-hr' } } // the employee address opens My HR
  for (const g of NAV) {
    if (g.to && (pathname === g.to || (g.to !== '/' && pathname.startsWith(g.to + '/')))) return { item: g }
    for (const i of g.items ?? []) {
      if (pathname === i.to || pathname.startsWith(i.to + '/')) return { group: g, item: i }
    }
  }
  return null
}
