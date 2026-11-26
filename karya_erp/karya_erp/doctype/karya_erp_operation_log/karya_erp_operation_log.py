import frappe
from frappe import _
from frappe.model.document import Document


class KaryaErpOperationLog(Document):
	"""Append-only: rows are written by karya_erp.audit and nobody, Administrator included, edits or deletes them here."""

	def validate(self):
		if not self.flags.in_insert and not self.is_new():
			frappe.throw(_("The operation log can't be changed"))

	def on_trash(self):
		if not (frappe.flags.in_test or frappe.flags.in_migrate or frappe.flags.in_uninstall):
			frappe.throw(_("The operation log can't be deleted"))
