# Karya Erp — QA report

Date: 2026-11-27 · Status: every finding fixed or explained; the "What was run" results show what was found, then the outcome · Site tested: `site1.local` (company ROKN, ERPNext/HRMS v16) · Scope: backend functions, frontend code, accounting integrity, security scan.
The browser (UI) pass was run signed in as Administrator on the dev server (`site1.local:5173`): a sweep of all 166 menu routes, then screens checked by eye at phone-width dark and desktop-width light.

## What was run

| Area | Check | Result |
|---|---|---|
| Backend | Full automated suite (233 tests: generator, chat, wishlist, POS counters, ledger reports, payroll, party payments …) | 237 pass (1 skipped) after the fixes below |
| Backend | Python static check (ruff F, E9, B) | 11 minor hits, none functional (F-9): fixed, now clean |
| Backend | Security scan of 4 guest and 47 unchecked-looking `@frappe.whitelist` functions | No hole found; guest endpoints are HMAC-signed; the rest delegate to permission helpers |
| Accounting | 20 integrity queries on live site1 data (see below) | 1 data finding explained (history import), 3 bugs fixed (F-2, F-3, F-18) |
| Accounting | End-to-end POS sale → change → stock → COGS → return → shift summary (rolled back) | Pass |
| Frontend | Full ESLint | 3 errors found (F-8): fixed, now clean |
| Frontend | Production build | Pass; one 1.6 MB bundle found (F-10): now 833 kB with on-demand pages |
| Frontend | All 114 screen configs checked field by field against ERPNext's real fields | 5 fields did not exist (F-7): fixed, none left |
| Frontend | Every menu route has a page or screen | Pass (166 routes) |
| UI | Opened all 166 routes in the browser and watched page text, console and every API call | All 166 render; 0 API errors except those noted in F-12 and F-13 (F-12 fixed for dev); 1 console warning (F-14) fixed |
| UI | Wishlist heart + filter + remembering the filter across navigation; chat panel + Esc; POS sessions and New session dialog (counter picker, "in use"); Work Order, BOM, Production Plan, Subcontract PO forms; dashboard; dark and light | Pass, with the fixes in F-15 to F-20 |

## Accounting checks that passed
- GL debit = credit, overall (8,675,927.05) and for every voucher (0 unbalanced).
- Assets + liabilities + equity + income + expense nets to 0.00.
- Receivable and payable control accounts equal the party ledger (124,992.50 / 117,068.50).
- Stock value agrees three ways: GL stock accounts = stock ledger = bins = 666,440.00. No negative stock, no zero-value stock.
- Invoice arithmetic: grand total = net + tax − discount; tax total = sum of tax rows; no POS invoice left unpaid; no negative outstanding; no duplicate supplier bill numbers; no negative unallocated payments.
- POS sale of 3 + 3 items at 5% VAT: total 18,585.00, change 1,415.00, 7 balanced GL lines, stock out, cost of goods 12,744.00 = quantity × valuation, return reverses cleanly.
- Fiscal years 2026 and 2027 exist; company default accounts, round-off and cost centers are set; no P&L entries without a cost center.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-1 | Medium (by design, corrected) | 2,457 submitted Sales Invoices (14,067,858.50) and 513 Purchase Invoices (9,753,776.00) have no GL entries or payment-ledger rows. **Cause confirmed: these are the 5–6 months of history loaded through Import → Sales history / Purchase history** (posting dates 2026-06-01 to 2026-11-20, loaded in one go on 2026-11-23; all carry the tag "Historical import [...]"; the counts match exactly). That import saves past invoices as submitted but deliberately never posts them, so opening balances are not counted twice. They therefore appear in the invoice-based screens (sales/purchase totals, lists, statuses) but not in ledger reports (P&L, balance sheet, receivable/payable ageing). Not a defect. | Resolved: understood and documented |
| F-2 | High (bug) | Receivable/Payable reports counted an unallocated customer/supplier payment (an advance) as a **negative "Invoiced"** and showed 0 "Paid", so Invoiced was understated by 1,301.50 (receivable) and 500.00 (payable) against ERPNext. Outstanding was always right. | **Fixed** in `ledger_reports.py`; the ledger test now passes |
| F-3 | High (bug) | A POS shift left open past midnight cannot be used: ERPNext refuses every sale ("POS Opening Entry … is outdated"), and the cashier only saw that message at checkout. site1's current shift (POS-OPE-2026-00005) is in this state. | **Fixed**: the till shows a warning with a Close shift button and disables Pay; close the shift and open a new one |
| F-4 | Medium (data) | 3 of 103 items have an item-level valuation rate; the real cost lives in the stock balance. Stock entries used the item field (0). | Fixed earlier: rate now comes from ERPNext's current valuation |
| F-5 | Medium (setup) | Company default work-in-progress and finished-goods warehouses were empty. | Fixed earlier on site1; other sites need the same |
| F-6 | Medium (test) | `test_advance_only_leaves_the_invoices_open` fails: `settle()` has no `advance_only` argument. The test was written for a feature that is not finished. | **Fixed**: `settle()` now takes `advance_only` (the front end already sent it); the whole amount stays as an advance, nothing is allocated |
| F-7 | Low | Screens list fields that do not exist in this ERPNext version, so they are silently skipped: Employee Advance `required_by`, `exchange_rate`; Employee Feedback Criteria `description`; Finance Book `for_depreciation`; Asset `is_existing_asset`. (Customer/Supplier address fields are handled by the address form, not a fault.) | **Fixed**: the five missing fields removed from their screens (Asset's opening-depreciation fields now show when depreciation is on) |
| F-8 | Low | ESLint: 3 "setState in effect" errors in `crm/LeadScoring.jsx` (2) and `crm/Telephony.jsx` (1). Work today, flagged by the React Compiler rules. | **Fixed**: the three components now fill their editable copies during render; ESLint is clean |
| F-9 | Low | Unused imports/variables: `assets.py`, `company_setup.py`, `loans.py`, `pos.py` imports; unused locals in `chat.py:263`, `sharing.py:108` (both are intentional permission-check calls). | **Fixed**: unused imports removed; the two unused locals now simply call the permission helper |
| F-10 | Medium (performance) | One 1.6 MB JavaScript file (448 kB compressed) loads on first visit: no route-level code splitting. Slow on mobile or weak links. | **Fixed**: hand-built pages now load on demand; the first download is 833 kB (244 kB compressed), down from 1,609 kB (448 kB). The app generator reads and trims the lazy imports (2 new tests) |
| F-11 | Info | The cashier-only counters rule: a counter with no cashiers is now manager-only. | By design (see POS counters change) |
| F-12 | Medium (dev setup) | Live-update connection (`:9000/socket.io`) fails on every page when the app is opened at `:5173`: the realtime server is running but refuses that origin. Production behind one web address is not affected. Screens that rely on live pushes fall back to refreshing. | **Fixed for dev** (Vite now proxies `/socket.io`); restart the Vite dev server to apply. Production unaffected |
| F-13 | Info | `/my-team` returns 417 "Your user is not linked to an active employee" for Administrator; the page shows a friendly message. | By design |
| F-14 | Low | React console warning on `/reports`: a props object containing `key` is spread into JSX (will be an error in a later React). | **Fixed** |
| F-15 | Medium (UI bug) | Form sections ignored the `when` condition, so a new Work Order showed a read-only "Progress" block (transferred, produced, status). | **Fixed** (`DocPage.jsx` now honours section `when`) |
| F-16 | Low (UI) | BOM raw-materials table showed UOM and Rate as required (*) although they are filled on save. | **Fixed** |
| F-17 | Low (UI) | Production Plan hints told users to press "Get sales orders / items" on a new plan, but those buttons only appear after the first save. | **Fixed** (hints now say save first) |
| F-18 | Medium (bug) | The dashboard owed cards counted the history invoices from F-1: "To receive AED 2,909,703.24", "To pay 1,979,610.68", "Overdue invoices 471", while the Receivable report shows 124,992.50. | **Fixed**: they now leave history-loaded invoices out (To receive 126,294.00, To pay 117,568.50, Overdue 29; the Receivable report is 124,992.50 after 1,301.50 of unallocated payments). Sales/purchase month totals and the 6-month chart still include history, as intended |
| F-19 | Low (UI) | On widths between phone and laptop (about 640 to 1024 px) the floating chat panel covers the bottom tab bar. | **Fixed**: the panel now stops above the bottom bar between phone and laptop widths |
| F-20 | Low (UI) | Turning on the Wishlist filter briefly shows the full list before the filtered one; un-hearting a row while the filter is on leaves it until the next refresh. | **Fixed**: rows leave the Wishlist view at once |
| F-22 | Low (dev only) | Opening or refreshing `/assets` or `/assets/new` in the Vite dev server returned Frappe's 404, because the dev proxy sent every `/assets/…` path to Frappe (clicking the links worked). Production uses the `/karya_erp` prefix and is not affected. | **Fixed** (the proxy now only forwards `/assets/<app>/…`); restart Vite to apply |
| F-21 | Low (perf) | Each list fires one request per status tab for its counts (up to 8) plus a wishlist call, on top of the data call. | **Fixed**: one `tab_counts` call per list instead of one request per tab |

## Not covered
- Chat messages and ticks (the Administrator account has no chats; sending one would create real chat rows).
- Saving, submitting and printing documents through the screens (done server-side only, rolled back, to avoid leaving test documents on site1).
- Sales till with a live shift (the only open shift is yesterday's, see F-3), print/PDF output, keyboard and screen-reader behaviour, a real phone.

## How to re-run
- Tests: `cd sites && ../env/bin/python ../apps/operator_app/operator_app/tests/run.py --site site1.local`
- Lint: `cd apps/karya_erp/frontend && npx eslint .`
- Build: `npx vite build`
