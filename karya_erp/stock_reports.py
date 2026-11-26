"""Server-paged stock reports for the Karya Erp UI.

ERPNext's own Stock Ledger / Stock Balance / Projected Qty reports build every row in memory, which gets slow
and heavy once a business has years of movements. These do the same sums in SQL and hand back one page at a
time, plus the total row count (on the first page) so the UI can page through.

Same column names as the ERPNext reports, so the saved column choices and the CSV look the same.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

MAX_PAGE = 500
EXPORT_PAGE = 2000


def C(fieldname, label, fieldtype="Data", options=None, width=120):
	return {"fieldname": fieldname, "label": label, "fieldtype": fieldtype, "options": options, "width": width}


LEDGER_COLUMNS = [
	C("date", "Date", "Date", width=95), C("item_code", "Item", "Link", "Item", 130), C("item_name", "Item Name", width=160),
	C("warehouse", "Warehouse", "Link", "Warehouse", 150), C("stock_uom", "UOM", "Link", "UOM", 70),
	C("in_qty", "In Qty", "Float", width=90), C("out_qty", "Out Qty", "Float", width=90),
	C("qty_after_transaction", "Balance Qty", "Float", width=100), C("valuation_rate", "Valuation Rate", "Currency", width=110),
	C("stock_value", "Balance Value", "Currency", width=120), C("stock_value_difference", "Value Change", "Currency", width=110),
	C("voucher_type", "Voucher Type", width=130), C("voucher_no", "Voucher #", "Dynamic Link", "voucher_type", 160),
	C("batch_no", "Batch", width=100),
]
BALANCE_COLUMNS = [
	C("item_code", "Item", "Link", "Item", 130), C("item_name", "Item Name", width=160), C("item_group", "Item Group", "Link", "Item Group", 120),
	C("warehouse", "Warehouse", "Link", "Warehouse", 150), C("stock_uom", "UOM", "Link", "UOM", 70),
	C("opening_qty", "Opening Qty", "Float", width=100), C("opening_val", "Opening Value", "Currency", width=110),
	C("in_qty", "In Qty", "Float", width=90), C("in_val", "In Value", "Currency", width=100),
	C("out_qty", "Out Qty", "Float", width=90), C("out_val", "Out Value", "Currency", width=100),
	C("bal_qty", "Balance Qty", "Float", width=100), C("val_rate", "Valuation Rate", "Currency", width=110), C("bal_val", "Balance Value", "Currency", width=120),
]
PROJECTED_COLUMNS = [
	C("item_code", "Item", "Link", "Item", 130), C("item_name", "Item Name", width=160), C("item_group", "Item Group", "Link", "Item Group", 120),
	C("warehouse", "Warehouse", "Link", "Warehouse", 150), C("stock_uom", "UOM", "Link", "UOM", 70),
	C("actual_qty", "Actual Qty", "Float", width=100), C("ordered_qty", "Ordered Qty", "Float", width=100), C("indented_qty", "Requested Qty", "Float", width=110),
	C("planned_qty", "Planned Qty", "Float", width=100), C("reserved_qty", "Reserved Qty", "Float", width=100),
	C("projected_qty", "Projected Qty", "Float", width=110), C("reorder_level", "Reorder Level", "Float", width=110),
	C("reorder_qty", "Reorder Qty", "Float", width=100), C("shortage_qty", "Shortage Qty", "Float", width=100),
]


# ---------------------------------------------------------------- helpers

def _tree(doctype, name):
	"""The group and everything under it (warehouses and item groups are trees)."""
	row = frappe.db.get_value(doctype, name, ["lft", "rgt"])
	if not row:
		return (name,)
	return tuple(frappe.get_all(doctype, filters={"lft": [">=", row[0]], "rgt": ["<=", row[1]]}, pluck="name")) or (name,)


def _restricted(doctype):
	"""Names this user is limited to by User Permissions on the doctype (empty = no limit). Raw SQL skips
	Frappe's own permission filtering, so the report applies it itself."""
	from frappe.permissions import get_user_permissions

	return tuple(p.get("doc") for p in (get_user_permissions(frappe.session.user).get(doctype) or []) if p.get("doc"))


def _scope(f, to_alias, values, search_fields):
	"""Conditions shared by the movement based reports. `to_alias` = the table with item_code / warehouse."""
	cond = []
	company = f.get("company") or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	values["company"] = company
	if f.get("warehouse"):
		values["warehouses"] = _tree("Warehouse", f["warehouse"])
		cond.append(f"{to_alias}.warehouse in %(warehouses)s")
	if f.get("item_code"):
		values["item_code"] = f["item_code"]
		cond.append(f"{to_alias}.item_code = %(item_code)s")
	if f.get("item_group"):
		values["item_groups"] = _tree("Item Group", f["item_group"])
		cond.append("i.item_group in %(item_groups)s")
	for doctype, column, key in (("Warehouse", f"{to_alias}.warehouse", "ur_wh"), ("Item", f"{to_alias}.item_code", "ur_item")):
		allowed = _restricted(doctype)
		if allowed:
			values[key] = allowed
			cond.append(f"{column} in %({key})s")
	return cond


def _search(q, fields, values):
	q = (q or "").strip()
	if not q:
		return []
	values["q"] = f"%{q}%"
	return ["(" + " or ".join(f"{fld} like %(q)s" for fld in fields) + ")"]


def _dates(f):
	to_date = getdate(f.get("to_date") or nowdate())
	from_date = getdate(f.get("from_date") or to_date.replace(day=1))
	if from_date > to_date:
		frappe.throw(_("From date is after the To date"))
	return str(from_date), str(to_date)


# ---------------------------------------------------------------- reports

def stock_ledger(f, start, page_length, q, with_total):
	from_date, to_date = _dates(f)
	values = {"from_date": from_date, "to_date": to_date}
	cond = ["sle.is_cancelled = 0", "sle.company = %(company)s", "sle.posting_date between %(from_date)s and %(to_date)s"]
	cond += _scope(f, "sle", values, None)
	cond += _search(q, ["sle.item_code", "i.item_name", "sle.voucher_no"], values)
	where = " and ".join(cond)
	frm = "from `tabStock Ledger Entry` sle join `tabItem` i on i.name = sle.item_code"
	rows = frappe.db.sql(
		f"""select sle.posting_date as `date`, sle.item_code, i.item_name, sle.warehouse, i.stock_uom,
			greatest(sle.actual_qty, 0) as in_qty, greatest(-sle.actual_qty, 0) as out_qty,
			sle.qty_after_transaction, sle.valuation_rate, sle.stock_value, sle.stock_value_difference,
			sle.voucher_type, sle.voucher_no, sle.batch_no
		{frm} where {where}
		order by sle.posting_date, sle.posting_time, sle.creation
		limit %(start)s, %(page_length)s""",
		{**values, "start": start, "page_length": page_length}, as_dict=True)
	total = None
	if with_total:
		total = frappe.db.sql(f"select count(*) {frm} where {where}", values)[0][0]
	return {"columns": LEDGER_COLUMNS, "result": rows, "total": total}


def stock_balance(f, start, page_length, q, with_total):
	from_date, to_date = _dates(f)
	values = {"from_date": from_date, "to_date": to_date}
	cond = ["sle.is_cancelled = 0", "sle.company = %(company)s", "sle.posting_date <= %(to_date)s"]
	cond += _scope(f, "sle", values, None)
	cond += _search(q, ["sle.item_code", "i.item_name"], values)
	inside = "sle.posting_date >= %(from_date)s"
	inner = f"""select sle.item_code, i.item_name, i.item_group, i.stock_uom, sle.warehouse,
			sum(if(sle.posting_date < %(from_date)s, sle.actual_qty, 0)) as opening_qty,
			sum(if(sle.posting_date < %(from_date)s, sle.stock_value_difference, 0)) as opening_val,
			sum(if({inside} and sle.actual_qty > 0, sle.actual_qty, 0)) as in_qty,
			sum(if({inside} and sle.actual_qty > 0, sle.stock_value_difference, 0)) as in_val,
			sum(if({inside} and sle.actual_qty < 0, -sle.actual_qty, 0)) as out_qty,
			sum(if({inside} and sle.actual_qty < 0, -sle.stock_value_difference, 0)) as out_val,
			sum(sle.actual_qty) as bal_qty, sum(sle.stock_value_difference) as bal_val
		from `tabStock Ledger Entry` sle join `tabItem` i on i.name = sle.item_code
		where {" and ".join(cond)}
		group by sle.item_code, sle.warehouse
		{"" if cint(f.get("include_zero_stock_items")) else "having abs(bal_qty) + abs(bal_val) > 0"}"""
	rows = frappe.db.sql(f"{inner} order by item_code, warehouse limit %(start)s, %(page_length)s",
		{**values, "start": start, "page_length": page_length}, as_dict=True)
	for r in rows:
		r["val_rate"] = flt(r["bal_val"]) / flt(r["bal_qty"]) if flt(r["bal_qty"]) else 0
	out = {"columns": BALANCE_COLUMNS, "result": rows, "total": None}
	if with_total:
		n, qty, val = frappe.db.sql(f"select count(*), coalesce(sum(bal_qty), 0), coalesce(sum(bal_val), 0) from ({inner}) t", values)[0]
		out["total"] = n
		out["report_summary"] = [{"label": _("Stock value"), "value": flt(val), "datatype": "Currency"}, {"label": _("Quantity on hand"), "value": flt(qty), "datatype": "Float"}]
	return out


def projected_qty(f, start, page_length, q, with_total):
	values = {}
	cond = ["w.company = %(company)s", "i.disabled = 0", "i.is_stock_item = 1"]
	cond += _scope(f, "b", values, None)
	cond += _search(q, ["b.item_code", "i.item_name"], values)
	frm = """from `tabBin` b join `tabItem` i on i.name = b.item_code join `tabWarehouse` w on w.name = b.warehouse
		left join `tabItem Reorder` ir on ir.parent = b.item_code and ir.warehouse = b.warehouse"""
	where = " and ".join(cond)
	rows = frappe.db.sql(
		f"""select b.item_code, i.item_name, i.item_group, b.warehouse, i.stock_uom, b.actual_qty, b.ordered_qty,
			b.indented_qty, b.planned_qty, b.reserved_qty, b.projected_qty,
			coalesce(ir.warehouse_reorder_level, 0) as reorder_level, coalesce(ir.warehouse_reorder_qty, 0) as reorder_qty,
			greatest(coalesce(ir.warehouse_reorder_level, 0) - b.projected_qty, 0) as shortage_qty
		{frm} where {where}
		order by b.item_code, b.warehouse limit %(start)s, %(page_length)s""",
		{**values, "start": start, "page_length": page_length}, as_dict=True)
	total = frappe.db.sql(f"select count(*) {frm} where {where}", values)[0][0] if with_total else None
	return {"columns": PROJECTED_COLUMNS, "result": rows, "total": total}


REPORTS = {
	"stock-ledger": (stock_ledger, "Stock Ledger Entry"),
	"stock-balance-report": (stock_balance, "Stock Ledger Entry"),
	"stock-projected-qty": (projected_qty, "Bin"),
}


# ---------------------------------------------------------------- API

@frappe.whitelist()
def run(report, filters=None, start=0, page_length=100, search=None, with_total=0, export=0):
	"""One page of a stock report: {columns, result (dicts), total (when with_total), report_summary}."""
	if report not in REPORTS:
		frappe.throw(_("Unknown report {0}").format(report))
	fn, doctype = REPORTS[report]
	frappe.has_permission(doctype, "read", throw=True)
	f = frappe.parse_json(filters) if filters else {}
	limit = EXPORT_PAGE if cint(export) else MAX_PAGE
	return fn(f, max(cint(start), 0), min(max(cint(page_length), 1), limit), search, cint(with_total))
