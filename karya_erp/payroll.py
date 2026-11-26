"""Payroll for the React app, on Frappe HR (Salary Component / Structure / Assignment, Payroll Entry, Salary Slip).

UAE basis: a fixed 30-day month. Frappe HR has no such option, so the bundled UAE components are
formula-based with "depends on payment days" OFF:

    amount = monthly × (30 − unpaid days) / 30,   unpaid days = total_working_days − payment_days

With Payroll Settings "include holidays in total working days" ON, total_working_days is the calendar
length of the period and payment_days drops leave without pay (and joining / relieving days), so a
full month pays exactly the monthly amount whether it has 28 or 31 days.
"""

import calendar

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from karya_erp.hr import is_hr

UNPAID = "(total_working_days - payment_days)"
UAE_EARNINGS = [
	# (component, abbr, share of the monthly package)
	("Basic Salary", "BS", "basic_pct"),
	("Housing Allowance", "HA", "housing_pct"),
	("Transport Allowance", "TA", "transport_pct"),
	("Other Allowance", "OA", "other_pct"),
]


def _require_hr():
	if not is_hr():
		frappe.throw(_("Only HR can manage payroll"), frappe.PermissionError)


def _month_range(year=None, month=None):
	today = getdate(nowdate())
	year, month = cint(year) or today.year, cint(month) or today.month
	start = getdate(f"{year}-{month:02d}-01")
	end = getdate(f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]}")
	return year, month, start, end


def _salary_account(company):
	return frappe.db.get_value(
		"Account", {"company": company, "is_group": 0, "account_name": ["in", ["Salary", "Salaries", "Salary Expense"]]}, "name",
	) or frappe.db.get_value("Account", {"company": company, "is_group": 0, "account_type": "Expense Account", "account_name": ["like", "%Salar%"]}, "name") \
		or frappe.db.get_value("Account", {"company": company, "is_group": 0, "root_type": "Expense", "account_name": ["in", ["Basic Salary", "Salaries and Wages", "Staff Salaries"]]}, "name") \
		or frappe.db.get_value("Account", {"company": company, "is_group": 0, "root_type": "Expense", "account_name": ["like", "%Salar%"]}, "name")


COMPONENT_ACCOUNTS = {
	# component → expense account names to look for (first match wins), then the general salary account
	"Basic Salary": ("Basic Salary",),
	"Housing Allowance": ("Housing Allowance",),
	"Transport Allowance": ("Transportation Allowance", "Transport Allowance"),
	"Other Allowance": ("Other Allowances", "Personnel Cost Others"),
	"Overtime": ("Overtime", "Overtime Expense"),
	# Paid out of the provisions booked monthly (karya_erp.provision), else expensed.
	"Gratuity": ("Provision for End of Service Benefits", "End Of Service Indemnity", "Gratuity"),
	"Leave Encashment": ("Accrued - Leave Salary", "Leave Salary", "Leave Encashment"),
}


def ensure_component(name, abbr, company, description=None):
	"""Earning salary component with an account for this company (adds the company row if missing)."""
	account = component_account(company, name)
	if frappe.db.exists("Salary Component", name):
		c = frappe.get_doc("Salary Component", name)
		if account and not any(a.company == company for a in c.get("accounts") or []):
			c.append("accounts", {"company": company, "account": account})
			c.save(ignore_permissions=True)
		return name
	c = frappe.new_doc("Salary Component")
	c.update({"salary_component": name, "salary_component_abbr": abbr, "type": "Earning", "depends_on_payment_days": 0, "is_tax_applicable": 0, "description": description})
	if account:
		c.append("accounts", {"company": company, "account": account})
	c.insert(ignore_permissions=True)
	return name


def component_account(company, component):
	for name in COMPONENT_ACCOUNTS.get(component, ()):
		acc = frappe.db.get_value("Account", {"company": company, "is_group": 0, "root_type": ["in", ["Expense", "Liability"]], "account_name": name}, "name")
		if acc:
			return acc
	return _salary_account(company)


# ---------------------------------------------------------------- overview & setup

@frappe.whitelist()
def overview(company=None, year=None, month=None):
	_require_hr()
	company = company or frappe.defaults.get_user_default("Company")
	year, month, start, end = _month_range(year, month)
	active = frappe.db.count("Employee", {"status": "Active", "company": company})
	assigned = len(set(frappe.get_all(
		"Salary Structure Assignment",
		filters={"docstatus": 1, "company": company, "from_date": ["<=", end]},
		pluck="employee",
	)))
	settings = frappe.get_cached_doc("Payroll Settings") if frappe.db.exists("DocType", "Payroll Settings") else None
	slips = frappe.get_all(
		"Salary Slip",
		filters={"company": company, "start_date": [">=", start], "end_date": ["<=", end], "docstatus": ["<", 2]},
		fields=["docstatus", "gross_pay", "total_deduction", "net_pay", "currency"],
	)
	runs = frappe.get_all(
		"Payroll Entry",
		filters={"company": company},
		fields=["name", "start_date", "end_date", "posting_date", "docstatus", "salary_slips_created", "salary_slips_submitted", "number_of_employees", "payment_account"],
		order_by="start_date desc",
		limit_page_length=8,
	)
	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency") if company else None,
		"year": year, "month": month, "start": str(start), "end": str(end),
		"setup": {
			"components": frappe.db.count("Salary Component"),
			"uae_components": frappe.db.count("Salary Component", {"name": ["in", [c[0] for c in UAE_EARNINGS]]}),
			"structures": frappe.db.count("Salary Structure", {"docstatus": 1, "is_active": "Yes", "company": company}),
			"active_employees": active,
			"assigned_employees": assigned,
			"payroll_payable_account": company and frappe.get_cached_value("Company", company, "default_payroll_payable_account"),
			"payroll_payable_type": company and frappe.db.get_value(
				"Account", frappe.get_cached_value("Company", company, "default_payroll_payable_account"), "account_type"),
			"salary_account": company and _salary_account(company),
			"payroll_based_on": settings and settings.payroll_based_on,
			"include_holidays": settings and cint(settings.include_holidays_in_total_working_days),
		},
		"month_totals": {
			"slips": len(slips),
			"submitted": sum(1 for s in slips if s.docstatus == 1),
			"gross": sum(flt(s.gross_pay) for s in slips),
			"deductions": sum(flt(s.total_deduction) for s in slips),
			"net": sum(flt(s.net_pay) for s in slips),
		},
		"runs": runs,
	}


@frappe.whitelist(methods=["POST"])
def setup_uae(company, basic_pct=60, housing_pct=25, transport_pct=10, other_pct=5, structure_name=None):
	"""Create the UAE 30-day earnings components and a draft salary structure HR can review and submit."""
	_require_hr()
	pct = {"basic_pct": flt(basic_pct), "housing_pct": flt(housing_pct), "transport_pct": flt(transport_pct), "other_pct": flt(other_pct)}
	if abs(sum(pct.values()) - 100) > 0.01:
		frappe.throw(_("The split must add up to 100% (now {0}%)").format(sum(pct.values())))

	for name, abbr, _key in UAE_EARNINGS:
		account = component_account(company, name)
		if frappe.db.exists("Salary Component", name):
			c = frappe.get_doc("Salary Component", name)
			if account and not any(a.company == company for a in c.get("accounts") or []):
				c.append("accounts", {"company": company, "account": account})
				c.save()
			continue
		c = frappe.new_doc("Salary Component")
		c.update({
			"salary_component": name, "salary_component_abbr": abbr, "type": "Earning",
			"depends_on_payment_days": 0, "is_tax_applicable": 0,
			"description": _("UAE: pro-rated on a fixed 30-day month by the salary structure formula"),
		})
		if account:
			c.append("accounts", {"company": company, "account": account})
		c.insert()

	# Payroll needs the payroll payable account typed "Payable".
	payable = frappe.get_cached_value("Company", company, "default_payroll_payable_account")
	if payable:
		acc = frappe.db.get_value("Account", payable, ["account_type", "root_type"], as_dict=True)
		if acc and acc.root_type == "Liability" and acc.account_type != "Payable":
			frappe.db.set_value("Account", payable, "account_type", "Payable")

	# Payroll Settings: calendar-day periods, so payment_days only drops unpaid days.
	ps = frappe.get_doc("Payroll Settings")
	ps.include_holidays_in_total_working_days = 1
	if not ps.payroll_based_on:
		ps.payroll_based_on = "Leave"
	ps.save()

	abbr = frappe.get_cached_value("Company", company, "abbr")
	base_name = structure_name or f"UAE Standard - {abbr}"
	name, n = base_name, 1
	while frappe.db.exists("Salary Structure", name):
		if frappe.db.get_value("Salary Structure", name, "docstatus") != 2:
			return {"structure": name, "created": False}  # an active / draft one already exists
		n += 1
		name = f"{base_name} ({n})"  # the old one was cancelled: make a fresh one
	s = frappe.new_doc("Salary Structure")
	s.update({
		"__newname": name, "company": company, "payroll_frequency": "Monthly", "is_active": "Yes",
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
	})
	for comp, comp_abbr, key in UAE_EARNINGS:
		if not pct[key]:
			continue
		s.append("earnings", {
			"salary_component": comp, "abbr": comp_abbr, "amount_based_on_formula": 1,
			"formula": f"base * {pct[key] / 100:g} * (30 - {UNPAID}) / 30", "depends_on_payment_days": 0,
		})
	s.insert()
	return {"structure": s.name, "created": True}


# ---------------------------------------------------------------- payroll run actions

def _call(doc, *names, **kwargs):
	for n in names:
		if hasattr(doc, n):
			return getattr(doc, n)(**kwargs)
	frappe.throw(_("This Frappe HR version has none of: {0}").format(", ".join(names)))


@frappe.whitelist(methods=["POST"])
def run_action(name, action):
	"""Steps of a Payroll Entry run: get_employees → (submit creates slips) → submit_slips → bank_entry."""
	_require_hr()
	doc = frappe.get_doc("Payroll Entry", name)
	doc.check_permission("write" if action == "get_employees" else "submit")
	if action == "get_employees":
		if doc.docstatus != 0:
			frappe.throw(_("Employees can only be fetched on a draft run"))
		_call(doc, "fill_employee_details")
		doc.number_of_employees = len(doc.employees)
		doc.save()  # Frappe HR fills the table but leaves saving to the form
		return {"employees": len(doc.employees)}
	if action == "create_slips":
		_call(doc, "create_salary_slips")
		return {"ok": True}
	if action == "submit_slips":
		_call(doc, "submit_salary_slips")
		return {"ok": True}
	if action == "bank_entry":
		if not doc.payment_account:
			frappe.throw(_("Set the Payment Account (bank / cash) on the payroll run first"))
		res = _call(doc, "make_bank_entry", "make_payment_entry")
		je = res.get("name") if isinstance(res, dict) else getattr(res, "name", None)
		return {"journal_entry": je}
	frappe.throw(_("Unknown action {0}").format(action))


# ---------------------------------------------------------------- register

@frappe.whitelist()
def register(company=None, year=None, month=None, department=None, include_draft=0):
	"""Salary register: one row per salary slip with every component as a column."""
	_require_hr()
	company = company or frappe.defaults.get_user_default("Company")
	year, month, start, end = _month_range(year, month)
	filters = {"company": company, "start_date": [">=", start], "end_date": ["<=", end], "docstatus": ["in", [0, 1] if cint(include_draft) else [1]]}
	if department:
		filters["department"] = department
	slips = frappe.get_all(
		"Salary Slip", filters=filters,
		fields=["name", "employee", "employee_name", "department", "designation", "total_working_days", "payment_days",
			"leave_without_pay", "gross_pay", "total_deduction", "net_pay", "currency", "docstatus", "bank_name", "bank_account_no"],
		order_by="employee_name asc",
	)
	details = frappe.get_all(
		"Salary Detail",
		filters={"parenttype": "Salary Slip", "parent": ["in", [s.name for s in slips] or [""]]},
		fields=["parent", "parentfield", "salary_component", "amount"],
		order_by="idx asc",
	)
	earnings, deductions, by_slip = [], [], {}
	for d in details:
		target = earnings if d.parentfield == "earnings" else deductions
		if d.salary_component not in target:
			target.append(d.salary_component)
		by_slip.setdefault(d.parent, {})
		by_slip[d.parent][d.salary_component] = by_slip[d.parent].get(d.salary_component, 0) + flt(d.amount)
	rows = [{**s, "components": by_slip.get(s.name, {})} for s in slips]
	totals = {c: sum(r["components"].get(c, 0) for r in rows) for c in earnings + deductions}
	totals.update({k: sum(flt(r[k]) for r in rows) for k in ("gross_pay", "total_deduction", "net_pay")})
	return {
		"year": year, "month": month, "start": str(start), "end": str(end),
		"earnings": earnings, "deductions": deductions, "rows": rows, "totals": totals,
		"currency": frappe.get_cached_value("Company", company, "default_currency") if company else None,
	}


# ---------------------------------------------------------------- WPS (UAE Wage Protection System) SIF file

MOL_DOC_TYPES = ("Labour Card", "Work Permit")


def _mol_ids(employees):
	"""Employee → MOL person ID (14 digits), from the latest Labour Card / Work Permit Karya Erp Employee Document."""
	if not employees or not frappe.db.exists("DocType", "Karya Erp Employee Document"):
		return {}
	rows = frappe.get_all(
		"Karya Erp Employee Document",
		filters={"employee": ["in", employees], "document_type": ["in", MOL_DOC_TYPES], "document_number": ["is", "set"]},
		fields=["employee", "document_number", "expiry_date"],
		order_by="expiry_date desc",
	)
	out = {}
	for r in rows:
		out.setdefault(r.employee, "".join(ch for ch in r.document_number if ch.isdigit()) or r.document_number)
	return out


def _money(v):
	return f"{flt(v, 2):.2f}"


@frappe.whitelist()
def wps_file(payroll_entry):
	"""Build the WPS SIF for a payroll run's submitted salary slips.

	EDR,<MOL person ID>,<routing code>,<IBAN>,<pay start>,<pay end>,<days>,<fixed>,<variable>,<days on leave>
	SCR,<employer ID>,<employer bank routing>,<file date>,<file time HHMM>,<salary month MMYYYY>,<EDR count>,<total>,AED,<reference>

	Returns {filename, content, problems[]}; with problems the file is still built from the valid rows.
	"""
	_require_hr()
	run = frappe.get_doc("Payroll Entry", payroll_entry)
	if not frappe.db.exists("Karya Erp WPS Settings", run.company):
		frappe.throw(_("Create Karya Erp WPS Settings for {0} first (employer ID and bank routing codes)").format(run.company))
	cfg = frappe.get_doc("Karya Erp WPS Settings", run.company)
	routing = {(r.bank_name or "").strip().lower(): r.routing_code.strip() for r in cfg.bank_routing}

	slips = frappe.get_all(
		"Salary Slip",
		filters={"payroll_entry": run.name, "docstatus": 1},
		fields=["name", "employee", "employee_name", "start_date", "end_date", "total_working_days", "payment_days",
			"leave_without_pay", "net_pay", "rounded_total", "bank_name", "bank_account_no"],
		order_by="employee_name asc",
	)
	if not slips:
		frappe.throw(_("No submitted salary slips in {0}").format(run.name))
	names = [s.employee for s in slips]
	emp = {e.name: e for e in frappe.get_all("Employee", filters={"name": ["in", names]}, fields=["name", "iban", "bank_name", "bank_ac_no"])}
	mol = _mol_ids(names)
	variable = {}
	for d in frappe.get_all(
		"Salary Detail",
		filters={"parenttype": "Salary Slip", "parent": ["in", [s.name for s in slips]], "parentfield": "earnings", "additional_salary": ["is", "set"]},
		fields=["parent", "amount"],
	):
		variable[d.parent] = variable.get(d.parent, 0) + flt(d.amount)

	lines, problems, total = [], [], 0.0
	for s in slips:
		e = emp.get(s.employee) or frappe._dict()
		bank = (s.bank_name or e.bank_name or "").strip()
		account = (e.iban or s.bank_account_no or e.bank_ac_no or "").replace(" ", "")
		issues = []
		if not mol.get(s.employee):
			issues.append(_("no Labour Card / Work Permit number"))
		if not account:
			issues.append(_("no IBAN"))
		if not routing.get(bank.lower()):
			issues.append(_("no routing code for bank “{0}”").format(bank or "—"))
		if issues:
			problems.append({"employee": s.employee, "employee_name": s.employee_name, "issues": issues})
			continue
		pay = flt(s.rounded_total or s.net_pay, 2)
		var = min(flt(variable.get(s.name), 2), pay)
		lines.append(",".join([
			"EDR", mol[s.employee], routing[bank.lower()], account,
			str(s.start_date), str(s.end_date), str(cint(s.total_working_days)),
			_money(pay - var), _money(var), str(cint(flt(s.leave_without_pay))),
		]))
		total += pay

	now = frappe.utils.now_datetime()
	employer_id = (cfg.employer_id or "").strip()
	start = getdate(run.start_date)
	lines.append(",".join([
		"SCR", employer_id, cfg.employer_bank_routing_code.strip(), now.strftime("%Y-%m-%d"), now.strftime("%H%M"),
		start.strftime("%m%Y"), str(len(lines)), _money(total), "AED", (cfg.employer_reference or run.name).replace(",", " "),
	]))
	return {
		"filename": f"{employer_id}{now.strftime('%y%m%d%H%M%S')}.SIF",
		"content": "\r\n".join(lines) + "\r\n",
		"records": len(lines) - 1,
		"total": total,
		"problems": problems,
	}
