"""Shifts for the React app (Frappe HR Shift Type / Shift Assignment).

- roster():       who works which shift on a date (active Shift Assignment, else the employee's default shift)
- bulk_assign():  assign one shift type to many employees (submitted Shift Assignments)
- current_shift(): the shift an employee is on right now / next (for My HR)
"""

import json

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime, nowdate

from karya_erp.attendance import _active_employees, _require_hr


def hhmm(t):
	"""Time / timedelta → 'HH:MM' (Frappe returns Time fields as timedelta, e.g. 9:00:00)."""
	if t is None:
		return None
	if hasattr(t, "total_seconds"):
		secs = int(t.total_seconds())
		return f"{secs // 3600 % 24:02d}:{secs % 3600 // 60:02d}"
	parts = str(t).split(":")
	return f"{int(parts[0]):02d}:{int(parts[1]):02d}" if len(parts) > 1 else str(t)


def _assignments_on(employees, date):
	if not employees:
		return {}
	rows = frappe.get_all(
		"Shift Assignment",
		filters={"employee": ["in", employees], "docstatus": 1, "status": "Active", "start_date": ["<=", date]},
		or_filters=[["end_date", "is", "not set"], ["end_date", ">=", date]],
		fields=["name", "employee", "shift_type", "start_date", "end_date"],
		order_by="start_date desc",
	)
	out = {}
	for r in rows:
		out.setdefault(r.employee, r)  # latest start wins
	return out


@frappe.whitelist()
def roster(date=None, company=None, department=None, branch=None):
	_require_hr()
	date = str(getdate(date or nowdate()))
	emps = _active_employees(date, date, company, department, branch)
	names = [e.name for e in emps]
	assigned = _assignments_on(names, date)
	defaults = dict(frappe.get_all("Employee", filters={"name": ["in", names]}, fields=["name", "default_shift"], as_list=True)) if names else {}
	shifts = {
		s.name: s for s in frappe.get_all("Shift Type", fields=["name", "start_time", "end_time", "color"])
	}

	def shift_info(name):
		s = shifts.get(name)
		return s and {"name": s.name, "start": hhmm(s.start_time), "end": hhmm(s.end_time), "color": s.color}

	rows = []
	for e in emps:
		a = assigned.get(e.name)
		current = a.shift_type if a else defaults.get(e.name)
		rows.append({
			"employee": e.name, "employee_name": e.employee_name, "designation": e.designation,
			"department": e.department, "branch": e.branch,
			"shift": shift_info(current) if current else None,
			"source": "assignment" if a else ("default" if current else None),
			"assignment": a and a.name, "until": a and a.end_date and str(a.end_date),
		})
	return {"date": date, "rows": rows, "shift_types": [shift_info(n) for n in sorted(shifts)]}


@frappe.whitelist(methods=["POST"])
def bulk_assign(shift_type, start_date, employees, end_date=None):
	"""Create + submit a Shift Assignment for each employee; overlaps are reported, not fatal."""
	_require_hr()
	if not frappe.has_permission("Shift Assignment", "submit"):
		frappe.throw(_("You can't submit Shift Assignments"), frappe.PermissionError)
	if end_date and getdate(end_date) < getdate(start_date):
		frappe.throw(_("End date can't be before the start date"))
	employees = json.loads(employees) if isinstance(employees, str) else employees
	done, failed = [], []
	for employee in employees or []:
		try:
			doc = frappe.new_doc("Shift Assignment")
			doc.update({
				"employee": employee, "shift_type": shift_type, "start_date": start_date, "end_date": end_date or None,
				"status": "Active", "company": frappe.db.get_value("Employee", employee, "company"),
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


def current_shift(employee):
	"""{name, start, end, start_datetime, end_datetime} of the employee's current / next shift, or None."""
	try:
		from hrms.hr.doctype.shift_assignment.shift_assignment import get_employee_shift
	except ImportError:
		return None
	info = get_employee_shift(employee, now_datetime(), True, "forward")
	if not info:
		return None
	st = info.get("shift_type") if isinstance(info, dict) else getattr(info, "shift_type", None)
	start = info.get("start_datetime") if isinstance(info, dict) else getattr(info, "start_datetime", None)
	end = info.get("end_datetime") if isinstance(info, dict) else getattr(info, "end_datetime", None)
	return {
		"name": getattr(st, "name", st),
		"start": start and start.strftime("%H:%M"),
		"end": end and end.strftime("%H:%M"),
		"start_datetime": start and str(start),
		"end_datetime": end and str(end),
	}


@frappe.whitelist(methods=["POST"])
def process_now(shift_type):
	"""Mark attendance from check-ins for one shift type now (Frappe HR's own auto-attendance)."""
	_require_hr()
	doc = frappe.get_doc("Shift Type", shift_type)
	doc.check_permission("write")
	if not doc.enable_auto_attendance:
		frappe.throw(_("Turn on auto attendance for this shift first"))
	try:
		doc.process_auto_attendance(is_manually_triggered=True)
	except TypeError:
		doc.process_auto_attendance()
	return True
