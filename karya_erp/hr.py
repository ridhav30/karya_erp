"""HR helpers for the React app (Frappe HR / hrms is the backend).

- my_hr(): everything the "My HR" page needs for the logged-in employee, in one call
- create_login(): make a User for an Employee (email + password, welcome email) and link it
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

HR_ROLES = ("HR User", "HR Manager", "System Manager")
SELF_SERVICE_ROLES = ("Employee", "Employee Self Service")


def employee_of(user=None):
	"""Active Employee linked to a user (Employee.user_id), or None."""
	user = user or frappe.session.user
	if user in ("Guest", "Administrator"):
		return None
	return frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")


def is_leave_approver(user=None):
	user = user or frappe.session.user
	try:
		return bool(
			frappe.db.exists("Employee", {"leave_approver": user, "status": "Active"})
			or frappe.db.exists("Employee", {"expense_approver": user, "status": "Active"})
			or frappe.db.exists("Department Approver", {"approver": user, "parentfield": ["in", ["leave_approvers", "expense_approvers"]]})
		)
	except Exception:
		return False


def has_reports(user=None):
	employee = employee_of(user)
	return bool(employee and frappe.db.exists("Employee", {"reports_to": employee, "status": "Active"}))


def is_hr(roles=None):
	roles = roles or frappe.get_roles()
	return any(r in roles for r in HR_ROLES)


def _safe(fn, default=None):
	try:
		return fn()
	except Exception:
		frappe.clear_last_message()
		return default


def _leave_balances(employee):
	from hrms.hr.doctype.leave_application.leave_application import get_leave_details

	details = get_leave_details(employee, nowdate()) or {}
	out = []
	for leave_type, d in (details.get("leave_allocation") or {}).items():
		out.append({
			"leave_type": leave_type,
			"allocated": d.get("total_leaves", 0),
			"taken": d.get("leaves_taken", 0),
			"pending": d.get("leaves_pending_approval", 0),
			"expired": d.get("expired_leaves", 0),
			"balance": d.get("remaining_leaves", 0),
		})
	return out


def holiday_list_for(employee, on_date=None):
	"""Holiday list that applies to the employee on a date.

	Frappe HR v16 assigns lists with submitted Holiday List Assignments (employee first, then company);
	older versions use Employee.holiday_list / Company.default_holiday_list. Try Frappe HR's own lookup,
	then the assignments, then the old fields.
	"""
	on_date = getdate(on_date or nowdate())
	for path in ("hrms.hr.utils", "erpnext.setup.doctype.employee.employee"):
		try:
			fn = frappe.get_attr(f"{path}.get_holiday_list_for_employee")
		except Exception:
			continue
		for kwargs in ({"raise_exception": False, "as_on": on_date}, {"raise_exception": False}):
			try:
				hl = fn(employee, **kwargs)
				if hl:
					return hl
				break
			except TypeError:
				continue
			except Exception:
				frappe.clear_last_message()
				break
	company = frappe.db.get_value("Employee", employee, "company")
	if frappe.db.exists("DocType", "Holiday List Assignment"):
		for applicable_for, assigned_to in (("Employee", employee), ("Company", company)):
			hl = frappe.db.get_value(
				"Holiday List Assignment",
				{"docstatus": 1, "applicable_for": applicable_for, "assigned_to": assigned_to, "from_date": ["<=", on_date]},
				"holiday_list", order_by="from_date desc",
			)
			if hl:
				return hl
	hl = frappe.db.get_value("Employee", employee, "holiday_list")
	return hl or (company and frappe.get_cached_value("Company", company, "default_holiday_list"))


@frappe.whitelist(methods=["POST"])
def assign_holiday_list(holiday_list, company=None, from_date=None):
	"""Holiday List → submitted Holiday List Assignment for a company (Frappe HR v16)."""
	if not is_hr():
		frappe.throw(_("Only HR can assign holiday lists"), frappe.PermissionError)
	company = company or frappe.defaults.get_user_default("Company")
	hl = frappe.get_doc("Holiday List", holiday_list)
	if not frappe.db.exists("DocType", "Holiday List Assignment"):
		frappe.db.set_value("Company", company, "default_holiday_list", hl.name)
		return {"company_default": hl.name}
	from_date = from_date or hl.from_date
	existing = frappe.db.exists("Holiday List Assignment", {
		"docstatus": 1, "applicable_for": "Company", "assigned_to": company, "holiday_list": hl.name, "from_date": from_date,
	})
	if existing:
		return {"assignment": existing, "existing": True}
	a = frappe.new_doc("Holiday List Assignment")
	a.update({"applicable_for": "Company", "assigned_to": company, "holiday_list": hl.name, "from_date": from_date})
	a.insert()
	a.submit()
	return {"assignment": a.name}


def _holidays(employee, limit=5):
	holiday_list = holiday_list_for(employee)
	if not holiday_list:
		return {"holiday_list": None, "upcoming": []}
	rows = frappe.get_all(
		"Holiday",
		filters={"parent": holiday_list, "parenttype": "Holiday List", "holiday_date": [">=", nowdate()], "weekly_off": 0},
		fields=["holiday_date", "description"],
		order_by="holiday_date asc",
		limit_page_length=limit,
	)
	for r in rows:
		r.description = frappe.utils.strip_html(r.description or "")
	return {"holiday_list": holiday_list, "upcoming": rows}


@frappe.whitelist()
def my_hr():
	employee = employee_of()
	if not employee:
		return {"employee": None}

	emp = frappe.get_doc("Employee", employee)
	profile = {
		"name": emp.name,
		"employee_name": emp.employee_name,
		"image": emp.image,
		"designation": emp.designation,
		"department": emp.department,
		"branch": emp.branch,
		"company": emp.company,
		"date_of_joining": str(emp.date_of_joining) if emp.date_of_joining else None,
		"reports_to": emp.reports_to,
		"reports_to_name": emp.reports_to and frappe.db.get_value("Employee", emp.reports_to, "employee_name"),
		"leave_approver": emp.get("leave_approver"),
		"email": emp.company_email or emp.personal_email or emp.get("prefered_email"),
		"mobile": emp.cell_number,
	}

	payslips = _safe(lambda: frappe.get_all(
		"Salary Slip",
		filters={"employee": employee, "docstatus": 1},
		fields=["name", "start_date", "end_date", "posting_date", "net_pay", "gross_pay", "currency"],
		order_by="start_date desc",
		limit_page_length=3,
	), [])

	documents = _safe(lambda: frappe.get_all(
		"Karya Erp Employee Document",
		filters={"employee": employee},
		fields=["name", "document_type", "document_number", "expiry_date", "status"],
		order_by="expiry_date asc",
	), [])

	today = nowdate()
	open_leaves = _safe(lambda: frappe.db.count("Leave Application", {"employee": employee, "status": "Open", "docstatus": 0}), 0)
	on_leave_today = _safe(lambda: frappe.db.exists("Leave Application", {
		"employee": employee, "status": "Approved", "docstatus": 1,
		"from_date": ["<=", today], "to_date": [">=", today],
	}), None)
	checkins = _safe(lambda: frappe.get_all(
		"Employee Checkin",
		filters={"employee": employee, "time": ["between", [f"{today} 00:00:00", f"{today} 23:59:59"]]},
		fields=["name", "time", "log_type"],
		order_by="time asc",
	), [])
	years = None
	if emp.date_of_joining:
		years = round((getdate(today) - getdate(emp.date_of_joining)).days / 365.25, 1)

	from karya_erp.shifts import current_shift

	return {
		"employee": employee,
		"profile": profile,
		"shift": _safe(lambda: current_shift(employee)),
		"payslip_format": "Payslip" if frappe.db.exists("Print Format", "Payslip") else "Standard",
		"years_of_service": years,
		"leave_balances": _safe(lambda: _leave_balances(employee), []),
		"holidays": _safe(lambda: _holidays(employee), {"holiday_list": None, "upcoming": []}),
		"payslips": payslips,
		"documents": documents,
		"open_leave_applications": open_leaves,
		"on_leave_today": bool(on_leave_today),
		"checkins_today": checkins,
	}


@frappe.whitelist(methods=["POST"])
def create_login(employee, email=None):
	"""Create a User for the employee (email + password; Frappe sends the welcome / set-password email)."""
	if not is_hr():
		frappe.throw(_("Only HR can create employee logins"), frappe.PermissionError)
	emp = frappe.get_doc("Employee", employee)
	emp.check_permission("write")
	if emp.user_id:
		frappe.throw(_("{0} already has a login: {1}").format(emp.employee_name, emp.user_id))

	email = (email or emp.company_email or emp.personal_email or emp.get("prefered_email") or "").strip()
	if not email:
		frappe.throw(_("Add a company or personal email on the employee first"))
	frappe.utils.validate_email_address(email, throw=True)

	if frappe.db.exists("User", email):
		user = frappe.get_doc("User", email)
		if frappe.db.exists("Employee", {"user_id": user.name}):
			frappe.throw(_("User {0} is already linked to another employee").format(email))
	else:
		parts = (emp.employee_name or "").split(" ", 1)
		user = frappe.new_doc("User")
		user.update({
			"email": email,
			"first_name": emp.first_name or parts[0],
			"last_name": emp.last_name or (parts[1] if len(parts) > 1 else ""),
			"gender": emp.gender,
			"birth_date": emp.date_of_birth,
			"mobile_no": emp.cell_number,
			"user_type": "System User",
			"send_welcome_email": 1,
			"enabled": 1,
		})
		user.insert(ignore_permissions=True)

	user.add_roles(*[r for r in SELF_SERVICE_ROLES if frappe.db.exists("Role", r)])

	emp.user_id = user.name
	if emp.meta.has_field("create_user_permission"):
		emp.create_user_permission = 1
	emp.save()
	if not is_hr(frappe.get_roles(user.name)):
		_restrict(emp.name, user.name)
	return {"user": user.name, "email_sent": bool(user.get("send_welcome_email"))}


# ---------------------------------------------------------------- employee access
# Frappe HR limits an employee to their own records through a User Permission on Employee
# (created when "Create User Permission" is ticked). Without it the Employee role can read every
# employee, payslip and leave application. These helpers find and close that gap.

def _restricted_users():
	# Frappe HR's own permission (created when an employee is linked) leaves hide_descendants off, which lets a
	# manager see their reports' payslips — only a permission with hide_descendants counts as restricted.
	return set(frappe.get_all("User Permission", filters={"allow": "Employee", "hide_descendants": 1}, pluck="user"))


def access_gaps(company=None):
	"""Active employees whose (non-HR) login can see other employees' records."""
	cf = {"company": company} if company else {}
	rows = frappe.get_all(
		"Employee", filters={"status": "Active", "user_id": ["is", "set"], **cf},
		fields=["name", "employee_name", "user_id"],
	)
	restricted = _restricted_users()
	return [
		r for r in rows
		if r.user_id not in restricted and r.user_id != "Administrator" and not is_hr(frappe.get_roles(r.user_id))
	]


def _restrict(employee, user):
	existing = frappe.db.get_value("User Permission", {"user": user, "allow": "Employee", "for_value": employee}, ["name", "hide_descendants"], as_dict=True)
	if existing:
		if not cint(existing.hide_descendants):
			frappe.db.set_value("User Permission", existing.name, "hide_descendants", 1)
			frappe.cache.delete_value("user_permissions")
		return
	frappe.get_doc({
		"doctype": "User Permission", "user": user, "allow": "Employee", "for_value": employee,
		# hide_descendants: managers don't see their reports' payslips / records through the reports_to tree.
		# Team work (approvals, My Team, appraisals) goes through karya_erp's own checks instead.
		"apply_to_all_doctypes": 1, "is_default": 1, "hide_descendants": 1,
	}).insert(ignore_permissions=True)
	frappe.db.set_value("Employee", employee, "create_user_permission", 1, update_modified=False)


@frappe.whitelist(methods=["POST"])
def restrict_to_own_records(company=None):
	"""HR Manager: give every unrestricted employee login a User Permission on their own Employee."""
	# Only ever narrows access, so HR Manager is enough (User Permission itself is System Manager-only).
	if not any(r in frappe.get_roles() for r in ("HR Manager", "System Manager")):
		frappe.throw(_("Only an HR Manager can change employee access"), frappe.PermissionError)
	fixed = []
	for r in access_gaps(company):
		_restrict(r.name, r.user_id)
		fixed.append(r.name)
	return {"fixed": fixed}


# ---------------------------------------------------------------- HR dashboard

@frappe.whitelist()
def dashboard(company=None):
	if not is_hr():
		frappe.throw(_("Only HR can see the HR dashboard"), frappe.PermissionError)
	from frappe.utils import add_days, add_months, get_first_day, get_last_day

	company = company or frappe.defaults.get_user_default("Company")
	today = getdate(nowdate())
	m_start, m_end = get_first_day(today), get_last_day(today)
	cf = {"company": company} if company else {}

	active = frappe.get_all("Employee", filters={"status": "Active", **cf}, fields=["name", "department", "date_of_birth", "date_of_joining", "employee_name", "relieving_date"])
	by_dept = {}
	for e in active:
		key = (e.department or "No department").rsplit(" - ", 1)[0]
		by_dept[key] = by_dept.get(key, 0) + 1

	joiners = frappe.get_all("Employee", filters={"date_of_joining": ["between", [m_start, m_end]], **cf}, fields=["name", "employee_name", "date_of_joining", "designation"])
	leavers = frappe.get_all("Employee", filters={"relieving_date": ["between", [m_start, m_end]], **cf}, fields=["name", "employee_name", "relieving_date", "designation"])
	notice = [e for e in active if e.relieving_date and getdate(e.relieving_date) > today]

	on_leave = _safe(lambda: frappe.get_all(
		"Leave Application",
		filters={"docstatus": 1, "status": "Approved", "from_date": ["<=", today], "to_date": [">=", today], **cf},
		fields=["employee", "employee_name", "leave_type", "to_date"],
	), [])
	att = _safe(lambda: frappe.get_all(
		"Attendance", filters={"attendance_date": today, "docstatus": 1, **cf}, fields=["status"],
	), [])
	att_today = {}
	for a in att:
		att_today[a.status] = att_today.get(a.status, 0) + 1
	checked_in = _safe(lambda: len(set(frappe.get_all(
		"Employee Checkin", filters={"time": ["between", [f"{today} 00:00:00", f"{today} 23:59:59"]]}, pluck="employee",
	))), 0)

	docs = _safe(lambda: frappe.get_all(
		"Karya Erp Employee Document",
		filters={"status": ["in", ["Expiring Soon", "Expired"]], **cf},
		fields=["name", "employee", "employee_name", "document_type", "expiry_date", "status"],
		order_by="expiry_date asc", limit_page_length=20,
	), [])

	pending_leave = _safe(lambda: frappe.db.count("Leave Application", {"status": "Open", "docstatus": 0, **cf}), 0)
	pending_claims = _safe(lambda: frappe.db.count("Expense Claim", {"approval_status": "Draft", "docstatus": 0, **cf}), 0)

	cost = []
	for i in range(5, -1, -1):
		s = get_first_day(add_months(today, -i))
		e = get_last_day(s)
		row = frappe.db.sql(
			"""select coalesce(sum(base_gross_pay), 0), coalesce(sum(base_net_pay), 0), count(*) from `tabSalary Slip`
			where docstatus = 1 and start_date >= %s and end_date <= %s {0}""".format("and company = %s" if company else ""),
			(s, e, company) if company else (s, e),
		)
		cost.append({"key": str(s)[:7], "gross": flt(row[0][0]), "net": flt(row[0][1]), "slips": row[0][2]})

	def upcoming(field):
		out = []
		for e in active:
			d = e.get(field)
			if not d:
				continue
			d = getdate(d)
			for year in (today.year, today.year + 1):
				try:
					nxt = d.replace(year=year)
				except ValueError:  # 29 Feb
					nxt = d.replace(year=year, day=28)
				if today <= nxt <= add_days(today, 14):
					out.append({"employee": e.name, "employee_name": e.employee_name, "date": str(nxt), "years": year - d.year})
					break
		return sorted(out, key=lambda x: x["date"])

	return {
		"company": company,
		"currency": company and frappe.get_cached_value("Company", company, "default_currency"),
		"headcount": len(active),
		"by_department": sorted(by_dept.items(), key=lambda kv: -kv[1]),
		"joiners": joiners, "leavers": leavers, "on_notice": [{"employee": e.name, "employee_name": e.employee_name, "relieving_date": str(e.relieving_date)} for e in notice],
		"on_leave": on_leave, "attendance_today": att_today, "checked_in_today": checked_in,
		"documents": docs,
		"pending": {"leave": pending_leave, "expense_claims": pending_claims},
		"payroll_cost": cost,
		"birthdays": upcoming("date_of_birth"),
		"anniversaries": [a for a in upcoming("date_of_joining") if a["years"] > 0],
		"access_gaps": _safe(lambda: access_gaps(company), []),
	}
