"""Operation log: who created, changed, submitted, cancelled or deleted a record, in which company.

A site-wide doc event ("*") writes one Karya Erp Operation Log row per write, in the same transaction as the write
itself: if the save is rolled back the log row goes with it, and a failure to log never blocks the save.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, now

LOG = "Karya Erp Operation Log"
READERS = {"System Manager", "Auditor"}
MAX_CHANGES = 25
MAX_VALUE = 300

# Records that are themselves bookkeeping: logging them would be noise (or loop).
IGNORE = {
	LOG, "Version", "Activity Log", "Access Log", "Error Log", "Error Snapshot", "Comment", "Communication", "File", "DocShare",
	"Scheduled Job Log", "RQ Job", "Deleted Document", "View Log", "Route History", "Notification Log", "Email Queue",
	"Email Queue Recipient", "Prepared Report", "Console Log", "Webhook Request Log", "Integration Request", "Document Follow",
	"Workflow Action", "Workflow Action Permitted Role", "Series", "Session Default Settings", "User Settings", "Desktop Icon",
	"Event Sync Log", "Submission Queue", "Document Share Key", "OAuth Bearer Token", "OAuth Authorization Code", "Token Cache",
	"Bulk Update", "Data Import", "Data Import Log", "Reminder", "Tag Link", "Tag", "Energy Point Log", "Changelog Feed", "Note Seen By",
	"Karya Erp Chat Room", "Karya Erp Chat Message",  # private conversations are not an audit trail
}
SKIP_FIELDS = {"modified", "modified_by", "creation", "owner", "idx", "lft", "rgt", "_user_tags", "_comments", "_assign", "_liked_by", "docstatus", "workflow_state"}
ACTION = {"save": "Update", "submit": "Submit", "cancel": "Cancel", "update_after_submit": "Update"}


def _skip(doc):
	flags = frappe.flags
	return (
		doc.doctype in IGNORE
		or flags.in_install or flags.in_migrate or flags.in_patch or flags.in_uninstall
		or getattr(doc.meta, "istable", 0)
	)


def _company(doc):
	company = doc.get("company") if doc.meta.has_field("company") else None
	return company or frappe.defaults.get_user_default("Company") or None


def _short(v):
	text = "" if v is None else str(v)
	return text if len(text) <= MAX_VALUE else text[:MAX_VALUE] + "…"


def _diff(doc):
	"""[{field, label, old, new}] for the plain fields that changed in this save."""
	before = doc.get_doc_before_save()
	if not before:
		return []
	out = []
	for df in doc.meta.fields:
		f = df.fieldname
		if f in SKIP_FIELDS or df.fieldtype in ("Table", "Table MultiSelect", "Password", "Section Break", "Column Break", "Tab Break", "HTML", "Button"):
			continue
		old, new = before.get(f), doc.get(f)
		if (old or None) != (new or None) and str(old or "") != str(new or ""):
			out.append({"field": f, "label": df.label or f, "old": _short(old), "new": _short(new)})
			if len(out) >= MAX_CHANGES:
				break
	return out


def _write(action, doc, changes=None, summary=None):
	try:
		user = frappe.session.user
		row = frappe.get_doc({
			"doctype": LOG, "user": user, "full_name": frappe.utils.get_fullname(user), "company": _company(doc),
			"action": action, "reference_doctype": doc.doctype, "reference_name": str(doc.name),
			"summary": summary or f"{action} {doc.doctype} {doc.name}",
			"changes": json.dumps(changes) if changes else None,
			"ip_address": getattr(frappe.local, "request_ip", None),
		})
		row.name = frappe.generate_hash(length=14)
		row.creation = row.modified = now()
		row.owner = row.modified_by = user
		row.db_insert()
	except Exception:
		frappe.logger("audit").exception("operation log write failed")


def on_create(doc, method=None):
	if not _skip(doc):
		_write("Create", doc)


def on_change(doc, method=None):
	if _skip(doc) or doc.flags.in_insert:
		return
	action = ACTION.get(getattr(doc, "_action", "save"), "Update")
	changes = _diff(doc)
	if action == "Update" and not changes:
		return  # saved with nothing changed
	_write(action, doc, changes)


def on_delete(doc, method=None):
	if not _skip(doc):
		_write("Delete", doc)


def on_rename(doc, method=None, old=None, new=None, merge=False):
	if not _skip(doc):
		_write("Rename", doc, summary=f"Renamed {doc.doctype} {old} to {new}" + (" (merged)" if merge else ""))


# ---------------------------------------------------------------- reading

def _require():
	if not (READERS & set(frappe.get_roles())):
		frappe.throw(_("Only a System Manager or an Auditor can read the operation log"), frappe.PermissionError)


def _filters(user, company, doctype, action, name, from_date, to_date, q):
	f = []
	for field, val in (("user", user), ("company", company), ("reference_doctype", doctype), ("action", action)):
		if val:
			f.append([field, "=", val])
	if name:
		f.append(["reference_name", "like", f"%{name}%"])
	if q:
		f.append(["summary", "like", f"%{q}%"])
	if from_date:
		f.append(["creation", ">=", f"{from_date} 00:00:00"])
	if to_date:
		f.append(["creation", "<=", f"{to_date} 23:59:59"])
	return f


FIELDS = ["name", "creation", "user", "full_name", "company", "action", "reference_doctype", "reference_name", "summary", "changes", "ip_address"]


@frappe.whitelist()
def entries(user=None, company=None, doctype=None, action=None, name=None, from_date=None, to_date=None, q=None, start=0, page_length=50):
	"""One page of the log, newest first, with the number of matches overall."""
	_require()
	start, page_length = max(cint(start), 0), min(max(cint(page_length) or 50, 1), 200)
	filters = _filters(user, company, doctype, action, name, from_date, to_date, q)
	total = frappe.db.count(LOG, filters)
	rows = frappe.get_all(LOG, filters=filters, fields=FIELDS, order_by="creation desc", limit_start=start, limit_page_length=page_length)
	for r in rows:
		r["creation"] = str(r["creation"])
		r["changes"] = json.loads(r["changes"]) if r["changes"] else []
	return {"rows": rows, "total": total, "start": start, "page_length": page_length}


@frappe.whitelist()
def facets():
	"""Values for the filter lists."""
	_require()
	def distinct(field):
		return [r[0] for r in frappe.db.sql(f"select `{field}` from `tab{LOG}` where `{field}` is not null and `{field}` != '' group by `{field}` order by `{field}` limit 300")]
	return {"users": distinct("user"), "companies": distinct("company"), "doctypes": distinct("reference_doctype"), "actions": ["Create", "Update", "Submit", "Cancel", "Delete", "Rename"]}


@frappe.whitelist()
def export(user=None, company=None, doctype=None, action=None, name=None, from_date=None, to_date=None, q=None):
	"""Up to 5000 matching rows, for a CSV download."""
	_require()
	filters = _filters(user, company, doctype, action, name, from_date, to_date, q)
	rows = frappe.get_all(LOG, filters=filters, fields=FIELDS, order_by="creation desc", limit_page_length=5000)
	for r in rows:
		r["creation"] = str(r["creation"])
	return rows
