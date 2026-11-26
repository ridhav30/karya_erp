# Copyright (c) 2026, ridha and contributors
# For license information, please see license.txt

"""A month of pay before go-live, kept as totals. It is a record for reports, not a payslip:
nothing is posted to the accounts and no salary structure is needed."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, get_first_day


class KaryaErpSalaryHistory(Document):
	def validate(self):
		self.month_start = get_first_day(self.month_start)
		if flt(self.gross_pay) < 0 or flt(self.deductions) < 0:
			frappe.throw(_("Gross pay and deductions can't be negative"))
		if flt(self.deductions) > flt(self.gross_pay):
			frappe.throw(_("Deductions are more than gross pay"))
		self.net_pay = flt(self.gross_pay) - flt(self.deductions)
		if frappe.db.exists("Karya Erp Salary History", {"employee": self.employee, "month_start": self.month_start, "name": ["!=", self.name]}):
			frappe.throw(_("{0} already has a salary record for {1}").format(self.employee_name or self.employee, self.month_start))
