"""Expense claims and employee advances (Frappe HR) for the React app.

Employees claim / request from My HR. Expense claims go to the employee's expense approver
(one level, Frappe HR's own flow); HR / accounts submit advances and pay both.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from karya_erp.hr import employee_of, is_hr

EC = "Expense Claim"


def _require_employee():
	employee = employee_of()
	if not employee:
		frappe.throw(_("Your user is not linked to an active employee"))
	return employee


def _expense_approver(employee):
	approver = frappe.db.get_value("Employee", employee, "expense_approver")
	if approver:
		return approver
	dept = frappe.db.get_value("Employee", employee, "department")
	if dept:
		return frappe.db.get_value(
			"Department Approver", {"parent": dept, "parentfield": "expense_approvers", "parenttype": "Department"}, "approver", order_by="idx asc",
		)
	return None


def _fill_defaults(doc):
	"""Company defaults ERPNext needs to book the claim: payable account and cost center (header + each line)."""
	company = doc.company
	if not doc.get("payable_account"):
		doc.payable_account = frappe.get_cached_value("Company", company, "default_expense_claim_payable_account") or frappe.get_cached_value("Company", company, "default_payable_account")
	cc = doc.get("cost_center") or frappe.get_cached_value("Company", company, "cost_center")
	if doc.meta.has_field("cost_center") and not doc.get("cost_center"):
		doc.cost_center = cc
	for row in doc.get("expenses") or []:
		if row.meta.has_field("cost_center") and not row.get("cost_center"):
			row.cost_center = cc


# ---------------------------------------------------------------- employee

@frappe.whitelist()
def expense_types():
	return frappe.get_all("Expense Claim Type", pluck="name", order_by="name asc")


@frappe.whitelist(methods=["POST"])
def claim(lines, remark=None):
	"""lines: [{expense_date, expense_type, description, amount}] → draft Expense Claim sent to the expense approver."""
	employee = _require_employee()
	lines = json.loads(lines) if isinstance(lines, str) else lines
	lines = [l for l in lines or [] if l.get("expense_type") and flt(l.get("amount")) > 0]
	if not lines:
		frappe.throw(_("Add at least one expense with an amount"))
	company = frappe.db.get_value("Employee", employee, "company")
	doc = frappe.new_doc(EC)
	doc.update({
		"employee": employee, "company": company, "posting_date": nowdate(),
		"expense_approver": _expense_approver(employee), "approval_status": "Draft",
		"payable_account": frappe.get_cached_value("Company", company, "default_expense_claim_payable_account"),
		"remark": remark,
	})
	for l in lines:
		doc.append("expenses", {
			"expense_date": l.get("expense_date") or nowdate(), "expense_type": l["expense_type"],
			"description": l.get("description") or l["expense_type"], "amount": flt(l["amount"]),
			"sanctioned_amount": flt(l["amount"]),
		})
	_fill_defaults(doc)
	doc.insert()
	return {"name": doc.name, "total": doc.total_claimed_amount, "expense_approver": doc.expense_approver}


@frappe.whitelist(methods=["POST"])
def request_advance(purpose, amount, required_by=None):
	employee = _require_employee()
	company = frappe.db.get_value("Employee", employee, "company")
	doc = frappe.new_doc("Employee Advance")
	doc.update({
		"employee": employee, "company": company, "purpose": purpose, "advance_amount": flt(amount),
		"posting_date": nowdate(), "currency": frappe.get_cached_value("Company", company, "default_currency"),
		"exchange_rate": 1, "advance_account": frappe.get_cached_value("Company", company, "default_employee_advance_account"),
	})
	if required_by and doc.meta.has_field("required_by"):
		doc.required_by = required_by
	doc.insert()
	return {"name": doc.name}


@frappe.whitelist()
def mine(limit=20):
	employee = _require_employee()
	claims = frappe.get_all(
		EC, filters={"employee": employee},
		fields=["name", "posting_date", "total_claimed_amount", "total_sanctioned_amount", "approval_status", "status", "docstatus", "expense_approver"],
		order_by="posting_date desc", limit_page_length=cint(limit) or 20,
	)
	advances = frappe.get_all(
		"Employee Advance", filters={"employee": employee},
		fields=["name", "posting_date", "purpose", "advance_amount", "paid_amount", "claimed_amount", "return_amount", "status", "docstatus", "currency"],
		order_by="posting_date desc", limit_page_length=cint(limit) or 20,
	)
	for c in claims:
		c.can_withdraw = c.docstatus == 0 and c.approval_status == "Draft"
	for a in advances:
		a.can_withdraw = a.docstatus == 0
	return {"claims": claims, "advances": advances}


@frappe.whitelist(methods=["POST"])
def withdraw(doctype, name):
	if doctype not in (EC, "Employee Advance"):
		frappe.throw(_("Not allowed"))
	employee = _require_employee()
	doc = frappe.get_doc(doctype, name)
	if doc.employee != employee or doc.docstatus != 0 or (doctype == EC and doc.approval_status != "Draft"):
		frappe.throw(_("Only your own unprocessed requests can be withdrawn"), frappe.PermissionError)
	frappe.delete_doc(doctype, name, ignore_permissions=True)
	return True


# ---------------------------------------------------------------- approver

def pending_for_me(limit=200):
	user = frappe.session.user
	filters = {"approval_status": "Draft", "docstatus": 0}
	if not is_hr():
		filters["expense_approver"] = user
	rows = frappe.get_all(
		EC, filters=filters,
		fields=["name", "employee", "employee_name", "posting_date", "total_claimed_amount", "modified", "expense_approver", "company"],
		order_by="posting_date asc", limit_page_length=cint(limit) or 200,
	)
	own = employee_of(user)
	return [r for r in rows if r.employee != own]


@frappe.whitelist(methods=["POST"])
def decide(name, action, reason=None):
	"""Approve (all lines sanctioned as claimed) or Reject a draft claim; submits it as Frappe HR requires."""
	if action not in ("Approve", "Reject"):
		frappe.throw(_("Unknown action {0}").format(action))
	doc = frappe.get_doc(EC, name)
	if doc.docstatus != 0 or doc.approval_status != "Draft":
		frappe.throw(_("{0} is already {1}").format(name, doc.approval_status))
	user = frappe.session.user
	if doc.employee == employee_of(user) or not (doc.expense_approver == user or is_hr()):
		frappe.throw(_("You are not the expense approver for {0}").format(doc.employee_name), frappe.PermissionError)
	if reason:
		doc.add_comment("Comment", _("{0}: {1}").format(_("Approved") if action == "Approve" else _("Rejected"), reason))
	doc.approval_status = "Approved" if action == "Approve" else "Rejected"
	for row in doc.expenses:
		row.sanctioned_amount = row.amount if action == "Approve" else 0
	_fill_defaults(doc)
	doc.flags.ignore_permissions = not frappe.has_permission(EC, "submit", doc)
	doc.save()
	doc.submit()
	return {"name": doc.name, "status": doc.approval_status}
