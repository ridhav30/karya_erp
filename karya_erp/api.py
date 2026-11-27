"""Thin API for the Karya Erp React UI.

All business data comes from standard ERPNext doctypes; this module only
bundles a few read calls so the UI needs fewer requests.
"""

import frappe
from frappe import _
from frappe.utils import cint, get_first_day, nowdate

from karya_erp.company_setup import needs_setup

# Doctypes shown in the sidebar (keep in sync with frontend/src/lib/nav.js)
NAV_DOCTYPES = [
	"Lead", "Opportunity",
	"Customer", "Quotation", "Sales Order", "Delivery Note", "Sales Invoice",
	"Supplier", "Material Request", "Purchase Order", "Purchase Receipt", "Purchase Invoice",
	"Item", "Warehouse", "BOM", "Work Order", "Job Card", "Operation", "Workstation", "Production Plan", "Subcontracting Order", "Subcontracting Receipt", "Subcontracting BOM", "Stock Entry", "Bin", "Stock Reconciliation", "Landed Cost Voucher", "Batch", "Serial No",
	"Stock Ledger Entry", "Item Price", "Price List", "Pricing Rule",
	"Bank Account", "Bank", "Period Closing Voucher", "Budget", "Dunning", "Dunning Type",
	"Payment Entry", "Journal Entry", "Account", "GL Entry", "Cost Center", "Mode of Payment",
	"Sales Taxes and Charges Template", "Purchase Taxes and Charges Template", "Fiscal Year",
	"Employee", "Karya Erp Employee Document", "Department", "Designation", "Branch", "Company", "Finance Book", "Payment Term", "Payment Terms Template", "Holiday List", "Holiday List Assignment",
	"Attendance", "Employee Checkin", "Shift Type", "Shift Assignment", "Shift Request",
	"Leave Type", "Leave Allocation", "Leave Application", "Leave Period", "Attendance Request",
	"Salary Component", "Karya Erp Salary History", "Salary Structure", "Salary Structure Assignment", "Payroll Entry", "Salary Slip",
	"Additional Salary", "Expense Claim", "Employee Advance", "Expense Claim Type", "Karya Erp WPS Settings",
	"Appraisal Cycle", "Appraisal", "Appraisal Template", "KRA", "Employee Feedback Criteria", "Goal",
	"Employee Performance Feedback", "Full and Final Statement", "Gratuity",
	"Item Tax Template",
	"Activity Type", "Asset", "Asset Category", "Asset Movement", "Bank Transaction", "Interview", "Interview Type", "Job Applicant", "Job Applicant Source", "Job Offer", "Job Opening", "Location", "POS Closing Entry", "POS Profile", "Project", "Project Type", "Request for Quotation", "Skill", "Supplier Quotation", "Task", "Timesheet",
]

# Any of these readable → the user works in the ERP, not only in My HR.
BUSINESS_DOCTYPES = ["Customer", "Supplier", "Item", "Sales Invoice", "Purchase Invoice", "Account", "Stock Entry"]


def _default_company():
	return frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)


def _single(doctype, field):
	try:
		return frappe.db.get_single_value(doctype, field)
	except Exception:
		return None


def _can_read(doctype, ptype="read"):
	try:
		return bool(frappe.has_permission(doctype, ptype))
	except Exception:
		return False


@frappe.whitelist(allow_guest=True)
def boot():
	"""Everything the UI needs on load. Returns {"user": "Guest"} when not logged in."""
	user = frappe.session.user
	if user == "Guest":
		return {"user": "Guest"}

	user_doc = frappe.get_cached_doc("User", user)
	company = _default_company()
	roles = frappe.get_roles(user)
	can_read = {dt: _can_read(dt) for dt in NAV_DOCTYPES}

	from karya_erp.hr import employee_of, has_reports, is_hr, is_leave_approver
	from karya_erp.users import page_access_of

	employee = employee_of(user)
	hr = is_hr(roles)

	return {
		"user": user,
		"needs_setup": needs_setup(),
		"full_name": user_doc.full_name or user,
		"user_image": user_doc.user_image,
		"roles": roles,
		"is_system_manager": "System Manager" in roles,
		"company": company,
		"currency": (company and frappe.get_cached_value("Company", company, "default_currency")) or "AED",
		"cost_center": company and frappe.get_cached_value("Company", company, "cost_center"),
		"can_read": can_read,
		"can_create": {dt: _can_read(dt, "create") for dt, ok in can_read.items() if ok},
		"page_access": page_access_of(user),  # None, or {mode: "Custom", modules, pages}: the only modules / pages this person may open
		"employee": employee,
		"employee_name": employee and frappe.db.get_value("Employee", employee, "employee_name"),
		"is_hr": hr,
		"is_approver": is_leave_approver(user),
		"has_reports": has_reports(user),
		# Plain employees only get My HR (no ERP menus).
		"employee_only": bool(employee) and not hr and not any(_can_read(dt) for dt in BUSINESS_DOCTYPES),
		"selling_price_list": _single("Selling Settings", "selling_price_list"),
		"buying_price_list": _single("Buying Settings", "buying_price_list"),
		"default_warehouse": _single("Stock Settings", "default_warehouse"),
		"site": frappe.local.site,
		"time_zone": frappe.utils.get_system_timezone(),
		"companies": frappe.get_list("Company", pluck="name", order_by="name") if _can_read("Company") else [],
		"branch": frappe.defaults.get_user_default("branch"),
		"branches": frappe.get_list("Branch", pluck="name", order_by="name") if _can_read("Branch") else [],
	}


@frappe.whitelist()
def set_scope(company=None, branch=None):
	"""Remember the user's working company and branch (user defaults). Empty branch = all branches."""
	user = frappe.session.user
	if company:
		if not frappe.db.exists("Company", company) or not _can_read("Company"):
			frappe.throw(_("Company {0} is not available").format(company))
		frappe.defaults.set_user_default("company", company, user)
	if branch is not None:
		if branch:
			if not frappe.db.exists("Branch", branch):
				frappe.throw(_("Branch {0} does not exist").format(branch))
			frappe.defaults.set_user_default("branch", branch, user)
		else:
			frappe.defaults.clear_default("branch", parent=user)
	frappe.clear_cache(user=user)
	return {"company": _default_company(), "branch": frappe.defaults.get_user_default("branch")}


NOT_HISTORY = "coalesce(remarks, '') not like 'Historical import [%%'"


def _sum(doctype, field, conditions, values):
	if not _can_read(doctype):
		return None
	result = frappe.db.sql(
		f"select coalesce(sum(`{field}`), 0) from `tab{doctype}` where docstatus = 1 and {conditions}",
		values,
	)
	return float(result[0][0]) if result else 0.0


def _count(doctype, filters):
	if not _can_read(doctype):
		return None
	return frappe.db.count(doctype, filters)


@frappe.whitelist()
def tab_counts(doctype, tabs):
	"""How many records each status tab of a list holds, in one call. tabs: JSON [filters, ...] (Frappe filter lists);
	returns the counts in the same order. Counted with the caller's own permissions, like the list itself."""
	tabs = frappe.parse_json(tabs) if isinstance(tabs, str) else (tabs or [])
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("You do not have permission to read {0}").format(doctype), frappe.PermissionError)
	return [cint(frappe.get_list(doctype, filters=f or [], fields=[{"COUNT": "name", "as": "n"}], limit_page_length=0)[0].n) for f in tabs[:20]]


@frappe.whitelist()
def dashboard():
	"""KPI numbers for the dashboard and badge counts. A value is None if the user can't read that doctype."""
	company = _default_company()
	month_start = get_first_day(nowdate())
	values = {"company": company, "month_start": month_start, "today": nowdate()}
	company_cond = "company = %(company)s" if company else "1=1"

	# Same rule as the Approvals inbox: documents where this user can take a workflow action.
	try:
		from karya_erp.approvals import pending_count

		pending = pending_count()
	except Exception:
		pending = None

	return {
		"company": company,
		"sales_month": _sum(
			"Sales Invoice", "base_grand_total",
			f"{company_cond} and is_return = 0 and posting_date >= %(month_start)s", values,
		),
		"purchase_month": _sum(
			"Purchase Invoice", "base_grand_total",
			f"{company_cond} and is_return = 0 and posting_date >= %(month_start)s", values,
		),
		# Invoices loaded with "Sales / Purchase history" are for the reports only (never posted to the ledger, and their open
		# balances come in as opening balances), so what is owed leaves them out.
		"receivable": _sum("Sales Invoice", "outstanding_amount", f"{company_cond} and {NOT_HISTORY}", values),
		"payable": _sum("Purchase Invoice", "outstanding_amount", f"{company_cond} and {NOT_HISTORY}", values),
		"so_to_deliver": _count(
			"Sales Order",
			{"docstatus": 1, "status": ["in", ["To Deliver and Bill", "To Deliver"]], **({"company": company} if company else {})},
		),
		"po_to_receive": _count(
			"Purchase Order",
			{"docstatus": 1, "status": ["in", ["To Receive and Bill", "To Receive"]], **({"company": company} if company else {})},
		),
		"overdue_invoices": (
			frappe.db.sql(
				f"select count(*) from `tabSales Invoice` where docstatus = 1 and status like 'Overdue%%' and {company_cond} and {NOT_HISTORY}", values,
			)[0][0]
			if _can_read("Sales Invoice") else None
		),
		"pending_approvals": pending,
	}


RECENT_DOCTYPES = [
	("Sales Invoice", "customer_name", "grand_total"),
	("Sales Order", "customer_name", "grand_total"),
	("Quotation", "customer_name", "grand_total"),
	("Purchase Invoice", "supplier_name", "grand_total"),
	("Purchase Order", "supplier_name", "grand_total"),
	("Payment Entry", "party_name", "paid_amount"),
	("Journal Entry", "title", "total_debit"),
]


@frappe.whitelist()
def overview():
	"""Main dashboard extras: 6-month sales vs purchases, last month's sales, top customers, recent documents."""
	from frappe.utils import add_months, get_last_day

	company = _default_company()
	today = nowdate()
	start = get_first_day(add_months(today, -5))
	values = {"company": company, "start": start}
	company_cond = "and company = %(company)s" if company else ""

	def monthly(doctype):
		if not _can_read(doctype):
			return {}
		rows = frappe.db.sql(
			f"""select date_format(posting_date, '%%Y-%%m') m, coalesce(sum(base_grand_total), 0)
			from `tab{doctype}` where docstatus = 1 and is_return = 0 and posting_date >= %(start)s {company_cond}
			group by m""",
			values,
		)
		return {r[0]: float(r[1]) for r in rows}

	sales, purchases = monthly("Sales Invoice"), monthly("Purchase Invoice")
	months = []
	for i in range(6):
		key = str(add_months(start, i))[:7]
		months.append({"key": key, "sales": sales.get(key, 0.0), "purchases": purchases.get(key, 0.0)})

	prev_start = get_first_day(add_months(today, -1))
	prev_month_sales = _sum(
		"Sales Invoice", "base_grand_total",
		f"is_return = 0 and posting_date between %(ps)s and %(pe)s {company_cond}",
		{**values, "ps": prev_start, "pe": get_last_day(prev_start)},
	)

	top_customers = []
	if _can_read("Sales Invoice"):
		top_customers = frappe.db.sql(
			f"""select customer, max(customer_name) customer_name, sum(base_grand_total) amount, count(*) invoices
			from `tabSales Invoice` where docstatus = 1 and is_return = 0 and posting_date >= %(since)s {company_cond}
			group by customer order by amount desc limit 5""",
			{**values, "since": add_months(today, -3)},
			as_dict=True,
		)

	recent = []
	for doctype, party, amount in RECENT_DOCTYPES:
		if not _can_read(doctype):
			continue
		meta = frappe.get_meta(doctype)
		fields = ["name", "modified", "modified_by", "docstatus"]
		fields += [f for f in ("status", party, amount, "currency", "paid_from_account_currency") if meta.has_field(f)]
		filters = {"company": company} if company and meta.has_field("company") else {}
		for r in frappe.get_list(doctype, fields=fields, filters=filters, order_by="modified desc", limit_page_length=6):
			recent.append({
				"doctype": doctype,
				"name": r.name,
				"modified": str(r.modified),
				"by": frappe.utils.get_fullname(r.modified_by),
				"status": r.get("status") or ("Draft", "Submitted", "Cancelled")[int(r.docstatus or 0)],
				"party": r.get(party),
				"amount": r.get(amount),
				"currency": r.get("currency") or r.get("paid_from_account_currency"),
			})
	recent.sort(key=lambda r: r["modified"], reverse=True)

	return {
		"months": months,
		"prev_month_sales": prev_month_sales,
		"top_customers": top_customers,
		"recent": recent[:10],
	}


# ---------------------------------------------------------------- global search (Ctrl+K)

SEARCH_DOCTYPES = [
	# (doctype, title field, extra searchable fields, subtitle field)
	("Customer", "customer_name", ["mobile_no", "email_id"], "customer_group"),
	("Supplier", "supplier_name", ["mobile_no", "email_id"], "supplier_group"),
	("Item", "item_name", ["item_code"], "item_group"),
	("Employee", "employee_name", ["cell_number", "company_email"], "designation"),
	("Lead", "lead_name", ["company_name", "email_id", "mobile_no"], "status"),
	("Opportunity", "customer_name", ["party_name"], "status"),
	("Quotation", "customer_name", ["party_name"], "status"),
	("Sales Order", "customer_name", ["po_no"], "status"),
	("Sales Invoice", "customer_name", [], "status"),
	("Delivery Note", "customer_name", [], "status"),
	("Purchase Order", "supplier_name", [], "status"),
	("Purchase Invoice", "supplier_name", ["bill_no"], "status"),
	("Payment Entry", "party_name", ["reference_no"], "payment_type"),
	("Journal Entry", "title", ["cheque_no"], "voucher_type"),
]


@frappe.whitelist()
def search(text, limit=5):
	"""Documents matching text across the main doctypes (read permission respected), best matches first."""
	text = (text or "").strip()
	if len(text) < 2:
		return []
	like = f"%{text}%"
	limit = min(int(limit or 5), 10)
	out = []
	for doctype, title, extra, sub in SEARCH_DOCTYPES:
		if not _can_read(doctype):
			continue
		meta = frappe.get_meta(doctype)
		fields = [f for f in [title, *extra] if meta.has_field(f)]
		or_filters = [["name", "like", like]] + [[f, "like", like] for f in fields]
		select = ["name"] + [f for f in (title, sub) if meta.has_field(f)]
		try:
			rows = frappe.get_list(doctype, or_filters=or_filters, fields=select, order_by="modified desc", limit_page_length=limit)
		except Exception:
			continue
		for r in rows:
			label = r.get(title) or r.name
			score = 0 if str(r.name).lower() == text.lower() or str(label).lower() == text.lower() else (1 if str(label).lower().startswith(text.lower()) else 2)
			out.append({"doctype": doctype, "name": r.name, "title": label, "subtitle": r.get(sub) if sub else None, "score": score})
	out.sort(key=lambda x: x["score"])
	return out[:30]


@frappe.whitelist()
def link_search(doctype, txt="", filters=None, start=0, page_length=20):
	"""One page of Frappe's link search (the same results and permissions as Desk's link fields), plus whether
	more follow, so a long list of accounts, parties or items can be scrolled through instead of cut at 20."""
	from frappe.desk.search import build_for_autosuggest, search_widget

	page_length = min(max(cint(page_length), 1), 300)
	rows = search_widget(doctype, (txt or "").strip(), None, start=max(cint(start), 0), page_length=page_length + 1, filters=filters)
	return {"results": build_for_autosuggest(rows[:page_length], doctype=doctype), "has_more": len(rows) > page_length}


# ---------------------------------------------------------------- language (Arabic / RTL)

@frappe.whitelist()
def translations(lang="ar"):
	"""All Frappe / ERPNext / Frappe HR translations for a language (the UI looks labels up client-side)."""
	if lang not in ("ar",):
		return {}
	from frappe.translate import get_all_translations

	return get_all_translations(lang)


@frappe.whitelist(methods=["POST"])
def set_language(lang):
	"""Remember the UI language on the user, so emails, print formats and messages follow it."""
	if lang not in ("en", "ar"):
		frappe.throw(frappe._("Unsupported language"))
	frappe.db.set_value("User", frappe.session.user, "language", lang)
	frappe.clear_cache(user=frappe.session.user)
	return True
