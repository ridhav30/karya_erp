"""Live totals for a document that is still being edited (nothing is saved)."""

import json

import frappe
from frappe import _
from frappe.utils import flt

_ROW_KEYS = ("name", "idx", "doctype", "parent", "parenttype", "parentfield", "docstatus", "creation", "modified", "owner", "modified_by")


@frappe.whitelist(methods=["POST"])
def totals(doctype, doc):
	"""Taxes and totals exactly as ERPNext will calculate them on save (item tax templates, extra charges, discounts)."""
	if not frappe.has_permission(doctype, "create") and not frappe.has_permission(doctype, "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	data = json.loads(doc) if isinstance(doc, str) else dict(doc)
	data.pop("name", None)
	data["doctype"] = doctype
	data["docstatus"] = 0
	data["apply_discount_on"] = data.get("apply_discount_on") or "Grand Total"
	for t in ("items", "taxes"):
		data[t] = [{k: v for k, v in r.items() if k not in _ROW_KEYS or k == "idx"} for r in (data.get(t) or []) if r]
	d = frappe.get_doc(data)
	from erpnext.controllers.taxes_and_totals import calculate_taxes_and_totals

	# per-item tax rates come from each line's Item Tax Template
	from erpnext.stock.get_item_details import get_item_tax_map

	for i in d.items:
		i.item_tax_rate = get_item_tax_map(doc=d, tax_template=i.get("item_tax_template"), as_json=True)
	calculate_taxes_and_totals(d)
	return {
		"net_total": flt(d.net_total), "total": flt(d.total), "discount_amount": flt(d.get("discount_amount")),
		"total_taxes_and_charges": flt(d.total_taxes_and_charges), "grand_total": flt(d.grand_total),
		"round_off": flt(d.get("rounding_adjustment")), "rounded_total": flt(d.get("rounded_total")),
		"taxes": [{"idx": t.idx, "description": t.description, "rate": flt(t.rate), "tax_amount": flt(t.tax_amount)} for t in d.taxes],
	}
