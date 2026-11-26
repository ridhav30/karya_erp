"""Monthly end-of-service gratuity, leave-salary and air-ticket provision (UAE).

At each month end the liability for every active employee is recalculated with the same rules as the
final settlement (karya_erp.settlement): gratuity = daily basic × (21 days × first 5 years + 30 days
beyond), daily basic = monthly basic / 30, unpaid leave not counted, capped at 24 × total wage; leave
salary = unused annual-leave days × daily basic.

The required total is compared with what the provision accounts already hold (GL balance) and one
Journal Entry posts the difference ("true-up"): Dr expense / Cr provision, or the reverse when the
liability went down (leavers paid out, leave taken). The per-employee working is kept on the entry
as a comment. No custom fields; entries are found again by the tag in their remark.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import cint, date_diff, flt, get_last_day, getdate, nowdate

from karya_erp.hr import is_hr

TAG = "Gratuity & leave provision"
ACCOUNT_HINTS = {
	"gratuity_expense": ("End Of Service Indemnity", "Gratuity"),
	"gratuity_liability": ("Provision for End of Service", "End of Service Benefit", "Gratuity Payable", "Gratuity Provision"),
	"leave_expense": ("Leave Salary",),
	"leave_liability": ("Accrued - Leave Salary", "Leave Salary Payable", "Leave Salary Provision"),
	"ticket_expense": ("Air tickets", "Air Ticket"),
	"ticket_liability": ("Accrued - Leave Tickets", "Air Ticket Provision", "Accrued Air Tickets"),
}
REQUIRED = ("gratuity_expense", "gratuity_liability", "leave_expense", "leave_liability")


def _require(write=False):
	roles = set(frappe.get_roles())
	if not (roles & {"Accounts Manager", "HR Manager", "System Manager"} or (is_hr() and not write)):
		frappe.throw(_("Only Accounts or HR managers can manage provisions"), frappe.PermissionError)
	if write and not frappe.has_permission("Journal Entry", "submit"):
		frappe.throw(_("You need permission to submit Journal Entries"), frappe.PermissionError)


def _company(company=None):
	return company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")


def _guess_accounts(company):
	out = {}
	for key, hints in ACCOUNT_HINTS.items():
		root = "Expense" if key.endswith("expense") else "Liability"
		for h in hints:
			acc = frappe.db.get_value("Account", {"company": company, "is_group": 0, "root_type": root, "account_name": ["like", f"%{h}%"]}, "name")
			if acc:
				out[key] = acc
				break
	return out


def _basic_from_assignment(employee, on_date):
	"""Monthly basic when there is no salary slip yet: assignment base × the Basic share in the structure formula."""
	ssa = frappe.db.get_value(
		"Salary Structure Assignment", {"employee": employee, "docstatus": 1, "from_date": ["<=", on_date]},
		["salary_structure", "base"], as_dict=True, order_by="from_date desc",
	)
	if not ssa:
		return 0.0, 0.0
	rows = frappe.get_all(
		"Salary Detail", filters={"parent": ssa.salary_structure, "parenttype": "Salary Structure", "parentfield": "earnings"},
		fields=["salary_component", "abbr", "formula", "amount", "amount_based_on_formula"],
	)
	for r in rows:
		if "basic" not in (r.salary_component or "").lower() and r.abbr != "BS":
			continue
		if cint(r.amount_based_on_formula) and r.formula:
			m = re.search(r"base\s*\*\s*([0-9.]+)", r.formula)
			if m:
				return flt(ssa.base) * flt(m.group(1)), flt(ssa.base)
		elif flt(r.amount):
			return flt(r.amount), flt(ssa.base)
	return 0.0, flt(ssa.base)


def _employee_liability(emp, as_of, include_first_year, cache):
	from karya_erp.settlement import _latest_wages, _leave_balances, _unpaid_leave_days

	start = getdate(emp.date_of_joining)
	basic, total, slip = _latest_wages(emp.name)
	if not basic:
		basic, base = _basic_from_assignment(emp.name, as_of)
		total = total or base
	daily = basic / 30 if basic else 0.0
	unpaid = _unpaid_leave_days(emp.name, start, as_of)
	service_days = max(0.0, date_diff(as_of, start) + 1 - unpaid)
	years = service_days / 365
	accrues = years >= 1 or cint(include_first_year)
	gratuity = daily * (min(years, 5) * 21 + max(0.0, years - 5) * 30) if accrues else 0.0
	if total:
		gratuity = min(gratuity, total * 24)
	leave_days = sum(b["balance"] for b in _leave_balances(emp.name, as_of) if b["encash"])
	return {
		"employee": emp.name, "employee_name": emp.employee_name, "department": emp.department,
		"date_of_joining": str(start), "years": flt(years, 2), "basic": flt(basic, 2), "basic_from": slip or ("assignment" if basic else None),
		"gratuity": flt(gratuity, 2), "leave_days": flt(leave_days, 2), "leave_salary": flt(daily * leave_days, 2),
		"missing_basic": not basic,
	}


def _balance(account, as_of):
	"""Credit balance (liability) of an account up to a date."""
	if not account:
		return 0.0
	row = frappe.db.sql(
		"select coalesce(sum(credit) - sum(debit), 0) from `tabGL Entry` where account = %s and is_cancelled = 0 and posting_date <= %s",
		(account, as_of),
	)
	return flt(row[0][0], 2)


def _existing(company, as_of):
	return frappe.db.get_value(
		"Journal Entry", {"company": company, "docstatus": 1, "posting_date": as_of, "user_remark": ["like", f"{TAG}%"]}, "name"
	)


@frappe.whitelist()
def preview(company=None, as_of=None, include_first_year=1, accounts=None):
	_require()
	company = _company(company)
	as_of = getdate(get_last_day(as_of or nowdate()))
	acc = {**_guess_accounts(company), **{k: v for k, v in (json.loads(accounts) if isinstance(accounts, str) else (accounts or {})).items() if v}}
	emps = frappe.get_all(
		"Employee", filters={"company": company, "status": "Active", "date_of_joining": ["<=", as_of]},
		fields=["name", "employee_name", "department", "date_of_joining"], order_by="employee_name",
	)
	cache = {}
	rows = [_employee_liability(e, as_of, include_first_year, cache) for e in emps]
	from karya_erp.airtickets import status as ticket_status

	tickets = {t["employee"]: t["accrued"] for t in ticket_status(company, as_of)}
	for r in rows:
		r["air_ticket"] = flt(tickets.get(r["employee"], 0), 2)
	req_t = flt(sum(r["air_ticket"] for r in rows), 2)
	booked_t = _balance(acc.get("ticket_liability"), as_of)
	req_g = flt(sum(r["gratuity"] for r in rows), 2)
	req_l = flt(sum(r["leave_salary"] for r in rows), 2)
	booked_g = _balance(acc.get("gratuity_liability"), as_of)
	booked_l = _balance(acc.get("leave_liability"), as_of)
	history = frappe.get_all(
		"Journal Entry", filters={"company": company, "docstatus": 1, "user_remark": ["like", f"{TAG}%"]},
		fields=["name", "posting_date", "total_debit"], order_by="posting_date desc", limit_page_length=12,
	)
	return {
		"company": company, "currency": frappe.get_cached_value("Company", company, "default_currency"),
		"as_of": str(as_of), "include_first_year": cint(include_first_year), "accounts": acc, "rows": rows,
		"gratuity": {"required": req_g, "booked": booked_g, "entry": flt(req_g - booked_g, 2)},
		"leave": {"required": req_l, "booked": booked_l, "entry": flt(req_l - booked_l, 2)},
		"air_ticket": {"required": req_t, "booked": booked_t, "entry": flt(req_t - booked_t, 2)},
		"existing": _existing(company, as_of), "history": history,
		"can_post": bool(frappe.has_permission("Journal Entry", "submit")),
	}


@frappe.whitelist(methods=["POST"])
def post(company=None, as_of=None, include_first_year=1, accounts=None):
	_require(write=True)
	p = preview(company, as_of, include_first_year, accounts)
	company, as_of, acc = p["company"], p["as_of"], p["accounts"]
	if p["existing"]:
		frappe.throw(_("The provision for {0} is already posted ({1}). Cancel it first to post again.").format(as_of, p["existing"]))
	missing = [k for k in REQUIRED if not acc.get(k)]
	if abs(p["air_ticket"]["entry"]) >= 0.01 and not (acc.get("ticket_expense") and acc.get("ticket_liability")):
		missing += [k for k in ("ticket_expense", "ticket_liability") if not acc.get(k)]
	if missing:
		frappe.throw(_("Choose the accounts first: {0}").format(", ".join(m.replace("_", " ") for m in missing)))
	cc = frappe.get_cached_value("Company", company, "cost_center")
	je = frappe.new_doc("Journal Entry")
	je.update({
		"company": company, "voucher_type": "Journal Entry", "posting_date": as_of,
		"user_remark": f"{TAG} as of {as_of}: gratuity {p['gratuity']['required']}, leave salary {p['leave']['required']}, air tickets {p['air_ticket']['required']} "
		f"({len(p['rows'])} employees{'' if cint(include_first_year) else ', from 1 year of service'})",
	})
	for key, exp, liab in (("gratuity", "gratuity_expense", "gratuity_liability"), ("leave", "leave_expense", "leave_liability"), ("air_ticket", "ticket_expense", "ticket_liability")):
		amt = p[key]["entry"]
		if abs(amt) < 0.01:
			continue
		je.append("accounts", {"account": acc[exp], "debit_in_account_currency": max(amt, 0), "credit_in_account_currency": max(-amt, 0), "cost_center": cc})
		je.append("accounts", {"account": acc[liab], "debit_in_account_currency": max(-amt, 0), "credit_in_account_currency": max(amt, 0), "cost_center": cc})
	if not je.accounts:
		frappe.throw(_("Nothing to post — the provision already matches the liability"))
	je.insert()
	je.submit()
	head = "<tr><th>Employee</th><th>Years</th><th>Basic</th><th>Gratuity</th><th>Leave days</th><th>Leave salary</th><th>Air ticket</th></tr>"
	body = "".join(
		f"<tr><td>{frappe.utils.escape_html(r['employee_name'])} ({r['employee']})</td><td>{r['years']}</td><td>{r['basic']}</td>"
		f"<td>{r['gratuity']}</td><td>{r['leave_days']}</td><td>{r['leave_salary']}</td><td>{r.get('air_ticket', 0)}</td></tr>"
		for r in p["rows"]
	)
	je.add_comment("Comment", f"<p>{TAG} — working as of {as_of}</p><table>{head}{body}</table>")
	return {"name": je.name, "gratuity": p["gratuity"]["entry"], "leave": p["leave"]["entry"], "air_ticket": p["air_ticket"]["entry"]}
