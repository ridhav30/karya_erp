"""Leave for the React app, on Frappe HR (Leave Type, Leave Allocation, Leave Application).

One approval level: the employee's leave approver (Employee / Department setting) approves or
rejects; HR can decide any request. Frappe HR then submits the application, updates balances and
marks attendance "On Leave".
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from karya_erp.hr import employee_of, is_hr

LA = "Leave Application"


def _la_module():
	from hrms.hr.doctype.leave_application import leave_application

	return leave_application


def _approver_for(employee):
	try:
		return _la_module().get_leave_approver(employee)
	except Exception:
		return frappe.db.get_value("Employee", employee, "leave_approver")


def _require_employee():
	employee = employee_of()
	if not employee:
		frappe.throw(_("Your user is not linked to an active employee"))
	return employee


# ---------------------------------------------------------------- employee

@frappe.whitelist()
def leave_types():
	"""Leave types the employee can apply for: those with an allocation now, plus leave without pay / negative-allowed."""
	employee = _require_employee()
	allocated = set(frappe.get_all(
		"Leave Allocation",
		filters={"employee": employee, "docstatus": 1, "from_date": ["<=", nowdate()], "to_date": [">=", nowdate()]},
		pluck="leave_type",
	))
	rows = frappe.get_all("Leave Type", fields=["name", "is_lwp", "allow_negative", "is_optional_leave"], order_by="name asc")
	return [
		{"name": r.name, "is_lwp": cint(r.is_lwp), "allocated": r.name in allocated}
		for r in rows
		if r.name in allocated or cint(r.is_lwp) or cint(r.allow_negative)
	]


@frappe.whitelist()
def preview(leave_type, from_date, to_date, half_day=0, half_day_date=None):
	"""Working days the request would take, the balance on the start date and who approves it."""
	employee = _require_employee()
	m = _la_module()
	half_day = cint(half_day)
	if getdate(to_date) < getdate(from_date):
		return {"days": 0, "balance": None, "approver": None, "error": _("To date is before From date")}
	days = m.get_number_of_leave_days(employee, leave_type, from_date, to_date, half_day, half_day_date or (from_date if half_day else None))
	is_lwp = cint(frappe.db.get_value("Leave Type", leave_type, "is_lwp"))
	balance = None
	if not is_lwp:
		try:
			balance = m.get_leave_balance_on(employee, leave_type, from_date, to_date, consider_all_leaves_in_the_allocation_period=True, for_consumption=True)
			if isinstance(balance, dict):
				balance = balance.get("leave_balance_for_consumption", balance.get("leave_balance"))
		except TypeError:
			balance = m.get_leave_balance_on(employee, leave_type, from_date, to_date, consider_all_leaves_in_the_allocation_period=True)
	approver = _approver_for(employee)
	return {
		"days": flt(days),
		"balance": None if balance is None else flt(balance),
		"is_lwp": is_lwp,
		"approver": approver,
		"approver_name": approver and frappe.utils.get_fullname(approver),
	}


@frappe.whitelist(methods=["POST"])
def apply(leave_type, from_date, to_date, reason=None, half_day=0, half_day_date=None):
	employee = _require_employee()
	half_day = cint(half_day)
	doc = frappe.new_doc(LA)
	doc.update({
		"employee": employee,
		"leave_type": leave_type,
		"from_date": from_date,
		"to_date": to_date,
		"half_day": half_day,
		"half_day_date": (half_day_date or from_date) if half_day else None,
		"description": reason,
		"status": "Open",
		"posting_date": nowdate(),
		"company": frappe.db.get_value("Employee", employee, "company"),
		"leave_approver": _approver_for(employee),
		"follow_via_email": 1,
	})
	doc.insert()
	return {"name": doc.name, "total_leave_days": doc.total_leave_days, "leave_approver": doc.leave_approver}


@frappe.whitelist()
def my_leaves(limit=50):
	employee = _require_employee()
	rows = frappe.get_all(
		LA,
		filters={"employee": employee},
		fields=["name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "status", "docstatus", "leave_approver", "description", "posting_date"],
		order_by="from_date desc",
		limit_page_length=cint(limit) or 50,
	)
	for r in rows:
		r.leave_approver_name = r.leave_approver and frappe.utils.get_fullname(r.leave_approver)
		r.can_withdraw = r.status == "Open" and r.docstatus == 0
	return rows


@frappe.whitelist(methods=["POST"])
def withdraw(name):
	"""Withdraw your own request while it is still open (deletes the draft)."""
	employee = _require_employee()
	doc = frappe.get_doc(LA, name)
	if doc.employee != employee:
		frappe.throw(_("You can only withdraw your own leave requests"), frappe.PermissionError)
	if doc.docstatus != 0 or doc.status != "Open":
		frappe.throw(_("Only open requests can be withdrawn — ask HR to cancel an approved leave"))
	frappe.delete_doc(LA, name, ignore_permissions=True)
	return True


# ---------------------------------------------------------------- approver / HR

def pending_for_me(limit=200):
	"""Open leave requests the current user decides (their leave approver), or any open one for HR."""
	user = frappe.session.user
	filters = {"status": "Open", "docstatus": 0}
	if not is_hr():
		filters["leave_approver"] = user  # HR sees every open request
	rows = frappe.get_all(
		LA, filters=filters,
		fields=["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "description", "modified", "owner", "leave_approver"],
		order_by="from_date asc", limit_page_length=cint(limit) or 200,
	)
	own = employee_of(user)
	return [r for r in rows if r.employee != own]  # never approve your own leave


def _can_decide(doc):
	user = frappe.session.user
	if doc.employee == employee_of(user):
		return False
	return doc.leave_approver == user or is_hr()


@frappe.whitelist(methods=["POST"])
def decide(name, action, reason=None):
	"""Approve or Reject an open leave request (submits it, as Frappe HR requires)."""
	if action not in ("Approve", "Reject"):
		frappe.throw(_("Unknown action {0}").format(action))
	doc = frappe.get_doc(LA, name)
	if doc.docstatus != 0 or doc.status != "Open":
		frappe.throw(_("{0} is already {1}").format(name, doc.status))
	if not _can_decide(doc):
		frappe.throw(_("You are not the leave approver for {0}").format(doc.employee_name), frappe.PermissionError)
	if reason:
		doc.add_comment("Comment", _("{0}: {1}").format(_("Approved") if action == "Approve" else _("Rejected"), reason))
	doc.status = "Approved" if action == "Approve" else "Rejected"
	# The approver may not hold submit permission on other people's leave; the check above is the rule.
	doc.flags.ignore_permissions = not frappe.has_permission(LA, "submit", doc)
	doc.save()
	doc.submit()
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def bulk_allocate(leave_type, from_date, to_date, new_leaves_allocated, employees, carry_forward=0, description=None):
	"""HR: one Leave Allocation (submitted) per employee; existing overlaps are reported, not fatal."""
	if not (is_hr() and frappe.has_permission("Leave Allocation", "submit")):
		frappe.throw(_("Only HR can allocate leave"), frappe.PermissionError)
	employees = json.loads(employees) if isinstance(employees, str) else employees
	done, failed = [], []
	for employee in employees or []:
		try:
			doc = frappe.new_doc("Leave Allocation")
			doc.update({
				"employee": employee, "leave_type": leave_type, "from_date": from_date, "to_date": to_date,
				"new_leaves_allocated": flt(new_leaves_allocated), "carry_forward": cint(carry_forward),
				"description": description,
			})
			doc.insert()
			doc.submit()
			frappe.db.commit()
			done.append(doc.name)
		except Exception as ex:
			frappe.db.rollback()
			frappe.clear_last_message()
			failed.append({"employee": employee, "error": frappe.utils.strip_html(str(ex))[:200]})
	return {"done": done, "failed": failed}


@frappe.whitelist()
def on_leave(date=None, company=None):
	"""Who is on approved leave on a date (team / HR view)."""
	date = str(getdate(date or nowdate()))
	filters = {"docstatus": 1, "status": "Approved", "from_date": ["<=", date], "to_date": [">=", date]}
	if company:
		filters["company"] = company
	return frappe.get_list(
		LA, filters=filters,
		fields=["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "half_day"],
		order_by="employee_name asc", limit_page_length=0,
	)
