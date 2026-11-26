"""UAE end-of-service gratuity and final settlement (Federal Decree-Law No. 33 of 2021, private sector).

Gratuity = daily basic × (21 days × first 5 years + 30 days × years beyond 5)
  - daily basic = last monthly basic / 30
  - only after 1 year of continuous service; part years pro-rata after that
  - days of unpaid leave are not counted as service
  - total capped at 2 years' total wage (24 × monthly total wage)
  - resignation no longer reduces it (2021 law)

Settlement adds unused annual-leave encashment (balance × daily basic) and shows outstanding advances.
Paying it = Additional Salary (Gratuity, Leave Encashment) on the last payroll, so it flows through the
salary slip, accounting and the WPS file like any other pay.
"""

import frappe
from frappe import _
from frappe.utils import cint, date_diff, flt, getdate, nowdate

from karya_erp.hr import is_hr

COMPONENTS = {"gratuity": ("Gratuity", "GRAT"), "leave": ("Leave Encashment", "LENC")}


def _require_hr():
	if not is_hr():
		frappe.throw(_("Only HR can prepare final settlements"), frappe.PermissionError)


def _unpaid_leave_days(employee, start, end):
	lwp_types = frappe.get_all("Leave Type", filters={"is_lwp": 1}, pluck="name")
	if not lwp_types:
		return 0.0
	rows = frappe.get_all(
		"Leave Application",
		filters={"employee": employee, "leave_type": ["in", lwp_types], "docstatus": 1, "status": "Approved",
			"from_date": ["<=", end], "to_date": [">=", start]},
		fields=["total_leave_days"],
	)
	return sum(flt(r.total_leave_days) for r in rows)


def _latest_wages(employee):
	"""(monthly basic, monthly total, slip) from the latest submitted salary slip.

	A part-month slip (unpaid days, joining month) is scaled back to a full month by
	total_working_days / payment_days. Falls back to the salary assignment's base for the total.
	"""
	slips = frappe.get_all(
		"Salary Slip",
		filters={"employee": employee, "docstatus": 1},
		fields=["name", "gross_pay", "payment_days", "total_working_days", "start_date"],
		order_by="start_date desc", limit_page_length=6,
	)
	full = [s for s in slips if flt(s.payment_days) and flt(s.payment_days) >= flt(s.total_working_days)]
	for s in full + [s for s in slips if s not in full]:
		if not flt(s.payment_days):
			continue
		factor = flt(s.total_working_days) / flt(s.payment_days) if flt(s.payment_days) < flt(s.total_working_days) else 1.0
		basic = sum(
			flt(d.amount) for d in frappe.get_all(
				"Salary Detail", filters={"parent": s.name, "parenttype": "Salary Slip", "parentfield": "earnings"},
				fields=["salary_component", "amount"],
			) if "basic" in (d.salary_component or "").lower()
		)
		return flt(basic * factor, 2), flt(flt(s.gross_pay) * factor, 2), s.name
	base = frappe.db.get_value(
		"Salary Structure Assignment", {"employee": employee, "docstatus": 1}, "base", order_by="from_date desc",
	)
	return 0.0, flt(base, 2), None


def _leave_balances(employee, on_date):
	try:
		from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on
	except ImportError:
		return []
	types = frappe.get_all(
		"Leave Allocation",
		filters={"employee": employee, "docstatus": 1, "from_date": ["<=", on_date], "to_date": [">=", on_date]},
		pluck="leave_type",
	)
	out = []
	for lt in sorted(set(types)):
		meta = frappe.db.get_value("Leave Type", lt, ["is_lwp", "allow_encashment", "is_earned_leave"], as_dict=True) or {}
		if cint(meta.get("is_lwp")):
			continue
		bal = get_leave_balance_on(employee, lt, on_date, consider_all_leaves_in_the_allocation_period=True)
		if isinstance(bal, dict):
			bal = bal.get("leave_balance", 0)
		annual = "annual" in lt.lower() or cint(meta.get("allow_encashment"))
		out.append({"leave_type": lt, "balance": flt(bal, 2), "encash": bool(annual and flt(bal) > 0)})
	return out


@frappe.whitelist()
def calculate(employee, relieving_date=None, basic=None, total_wage=None, leave_days=None):
	"""Gratuity + leave encashment + outstanding advances. basic / total_wage / leave_days override the defaults."""
	_require_hr()
	emp = frappe.get_doc("Employee", employee)
	end = getdate(relieving_date or emp.relieving_date or nowdate())
	start = getdate(emp.date_of_joining)
	if end < start:
		frappe.throw(_("Relieving date is before the joining date"))

	d_basic, d_total, from_slip = _latest_wages(employee)
	basic = flt(basic) if basic not in (None, "") else d_basic
	total_wage = flt(total_wage) if total_wage not in (None, "") else d_total
	daily = basic / 30 if basic else 0.0

	calendar_days = date_diff(end, start) + 1
	unpaid = _unpaid_leave_days(employee, start, end)
	service_days = max(0.0, calendar_days - unpaid)
	years = service_days / 365

	eligible = years >= 1
	first = min(years, 5) if eligible else 0
	beyond = max(0.0, years - 5) if eligible else 0
	days_first, days_beyond = first * 21, beyond * 30
	gratuity_raw = daily * (days_first + days_beyond)
	cap = total_wage * 24 if total_wage else None
	gratuity = min(gratuity_raw, cap) if cap else gratuity_raw

	balances = _leave_balances(employee, end)
	default_leave = sum(b["balance"] for b in balances if b["encash"])
	leave_days = flt(leave_days) if leave_days not in (None, "") else default_leave
	leave_amount = daily * leave_days

	advances = frappe.get_all(
		"Employee Advance",
		filters={"employee": employee, "docstatus": 1},
		fields=["name", "purpose", "paid_amount", "claimed_amount", "return_amount"],
	)
	outstanding = [
		{**a, "outstanding": flt(a.paid_amount) - flt(a.claimed_amount) - flt(a.return_amount)}
		for a in advances
		if flt(a.paid_amount) - flt(a.claimed_amount) - flt(a.return_amount) > 0.005
	]
	already = frappe.get_all(
		"Additional Salary",
		filters={"employee": employee, "docstatus": 1, "salary_component": ["in", [c[0] for c in COMPONENTS.values()]]},
		fields=["name", "salary_component", "amount", "payroll_date"],
	)
	return {
		"employee": emp.name, "employee_name": emp.employee_name, "company": emp.company,
		"currency": frappe.get_cached_value("Company", emp.company, "default_currency"),
		"date_of_joining": str(start), "relieving_date": str(end), "saved_relieving_date": emp.relieving_date and str(emp.relieving_date),
		"basic": flt(basic, 2), "total_wage": flt(total_wage, 2), "daily_basic": flt(daily, 4), "wages_from_slip": from_slip,
		"calendar_days": calendar_days, "unpaid_days": unpaid, "service_days": service_days, "years": flt(years, 4),
		"eligible": eligible,
		"gratuity": {
			"first_years": flt(first, 4), "beyond_years": flt(beyond, 4),
			"days_first": flt(days_first, 2), "days_beyond": flt(days_beyond, 2),
			"raw": flt(gratuity_raw, 2), "cap": cap and flt(cap, 2), "capped": bool(cap and gratuity_raw > cap), "amount": flt(gratuity, 2),
		},
		"leave": {"balances": balances, "days": flt(leave_days, 2), "amount": flt(leave_amount, 2)},
		"advances": outstanding,
		"advances_total": flt(sum(a["outstanding"] for a in outstanding), 2),
		"total": flt(gratuity + leave_amount, 2),
		"already_added": already,
	}


def _ensure_component(key, company):
	from karya_erp.payroll import ensure_component

	name, abbr = COMPONENTS[key]
	return ensure_component(name, abbr, company)


@frappe.whitelist(methods=["POST"])
def add_to_payroll(employee, relieving_date, gratuity=0, leave_encashment=0, save_relieving_date=1, note=None):
	"""Create submitted Additional Salary rows (paid on the last payroll) and optionally store the relieving date."""
	_require_hr()
	emp = frappe.get_doc("Employee", employee)
	payroll_date = getdate(relieving_date)
	created = []
	for key, amount in (("gratuity", flt(gratuity)), ("leave", flt(leave_encashment))):
		if amount <= 0:
			continue
		comp = _ensure_component(key, emp.company)
		if frappe.db.exists("Additional Salary", {"employee": employee, "salary_component": comp, "docstatus": 1}):
			frappe.throw(_("{0} for {1} was already added — cancel it first to redo it").format(comp, emp.employee_name))
		a = frappe.new_doc("Additional Salary")
		a.update({
			"employee": employee, "company": emp.company, "salary_component": comp, "amount": flt(amount, 2),
			"payroll_date": payroll_date, "overwrite_salary_structure_amount": 1,
			"currency": frappe.get_cached_value("Company", emp.company, "default_currency"),
		})
		a.insert()
		a.submit()
		if note:
			a.add_comment("Comment", note)
		created.append(a.name)
	if cint(save_relieving_date) and str(emp.relieving_date or "") != str(payroll_date):
		emp.relieving_date = payroll_date
		emp.save()
	return {"created": created}
