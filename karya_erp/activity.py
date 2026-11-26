"""Document activity for the React app: timeline (versions + comments + workflow), comments, attachments.

Everything is read through the referenced document's own permission, like Desk's form sidebar.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, escape_html, get_fullname

SKIP_FIELDS = {"modified", "modified_by", "idx", "lft", "rgt", "_user_tags", "_comments", "_assign", "_liked_by"}
COMMENT_TYPES = ("Comment", "Workflow", "Info", "Attachment", "Attachment Removed", "Shared", "Unshared", "Assigned", "Assignment Completed", "Label", "Cancelled", "Submitted")


def _doc(doctype, name, ptype="read"):
	doc = frappe.get_doc(doctype, name)
	doc.check_permission(ptype)
	return doc


def _label(meta, fieldname):
	df = meta.get_field(fieldname)
	if fieldname == "docstatus":
		return "Status"
	return _(df.label) if df and df.label else fieldname.replace("_", " ").title()


def _plain(value):
	if value in (None, ""):
		return ""
	if isinstance(value, (dict, list)):
		return json.dumps(value)
	return str(value)


def _version_entry(meta, v):
	try:
		data = json.loads(v.data or "{}")
	except ValueError:
		return None
	changes = []
	for row in data.get("changed") or []:
		if len(row) < 3 or row[0] in SKIP_FIELDS:
			continue
		field, old, new = row[0], row[1], row[2]
		if field == "docstatus":
			word = {0: "Draft", 1: "Submitted", 2: "Cancelled"}
			old, new = word.get(cint(old), old), word.get(cint(new), new)
		changes.append({"label": _label(meta, field), "from": _plain(old), "to": _plain(new)})
	rows = []
	for key, verb in (("added", "added"), ("removed", "removed")):
		for item in data.get(key) or []:
			if len(item) >= 1:
				rows.append({"verb": verb, "table": _label(meta, item[0])})
	row_changes = 0
	for item in data.get("row_changed") or []:
		row_changes += len(item[3]) if len(item) > 3 and isinstance(item[3], list) else 1
	if not (changes or rows or row_changes):
		return None
	return {
		"kind": "version",
		"name": v.name,
		"by": v.owner,
		"by_name": get_fullname(v.owner),
		"at": str(v.creation),
		"changes": changes[:12],
		"more": max(len(changes) - 12, 0),
		"rows": rows[:6],
		"row_changes": row_changes,
	}


@frappe.whitelist()
def get(doctype, name):
	doc = _doc(doctype, name)
	meta = frappe.get_meta(doctype)
	can_write = frappe.has_permission(doctype, "write", doc)

	files = frappe.get_all(
		"File",
		filters={"attached_to_doctype": doctype, "attached_to_name": name, "is_folder": 0},
		fields=["name", "file_name", "file_url", "file_size", "is_private", "owner", "creation"],
		order_by="creation desc",
	)

	comments = frappe.get_all(
		"Comment",
		filters={"reference_doctype": doctype, "reference_name": name, "comment_type": ["in", COMMENT_TYPES]},
		fields=["name", "comment_type", "content", "owner", "comment_email", "creation"],
		order_by="creation desc",
		limit_page_length=200,
	)
	user = frappe.session.user
	timeline = [
		{
			"kind": "comment" if c.comment_type == "Comment" else "info",
			"type": c.comment_type,
			"name": c.name,
			"content": c.content or "",
			"by": c.comment_email or c.owner,
			"by_name": get_fullname(c.comment_email or c.owner),
			"at": str(c.creation),
			"mine": c.comment_type == "Comment" and (c.owner == user or c.comment_email == user),
		}
		for c in comments
	]

	if meta.track_changes:
		versions = frappe.get_all(
			"Version",
			filters={"ref_doctype": doctype, "docname": name},
			fields=["name", "owner", "creation", "data"],
			order_by="creation desc",
			limit_page_length=100,
		)
		for v in versions:
			entry = _version_entry(meta, v)
			if entry:
				timeline.append(entry)

	timeline.append({
		"kind": "created", "name": "created", "by": doc.owner, "by_name": get_fullname(doc.owner), "at": str(doc.creation),
	})
	timeline.sort(key=lambda e: e["at"], reverse=True)

	return {
		"attachments": files,
		"timeline": timeline,
		"can_attach": bool(can_write) or doc.docstatus == 1,
		"can_remove": bool(can_write),
		"max_attachments": meta.max_attachments or 0,
	}


@frappe.whitelist(methods=["POST"])
def comment(doctype, name, content):
	doc = _doc(doctype, name)
	text = (content or "").strip()
	if not text:
		frappe.throw(_("Comment is empty"))
	html = "<p>" + escape_html(text).replace("\n", "<br>") + "</p>"
	c = doc.add_comment("Comment", html, comment_email=frappe.session.user, comment_by=get_fullname())
	return c.name


@frappe.whitelist(methods=["POST"])
def delete_comment(name):
	c = frappe.get_doc("Comment", name)
	if c.comment_type != "Comment" or (c.owner != frappe.session.user and c.comment_email != frappe.session.user):
		frappe.throw(_("You can only delete your own comments"), frappe.PermissionError)
	_doc(c.reference_doctype, c.reference_name)
	frappe.delete_doc("Comment", name, ignore_permissions=True)
	return True


@frappe.whitelist(methods=["POST"])
def remove_attachment(doctype, name, file):
	_doc(doctype, name, "write")
	f = frappe.get_doc("File", file)
	if f.attached_to_doctype != doctype or f.attached_to_name != name:
		frappe.throw(_("This file is not attached to {0}").format(name), frappe.PermissionError)
	frappe.delete_doc("File", file, ignore_permissions=True)
	return True
