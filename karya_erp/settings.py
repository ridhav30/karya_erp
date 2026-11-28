"""Settings screen for the Karya Erp UI.

One page that edits the standard ERPNext / Frappe HR records a UAE company needs at go-live:
Company (TRN, contact, logo, address), default accounts, default VAT templates, stock defaults,
department approvers, the company holiday list and WPS employer details. No custom fields —
everything is written to the standard doctypes, each section behind that doctype's own permission.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate

from karya_erp.hr import is_hr

COMPANY_FIELDS = ("tax_id", "phone_no", "email", "website", "company_logo", "date_of_establishment", "default_finance_book")
ACCOUNT_FIELDS = (
	"default_receivable_account", "default_payable_account", "default_bank_account", "default_cash_account",
	"default_income_account", "default_expense_account", "cost_center", "round_off_account", "write_off_account",
	"exchange_gain_loss_account", "default_payroll_payable_account", "default_employee_advance_account",
	"default_expense_claim_payable_account",
)
ADDRESS_FIELDS = ("address_line1", "address_line2", "city", "state", "pincode", "phone", "email_id")
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _can(doctype, ptype="write", doc=None):
	try:
		return bool(frappe.has_permission(doctype, ptype, doc))
	except Exception:
		return False


def _require(doctype, ptype="write", doc=None):
	if not _can(doctype, ptype, doc):
		frappe.throw(_("You don't have permission to change {0}").format(_(doctype)), frappe.PermissionError)


def _company(company=None):
	company = company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if not company:
		frappe.throw(_("No company found"))
	_require("Company", "read", company)
	return company


def _loads(v):
	return json.loads(v) if isinstance(v, str) else (v or {})


def _company_address(company):
	# is_your_company_address is an ERPNext custom field — order by it only if the column exists.
	order = "a.is_your_company_address desc, " if frappe.db.has_column("Address", "is_your_company_address") else ""
	name = frappe.db.sql(
		f"""select a.name from `tabAddress` a join `tabDynamic Link` l on l.parent = a.name and l.parenttype = 'Address'
		where l.link_doctype = 'Company' and l.link_name = %s and a.disabled = 0
		order by {order}a.is_primary_address desc, a.creation asc limit 1""",
		company,
	)
	return name[0][0] if name else None


def _default_template(doctype, company):
	return frappe.db.get_value(doctype, {"company": company, "is_default": 1, "disabled": 0}, "name")


def _current_holiday_list(company):
	try:
		from karya_erp.hr import holiday_list_for

		emp = frappe.db.get_value("Employee", {"company": company, "status": "Active"}, "name")
		if emp:
			hl = holiday_list_for(emp)
			if hl:
				return hl
	except Exception:
		pass
	if frappe.db.exists("DocType", "Holiday List Assignment"):
		hl = frappe.db.get_value(
			"Holiday List Assignment",
			{"docstatus": 1, "applicable_for": "Company", "assigned_to": company},
			"holiday_list", order_by="from_date desc",
		)
		if hl:
			return hl
	return frappe.get_cached_value("Company", company, "default_holiday_list")


@frappe.whitelist()
def get(company=None):
	company = _company(company)
	c = frappe.get_doc("Company", company)

	addr_name = _company_address(company)
	addr = frappe.db.get_value("Address", addr_name, ADDRESS_FIELDS, as_dict=True) if addr_name else {}

	departments = []
	if _can("Department", "read"):
		for d in frappe.get_all("Department", filters={"company": company, "is_group": 0}, fields=["name", "department_name"], order_by="department_name"):
			doc = frappe.get_doc("Department", d.name)
			departments.append({
				"name": d.name, "label": d.department_name,
				"leave_approver": next((r.approver for r in doc.get("leave_approvers") or []), None),
				"expense_approver": next((r.approver for r in doc.get("expense_approvers") or []), None),
			})

	hl_name = _current_holiday_list(company)
	holiday_list = None
	if hl_name:
		hl = frappe.get_doc("Holiday List", hl_name)
		rows = hl.get("holidays") or []
		weekly = sorted({getdate(r.holiday_date).strftime("%A") for r in rows if cint(r.get("weekly_off"))}, key=WEEKDAYS.index)
		holiday_list = {
			"name": hl.name, "from_date": str(hl.from_date), "to_date": str(hl.to_date), "weekly_off": weekly,
			"public_holidays": [
				{"date": str(r.holiday_date), "description": frappe.utils.strip_html(r.description or "")}
				for r in rows if not cint(r.get("weekly_off"))
			],
		}

	wps = frappe.db.get_value("Karya Erp WPS Settings", company, ["employer_id", "employer_bank_routing_code", "employer_reference"], as_dict=True) if frappe.db.exists("Karya Erp WPS Settings", company) else None

	return {
		"company": {
			"name": c.name, "company_name": c.company_name, "abbr": c.abbr, "country": c.country, "currency": c.default_currency,
			**{f: c.get(f) for f in COMPANY_FIELDS},
		},
		"address": {"name": addr_name, **{f: (addr or {}).get(f) for f in ADDRESS_FIELDS}},
		"accounts": {f: c.get(f) for f in ACCOUNT_FIELDS},
		"vat": {
			"sales_template": _default_template("Sales Taxes and Charges Template", company),
			"purchase_template": _default_template("Purchase Taxes and Charges Template", company),
		},
		"stock": {
			# v16 keeps the default warehouse on the Company (older versions: Stock Settings).
			"default_warehouse": c.get("default_warehouse") if c.meta.has_field("default_warehouse") else frappe.db.get_single_value("Stock Settings", "default_warehouse"),
			"allow_negative_stock": cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock")),
		},
		"departments": departments,
		"holiday_list": holiday_list,
		"wps": wps or {"employer_id": None, "employer_bank_routing_code": None, "employer_reference": None},
		"wps_exists": bool(wps),
		"can": {
			"company": _can("Company", "write", company),
			"accounts": _can("Company", "write", company) and _can("Account", "read"),
			"vat": _can("Sales Taxes and Charges Template") and _can("Purchase Taxes and Charges Template"),
			"stock": _can("Stock Settings") and _can("Company", "write", company),
			"approvers": _can("Department") and is_hr(),
			"holidays": _can("Holiday List") and is_hr(),
			"wps": _can("Karya Erp WPS Settings", "create" if not wps else "write"),
		},
	}


# ---------------------------------------------------------------- save, one section at a time

@frappe.whitelist(methods=["POST"])
def save(section, values, company=None):
	company = _company(company)
	values = _loads(values)
	handler = {
		"company": _save_company, "accounts": _save_accounts, "vat": _save_vat, "stock": _save_stock,
		"approvers": _save_approvers, "holidays": _save_holidays, "wps": _save_wps,
	}.get(section)
	if not handler:
		frappe.throw(_("Unknown settings section {0}").format(section))
	handler(company, values)
	return get(company)


def _save_company(company, v):
	c = frappe.get_doc("Company", company)
	c.check_permission("write")
	for f in COMPANY_FIELDS:
		if f in v:
			c.set(f, v.get(f) or None)
	if v.get("tax_id"):
		trn = "".join(ch for ch in str(v["tax_id"]) if ch.isdigit())
		if c.country == "United Arab Emirates" and len(trn) != 15:
			frappe.throw(_("A UAE TRN has 15 digits"))
		c.tax_id = trn
	c.save()

	a = v.get("address") or {}
	if any(a.get(f) for f in ADDRESS_FIELDS):
		if not a.get("address_line1") or not a.get("city"):
			frappe.throw(_("Address line 1 and city are required"))
		name = _company_address(company)
		addr = frappe.get_doc("Address", name) if name else frappe.new_doc("Address")
		if not name:
			addr.update({"address_title": c.company_name, "address_type": "Billing", "country": c.country, "is_primary_address": 1})
			if addr.meta.has_field("is_your_company_address"):
				addr.is_your_company_address = 1
			addr.append("links", {"link_doctype": "Company", "link_name": company})
		for f in ADDRESS_FIELDS:
			if f in a:
				addr.set(f, a.get(f) or None)
		if "state" in a and addr.meta.has_field("emirate"):  # ERPNext UAE localisation field
			addr.emirate = a.get("state") or None
		addr.save()


def _save_accounts(company, v):
	c = frappe.get_doc("Company", company)
	c.check_permission("write")
	for f in ACCOUNT_FIELDS:
		if f in v:
			c.set(f, v.get(f) or None)
	if c.round_off_account and not c.get("round_off_cost_center"):
		c.round_off_cost_center = c.cost_center
	c.save()


def _set_default_template(doctype, company, name):
	_require(doctype)
	if name and frappe.db.get_value(doctype, name, "company") != company:
		frappe.throw(_("{0} does not belong to {1}").format(name, company))
	for other in frappe.get_all(doctype, filters={"company": company, "is_default": 1, "name": ["!=", name or ""]}, pluck="name"):
		frappe.db.set_value(doctype, other, "is_default", 0)
	if name:
		doc = frappe.get_doc(doctype, name)
		doc.is_default = 1
		doc.save()


def _save_vat(company, v):
	if "sales_template" in v:
		_set_default_template("Sales Taxes and Charges Template", company, v.get("sales_template"))
	if "purchase_template" in v:
		_set_default_template("Purchase Taxes and Charges Template", company, v.get("purchase_template"))


def _save_stock(company, v):
	_require("Stock Settings")
	if "default_warehouse" in v:
		wh = v.get("default_warehouse") or None
		if wh and frappe.db.get_value("Warehouse", wh, "company") != company:
			frappe.throw(_("{0} does not belong to {1}").format(wh, company))
		c = frappe.get_doc("Company", company)
		if c.meta.has_field("default_warehouse"):
			c.check_permission("write")
			c.default_warehouse = wh
			c.save()
		else:
			frappe.db.set_single_value("Stock Settings", "default_warehouse", wh)
	s = frappe.get_doc("Stock Settings")
	if "allow_negative_stock" in v:
		s.allow_negative_stock = cint(v.get("allow_negative_stock"))
	s.save()


def _save_approvers(company, v):
	if not is_hr():
		frappe.throw(_("Only HR can set approvers"), frappe.PermissionError)
	for row in v.get("departments") or []:
		d = frappe.get_doc("Department", row["name"])
		if d.company != company:
			continue
		d.check_permission("write")
		changed = False
		for key, table in (("leave_approver", "leave_approvers"), ("expense_approver", "expense_approvers")):
			if key not in row:
				continue
			current = next((r.approver for r in d.get(table) or []), None)
			if (row.get(key) or None) == current:
				continue
			d.set(table, [{"approver": row[key]}] if row.get(key) else [])
			changed = True
		if changed:
			d.save()


def _save_holidays(company, v):
	"""Create (or replace the rows of) the company's holiday list for a year, then assign it to the company."""
	if not is_hr():
		frappe.throw(_("Only HR can set holidays"), frappe.PermissionError)
	_require("Holiday List", "create")
	year = cint(v.get("year"))
	if year < 2000 or year > 2100:
		frappe.throw(_("Enter a valid year"))
	weekly = [d for d in (v.get("weekly_off") or []) if d in WEEKDAYS]
	start, end = getdate(f"{year}-01-01"), getdate(f"{year}-12-31")

	public = []
	for h in v.get("public_holidays") or []:
		if not h.get("date"):
			continue
		d = getdate(h["date"])
		if d < start or d > end:
			frappe.throw(_("{0} is outside {1}").format(h["date"], year))
		public.append((d, (h.get("description") or _("Public holiday")).strip()))

	name = v.get("name") or f"{company} {year}"
	hl = frappe.get_doc("Holiday List", name) if frappe.db.exists("Holiday List", name) else frappe.new_doc("Holiday List")
	if hl.is_new():
		hl.holiday_list_name = name
	hl.from_date, hl.to_date = start, end
	if hl.meta.has_field("weekly_off"):
		hl.weekly_off = weekly[0] if weekly else None

	rows, seen = [], set()
	for d, desc in sorted(public):
		rows.append({"holiday_date": d, "description": desc, "weekly_off": 0})
		seen.add(d)
	day = start
	while day <= end:
		if day.strftime("%A") in weekly and day not in seen:
			rows.append({"holiday_date": day, "description": day.strftime("%A"), "weekly_off": 1})
		day = add_days(day, 1)
	hl.set("holidays", sorted(rows, key=lambda r: r["holiday_date"]))
	hl.save()

	from karya_erp.hr import assign_holiday_list

	assign_holiday_list(hl.name, company, str(start))
	if not frappe.get_cached_value("Company", company, "default_holiday_list"):
		frappe.db.set_value("Company", company, "default_holiday_list", hl.name)


def _save_wps(company, v):
	for f in ("employer_id", "employer_bank_routing_code"):
		val = (v.get(f) or "").strip()
		if val and (not val.isdigit()):
			frappe.throw(_("{0} must contain digits only").format(_(f.replace("_", " ").title())))
	if frappe.db.exists("Karya Erp WPS Settings", company):
		doc = frappe.get_doc("Karya Erp WPS Settings", company)
		doc.check_permission("write")
	else:
		_require("Karya Erp WPS Settings", "create")
		doc = frappe.new_doc("Karya Erp WPS Settings")
		doc.company = company
	for f in ("employer_id", "employer_bank_routing_code", "employer_reference"):
		if f in v:
			doc.set(f, (v.get(f) or "").strip() or None)
	doc.save()
