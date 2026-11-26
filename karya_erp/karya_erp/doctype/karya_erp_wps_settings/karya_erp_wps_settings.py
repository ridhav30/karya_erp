# Copyright (c) 2026, ridha and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document


class KaryaErpWPSSettings(Document):
	def validate(self):
		if self.employer_id and not re.fullmatch(r"\d{13}", self.employer_id.strip()):
			frappe.msgprint(_("Employer ID is usually 13 digits — please double-check it."), indicator="orange", alert=True)
		for code in [self.employer_bank_routing_code, *[r.routing_code for r in self.bank_routing]]:
			if code and not re.fullmatch(r"\d{9}", code.strip()):
				frappe.throw(_("Routing code {0} must be 9 digits").format(code))
		seen = set()
		for r in self.bank_routing:
			key = (r.bank_name or "").strip().lower()
			if key in seen:
				frappe.throw(_("Bank {0} is listed twice").format(r.bank_name))
			seen.add(key)
