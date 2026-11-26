"""Bulk import for the Karya Erp UI (Excel .xlsx or CSV).

Kinds: employees, items, customers, suppliers, opening stock, opening account balances and opening
customer / supplier invoices, plus history for the months before go-live: sales and purchase invoices (reports
only — nothing is posted to the ledgers or stock), attendance and monthly salary totals. Each kind maps spreadsheet columns onto standard ERPNext / Frappe HR
doctypes — nothing custom is stored. Flow: download template → upload file → preview (every row
validated, nothing saved) → import (valid rows only; each row on its own so one bad row never
blocks the rest; the opening entries are posted as one document each).
"""

import csv
import io
import re

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

MAX_ROWS = 5000
PREVIEW_ROWS = 500
YES = {"1", "yes", "y", "true", "x"}
EMIRATES = ("Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah")


def C(fieldname, label, required=False, kind="data", hint=None, example=None):
	return {"fieldname": fieldname, "label": label, "required": required, "type": kind, "hint": hint, "example": example}


KINDS = {
	"employees": {
		"label": "Employees", "doctype": "Employee", "key": "employee",
		"columns": [
			C("first_name", "First Name", True, example="Ahmed"),
			C("last_name", "Last Name", example="Khan"),
			C("gender", "Gender", True, "link:Gender", example="Male"),
			C("date_of_birth", "Date of Birth", True, "date", "YYYY-MM-DD or DD/MM/YYYY", "1990-05-14"),
			C("date_of_joining", "Date of Joining", True, "date", example="2024-02-01"),
			C("employee_number", "Employee Number", hint="Your own staff number", example="E-001"),
			C("department", "Department", kind="department", example="Sales"),
			C("designation", "Designation", kind="autolink:Designation", hint="Created if missing", example="Sales Executive"),
			C("branch", "Branch", kind="autolink:Branch", hint="Created if missing", example="Dubai"),
			C("employment_type", "Employment Type", kind="link:Employment Type", example="Full-time"),
			C("cell_number", "Mobile", example="+971501234567"),
			C("company_email", "Company Email", kind="email", example="ahmed@rokn.ae"),
			C("personal_email", "Personal Email", kind="email"),
			C("reports_to", "Reports To", kind="employee", hint="Employee ID or full name of the manager"),
			C("passport_number", "Passport Number"),
			C("iban", "IBAN", hint="Used for WPS", example="AE070331234567890123456"),
			C("bank_name", "Bank Name"),
		],
	},
	"items": {
		"label": "Items", "doctype": "Item", "key": "item_code",
		"columns": [
			C("item_code", "Item Code", True, example="LAP-001"),
			C("item_name", "Item Name", example="Laptop 14 inch"),
			C("item_group", "Item Group", kind="link:Item Group", hint="Default: Products", example="Products"),
			C("stock_uom", "Unit", kind="link:UOM", hint="Default: Nos", example="Nos"),
			C("is_stock_item", "Maintain Stock", kind="check", hint="Yes / No (default Yes)", example="Yes"),
			C("description", "Description"),
			C("selling_price", "Selling Price", kind="float", hint="Saved in the Standard Selling price list", example="2500"),
			C("buying_price", "Buying Price", kind="float", hint="Saved in the Standard Buying price list", example="1800"),
			C("valuation_rate", "Valuation Rate", kind="float"),
			C("barcode", "Barcode"),
		],
	},
	"customers": {
		"label": "Customers", "doctype": "Customer", "key": "customer_name",
		"columns": [
			C("customer_name", "Customer Name", True, example="Al Noor Trading LLC"),
			C("customer_name_in_arabic", "Name in Arabic"),
			C("customer_type", "Type", kind="select:Company,Individual", hint="Company / Individual (default Company)", example="Company"),
			C("customer_group", "Customer Group", kind="autolink:Customer Group", hint="Created if missing", example="Commercial"),
			C("territory", "Territory", kind="autolink:Territory", hint="Created if missing", example="United Arab Emirates"),
			C("tax_id", "TRN", kind="trn", hint="15 digits", example="100123456700003"),
			C("email_id", "Email", kind="email"),
			C("mobile_no", "Mobile"),
			C("address_line1", "Address Line 1", example="Office 12, Al Qusais"),
			C("city", "City", example="Dubai"),
			C("state", "Emirate", kind="emirate", example="Dubai"),
		],
	},
	"suppliers": {
		"label": "Suppliers", "doctype": "Supplier", "key": "supplier_name",
		"columns": [
			C("supplier_name", "Supplier Name", True, example="Gulf Supplies FZE"),
			C("supplier_name_in_arabic", "Name in Arabic"),
			C("supplier_type", "Type", kind="select:Company,Individual", hint="Company / Individual (default Company)", example="Company"),
			C("supplier_group", "Supplier Group", kind="autolink:Supplier Group", hint="Created if missing", example="Local"),
			C("tax_id", "TRN", kind="trn", hint="15 digits"),
			C("email_id", "Email", kind="email"),
			C("mobile_no", "Mobile"),
			C("address_line1", "Address Line 1"),
			C("city", "City"),
			C("state", "Emirate", kind="emirate"),
		],
	},
	"restaurant-tables": {
		"label": "Restaurant tables", "doctype": "Restaurant Table", "key": "table_name", "needs": "Restaurant Table",
		"columns": [
			C("table_name", "Table", True, example="T1"),
			C("area", "Area", hint="Hall, Terrace, Family section...", example="Hall"),
			C("seats", "Seats", kind="int", hint="Default 4", example="4"),
		],
	},
	"kitchen-stations": {
		"label": "Kitchen stations", "doctype": "Kitchen Station", "key": "kitchen_name", "needs": "Kitchen Station",
		"columns": [
			C("kitchen_name", "Kitchen", True, example="Grill"),
			C("item_groups", "Item groups", kind="itemgroups", hint="Item groups sent to this kitchen, separated by commas", example="Burgers, Grills"),
		],
	},
	"opening-stock": {
		"label": "Opening stock", "doctype": "Stock Reconciliation", "key": None,
		"columns": [
			C("item_code", "Item Code", True, "link:Item", example="LAP-001"),
			C("warehouse", "Warehouse", kind="warehouse", hint="Default: the company's default warehouse", example="Stores"),
			C("qty", "Quantity", True, "float", example="10"),
			C("valuation_rate", "Unit Cost", True, "float", example="1800"),
		],
	},
	"opening-balances": {
		"label": "Opening account balances", "doctype": "Journal Entry", "key": None,
		"columns": [
			C("account", "Account", kind="account", hint="Account name or number. Leave blank for a customer / supplier row", example="Banks Current Accounts"),
			C("party_type", "Party Type", kind="select:Customer,Supplier", hint="Only for receivable / payable balances"),
			C("party", "Party", kind="party", hint="Exact customer / supplier name. The receivable / payable account is filled in", example="Al Noor Trading LLC"),
			C("debit", "Debit", kind="float", hint="Customers owing you, bank, stock…", example="50000"),
			C("credit", "Credit", kind="float", hint="Suppliers you owe, loans, capital…"),
		],
	},
	"opening-invoices": {
		"label": "Opening invoices (unpaid)", "doctype": None, "key": None,
		"columns": [
			C("party_type", "Type", True, "select:Customer,Supplier", "Customer or Supplier", "Customer"),
			C("party", "Party", True, "party", "Exact customer / supplier name", "Al Noor Trading LLC"),
			C("invoice_number", "Invoice No"),
			C("posting_date", "Invoice Date", True, "date", example="2026-10-15"),
			C("due_date", "Due Date", kind="date", example="2026-11-14"),
			C("outstanding_amount", "Amount Due", True, "float", example="10500"),
		],
	},
	"sales-history": {
		"label": "Sales history", "doctype": "Sales Invoice", "key": None, "installed": "Sales Invoice", "history": True,
		"columns": [
			C("invoice_number", "Invoice No", True, example="INV-1042", hint="Lines with the same number become one invoice"),
			C("posting_date", "Invoice Date", True, "date", example="2026-06-18"),
			C("party", "Customer", True, "link:Customer", example="Al Noor Trading LLC"),
			C("item_code", "Item Code", True, "link:Item", example="LAP-001"),
			C("qty", "Quantity", True, "float", example="2"),
			C("rate", "Rate", True, "float", hint="Price per unit before VAT", example="2500"),
			C("due_date", "Due Date", kind="date", hint="Default: the invoice date"),
			C("amount_paid", "Amount Paid", kind="float", hint="Whole invoice, on its first line. Blank = unpaid", example="0"),
		],
	},
	"purchase-history": {
		"label": "Purchase history", "doctype": "Purchase Invoice", "key": None, "installed": "Purchase Invoice", "history": True,
		"columns": [
			C("invoice_number", "Supplier Invoice No", True, example="GS-7731", hint="Lines with the same number become one invoice"),
			C("posting_date", "Invoice Date", True, "date", example="2026-06-02"),
			C("party", "Supplier", True, "link:Supplier", example="Gulf Supplies FZE"),
			C("item_code", "Item Code", True, "link:Item", example="LAP-001"),
			C("qty", "Quantity", True, "float", example="10"),
			C("rate", "Rate", True, "float", hint="Cost per unit before VAT", example="1800"),
			C("due_date", "Due Date", kind="date", hint="Default: the invoice date"),
			C("amount_paid", "Amount Paid", kind="float", hint="Whole invoice, on its first line. Blank = unpaid", example="0"),
		],
	},
	"attendance-history": {
		"label": "Attendance history", "doctype": "Attendance", "key": None, "installed": "Attendance", "history": True,
		"columns": [
			C("employee", "Employee", True, "employee", "Employee ID or full name", "HR-EMP-00001"),
			C("attendance_date", "Date", True, "date", example="2026-06-18"),
			C("status", "Status", True, "select:Present,Absent,Half Day,Work From Home", example="Present"),
		],
	},
	"salary-history": {
		"label": "Salary history", "doctype": "Karya Erp Salary History", "key": None, "needs": "Karya Erp Salary History", "history": True,
		"columns": [
			C("employee", "Employee", True, "employee", "Employee ID or full name", "HR-EMP-00001"),
			C("month_start", "Month", True, "month", "YYYY-MM, MM/YYYY or any date in the month", "2026-06"),
			C("gross_pay", "Gross Pay", True, "float", example="9000"),
			C("deductions", "Deductions", kind="float", example="500"),
			C("remarks", "Remarks"),
		],
	},
}

# Tabs on the Import page, in the order to load things: masters first, then opening balances, then history.
GROUPS = [
	("Masters", ["customers", "suppliers", "items", "employees", "restaurant-tables", "kitchen-stations"]),
	("Opening balances", ["opening-balances", "opening-invoices", "opening-stock"]),
	("History", ["sales-history", "purchase-history", "attendance-history", "salary-history"]),
]
GROUP_OF = {kind: group for group, kinds_ in GROUPS for kind in kinds_}
ORDER = [kind for _group, kinds_ in GROUPS for kind in kinds_]
assert set(ORDER) == set(KINDS), "every import type must be listed in GROUPS"

HISTORY_INVOICES = {"sales-history": ("Sales Invoice", "customer"), "purchase-history": ("Purchase Invoice", "supplier")}


# ---------------------------------------------------------------- helpers

APP = __name__.split(".")[0]


def _has(doctype):
	"""True when this app owns the doctype. On a site that also has karya_erp, a generated app without
	the restaurant parts must not write into karya_erp's restaurant tables."""
	module = frappe.db.get_value("DocType", doctype, "module")
	return bool(module) and frappe.local.module_app.get(frappe.scrub(module)) == APP


def _available(kind):
	k = KINDS[kind]
	if k.get("installed") and not frappe.db.exists("DocType", k["installed"]):
		return False
	needs = k.get("needs")
	return not needs or _has(needs)


def _kind(kind):
	k = KINDS.get(kind)
	if not k or not _available(kind):
		frappe.throw(_("Unknown import type {0}").format(kind))
	return k


def _company(company=None):
	company = company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if not company:
		frappe.throw(_("Set a default company first"))
	return company


def _check_permission(kind):
	needs = {
		"opening-invoices": ("Sales Invoice", "Purchase Invoice"),
		"opening-balances": ("Journal Entry",),
	}.get(kind) or (KINDS[kind]["doctype"],)
	for dt in needs:
		if not frappe.has_permission(dt, "create"):
			frappe.throw(_("You don't have permission to create {0}").format(_(dt)), frappe.PermissionError)


def _norm(s):
	return re.sub(r"[^a-z0-9]", "", str(s or "").lower().replace("*", ""))


def _read(file_url):
	"""Rows (list of lists, strings / numbers / dates) from an uploaded .xlsx or .csv File."""
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not name:
		frappe.throw(_("Upload the file again"))
	f = frappe.get_doc("File", name)
	if f.owner != frappe.session.user and not frappe.has_permission("File", "read", f):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	content = f.get_content()
	ext = (f.file_name or file_url).rsplit(".", 1)[-1].lower()
	if ext in ("xlsx", "xlsm"):
		from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

		rows = read_xlsx_file_from_attached_file(fcontent=content)
	elif ext == "csv":
		if isinstance(content, bytes):
			content = content.decode("utf-8-sig", errors="replace")
		rows = list(csv.reader(io.StringIO(content)))
	else:
		frappe.throw(_("Upload an Excel (.xlsx) or CSV file"))
	rows = [[("" if c is None else c) for c in r] for r in rows]
	return [r for r in rows if any(str(c).strip() for c in r)]


def _map_header(header, columns):
	by_key = {}
	for col in columns:
		by_key[_norm(col["label"])] = col
		by_key[_norm(col["fieldname"])] = col
	mapped, unknown = [], []
	for i, h in enumerate(header):
		col = by_key.get(_norm(h))
		if col:
			mapped.append((i, col))
		elif str(h).strip():
			unknown.append(str(h).strip())
	return mapped, unknown


def _date(v):
	if hasattr(v, "year"):
		return getdate(v)
	s = str(v).strip()
	m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", s)
	if m:  # DD/MM/YYYY (UAE style)
		return getdate(f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}")
	return getdate(s)


class Ctx:
	"""Per-run lookups, cached."""

	def __init__(self, company):
		self.company = company
		self.abbr = frappe.get_cached_value("Company", company, "abbr")
		self.cache = {}

	def get(self, key, fn):
		if key not in self.cache:
			self.cache[key] = fn()
		return self.cache[key]

	def exists(self, doctype, name):
		return self.get(("exists", doctype, name), lambda: bool(frappe.db.exists(doctype, name)))

	def company_scoped(self, doctype, value):
		"""'Sales' → 'Sales - R' for company-specific masters."""
		for cand in (value, f"{value} - {self.abbr}"):
			if self.get(("cs", doctype, cand), lambda c=cand: frappe.db.get_value(doctype, {"name": c, "company": self.company}, "name")):
				return cand
		return None


def _convert(col, raw, ctx, errors):
	"""Spreadsheet cell → value for the field (or None), appending human errors."""
	label, kind = col["label"], col["type"]
	if isinstance(raw, str):
		raw = raw.strip()
	if raw in ("", None):
		if col["required"]:
			errors.append(_("{0} is required").format(label))
		return None
	try:
		if kind == "date":
			return str(_date(raw))
		if kind == "float":
			return flt(str(raw).replace(",", ""))
		if kind == "check":
			return 1 if str(raw).strip().lower() in YES else 0
		if kind == "int":
			n = flt(str(raw).replace(",", ""))
			if n < 0 or n != int(n):
				errors.append(_("{0} must be a whole number, zero or more").format(label))
				return None
			return int(n)
		if kind == "itemgroups":
			groups = [g.strip() for g in str(raw).replace(";", ",").split(",") if g.strip()]
			for g in groups:
				if not ctx.exists("Item Group", g):
					errors.append(_("Item Group '{0}' does not exist").format(g))
			return groups
		if kind == "email":
			if not frappe.utils.validate_email_address(str(raw)):
				errors.append(_("{0}: '{1}' is not a valid email").format(label, raw))
				return None
			return str(raw)
		if kind == "trn":
			trn = re.sub(r"\D", "", str(raw))
			if len(trn) != 15:
				errors.append(_("TRN must have 15 digits"))
				return None
			return trn
		if kind == "emirate":
			match = next((e for e in EMIRATES if _norm(e) == _norm(raw)), None)
			if not match:
				errors.append(_("Emirate '{0}' not recognised").format(raw))
			return match
		if kind.startswith("select:"):
			opts = kind.split(":", 1)[1].split(",")
			match = next((o for o in opts if o.lower() == str(raw).lower()), None)
			if not match:
				errors.append(_("{0} must be one of {1}").format(label, ", ".join(opts)))
			return match
		if kind.startswith("link:"):
			dt = kind.split(":", 1)[1]
			val = str(raw)
			if not ctx.exists(dt, val):
				errors.append(_("{0} '{1}' does not exist").format(_(dt), val))
				return None
			return val
		if kind.startswith("autolink:"):
			return str(raw)
		if kind == "department":
			d = ctx.company_scoped("Department", str(raw))
			if not d:
				errors.append(_("Department '{0}' not found for {1}").format(raw, ctx.company))
			return d
		if kind == "warehouse":
			w = ctx.company_scoped("Warehouse", str(raw))
			if not w:
				errors.append(_("Warehouse '{0}' not found").format(raw))
			return w
		if kind == "employee":
			val = str(raw)
			emp = ctx.get(("emp", val), lambda: frappe.db.get_value("Employee", val, "name") or frappe.db.get_value("Employee", {"employee_name": val, "company": ctx.company}, "name"))
			if not emp:
				errors.append(_("Employee '{0}' not found (import employees first)").format(val))
			return emp
		if kind == "account":
			val = str(raw)
			base = re.sub(r"\s+-\s+[A-Za-z0-9]+$", "", val)  # 'Cash - R' written for another company abbreviation
			acc = ctx.get(("acc", val), lambda: (
				frappe.db.get_value("Account", {"name": val, "company": ctx.company}, "name")
				or frappe.db.get_value("Account", {"name": f"{val} - {ctx.abbr}", "company": ctx.company}, "name")
				or frappe.db.get_value("Account", {"account_number": val, "company": ctx.company}, "name")
				or frappe.db.get_value("Account", {"account_name": val, "company": ctx.company}, "name")
				or (base != val and (frappe.db.get_value("Account", {"name": f"{base} - {ctx.abbr}", "company": ctx.company}, "name")
					or frappe.db.get_value("Account", {"account_name": base, "company": ctx.company}, "name")))
				or None
			))
			if not acc:
				errors.append(_account_not_found(val, ctx))
			return acc
		if kind == "month":
			txt = str(raw)
			m = re.match(r"^(\d{4})[-/](\d{1,2})$", txt) or re.match(r"^(\d{1,2})[-/](\d{4})$", txt)
			if m:
				a, b = int(m.group(1)), int(m.group(2))
				year, month = (a, b) if a > 31 else (b, a)
				return str(getdate(f"{year}-{month:02d}-01"))
			return str(_date(raw).replace(day=1))
		if kind == "party":
			return str(raw)
		return str(raw) if not isinstance(raw, (int, float)) else (str(int(raw)) if float(raw).is_integer() else str(raw))
	except Exception:
		errors.append(_("{0}: '{1}' is not valid").format(label, raw))
		return None


def _validate_row(kind, v, ctx, errors, seen):
	"""Kind-specific checks after conversion. Returns 'new', 'exists' or 'error'."""
	k = KINDS[kind]
	if kind == "items":
		code = v.get("item_code")
		if code and code in seen:
			errors.append(_("Duplicate item code in the file"))
		seen.add(code)
		if code and ctx.exists("Item", code):
			return "exists"
	elif kind in ("customers", "suppliers"):
		name = v.get(k["key"])
		if name and name.lower() in seen:
			errors.append(_("Duplicate name in the file"))
		seen.add((name or "").lower())
		if name and ctx.exists(k["doctype"], name):
			return "exists"
		if v.get("address_line1") and not v.get("city"):
			errors.append(_("City is required with an address"))
	elif kind == "employees":
		key = (v.get("first_name"), v.get("last_name"), v.get("date_of_birth"))
		if key in seen:
			errors.append(_("Duplicate employee in the file"))
		seen.add(key)
		if v.get("first_name") and v.get("date_of_birth") and frappe.db.exists("Employee", {
			"first_name": v["first_name"], "last_name": v.get("last_name") or ["is", "not set"],
			"date_of_birth": v["date_of_birth"], "company": ctx.company,
		}):
			return "exists"
		if v.get("employee_number") and frappe.db.exists("Employee", {"employee_number": v["employee_number"], "company": ctx.company}):
			return "exists"
		if v.get("date_of_birth") and v.get("date_of_joining") and v["date_of_joining"] <= v["date_of_birth"]:
			errors.append(_("Joining date must be after date of birth"))
	elif kind in ("restaurant-tables", "kitchen-stations"):
		name = v.get(k["key"])
		if name and name.lower() in seen:
			errors.append(_("Duplicate name in the file"))
		seen.add((name or "").lower())
		if name and frappe.db.exists(k["doctype"], name):
			return "exists"
	elif kind == "opening-stock":
		if v.get("qty") is not None and v["qty"] < 0:
			errors.append(_("Quantity can't be negative"))
		if v.get("item_code") and not cint(frappe.db.get_value("Item", v["item_code"], "is_stock_item")):
			errors.append(_("{0} is not a stock item").format(v["item_code"]))
		if not v.get("warehouse"):
			wh = frappe.get_cached_value("Company", ctx.company, "default_warehouse") if frappe.get_meta("Company").has_field("default_warehouse") else None
			if wh:
				v["warehouse"] = wh
			else:
				errors.append(_("Warehouse is required (no default warehouse set)"))
	elif kind == "opening-balances":
		return _validate_opening_balance(v, ctx, errors)
	elif kind == "opening-invoices":
		pt, party = v.get("party_type"), v.get("party")
		if pt and party and not ctx.exists(pt, party):
			errors.append(_("{0} '{1}' does not exist — import it first").format(_(pt), party))
		if v.get("outstanding_amount") is not None and v["outstanding_amount"] <= 0:
			errors.append(_("Amount due must be more than zero"))
		if v.get("due_date") and v.get("posting_date") and v["due_date"] < v["posting_date"]:
			errors.append(_("Due date is before the invoice date"))
		if pt and party and not errors:
			return _opening_invoice_status(v, ctx, errors, seen)
	elif kind in HISTORY_INVOICES:
		return _validate_history_invoice(kind, v, ctx, errors)
	elif kind == "attendance-history":
		return _validate_attendance(v, ctx, errors, seen)
	elif kind == "salary-history":
		return _validate_salary(v, ctx, errors, seen)
	return "error" if errors else "new"


PARTY_ACCOUNT_TYPE = {"Customer": "Receivable", "Supplier": "Payable"}


def _account_not_found(val, ctx):
	"""'Account … not found', with the nearest names in this company's chart so a small naming difference is easy to spot."""
	import difflib

	names = ctx.get(("account-names",), lambda: dict(frappe.get_all("Account", filters={"company": ctx.company, "is_group": 0}, fields=["name", "account_name"], as_list=True)))
	base = re.sub(r"\s+-\s+[A-Za-z0-9]+$", "", val).lower()
	by_label = {(label or "").lower(): name for name, label in names.items()}
	close = [by_label[m] for m in difflib.get_close_matches(base, list(by_label), n=3, cutoff=0.6)]
	msg = _("Account '{0}' is not in {1}'s chart of accounts").format(val, ctx.company)
	return msg + (" — " + _("closest: {0}").format("; ".join(close)) if close else " — " + _("create it in the Chart of Accounts first"))


def _validate_opening_balance(v, ctx, errors):
	"""One line of the opening trial balance: a ledger account, or a customer / supplier (whose receivable /
	payable account is filled in) so every balance, including what is owed to and by you, opens in one entry."""
	account, pt, party = v.get("account"), v.get("party_type"), v.get("party")
	if bool(pt) != bool(party):
		errors.append(_("Give both Party Type and Party, or neither"))
	elif pt:
		if not ctx.exists(pt, party):
			errors.append(_("{0} '{1}' does not exist — import it first").format(_(pt), party))
		elif not account:
			from erpnext.accounts.party import get_party_account

			try:
				account = v["account"] = get_party_account(pt, party, ctx.company)
			except Exception:
				frappe.clear_last_message()
			if not account:
				errors.append(_("No {0} account is set for {1}").format(PARTY_ACCOUNT_TYPE[pt].lower(), party))
	if not account and not pt and not errors:
		errors.append(_("Account is required"))
	if not flt(v.get("debit")) and not flt(v.get("credit")):
		errors.append(_("Enter a debit or a credit"))
	elif flt(v.get("debit")) and flt(v.get("credit")):
		errors.append(_("Enter either debit or credit, not both"))
	if account:
		acc = frappe.get_cached_value("Account", account, ["account_type", "is_group"])
		if acc and cint(acc[1]):
			errors.append(_("{0} is a group account").format(account))
		elif acc and acc[0] in PARTY_ACCOUNT_TYPE.values():
			if not pt:
				errors.append(_("{0} needs a Customer / Supplier: fill Party Type and Party (or use 'Opening invoices' for invoice-wise balances)").format(account))
			elif PARTY_ACCOUNT_TYPE[pt] != acc[0]:
				errors.append(_("A {0} belongs on a {1} account, not {2}").format(_(pt).lower(), PARTY_ACCOUNT_TYPE[pt].lower(), account))
		elif pt:
			errors.append(_("{0} is not a {1} account").format(account, PARTY_ACCOUNT_TYPE[pt].lower()))
		elif acc and acc[0] == "Stock":
			errors.append(_("Use 'Opening stock' for stock balances"))
	if not errors and account and ctx.get(("opened", account, party or ""), lambda: bool(frappe.db.sql(
		"""select 1 from `tabJournal Entry Account` a join `tabJournal Entry` j on j.name = a.parent
		where j.docstatus = 1 and j.is_opening = 'Yes' and j.company = %s and a.account = %s and ifnull(a.party, '') = %s limit 1""",
		(ctx.company, account, party or "")))):
		return "exists"  # already opened (a second run must not double it)
	return "error" if errors else "new"


def _opening_invoice_status(v, ctx, errors, seen):
	"""'exists' when this opening invoice was loaded before: ERPNext names it after the Invoice No, so loading
	the file again would fail on every row. Rows without a number are matched on party, date and amount."""
	pt, party, no = v["party_type"], v["party"], v.get("invoice_number")
	doctype, field = ("Sales Invoice", "customer") if pt == "Customer" else ("Purchase Invoice", "supplier")
	if no:
		if ("opening", pt, no) in seen:
			errors.append(_("Duplicate invoice number {0} in the file").format(no))
			return "error"
		seen.add(("opening", pt, no))
		if frappe.db.exists(doctype, no):
			return "exists"
	elif frappe.db.exists(doctype, {field: party, "is_opening": "Yes", "docstatus": 1, "company": ctx.company, "posting_date": v["posting_date"], "base_grand_total": v["outstanding_amount"]}):
		return "exists"
	return "new"


def _history_date(v, errors):
	d = v.get("posting_date") or v.get("attendance_date") or v.get("month_start")
	if d and getdate(d) > getdate(nowdate()):
		errors.append(_("History can't be dated in the future"))


def _validate_history_invoice(kind, v, ctx, errors):
	doctype, party_field = HISTORY_INVOICES[kind]
	no, party, date = v.get("invoice_number"), v.get("party"), v.get("posting_date")
	_history_date(v, errors)
	if v.get("qty") is not None and v["qty"] <= 0:
		errors.append(_("Quantity must be more than zero"))
	if v.get("rate") is not None and v["rate"] < 0:
		errors.append(_("Rate can't be negative"))
	if v.get("amount_paid") is not None and v["amount_paid"] < 0:
		errors.append(_("Amount paid can't be negative"))
	if v.get("due_date") and date and v["due_date"] < date:
		errors.append(_("Due date is before the invoice date"))
	if date:
		try:
			from erpnext.accounts.utils import get_fiscal_year

			ctx.get(("fy", str(date)), lambda: get_fiscal_year(date, company=ctx.company))
		except Exception:
			frappe.clear_last_message()
			errors.append(_("No fiscal year covers {0}").format(date))
	if no:
		seen = ctx.get(("invoices", kind), dict)
		first = seen.setdefault(no, (party, date))
		if first != (party, date):
			errors.append(_("Invoice {0} has lines with a different party or date").format(no))
		if not errors and ctx.get(("hist-exists", kind, no, party), lambda: _history_exists(kind, no, party, ctx.company)):
			return "exists"
	return "error" if errors else "new"


def _history_exists(kind, no, party, company):
	doctype, party_field = HISTORY_INVOICES[kind]
	if kind == "purchase-history":
		return bool(frappe.db.exists(doctype, {"supplier": party, "bill_no": no, "company": company, "docstatus": ["<", 2]}))
	like = _history_tag(no).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
	return bool(frappe.db.exists(doctype, {"company": company, "docstatus": ["<", 2], "remarks": ["like", like + "%"]}))


def _history_tag(no):
	return f"Historical import [{no}]"


def _validate_attendance(v, ctx, errors, seen):
	emp, date = v.get("employee"), v.get("attendance_date")
	_history_date(v, errors)
	if not emp or not date:
		return "error" if errors else "new"
	if (emp, date) in seen:
		errors.append(_("Duplicate employee and date in the file"))
	seen.add((emp, date))
	joined = ctx.get(("joined", emp), lambda: frappe.db.get_value("Employee", emp, "date_of_joining"))
	if joined and getdate(date) < getdate(joined):
		errors.append(_("{0} had not joined yet on {1}").format(emp, date))
	if not errors and frappe.db.exists("Attendance", {"employee": emp, "attendance_date": date, "docstatus": ["<", 2]}):
		return "exists"
	return "error" if errors else "new"


def _validate_salary(v, ctx, errors, seen):
	emp, month = v.get("employee"), v.get("month_start")
	_history_date(v, errors)
	if v.get("gross_pay") is not None and v["gross_pay"] < 0:
		errors.append(_("Gross pay can't be negative"))
	if v.get("deductions") is not None and v["deductions"] < 0:
		errors.append(_("Deductions can't be negative"))
	if v.get("gross_pay") is not None and flt(v.get("deductions")) > v["gross_pay"]:
		errors.append(_("Deductions are more than gross pay"))
	if not emp or not month:
		return "error" if errors else "new"
	if (emp, month) in seen:
		errors.append(_("Duplicate employee and month in the file"))
	seen.add((emp, month))
	if not errors and frappe.db.exists("Karya Erp Salary History", {"employee": emp, "month_start": month}):
		return "exists"
	return "error" if errors else "new"


def _spread_invoice_errors(rows):
	"""An invoice is saved whole or not at all: one bad line holds back the others of the same invoice."""
	bad = {r["values"].get("invoice_number") for r in rows if r["status"] == "error"}
	for r in rows:
		if r["status"] != "error" and r["values"].get("invoice_number") in bad:
			r["status"] = "error"
			r["errors"].append(_("Another line of invoice {0} has an error").format(r["values"]["invoice_number"]))


def _parse(kind, file_url, company):
	k = _kind(kind)
	rows = _read(file_url)
	if not rows:
		frappe.throw(_("The file is empty"))
	if len(rows) - 1 > MAX_ROWS:
		frappe.throw(_("At most {0} rows per import").format(MAX_ROWS))
	mapped, unknown = _map_header(rows[0], k["columns"])
	present = {c["fieldname"] for _, c in mapped}
	missing = [c["label"] for c in k["columns"] if c["required"] and c["fieldname"] not in present]
	if not mapped:
		frappe.throw(_("No known columns found — use the template's header row"))
	ctx, seen, out = Ctx(company), set(), []
	for n, r in enumerate(rows[1:], start=2):
		errors, values = [], {}
		for i, col in mapped:
			values[col["fieldname"]] = _convert(col, r[i] if i < len(r) else "", ctx, errors)
		for label in missing:
			errors.append(_("{0} is required").format(label))
		status = _validate_row(kind, values, ctx, errors, seen)
		out.append({"row": n, "values": values, "errors": errors, "status": status})
	if kind in HISTORY_INVOICES:
		_spread_invoice_errors(out)
	return {"columns": [c for _, c in mapped], "unknown": unknown, "missing": missing, "rows": out}


# ---------------------------------------------------------------- API

@frappe.whitelist()
def kinds():
	return [
		{"kind": key, "label": KINDS[key]["label"], "group": GROUP_OF[key], "columns": KINDS[key]["columns"], "can": _can(key)}
		for key in ORDER if _available(key)
	]


def _can(kind):
	try:
		_check_permission(kind)
		return True
	except frappe.PermissionError:
		frappe.clear_last_message()
		return False


@frappe.whitelist()
def preview(kind, file_url, company=None):
	_check_permission(kind)
	company = _company(company)
	res = _parse(kind, file_url, company)
	counts = {"new": 0, "exists": 0, "error": 0}
	for r in res["rows"]:
		counts[r["status"]] += 1
	return {**res, "rows": res["rows"][:PREVIEW_ROWS], "total": len(res["rows"]), "counts": counts, "company": company}


@frappe.whitelist(methods=["POST"])
def run(kind, file_url, company=None, posting_date=None):
	_check_permission(kind)
	company = _company(company)
	res = _parse(kind, file_url, company)
	rows = [r for r in res["rows"] if r["status"] == "new"]
	if not rows:
		frappe.throw(_("Nothing to import — every row already exists or has errors"))
	posting_date = str(getdate(posting_date or nowdate()))
	if kind == "opening-stock":
		return {**_opening_stock(rows, company, posting_date), "skipped_rows": _skipped_rows(res["rows"]), "skipped": len(res["rows"]) - len(rows)}
	if kind == "opening-balances":
		return {**_opening_balances(rows, company, posting_date), "skipped_rows": _skipped_rows(res["rows"]), "skipped": len(res["rows"]) - len(rows)}
	if kind == "opening-invoices":
		return {**_opening_invoices(rows, company), "skipped_rows": _skipped_rows(res["rows"]), "skipped": len(res["rows"]) - len(rows)}

	if kind in HISTORY_INVOICES:
		return {**_history_invoices(kind, rows, company), "skipped_rows": _skipped_rows(res["rows"]), "skipped": len(res["rows"]) - len(rows)}

	created, failed = [], []
	for r in rows:
		frappe.db.savepoint("import_row")
		try:
			name = {"employees": _employee, "items": _item, "customers": _party, "suppliers": _party,
				"restaurant-tables": _restaurant_table, "kitchen-stations": _kitchen_station,
					"attendance-history": _attendance, "salary-history": _salary}[kind](kind, r["values"], company)
			created.append({"row": r["row"], "name": name})
		except Exception as e:
			frappe.db.rollback(save_point="import_row")
			frappe.clear_last_message()
			failed.append({"row": r["row"], "error": frappe.utils.strip_html(str(e))[:300]})
	return {"created": created, "failed": failed, "skipped": len(res["rows"]) - len(rows), "doctype": KINDS[kind]["doctype"],
		"skipped_rows": _skipped_rows(res["rows"])}


# ---------------------------------------------------------------- creators

def _ensure(doctype, name, field):
	if name and not frappe.db.exists(doctype, name):
		frappe.get_doc({"doctype": doctype, field: name}).insert()


def _skipped_rows(rows):
	"""Rows that were not imported before saving started (already there, or with errors), for the import report."""
	return [{"row": r["row"], "status": r["status"], "errors": r["errors"]} for r in rows if r["status"] != "new"]


def _restaurant_table(kind, v, company):
	doc = frappe.new_doc("Restaurant Table")
	doc.table_name = v["table_name"]
	doc.area = v.get("area") or ""
	doc.seats = v.get("seats") or 4
	doc.insert()
	return doc.name


def _kitchen_station(kind, v, company):
	doc = frappe.new_doc("Kitchen Station")
	doc.kitchen_name = v["kitchen_name"]
	for g in v.get("item_groups") or []:
		doc.append("item_groups", {"item_group": g})
	doc.insert()
	return doc.name


def _attendance(kind, v, company):
	doc = frappe.new_doc("Attendance")
	doc.update({"employee": v["employee"], "attendance_date": v["attendance_date"], "status": v["status"], "company": company})
	doc.insert()
	doc.submit()
	return doc.name


def _salary(kind, v, company):
	doc = frappe.new_doc("Karya Erp Salary History")
	doc.update({"employee": v["employee"], "month_start": v["month_start"], "gross_pay": v["gross_pay"], "deductions": flt(v.get("deductions")), "remarks": v.get("remarks")})
	doc.insert()
	return doc.name


def _history_invoices(kind, rows, company):
	"""One document per invoice number. Each is saved on its own so one failure never blocks the rest."""
	groups = {}
	for r in rows:
		groups.setdefault(r["values"]["invoice_number"], []).append(r)
	created, failed = [], []
	for no, lines in groups.items():
		label = ", ".join(str(r["row"]) for r in lines[:3]) + ("…" if len(lines) > 3 else "")
		frappe.db.savepoint("import_row")
		try:
			created.append({"row": label, "name": _history_invoice(kind, no, [r["values"] for r in lines], company)})
		except Exception as e:
			frappe.db.rollback(save_point="import_row")
			frappe.clear_last_message()
			failed.append({"row": label, "error": frappe.utils.strip_html(str(e))[:300]})
	return {"created": created, "failed": failed, "doctype": KINDS[kind]["doctype"]}


def _history_invoice(kind, no, lines, company):
	"""A past invoice for the reports. It is saved as submitted but never posted: no general ledger or stock
	entries, so opening balances you load separately are not counted twice."""
	doctype, party_field = HISTORY_INVOICES[kind]
	head = lines[0]
	doc = frappe.new_doc(doctype)
	doc.update({"company": company, "set_posting_time": 1, "posting_date": head["posting_date"], "due_date": head.get("due_date") or head["posting_date"], "update_stock": 0})
	doc.set(party_field, head["party"])
	note = _("no accounting or stock entries were posted")
	if kind == "purchase-history":
		doc.bill_no, doc.bill_date = no, head["posting_date"]
		doc.remarks = f"{_history_tag(no)} - {note}"
	else:
		doc.remarks = f"{_history_tag(no)} - {note}"
	for v in lines:
		doc.append("items", {"item_code": v["item_code"], "qty": v["qty"], "rate": v["rate"]})
	doc.insert()
	paid = min(flt(next((v["amount_paid"] for v in lines if v.get("amount_paid") is not None), 0)), doc.grand_total)
	outstanding = flt(doc.grand_total - paid, doc.precision("grand_total"))
	if outstanding <= 0:
		status = "Paid"
	elif paid > 0:
		status = "Partly Paid"
	else:
		status = "Overdue" if getdate(doc.due_date) < getdate(nowdate()) else "Unpaid"
	frappe.db.set_value(doctype, doc.name, {"docstatus": 1, "status": status, "outstanding_amount": outstanding}, update_modified=False)
	for child in doc.get_all_children():
		frappe.db.set_value(child.doctype, child.name, "docstatus", 1, update_modified=False)
	return doc.name


def _employee(kind, v, company):
	_ensure("Designation", v.get("designation"), "designation_name")
	_ensure("Branch", v.get("branch"), "branch")
	doc = frappe.new_doc("Employee")
	doc.update({k: val for k, val in v.items() if val not in (None, "")})
	doc.company = company
	doc.status = "Active"
	if doc.meta.has_field("salary_currency"):
		doc.salary_currency = frappe.get_cached_value("Company", company, "default_currency")
	if doc.meta.has_field("create_user_permission"):
		doc.create_user_permission = 1
	if v.get("iban") and doc.meta.has_field("salary_mode"):
		doc.salary_mode = "Bank"
	doc.insert()
	return doc.name


def _item(kind, v, company):
	doc = frappe.new_doc("Item")
	doc.item_code = v["item_code"]
	doc.item_name = v.get("item_name") or v["item_code"]
	doc.item_group = v.get("item_group") or ("Products" if frappe.db.exists("Item Group", "Products") else "All Item Groups")
	doc.stock_uom = v.get("stock_uom") or "Nos"
	doc.is_stock_item = 1 if v.get("is_stock_item") is None else v["is_stock_item"]
	doc.description = v.get("description") or doc.item_name
	if v.get("valuation_rate"):
		doc.valuation_rate = v["valuation_rate"]
	if v.get("barcode"):
		doc.append("barcodes", {"barcode": v["barcode"]})
	if doc.meta.has_field("item_defaults"):
		wh = frappe.get_cached_value("Company", company, "default_warehouse") if frappe.get_meta("Company").has_field("default_warehouse") else None
		doc.append("item_defaults", {"company": company, **({"default_warehouse": wh} if wh and doc.is_stock_item else {})})
	doc.insert()
	for field, price_list in (("selling_price", "Standard Selling"), ("buying_price", "Standard Buying")):
		if v.get(field) and frappe.db.exists("Price List", price_list):
			frappe.get_doc({"doctype": "Item Price", "item_code": doc.name, "price_list": price_list, "price_list_rate": v[field]}).insert()
	return doc.name


# Group masters a file may name that the site does not have yet: created under the tree's root.
GROUP_ROOTS = {
	"Territory": ("territory_name", "parent_territory", "All Territories"),
	"Customer Group": ("customer_group_name", "parent_customer_group", "All Customer Groups"),
	"Supplier Group": ("supplier_group_name", "parent_supplier_group", "All Supplier Groups"),
}


def _ensure_group(doctype, name):
	if not name or frappe.db.exists(doctype, name):
		return
	name_field, parent_field, root = GROUP_ROOTS[doctype]
	frappe.get_doc({"doctype": doctype, name_field: name, parent_field: root, "is_group": 0}).insert()


def _default_group(doctype, configured):
	"""The group for a party whose file gives none. ERPNext refuses a group (folder) here, and the root
	'All … Groups' is one, so use the configured default when it is a real group, else any ordinary one,
	else make a 'General' one."""
	if configured and not cint(frappe.db.get_value(doctype, configured, "is_group")):
		return configured
	found = frappe.db.get_value(doctype, {"is_group": 0}, "name", order_by="creation asc")
	if found:
		return found
	_ensure_group(doctype, "General")
	return "General"


def _party(kind, v, company):
	k = KINDS[kind]
	dt = k["doctype"]
	if dt == "Customer":
		_ensure_group("Territory", v.get("territory"))
		_ensure_group("Customer Group", v.get("customer_group"))
	else:
		_ensure_group("Supplier Group", v.get("supplier_group"))
	doc = frappe.new_doc(dt)
	for field, val in v.items():
		if val in (None, "") or field in ("address_line1", "city", "state"):
			continue
		if doc.meta.has_field(field):
			doc.set(field, val)
	type_field = "customer_type" if dt == "Customer" else "supplier_type"
	doc.set(type_field, v.get(type_field) or "Company")
	if dt == "Customer":
		ss = frappe.get_cached_doc("Selling Settings")
		doc.customer_group = doc.customer_group or _default_group("Customer Group", ss.customer_group)
		doc.territory = doc.territory or ss.territory or "All Territories"
	else:
		doc.supplier_group = doc.supplier_group or _default_group("Supplier Group", frappe.db.get_single_value("Buying Settings", "supplier_group"))
	doc.insert()

	if v.get("address_line1"):
		addr = frappe.get_doc({
			"doctype": "Address", "address_title": doc.get(k["key"]), "address_type": "Billing",
			"address_line1": v["address_line1"], "city": v.get("city"), "state": v.get("state"),
			"country": frappe.get_cached_value("Company", company, "country"), "is_primary_address": 1,
			"email_id": v.get("email_id"), "phone": v.get("mobile_no"),
			"links": [{"link_doctype": dt, "link_name": doc.name}],
		})
		if v.get("state") and addr.meta.has_field("emirate"):  # ERPNext UAE localisation field
			addr.emirate = v["state"]
		addr.insert()
		field = "customer_primary_address" if dt == "Customer" else "supplier_primary_address"
		if doc.meta.has_field(field):
			frappe.db.set_value(dt, doc.name, field, addr.name)
	return doc.name


def _temporary_opening(company):
	acc = frappe.db.get_value("Account", {"company": company, "account_type": "Temporary", "is_group": 0}, "name")
	if not acc:
		frappe.throw(_("Create a 'Temporary Opening' account (account type Temporary) first"))
	return acc


def _opening_stock(rows, company, posting_date):
	doc = frappe.new_doc("Stock Reconciliation")
	doc.update({"company": company, "purpose": "Opening Stock", "posting_date": posting_date, "set_posting_time": 1, "expense_account": _temporary_opening(company)})
	for r in rows:
		v = r["values"]
		doc.append("items", {"item_code": v["item_code"], "warehouse": v["warehouse"], "qty": v["qty"], "valuation_rate": v["valuation_rate"]})
	doc.insert()
	doc.submit()
	return {"created": [{"row": "all", "name": doc.name}], "failed": [], "doctype": "Stock Reconciliation", "documents": [doc.name]}


def _opening_balances(rows, company, posting_date):
	temp = _temporary_opening(company)
	cc = frappe.get_cached_value("Company", company, "cost_center")
	je = frappe.new_doc("Journal Entry")
	je.update({"company": company, "voucher_type": "Opening Entry", "is_opening": "Yes", "posting_date": posting_date, "user_remark": _("Opening balances (bulk import)")})
	dr = cr = 0.0
	for r in rows:
		v = r["values"]
		je.append("accounts", {
			"account": v["account"], "debit_in_account_currency": flt(v.get("debit")), "credit_in_account_currency": flt(v.get("credit")), "cost_center": cc,
			**({"party_type": v["party_type"], "party": v["party"]} if v.get("party") else {}),
		})
		dr += flt(v.get("debit"))
		cr += flt(v.get("credit"))
	diff = flt(dr - cr, 2)
	if diff:
		je.append("accounts", {"account": temp, "debit_in_account_currency": -diff if diff < 0 else 0, "credit_in_account_currency": diff if diff > 0 else 0, "cost_center": cc})
	je.insert()
	je.submit()
	return {"created": [{"row": "all", "name": je.name}], "failed": [], "doctype": "Journal Entry", "documents": [je.name], "balanced_to_temporary": diff}


def _opening_invoices(rows, company):
	temp = _temporary_opening(company)
	docs, failed = [], []
	for pt, invoice_type in (("Customer", "Sales"), ("Supplier", "Purchase")):
		part = [r for r in rows if r["values"]["party_type"] == pt]
		if not part:
			continue
		tool = frappe.get_doc("Opening Invoice Creation Tool")
		tool.company, tool.invoice_type, tool.create_missing_party = company, invoice_type, 0
		tool.set("invoices", [])
		for r in part:
			v = r["values"]
			tool.append("invoices", {
				"party_type": pt, "party": v["party"], "invoice_number": v.get("invoice_number"),
				"posting_date": v["posting_date"], "due_date": v.get("due_date") or v["posting_date"],
				"outstanding_amount": v["outstanding_amount"], "qty": 1, "temporary_opening_account": temp,
			})
		try:
			res = tool.make_invoices()
			made = res if isinstance(res, list) else []
			docs.extend(made)
			frappe.clear_messages()  # ERPNext's own "check Error Log" popup; reported below instead
			if len(part) < 50 and len(made) < len(part):
				failed.append({"row": f"{pt} invoices", "error": _("{0} of {1} could not be created — see Error Log ('Opening invoice creation failed')").format(len(part) - len(made), len(part))})
		except Exception as e:
			frappe.clear_last_message()
			failed.append({"row": f"{pt} invoices", "error": frappe.utils.strip_html(str(e))[:300]})
	return {
		"created": [{"row": "all", "name": d} for d in docs], "failed": failed, "doctype": "Sales Invoice / Purchase Invoice",
		"documents": docs, "queued": len(rows) >= 50 and not docs and not failed,
	}
