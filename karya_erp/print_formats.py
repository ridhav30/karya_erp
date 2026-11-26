"""Bundled print formats + the print picker's options.

Formats live as Jinja templates in karya_erp/templates/print/ and are upserted as
Print Format records (custom, module "Karya Erp") on install/migrate, and lazily the
first time the picker asks for them.
"""

import os

import frappe

MODULE = "Karya Erp"
BUNDLED = [
	{"name": "UAE Tax Invoice", "doc_type": "Sales Invoice", "file": "uae_tax_invoice.html"},
	{"name": "Payslip", "doc_type": "Salary Slip", "file": "uae_payslip.html"},
]


def _template(file):
	path = os.path.join(os.path.dirname(__file__), "templates", "print", file)
	with open(path, encoding="utf-8") as f:
		return f.read()


def sync(force=False):
	"""Create or update the bundled Print Format records (idempotent)."""
	for spec in BUNDLED:
		if not frappe.db.exists("DocType", spec["doc_type"]):
			continue
		html = _template(spec["file"])
		if frappe.db.exists("Print Format", spec["name"]):
			pf = frappe.get_doc("Print Format", spec["name"])
			if pf.html == html and not force:
				continue
			pf.html = html
		else:
			pf = frappe.new_doc("Print Format")
			pf.name = spec["name"]
			pf.update({
				"doc_type": spec["doc_type"],
				"module": MODULE,
				"standard": "No",
				"custom_format": 1,
				"print_format_type": "Jinja",
				"html": html,
				"font_size": 12,
				"margin_top": 12,
				"margin_bottom": 12,
				"margin_left": 12,
				"margin_right": 12,
			})
		pf.flags.ignore_permissions = True
		if pf.is_new():
			pf.insert()
		else:
			pf.save()


@frappe.whitelist()
def options(doctype):
	"""Print formats + letter heads for the picker."""
	if not frappe.has_permission(doctype, "print") and not frappe.has_permission(doctype, "read"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	if any(b["doc_type"] == doctype and not frappe.db.exists("Print Format", b["name"]) for b in BUNDLED):
		try:
			sync()
			frappe.db.commit()
		except Exception:
			frappe.log_error("karya_erp: print format sync failed")

	formats = frappe.get_all(
		"Print Format",
		filters={"doc_type": doctype, "disabled": 0},
		fields=["name"],
		order_by="name asc",
		pluck="name",
	)
	meta = frappe.get_meta(doctype)
	default = meta.default_print_format or ""
	if not default:
		bundled = next((b["name"] for b in BUNDLED if b["doc_type"] == doctype and b["name"] in formats), "")
		default = bundled or "Standard"

	letterheads = frappe.get_all("Letter Head", filters={"disabled": 0}, fields=["name", "is_default"], order_by="name asc")
	return {
		"formats": ["Standard", *[f for f in formats if f != "Standard"]],
		"default": default,
		"letterheads": [l.name for l in letterheads],
		"default_letterhead": next((l.name for l in letterheads if l.is_default), ""),
	}
