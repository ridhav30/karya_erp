# Copyright (c) 2026, ridha and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, nowdate

# A document counts as "Expiring Soon" this many days before its expiry date.
EXPIRY_WARNING_DAYS = 30


def status_for(expiry_date, today=None):
	if not expiry_date:
		return "No Expiry"
	today = getdate(today or nowdate())
	expiry = getdate(expiry_date)
	if expiry < today:
		return "Expired"
	if expiry <= add_days(today, EXPIRY_WARNING_DAYS):
		return "Expiring Soon"
	return "Valid"


class KaryaErpEmployeeDocument(Document):
	def validate(self):
		if self.issue_date and self.expiry_date and getdate(self.expiry_date) < getdate(self.issue_date):
			frappe.throw(_("Expiry date cannot be before the issue date"))
		self.status = status_for(self.expiry_date)


def update_statuses():
	"""Daily: move documents to Expiring Soon / Expired as dates pass."""
	for d in frappe.get_all("Karya Erp Employee Document", filters={"expiry_date": ["is", "set"]}, fields=["name", "expiry_date", "status"]):
		status = status_for(d.expiry_date)
		if status != d.status:
			frappe.db.set_value("Karya Erp Employee Document", d.name, "status", status, update_modified=False)


ALERT_DAYS = (30, 7, 0)  # e-mail when a document is this many days from expiry (0 = expires today)


def send_expiry_alerts():
	"""Daily: one digest to HR Managers, and a note to each employee whose own document is due."""
	today = getdate(nowdate())
	dates = [add_days(today, d) for d in ALERT_DAYS]
	docs = frappe.get_all(
		"Karya Erp Employee Document",
		filters={"expiry_date": ["in", dates]},
		fields=["name", "employee", "employee_name", "document_type", "document_number", "expiry_date"],
		order_by="expiry_date asc",
	)
	if not docs:
		return

	def when(d):
		n = (getdate(d.expiry_date) - today).days
		return _("today") if n == 0 else _("in {0} days").format(n)

	rows = "".join(
		f"<tr><td>{frappe.utils.escape_html(d.employee_name or d.employee)}</td><td>{d.document_type}</td>"
		f"<td>{frappe.utils.escape_html(d.document_number or '')}</td><td>{frappe.utils.formatdate(d.expiry_date)}</td><td>{when(d)}</td></tr>"
		for d in docs
	)
	hr_users = [
		u for u in frappe.get_all("Has Role", filters={"role": "HR Manager", "parenttype": "User"}, pluck="parent")
		if u not in ("Administrator", "Guest") and frappe.db.get_value("User", u, "enabled")
	]
	if hr_users:
		frappe.sendmail(
			recipients=sorted(set(hr_users)),
			subject=_("{0} employee document(s) expiring").format(len(docs)),
			message=_("<p>These employee documents expire soon:</p>")
			+ f"<table border='1' cellpadding='6' style='border-collapse:collapse'><tr><th>Employee</th><th>Document</th><th>Number</th><th>Expiry</th><th>When</th></tr>{rows}</table>",
		)
	for d in docs:
		user = frappe.db.get_value("Employee", d.employee, "user_id")
		if user:
			frappe.sendmail(
				recipients=[user],
				subject=_("Your {0} expires {1}").format(d.document_type, when(d)),
				message=_("<p>Your {0} ({1}) expires on {2}. Please arrange the renewal with HR.</p>").format(
					d.document_type, frappe.utils.escape_html(d.document_number or "—"), frappe.utils.formatdate(d.expiry_date)
				),
			)


# ---------------------------------------------------------------- permissions
# The Employee role may read Employee Documents, but only those of the employee linked to the user.
# HR roles see everything. (Wired in hooks.py: permission_query_conditions / has_permission.)

def _is_hr(user):
	from karya_erp.hr import HR_ROLES

	return any(r in frappe.get_roles(user) for r in HR_ROLES)


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if user == "Administrator" or _is_hr(user):
		return ""
	from karya_erp.hr import employee_of

	employee = employee_of(user)
	if not employee:
		return "1=0"
	return f"`tabEmployee Document`.employee = {frappe.db.escape(employee)}"


def has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	if user == "Administrator" or _is_hr(user):
		return True
	from karya_erp.hr import employee_of

	return bool(doc.employee) and doc.employee == employee_of(user)
