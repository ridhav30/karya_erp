"""Users & access for the Karya Erp UI (System Managers only).

Access is given as job-level "profiles" (Sales, Purchasing, Stock, Accounts, HR …). Each profile is a
set of standard Frappe / ERPNext / Frappe HR roles; a user's roles are the union of the profiles they
have, plus any other role they already had that no profile covers (so nothing set in Desk is lost).
A profile shows as "on" when the user holds all of its roles. Users are standard Frappe Users — new
ones get the welcome / set-password email, or a password typed by the admin.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint

PROFILES = [
	{"key": "employee", "label": "Employee self-service", "hint": "My HR: attendance, leave, payslips, expenses", "roles": ["Employee"]},
	{"key": "sales", "label": "Sales", "hint": "Leads, quotations, orders, deliveries, invoices", "roles": ["Sales User"]},
	{"key": "sales_manager", "label": "Sales manager", "hint": "Sales + customers, price lists, pricing rules", "roles": ["Sales User", "Sales Manager", "Sales Master Manager"]},
	{"key": "purchase", "label": "Purchasing", "hint": "Material requests, RFQs, purchase orders, receipts", "roles": ["Purchase User"]},
	{"key": "purchase_manager", "label": "Purchase manager", "hint": "Purchasing + suppliers", "roles": ["Purchase User", "Purchase Manager", "Purchase Master Manager"]},
	{"key": "stock", "label": "Stock / warehouse", "hint": "Items, stock entries, deliveries, receipts", "roles": ["Stock User"]},
	{"key": "stock_manager", "label": "Stock manager", "hint": "Stock + reconciliation, item masters", "roles": ["Stock User", "Stock Manager", "Item Manager"]},
	{"key": "accounts", "label": "Accounts", "hint": "Invoices, payments, cheques, journal entries", "roles": ["Accounts User"]},
	{"key": "accounts_manager", "label": "Accounts manager", "hint": "Accounts + chart of accounts, VAT, period closing, provisions", "roles": ["Accounts User", "Accounts Manager"]},
	{"key": "hr", "label": "HR", "hint": "Employees, attendance, leave, payroll runs, overtime", "roles": ["HR User", "Employee"]},
	{"key": "hr_manager", "label": "HR manager", "hint": "HR + setup, appraisals, final settlement", "roles": ["HR User", "HR Manager", "Employee"]},
	{"key": "approver", "label": "Approver", "hint": "Approves team leave and expense claims", "roles": ["Leave Approver", "Expense Approver", "Employee"]},
	{"key": "auditor", "label": "Auditor (read only)", "hint": "Read access to accounts and reports", "roles": ["Auditor"]},
	{"key": "admin", "label": "Administrator", "hint": "Everything, including Settings and users", "roles": ["System Manager"]},
]
BASE_ROLES = {"All", "Guest", "Desk User", "Administrator"}


def _require():
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only a System Manager can manage users"), frappe.PermissionError)


def _available(roles):
	return [r for r in roles if frappe.db.exists("Role", r)]


def _profiles_of(roles):
	have = set(roles)
	return [p["key"] for p in PROFILES if _available(p["roles"]) and set(_available(p["roles"])) <= have]


@frappe.whitelist()
def list_users(q="", start=0, page_length=50):
	"""System users, one page at a time. `q` searches name, email and employee name; `total` and `active` cover every match."""
	_require()
	start, page_length = max(cint(start), 0), min(max(cint(page_length) or 50, 1), 200)
	filters = {"user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]}
	q = (q or "").strip()
	or_filters = None
	if q:
		like = f"%{q}%"
		by_emp = frappe.get_all("Employee", filters={"employee_name": ["like", like], "user_id": ["is", "set"]}, pluck="user_id", limit_page_length=50)
		or_filters = [["User", "full_name", "like", like], ["User", "name", "like", like]] + ([["User", "name", "in", by_emp]] if by_emp else [])
	total = len(frappe.get_all("User", filters=filters, or_filters=or_filters, pluck="name", limit_page_length=0))
	active = len(frappe.get_all("User", filters={**filters, "enabled": 1}, or_filters=or_filters, pluck="name", limit_page_length=0))
	users = frappe.get_all(
		"User", filters=filters, or_filters=or_filters,
		fields=["name", "full_name", "enabled", "last_login", "last_active", "mobile_no", "creation"], order_by="enabled desc, full_name asc",
		limit_start=start, limit_page_length=page_length,
	)
	names = [u.name for u in users]
	roles = {}
	for r in frappe.get_all("Has Role", filters={"parenttype": "User", "parent": ["in", names or [""]]}, fields=["parent", "role"]):
		roles.setdefault(r.parent, []).append(r.role)
	emp = {e.user_id: e for e in frappe.get_all("Employee", filters={"user_id": ["in", names or [""]]}, fields=["name", "employee_name", "user_id", "status"])}
	covered = {r for p in PROFILES for r in p["roles"]}
	out = []
	for u in users:
		rs = [r for r in roles.get(u.name, []) if r not in BASE_ROLES]
		out.append({
			**u, "last_login": u.last_login and str(u.last_login), "last_active": u.last_active and str(u.last_active),
			"profiles": _profiles_of(rs), "other_roles": sorted(r for r in rs if r not in covered),
			"employee": emp.get(u.name) and emp[u.name].name, "employee_name": emp.get(u.name) and emp[u.name].employee_name,
			"is_me": u.name == frappe.session.user,
		})
	return {
		"users": out, "total": total, "active": active, "start": start, "page_length": page_length, "profiles": [{**p, "roles": _available(p["roles"])} for p in PROFILES],
		"can_email": bool(frappe.db.exists("Email Account", {"enable_outgoing": 1})),
	}


def _roles_for(profile_keys, current_roles):
	chosen = {r for p in PROFILES if p["key"] in profile_keys for r in _available(p["roles"])}
	profile_roles = {r for p in PROFILES for r in p["roles"]}
	keep = {r for r in current_roles if r not in profile_roles and r not in BASE_ROLES}  # roles set elsewhere (Desk)
	return chosen | keep


@frappe.whitelist(methods=["POST"])
def save(email, full_name=None, profiles=None, enabled=1, send_welcome=1, password=None, mobile_no=None, employee=None):
	"""Create or update a user and set their access profiles."""
	_require()
	email = (email or "").strip().lower()
	if not frappe.utils.validate_email_address(email):
		frappe.throw(_("Enter a valid email address"))
	profiles = json.loads(profiles) if isinstance(profiles, str) else (profiles or [])
	unknown = set(profiles) - {p["key"] for p in PROFILES}
	if unknown:
		frappe.throw(_("Unknown access profile: {0}").format(", ".join(unknown)))
	is_me = email == frappe.session.user
	if is_me and "admin" not in profiles:
		frappe.throw(_("You can't remove your own Administrator access"))
	if is_me and not cint(enabled):
		frappe.throw(_("You can't disable your own login"))

	exists = frappe.db.exists("User", email)
	user = frappe.get_doc("User", email) if exists else frappe.new_doc("User")
	if not exists:
		if not full_name:
			frappe.throw(_("Enter the person's name"))
		first, _sep, last = full_name.strip().partition(" ")
		user.update({"email": email, "first_name": first, "last_name": last, "user_type": "System User", "send_welcome_email": 0})
		if not password and not cint(send_welcome):
			frappe.throw(_("Set a password or send the welcome email"))
		if cint(send_welcome) and not frappe.db.exists("Email Account", {"enable_outgoing": 1}):
			frappe.throw(_("No outgoing email account — set a password instead, or set up Settings → Email first"))
	elif full_name and full_name.strip() != (user.full_name or ""):
		first, _sep, last = full_name.strip().partition(" ")
		user.first_name, user.last_name = first, last
	if mobile_no is not None:
		user.mobile_no = mobile_no or None
	user.enabled = cint(enabled)
	current = [r.role for r in user.get("roles") or []]
	target = _roles_for(profiles, current)
	user.set("roles", [{"role": r} for r in sorted(target)])
	if password:
		user.new_password = password  # Frappe enforces its password policy on save
	if exists:
		user.save()
	else:
		user.insert()
		if cint(send_welcome) and not password:
			user.send_welcome_mail_to_user()

	if employee:
		emp = frappe.get_doc("Employee", employee)
		if emp.user_id and emp.user_id != email:
			frappe.throw(_("{0} is already linked to {1}").format(emp.employee_name, emp.user_id))
		if emp.user_id != email:
			emp.user_id = email
			emp.save()
		from karya_erp.hr import _restrict, is_hr

		if not is_hr(frappe.get_roles(email)):
			_restrict(emp.name, email)  # employees see only their own records
	return {"name": user.name, "profiles": _profiles_of(list(target))}


@frappe.whitelist(methods=["POST"])
def reset_password(email):
	_require()
	if not frappe.db.exists("Email Account", {"enable_outgoing": 1}):
		frappe.throw(_("No outgoing email account — set up Settings → Email first, or set a new password instead"))
	user = frappe.get_doc("User", email)
	user.reset_password(send_email=True)
	return True


@frappe.whitelist(methods=["POST"])
def set_enabled(email, enabled):
	_require()
	if email == frappe.session.user and not cint(enabled):
		frappe.throw(_("You can't disable your own login"))
	user = frappe.get_doc("User", email)
	user.enabled = cint(enabled)
	user.save()
	return True
