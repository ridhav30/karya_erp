"""Attendance for the React app, on Frappe HR doctypes (Employee Checkin, Attendance, Holiday List, Leave Application).

- checkin():          employee checks in / out from the phone, with GPS location
- my_month():         the logged-in employee's attendance calendar for one month
- daily_sheet():      HR's daily attendance sheet (all active employees for a date)
- mark_daily():       save the sheet (creates / corrects submitted Attendance)
- monthly_register(): employees × days grid with totals
"""

import calendar
import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, nowdate

from karya_erp.hr import employee_of, is_hr

SHEET_STATUSES = ("Present", "Absent", "Half Day", "Work From Home")
CODE = {"Present": "P", "Absent": "A", "Half Day": "HD", "On Leave": "L", "Work From Home": "WFH"}


# ---------------------------------------------------------------- helpers

def _require_hr():
	if not (is_hr() and frappe.has_permission("Attendance", "create")):
		frappe.throw(_("Only HR can manage attendance"), frappe.PermissionError)


def _holiday_list_for(employee, on_date=None):
	from karya_erp.hr import holiday_list_for

	return holiday_list_for(employee, on_date)


def _holidays(holiday_list, start, end, cache):
	"""{date_str: {"weekly_off": 0/1, "description": str}} for one holiday list (cached per call)."""
	if not holiday_list:
		return {}
	key = (holiday_list, str(start), str(end))
	if key not in cache:
		rows = frappe.get_all(
			"Holiday",
			filters={"parent": holiday_list, "parenttype": "Holiday List", "holiday_date": ["between", [start, end]]},
			fields=["holiday_date", "weekly_off", "description"],
		)
		cache[key] = {
			str(r.holiday_date): {"weekly_off": cint(r.weekly_off), "description": frappe.utils.strip_html(r.description or "")}
			for r in rows
		}
	return cache[key]


def _active_employees(start, end, company=None, department=None, branch=None, employee=None):
	filters = {"date_of_joining": ["<=", end]}
	if employee:
		filters["name"] = employee
	if company:
		filters["company"] = company
	if department:
		filters["department"] = department
	if branch:
		filters["branch"] = branch
	rows = frappe.get_list(
		"Employee",
		filters=filters,
		or_filters=[["status", "=", "Active"], ["relieving_date", ">=", start]],
		fields=["name", "employee_name", "designation", "department", "branch", "company", "date_of_joining", "relieving_date", "status"],
		order_by="employee_name asc",
		limit_page_length=0,
	)
	return [r for r in rows if r.status != "Left" or (r.relieving_date and getdate(r.relieving_date) >= getdate(start))]


def _attendance(employees, start, end):
	"""{(employee, date): row} for submitted attendance."""
	if not employees:
		return {}
	rows = frappe.get_all(
		"Attendance",
		filters={"employee": ["in", employees], "attendance_date": ["between", [start, end]], "docstatus": 1},
		fields=["name", "employee", "attendance_date", "status", "leave_type", "late_entry", "early_exit"],
	)
	return {(r.employee, str(r.attendance_date)): r for r in rows}


def _checkins(employees, start, end):
	"""{(employee, date): {"in": "HH:MM", "out": "HH:MM", "count": n}}"""
	if not employees:
		return {}
	rows = frappe.get_all(
		"Employee Checkin",
		filters={"employee": ["in", employees], "time": ["between", [f"{start} 00:00:00", f"{end} 23:59:59"]]},
		fields=["employee", "time", "log_type"],
		order_by="time asc",
	)
	out = {}
	for r in rows:
		key = (r.employee, str(get_datetime(r.time).date()))
		t = get_datetime(r.time).strftime("%H:%M")
		e = out.setdefault(key, {"in": None, "out": None, "count": 0})
		e["count"] += 1
		if r.log_type == "OUT":
			e["out"] = t
		elif not e["in"]:
			e["in"] = t
		if not r.log_type and e["in"] and t != e["in"]:
			e["out"] = t  # no IN/OUT marked: first and last punch
	return out


def _leaves(employees, start, end):
	"""{(employee, date): leave_type} from approved leave applications."""
	if not employees:
		return {}
	rows = frappe.get_all(
		"Leave Application",
		filters={
			"employee": ["in", employees], "docstatus": 1, "status": "Approved",
			"from_date": ["<=", end], "to_date": [">=", start],
		},
		fields=["employee", "from_date", "to_date", "leave_type", "half_day", "half_day_date"],
	)
	out = {}
	for r in rows:
		d = max(getdate(r.from_date), getdate(start))
		while d <= min(getdate(r.to_date), getdate(end)):
			half = cint(r.half_day) and (not r.half_day_date or getdate(r.half_day_date) == d)
			out[(r.employee, str(d))] = f"{r.leave_type}{' (half day)' if half else ''}"
			d = add_days(d, 1)
	return out


def _dates(start, end):
	d, end = getdate(start), getdate(end)
	while d <= end:
		yield d
		d = add_days(d, 1)


# ---------------------------------------------------------------- employee self-service

@frappe.whitelist(methods=["POST"])
def checkin(log_type=None, latitude=None, longitude=None, accuracy=None):
	"""Check in / out for the logged-in employee. log_type IN | OUT (default: the opposite of the last log today)."""
	employee = employee_of()
	if not employee:
		frappe.throw(_("Your user is not linked to an active employee"))
	if latitude in (None, "") or longitude in (None, ""):
		frappe.throw(_("Location is required to check in. Allow location access and try again."))

	today = nowdate()
	if log_type not in ("IN", "OUT"):
		last = frappe.get_all(
			"Employee Checkin",
			filters={"employee": employee, "time": ["between", [f"{today} 00:00:00", f"{today} 23:59:59"]]},
			fields=["log_type"], order_by="time desc", limit_page_length=1,
		)
		log_type = "OUT" if last and last[0].log_type == "IN" else "IN"

	meta = frappe.get_meta("Employee Checkin")
	doc = frappe.new_doc("Employee Checkin")
	doc.employee = employee
	doc.time = now_datetime()
	doc.log_type = log_type
	if meta.has_field("device_id"):
		doc.device_id = "karya_erp (mobile)"
	if meta.has_field("latitude"):
		doc.latitude = flt(latitude, 8)
		doc.longitude = flt(longitude, 8)
	if meta.has_field("geolocation"):
		doc.geolocation = json.dumps({
			"type": "FeatureCollection",
			"features": [{"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": [flt(longitude, 8), flt(latitude, 8)]}}],
		})
	doc.flags.ignore_permissions = True  # the employee is verified above; Employee role may not create checkins
	doc.insert()
	if accuracy:
		doc.add_comment("Info", _("Location accuracy ±{0} m").format(cint(accuracy)))
	return {"name": doc.name, "log_type": log_type, "time": str(doc.time)}


@frappe.whitelist()
def my_month(year=None, month=None, employee=None):
	"""Calendar for one employee and month. Employees see their own; HR may pass employee."""
	own = employee_of()
	if employee and employee != own:
		_require_hr()
	employee = employee or own
	if not employee:
		return {"employee": None, "days": []}

	today = getdate(nowdate())
	year, month = cint(year) or today.year, cint(month) or today.month
	start = getdate(f"{year}-{month:02d}-01")
	end = getdate(f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]}")

	cache = {}
	holidays = _holidays(_holiday_list_for(employee, start), start, end, cache)
	att = _attendance([employee], start, end)
	ins = _checkins([employee], start, end)
	leaves = _leaves([employee], start, end)
	joined = frappe.db.get_value("Employee", employee, "date_of_joining")

	days, totals = [], {"present": 0.0, "absent": 0, "leave": 0.0, "holiday": 0, "weekly_off": 0}
	for d in _dates(start, end):
		key, ds = (employee, str(d)), str(d)
		a, h = att.get(key), holidays.get(ds)
		if a:
			status = a.status
		elif key in leaves:
			status = "On Leave"
		elif h:
			status = "Weekly Off" if h["weekly_off"] else "Holiday"
		elif d > today or (joined and d < getdate(joined)):
			status = None
		elif ins.get(key):
			status = "Checked In"
		else:
			status = "Not Marked"
		if status in ("Present", "Work From Home"):
			totals["present"] += 1
		elif status == "Half Day":
			totals["present"] += 0.5
			totals["leave"] += 0.5
		elif status == "Absent":
			totals["absent"] += 1
		elif status == "On Leave":
			totals["leave"] += 1
		elif status == "Holiday":
			totals["holiday"] += 1
		elif status == "Weekly Off":
			totals["weekly_off"] += 1
		days.append({
			"date": ds, "status": status,
			"holiday": h["description"] if h and not h["weekly_off"] else None,
			"leave_type": (a and a.leave_type) or leaves.get(key),
			"late": bool(a and a.late_entry), "early": bool(a and a.early_exit),
			"in": ins.get(key, {}).get("in"), "out": ins.get(key, {}).get("out"),
		})
	return {"employee": employee, "year": year, "month": month, "days": days, "totals": totals}


# ---------------------------------------------------------------- HR

@frappe.whitelist()
def daily_sheet(date=None, company=None, department=None, branch=None):
	_require_hr()
	date = str(getdate(date or nowdate()))
	emps = _active_employees(date, date, company, department, branch)
	names = [e.name for e in emps]
	att, ins, leaves = _attendance(names, date, date), _checkins(names, date, date), _leaves(names, date, date)
	cache, rows = {}, []
	for e in emps:
		key = (e.name, date)
		h = _holidays(_holiday_list_for(e.name, date), date, date, cache).get(date)
		a = att.get(key)
		rows.append({
			"employee": e.name, "employee_name": e.employee_name, "designation": e.designation,
			"department": e.department, "branch": e.branch,
			"attendance": a and a.name, "status": a and a.status, "leave_type": (a and a.leave_type) or leaves.get(key),
			"on_leave": key in leaves or (a and a.status == "On Leave"),
			"holiday": h and ("Weekly Off" if h["weekly_off"] else (h["description"] or "Holiday")),
			"in": ins.get(key, {}).get("in"), "out": ins.get(key, {}).get("out"),
		})
	summary = {s: sum(1 for r in rows if r["status"] == s) for s in (*SHEET_STATUSES, "On Leave")}
	summary["Not Marked"] = sum(1 for r in rows if not r["status"])
	return {"date": date, "future": getdate(date) > getdate(nowdate()), "rows": rows, "summary": summary}


@frappe.whitelist(methods=["POST"])
def mark_daily(date, entries):
	"""entries: [{employee, status}] — creates submitted Attendance; a different existing status is cancelled and replaced."""
	_require_hr()
	date = getdate(date)
	if date > getdate(nowdate()):
		frappe.throw(_("Attendance can't be marked for a future date"))
	entries = json.loads(entries) if isinstance(entries, str) else entries
	done, skipped, failed = 0, 0, []
	for e in entries or []:
		employee, status = e.get("employee"), e.get("status")
		if not employee or status not in SHEET_STATUSES:
			continue
		try:
			existing = frappe.db.get_value(
				"Attendance", {"employee": employee, "attendance_date": date, "docstatus": 1}, ["name", "status"], as_dict=True,
			)
			if existing and existing.status == status:
				skipped += 1
				continue
			if existing and existing.status == "On Leave":
				raise frappe.ValidationError(_("On approved leave — cancel the leave application instead"))
			if existing:
				frappe.get_doc("Attendance", existing.name).cancel()
			att = frappe.new_doc("Attendance")
			att.update({
				"employee": employee, "attendance_date": date, "status": status,
				"company": frappe.db.get_value("Employee", employee, "company"),
			})
			att.insert()
			att.submit()
			frappe.db.commit()
			done += 1
		except Exception as ex:
			frappe.db.rollback()
			frappe.clear_last_message()
			failed.append({"employee": employee, "error": frappe.utils.strip_html(str(ex))[:200]})
	return {"done": done, "skipped": skipped, "failed": failed}


@frappe.whitelist()
def monthly_register(year=None, month=None, company=None, department=None, branch=None):
	_require_hr()
	today = getdate(nowdate())
	year, month = cint(year) or today.year, cint(month) or today.month
	start = getdate(f"{year}-{month:02d}-01")
	end = getdate(f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]}")

	emps = _active_employees(start, end, company, department, branch)
	names = [e.name for e in emps]
	att, leaves = _attendance(names, start, end), _leaves(names, start, end)
	cache, out = {}, []
	for e in emps:
		holidays = _holidays(_holiday_list_for(e.name, start), start, end, cache)
		codes, t = [], {"present": 0.0, "absent": 0, "leave": 0.0, "holidays": 0, "not_marked": 0}
		for d in _dates(start, end):
			key, ds = (e.name, str(d)), str(d)
			a, h = att.get(key), holidays.get(ds)
			if (e.date_of_joining and d < getdate(e.date_of_joining)) or (e.relieving_date and d > getdate(e.relieving_date)):
				code = ""
			elif a:
				code = CODE.get(a.status, a.status[:2])
			elif key in leaves:
				code = "L"
			elif h:
				code = "WO" if h["weekly_off"] else "H"
			elif d > today:
				code = ""
			else:
				code = "-"
			codes.append(code)
			if code in ("P", "WFH"):
				t["present"] += 1
			elif code == "HD":
				t["present"] += 0.5
				t["leave"] += 0.5
			elif code == "A":
				t["absent"] += 1
			elif code == "L":
				t["leave"] += 1
			elif code in ("H", "WO"):
				t["holidays"] += 1
			elif code == "-":
				t["not_marked"] += 1
		out.append({"employee": e.name, "employee_name": e.employee_name, "department": e.department, "codes": codes, "totals": t})
	return {"year": year, "month": month, "days": [str(d) for d in _dates(start, end)], "rows": out}
