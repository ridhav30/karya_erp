"""Company defaults chosen in the Operator when this app was made: how stock is accounted. Applied once per company."""
import frappe
from frappe.utils import cint

METHOD = "periodic"  # perpetual: stock value posts to the accounts on every movement; periodic: counted at period end
MARK = "karya_erp_stock_method_applied"


def apply():
	company = frappe.defaults.get_global_default("company") or frappe.db.get_single_value("Global Defaults", "default_company")
	if not company or frappe.db.get_default(MARK) == company:
		return
	want = 1 if METHOD == "perpetual" else 0
	if cint(frappe.db.get_value("Company", company, "enable_perpetual_inventory")) != want:
		if frappe.db.exists("Stock Ledger Entry", {"company": company, "is_cancelled": 0}):
			print(f"karya_erp: {company} already has stock entries, so its stock method was left as it is")
			return
		frappe.db.set_value("Company", company, "enable_perpetual_inventory", want)
	frappe.db.set_default(MARK, company)
