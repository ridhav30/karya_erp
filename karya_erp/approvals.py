"""Approvals for the Karya Erp React UI, on top of standard Frappe Workflows.

No custom doctypes: workflows are configured in Desk (Workflow doctype). This module only finds
what is waiting for the current user and applies workflow actions with Frappe's own API, so
conditions, roles and "allow self approval" are enforced exactly as in Desk.
"""

import json

import frappe
from frappe import _
from frappe.model.workflow import apply_workflow, get_transitions
from frappe.utils import cint

PARTY_FIELDS = ("customer_name", "supplier_name", "party_name", "employee_name", "title")
AMOUNT_FIELDS = ("rounded_total", "grand_total", "advance_amount", "total_claimed_amount", "paid_amount", "total_debit", "total_sanctioned_amount")
DATE_FIELDS = ("transaction_date", "posting_date", "from_date", "schedule_date")


def _active_workflows():
	return frappe.get_all(
		"Workflow",
		filters={"is_active": 1},
		fields=["name", "document_type", "workflow_state_field"],
	)


def _first(meta, candidates):
	return next((f for f in candidates if meta.has_field(f)), None)


def _summary(doc, meta):
	party = _first(meta, PARTY_FIELDS)
	amount = _first(meta, AMOUNT_FIELDS)
	date = _first(meta, DATE_FIELDS)
	return {
		"party": doc.get(party) if party else None,
		"amount": doc.get(amount) if amount else None,
		"currency": doc.get("currency") or doc.get("paid_from_account_currency"),
		"date": str(doc.get(date)) if date and doc.get(date) else None,
		"title": doc.get(meta.title_field) if meta.title_field else None,
	}


def _user_can_act_on(workflow_name):
	"""States from which the current user's roles have at least one transition."""
	roles = set(frappe.get_roles())
	rows = frappe.get_all(
		"Workflow Transition",
		filters={"parent": workflow_name, "parenttype": "Workflow"},
		fields=["state", "allowed"],
	)
	return sorted({r.state for r in rows if r.allowed in roles})


@frappe.whitelist()
def pending(limit=200):
	"""Documents waiting for an action by the current user, newest first."""
	limit = cint(limit) or 200
	out = []
	for wf in _active_workflows():
		doctype = wf.document_type
		if not frappe.has_permission(doctype, "read"):
			continue
		states = _user_can_act_on(wf.name)
		if not states:
			continue
		state_field = wf.workflow_state_field or "workflow_state"
		names = frappe.get_list(
			doctype,
			filters={state_field: ["in", states], "docstatus": ["<", 2]},
			pluck="name",
			order_by="modified desc",
			limit_page_length=limit,
		)
		meta = frappe.get_meta(doctype)
		for name in names:
			doc = frappe.get_doc(doctype, name)
			actions = [t.action for t in get_transitions(doc)]
			if not actions:
				continue  # condition not met, or own document without self-approval
			out.append({
				"doctype": doctype,
				"name": name,
				"state": doc.get(state_field),
				"actions": list(dict.fromkeys(actions)),
				"owner": frappe.utils.get_fullname(doc.owner),
				"modified": str(doc.modified),
				**_summary(doc, meta),
			})
	out.extend(_leave_items(limit))
	out.extend(_expense_items(limit))
	out.sort(key=lambda r: r["modified"], reverse=True)
	return out[:limit]


def _has_workflow(doctype):
	return any(w.document_type == doctype for w in _active_workflows())


def _expense_items(limit):
	"""Draft expense claims this user approves (Frappe HR's own approver flow)."""
	if not frappe.db.exists("DocType", "Expense Claim") or _has_workflow("Expense Claim"):
		return []
	from karya_erp.expenses import pending_for_me

	return [
		{
			"doctype": "Expense Claim",
			"name": r.name,
			"state": "Draft",
			"actions": ["Approve", "Reject"],
			"owner": r.employee_name,
			"modified": str(r.modified),
			"party": r.employee_name,
			"amount": r.total_claimed_amount,
			"currency": frappe.get_cached_value("Company", r.company, "default_currency") if r.company else None,
			"date": str(r.posting_date),
			"title": _("Expense claim"),
		}
		for r in pending_for_me(limit)
	]


def _leave_items(limit):
	"""Open leave requests this user decides (Frappe HR's own approver flow, not a Workflow)."""
	try:
		from karya_erp.leave import pending_for_me
	except Exception:
		return []
	if not frappe.db.exists("DocType", "Leave Application"):
		return []
	if any(w.document_type == "Leave Application" for w in _active_workflows()):
		return []  # a Workflow on leave is handled above
	return [
		{
			"doctype": "Leave Application",
			"name": r.name,
			"state": "Open",
			"actions": ["Approve", "Reject"],
			"owner": r.employee_name,
			"modified": str(r.modified),
			"party": r.employee_name,
			"amount": None,
			"currency": None,
			"date": str(r.from_date),
			"title": "{0} · {1} day(s), {2} → {3}".format(r.leave_type, frappe.utils.flt(r.total_leave_days), r.from_date, r.to_date),
		}
		for r in pending_for_me(limit)
	]


@frappe.whitelist()
def pending_count():
	return len(pending())


@frappe.whitelist()
def transitions(doctype, name):
	"""Workflow state + the actions the current user can take on one document (None if no workflow)."""
	wf = next((w for w in _active_workflows() if w.document_type == doctype), None)
	if not wf:
		return None
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	state_field = wf.workflow_state_field or "workflow_state"
	return {
		"workflow": wf.name,
		"state": doc.get(state_field),
		"actions": list(dict.fromkeys(t.action for t in get_transitions(doc))),
	}


def _apply(doctype, name, action, reason=None):
	if doctype == "Leave Application" and action in ("Approve", "Reject") and not any(
		w.document_type == doctype for w in _active_workflows()
	):
		from karya_erp.leave import decide

		res = decide(name, action, reason)
		return {"name": res["name"], "docstatus": 1, "state": res["status"]}
	if doctype == "Expense Claim" and action in ("Approve", "Reject") and not _has_workflow(doctype):
		from karya_erp.expenses import decide as decide_expense

		res = decide_expense(name, action, reason)
		return {"name": res["name"], "docstatus": 1, "state": res["status"]}
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	if action not in [t.action for t in get_transitions(doc)]:
		frappe.throw(_("You can't {0} {1}").format(action, name), frappe.PermissionError)
	if reason:
		doc.add_comment("Comment", _("{0}: {1}").format(action, reason))
	doc = apply_workflow(doc, action)
	return {"name": doc.name, "docstatus": doc.docstatus, "state": doc.get("workflow_state")}


@frappe.whitelist(methods=["POST"])
def apply(doctype, name, action, reason=None):
	"""Apply one workflow action (Approve / Reject / Send for Approval …) with an optional reason."""
	return _apply(doctype, name, action, reason)


@frappe.whitelist(methods=["POST"])
def bulk_apply(items, action, reason=None):
	"""Apply the same action to many documents. items: JSON [{doctype, name}]. Each runs on its own."""
	if isinstance(items, str):
		items = json.loads(items)
	done, failed = [], []
	for item in items:
		try:
			_apply(item["doctype"], item["name"], action, reason)
			frappe.db.commit()
			done.append(item["name"])
		except Exception as e:
			frappe.db.rollback()
			frappe.clear_last_message()
			failed.append({"name": item.get("name"), "error": frappe.utils.strip_html(str(e))[:300]})
	return {"done": done, "failed": failed}
