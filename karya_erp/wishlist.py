"""Wishlist: each person's private starred records, for every list in the app.

  names()    the starred records of one document type (for the stars and the "Wishlist" filter)
  toggle()   star or un-star one record
  counts()   how many records are starred per document type

Entries belong to the person who made them; nobody else sees them. The doctype is closed to everyone
but System Managers, so every read and write goes through these functions, scoped to the session user.
A person can only star a record they may read. Wishlist stars are never written to the operation log.
"""

import frappe
from frappe import _

DT = "Karya Erp Wishlist Entry"


def _me():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to use the wishlist"), frappe.PermissionError)
	return frappe.session.user


def _names(doctype):
	return frappe.get_all(DT, filters={"user": _me(), "ref_doctype": doctype}, pluck="ref_name", limit_page_length=0)


@frappe.whitelist()
def names(doctype):
	return _names(doctype)


@frappe.whitelist()
def toggle(doctype, name):
	me = _me()
	if not frappe.db.exists(doctype, name) or not frappe.has_permission(doctype, "read", doc=name):
		frappe.throw(_("You cannot read {0} {1}").format(doctype, name), frappe.PermissionError)
	found = frappe.db.get_value(DT, {"user": me, "ref_doctype": doctype, "ref_name": name})
	if found:
		frappe.delete_doc(DT, found, ignore_permissions=True, force=True)
		return {"starred": False}
	frappe.get_doc({"doctype": DT, "user": me, "ref_doctype": doctype, "ref_name": name}).insert(ignore_permissions=True)
	return {"starred": True}


@frappe.whitelist()
def counts():
	rows = frappe.get_all(DT, filters={"user": _me()}, fields=["ref_doctype", {"COUNT": "name", "as": "n"}], group_by="ref_doctype", order_by=None)
	return {r.ref_doctype: r.n for r in rows}
