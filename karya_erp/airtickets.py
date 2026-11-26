"""Annual air ticket entitlement (UAE practice) for the Karya Erp UI.

Policy per company — default ticket value, how often it is due (every 12 / 24 months), eligibility
after N months of service — with per-employee overrides (value, frequency, route) and the date a
company-booked ticket was last given. Stored as one JSON company default (frappe.db.set_default),
not as custom fields.

Paying a ticket in cash = Additional Salary (earning "Air Ticket Allowance") on that month's payroll,
posted against the air-ticket accrual so the monthly provision (karya_erp.provision) is released.
The last ticket date is the latest of: that Additional Salary, a recorded company-booked ticket, or
(none yet) the joining date.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_months, cint, date_diff, flt, getdate, nowdate

from karya_erp.hr import is_hr

COMPONENT = ("Air Ticket Allowance", "ATA")
DEFAULT_POLICY = {"value": 0, "frequency": 12, "eligible_after": 12, "employees": {}}


def _key(company):
	return f"karya_erp_air_ticket_policy::{company}"


def _company(company=None):
	return company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")


def _require(write=False):
	if not is_hr():
		frappe.throw(_("Only HR can manage air tickets"), frappe.PermissionError)


def get_policy(company):
	raw = frappe.db.get_default(_key(company))
	try:
		p = json.loads(raw) if raw else {}
	except Exception:
		p = {}
	return {**DEFAULT_POLICY, **p, "employees": p.get("employees") or {}}


def _save_policy(company, policy):
	# drop overrides of employees that no longer exist
	policy["employees"] = {k: v for k, v in (policy.get("employees") or {}).items() if frappe.db.exists("Employee", k)}
	frappe.db.set_default(_key(company), json.dumps(policy))


def _ensure_component(company):
	from karya_erp.payroll import ensure_component

	name = ensure_component(*COMPONENT, company, _("Air ticket paid in cash (UAE entitlement)"))
	acc = (frappe.db.get_value("Account", {"company": company, "is_group": 0, "account_name": "Accrued - Leave Tickets"}, "name")
		or frappe.db.get_value("Account", {"company": company, "is_group": 0, "account_name": "Air tickets"}, "name"))
	if acc:
		c = frappe.get_doc("Salary Component", name)
		row = next((a for a in c.accounts if a.company == company), None)
		if row and row.account != acc:
			row.account = acc
			c.save(ignore_permissions=True)
	return name


def _last_paid(employees):
	rows = frappe.get_all(
		"Additional Salary", filters={"employee": ["in", employees or [""]], "salary_component": COMPONENT[0], "docstatus": 1},
		fields=["employee", "payroll_date"], order_by="payroll_date asc",
	)
	return {r.employee: getdate(r.payroll_date) for r in rows}


def status(company, as_of=None):
	"""Entitlement, last ticket, next due date and accrued value per active employee."""
	as_of = getdate(as_of or nowdate())
	policy = get_policy(company)
	emps = frappe.get_all("Employee", filters={"company": company, "status": "Active", "date_of_joining": ["<=", as_of]}, fields=["name", "employee_name", "date_of_joining", "department"], order_by="employee_name")
	paid = _last_paid([e.name for e in emps])
	out = []
	for e in emps:
		ov = policy["employees"].get(e.name, {})
		value = flt(ov.get("value") if ov.get("value") not in (None, "") else policy["value"])
		freq = cint(ov.get("frequency") or policy["frequency"]) or 12
		booked = getdate(ov["last_date"]) if ov.get("last_date") else None
		last = max([d for d in (paid.get(e.name), booked) if d] or [None]) if (paid.get(e.name) or booked) else None
		join = getdate(e.date_of_joining)
		eligible_from = add_months(join, cint(policy["eligible_after"]))
		base = last or join
		due = add_months(base, freq)
		months = max(0.0, date_diff(as_of, base) / 30.4375)
		accrued = flt(min(value, value * months / freq), 2) if value else 0.0
		state = "No entitlement" if not value else ("Not eligible yet" if as_of < getdate(eligible_from) else ("Due" if as_of >= getdate(due) else "Accruing"))
		out.append({
			"employee": e.name, "employee_name": e.employee_name, "department": e.department, "date_of_joining": str(join),
			"value": value, "frequency": freq, "route": ov.get("route") or "", "custom": bool(ov),
			"last_ticket": str(last) if last else None, "last_via": "payroll" if last and last == paid.get(e.name) else ("company booked" if last else None),
			"next_due": str(due), "eligible_from": str(eligible_from), "accrued": accrued, "state": state,
		})
	return out


@frappe.whitelist()
def overview(company=None):
	_require()
	company = _company(company)
	rows = status(company)
	return {
		"company": company, "currency": frappe.get_cached_value("Company", company, "default_currency"),
		"policy": {k: v for k, v in get_policy(company).items() if k != "employees"}, "rows": rows,
		"totals": {"accrued": flt(sum(r["accrued"] for r in rows), 2), "due": sum(1 for r in rows if r["state"] == "Due")},
	}


@frappe.whitelist(methods=["POST"])
def save_policy(value, frequency=12, eligible_after=12, company=None):
	_require(True)
	company = _company(company)
	p = get_policy(company)
	if cint(frequency) not in (12, 24, 36):
		frappe.throw(_("Frequency must be every 12, 24 or 36 months"))
	p.update({"value": flt(value), "frequency": cint(frequency), "eligible_after": max(0, cint(eligible_after))})
	_save_policy(company, p)
	return True


@frappe.whitelist(methods=["POST"])
def save_employee(employee, value=None, frequency=None, route=None, company=None):
	"""Per-employee override; empty value / frequency = use the company policy."""
	_require(True)
	company = _company(company)
	p = get_policy(company)
	ov = p["employees"].get(employee, {})
	ov.update({"value": flt(value) if value not in (None, "") else None, "frequency": cint(frequency) or None, "route": (route or "").strip() or None})
	ov = {k: v for k, v in ov.items() if v not in (None, "")}
	if ov:
		p["employees"][employee] = ov
	else:
		p["employees"].pop(employee, None)
	_save_policy(company, p)
	return True


@frappe.whitelist(methods=["POST"])
def pay_in_payroll(employee, amount, payroll_date=None, company=None):
	"""Cash in lieu of the ticket on that month's payslip."""
	_require(True)
	company = _company(company)
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Enter the amount"))
	if not frappe.db.exists("Salary Structure Assignment", {"employee": employee, "docstatus": 1}):
		frappe.throw(_("This employee has no salary assigned yet"))
	component = _ensure_component(company)
	a = frappe.new_doc("Additional Salary")
	a.update({"employee": employee, "company": company, "salary_component": component, "type": "Earning", "amount": amount,
		"payroll_date": payroll_date or nowdate(), "overwrite_salary_structure_amount": 0, "currency": frappe.get_cached_value("Company", company, "default_currency")})
	a.insert()
	a.submit()
	return {"name": a.name}


@frappe.whitelist(methods=["POST"])
def record_booked(employee, ticket_date, note=None, company=None):
	"""The company bought the ticket (expense / supplier invoice): only restart the entitlement clock."""
	_require(True)
	company = _company(company)
	p = get_policy(company)
	ov = p["employees"].get(employee, {})
	ov["last_date"] = str(getdate(ticket_date))
	p["employees"][employee] = ov
	_save_policy(company, p)
	frappe.get_doc("Employee", employee).add_comment("Comment", frappe.utils.escape_html(_("Air ticket provided on {0}{1}").format(frappe.utils.formatdate(ticket_date), f" — {note}" if note else "")))
	return True
