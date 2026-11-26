"""Server-paged Sales / Purchase Analytics for the Karya Erp UI.

ERPNext's analytics report pulls every invoice row into Python and buckets them there, which stalls on a busy
site. This groups and sums in SQL (one column per period) and returns one page of entities (customers,
suppliers, items or projects) at a time, biggest first, with a whole-set total row on the first page.

Group views (customer group, territory, item group, order type …) are small trees and stay on ERPNext's report.
"""

import frappe
from frappe import _, scrub
from frappe.utils import add_days, add_to_date, cint, flt, getdate

from karya_erp.stock_reports import EXPORT_PAGE, MAX_PAGE, _restricted, _search

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FLAT = ("Customer", "Supplier", "Item", "Project")
# report key -> (invoice doctype, party field, party name field, tree types it offers)
REPORTS = {
	"sales-analytics": ("Sales Invoice", "customer", "customer_name", ("Customer", "Item", "Project")),
	"purchase-analytics": ("Purchase Invoice", "supplier", "supplier_name", ("Supplier", "Item", "Project")),
}


def _label(range_, d, company):
	if range_ == "Weekly":
		iso = d.isocalendar()
		return _("Week {0} {1}").format(str(iso.week), str(iso.year))
	if range_ == "Monthly":
		return _(MONTHS[d.month - 1]) + " " + str(d.year)
	if range_ == "Quarterly":
		return _("Quarter {0} {1}").format(str(((d.month - 1) // 3) + 1), str(d.year))
	from erpnext.accounts.utils import get_fiscal_year

	return str(get_fiscal_year(d, company=company)[0])


def _periods(f, company):
	"""The period buckets, built the way ERPNext's report builds them (at most 52)."""
	from dateutil.relativedelta import MO, relativedelta

	from_date, to_date = getdate(f["from_date"]), getdate(f["to_date"])
	range_ = f.get("range") or "Monthly"
	step = {"Monthly": 1, "Quarterly": 3, "Half-Yearly": 6, "Yearly": 12}.get(range_, 1)
	if range_ in ("Monthly", "Quarterly"):
		cursor = from_date.replace(day=1)
	elif range_ == "Yearly":
		from erpnext.accounts.utils import get_fiscal_year

		cursor = get_fiscal_year(from_date, company=company)[1]
	else:
		cursor = from_date + relativedelta(weekday=MO(-1))
	out = []
	for _i in range(52):
		end = add_days(cursor, 6) if range_ == "Weekly" else add_to_date(cursor, months=step, days=-1)
		end = min(end, to_date)
		label = _label(range_, end, company)
		out.append({"label": label, "fieldname": scrub(label), "start": str(cursor), "end": str(end)})
		cursor = add_days(end, 1)
		if end == to_date:
			break
	return out


def _columns(tree, periods):
	cols = [{"fieldname": "entity", "label": _(tree), "fieldtype": "Link", "options": tree, "width": 140}]
	if tree in ("Customer", "Supplier", "Item"):
		cols.append({"fieldname": "entity_name", "label": _(tree + " Name"), "fieldtype": "Data", "width": 160})
	if tree == "Item":
		cols.append({"fieldname": "stock_uom", "label": _("UOM"), "fieldtype": "Link", "options": "UOM", "width": 80})
	cols += [{"fieldname": p["fieldname"], "label": p["label"], "fieldtype": "Float", "width": 120} for p in periods]
	cols.append({"fieldname": "total", "label": _("Total"), "fieldtype": "Float", "width": 120})
	return cols


def can_page(report, filters):
	"""True when this report/tree combination is served here (otherwise the page uses ERPNext's report)."""
	return report in REPORTS and (filters.get("tree_type") in REPORTS[report][3])


def analytics(report, f, start, page_length, q, with_total):
	doctype, party, party_name, _trees = REPORTS[report]
	tree = f.get("tree_type") or _trees[0]
	if tree not in _trees:
		frappe.throw(_("Invalid Tree Type {0}").format(tree))
	if not (f.get("from_date") and f.get("to_date")):
		frappe.throw(_("From and To dates are required"))
	if getdate(f["from_date"]) > getdate(f["to_date"]):
		frappe.throw(_("From date is after the To date"))
	company = f.get("company") or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	qty = (f.get("value_quantity") or "Value") == "Quantity"
	periods = _periods(f, company)
	values = {"company": company, "from_date": f["from_date"], "to_date": periods[-1]["end"]}

	item_table = f"`tab{doctype} Item`"
	if tree == "Item":
		frm = f"{item_table} i join `tab{doctype}` d on d.name = i.parent"
		entity, name, uom, val = "i.item_code", "max(i.item_name)", "max(i.stock_uom)", "i.stock_qty" if qty else "i.base_net_amount"
		extra = ["i.docstatus = 1"]
		search_fields = ["i.item_code", "i.item_name"]
	else:
		frm = f"`tab{doctype}` d" + (f" join {item_table} i on i.parent = d.name" if qty else "")
		entity = "d.project" if tree == "Project" else f"d.{party}"
		name, uom, val = (f"max(d.{party_name})" if tree != "Project" else "null"), "null", "i.stock_qty" if qty else "d.base_net_total"
		extra = ["ifnull(d.project, '') != ''"] if tree == "Project" else []
		search_fields = [entity] + ([f"d.{party_name}"] if tree != "Project" else [])

	cond = ["d.docstatus = 1", "d.company = %(company)s", "d.is_opening = 'No'", "d.posting_date between %(from_date)s and %(to_date)s", *extra]
	if tree == "Item":
		restricted = _restricted("Item")
		if restricted:
			values["ur_item"] = restricted
			cond.append("i.item_code in %(ur_item)s")
	else:
		restricted = _restricted("Customer" if doctype == "Sales Invoice" else "Supplier")
		if restricted:
			values["ur_party"] = restricted
			cond.append(f"d.{party} in %(ur_party)s")
	company_limit = _restricted("Company")
	if company_limit and company not in company_limit:
		frappe.throw(_("You are not permitted to see {0}").format(company), frappe.PermissionError)
	cond += _search(q, search_fields, values)
	where = " and ".join(cond)

	sums = []
	for n, p in enumerate(periods):
		values[f"s{n}"], values[f"e{n}"] = p["start"], p["end"]
		sums.append(f"sum(case when d.posting_date between %(s{n})s and %(e{n})s then {val} else 0 end) as p{n}")
	period_sql = ", ".join(sums)

	rows = frappe.db.sql(
		f"""select {entity} as entity, {name} as entity_name, {uom} as stock_uom, {period_sql}, sum({val}) as total
		from {frm} where {where}
		group by {entity} order by total desc, {entity} limit %(start)s, %(page_length)s""",
		{**values, "start": start, "page_length": page_length}, as_dict=True)
	for r in rows:
		for n, p in enumerate(periods):
			r[p["fieldname"]] = flt(r.pop(f"p{n}"))
		r["total"] = flt(r["total"])
		if tree != "Item":
			r.pop("stock_uom", None)

	out = {"columns": _columns(tree, periods), "result": rows, "total": None}
	if with_total:
		out["total"] = frappe.db.sql(f"select count(*) from (select 1 from {frm} where {where} group by {entity}) t", values)[0][0]
		tot = frappe.db.sql(f"select {period_sql}, sum({val}) as total from {frm} where {where}", values, as_dict=True)[0]
		row = {"entity": _("Total"), "total": flt(tot["total"])}
		for n, p in enumerate(periods):
			row[p["fieldname"]] = flt(tot[f"p{n}"])
		out["total_row"] = row
	return out


# report key -> (invoice doctype, party field, party name field, party doctype)
REGISTERS = {
	"item-wise-sales-register": ("Sales Invoice", "customer", "customer_name", "Customer"),
	"item-wise-purchase-register": ("Purchase Invoice", "supplier", "supplier_name", "Supplier"),
}


def register(report, f, start, page_length, q, with_total):
	"""Every invoiced item line, newest first. Tax is the invoice's tax shared out by each line's net amount
	(exact when one rate applies, which is the normal case)."""
	doctype, party, party_name, party_doctype = REGISTERS[report]
	if not (f.get("from_date") and f.get("to_date")):
		frappe.throw(_("From and To dates are required"))
	if getdate(f["from_date"]) > getdate(f["to_date"]):
		frappe.throw(_("From date is after the To date"))
	company = f.get("company") or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	values = {"company": company, "from_date": f["from_date"], "to_date": f["to_date"]}
	cond = ["d.docstatus = 1", "i.docstatus = 1", "d.company = %(company)s", "d.posting_date between %(from_date)s and %(to_date)s"]
	if f.get(party):
		values["party"] = f[party]
		cond.append(f"d.{party} = %(party)s")
	if f.get("item_code"):
		values["item_code"] = f["item_code"]
		cond.append("i.item_code = %(item_code)s")
	for doc, column, key in ((party_doctype, f"d.{party}", "ur_party"), ("Item", "i.item_code", "ur_item")):
		allowed = _restricted(doc)
		if allowed:
			values[key] = allowed
			cond.append(f"{column} in %({key})s")
	company_limit = _restricted("Company")
	if company_limit and company not in company_limit:
		frappe.throw(_("You are not permitted to see {0}").format(company), frappe.PermissionError)
	cond += _search(q, ["i.item_code", "i.item_name", "d.name", f"d.{party_name}"], values)
	where = " and ".join(cond)
	frm = f"`tab{doctype} Item` i join `tab{doctype}` d on d.name = i.parent"
	tax = "if(d.base_net_total, d.base_total_taxes_and_charges * i.base_net_amount / d.base_net_total, 0)"
	rate = "if(i.stock_uom != i.uom and i.stock_qty, i.base_net_rate * i.qty / i.stock_qty, i.base_net_rate)"
	rows = frappe.db.sql(
		f"""select d.name as invoice, d.posting_date, d.{party} as {party}, d.{party_name} as {party_name},
			i.item_code, i.item_name, i.item_group, i.stock_qty, i.stock_uom, {rate} as rate,
			i.base_net_amount as amount, {tax} as total_tax, i.base_net_amount + {tax} as total
		from {frm} where {where}
		order by d.posting_date desc, d.name desc, i.idx limit %(start)s, %(page_length)s""",
		{**values, "start": start, "page_length": page_length}, as_dict=True)
	cols = [
		{"fieldname": "invoice", "label": _("Invoice"), "fieldtype": "Link", "options": doctype, "width": 150},
		{"fieldname": "posting_date", "label": _("Posting Date"), "fieldtype": "Date", "width": 95},
		{"fieldname": party, "label": _(party_doctype), "fieldtype": "Link", "options": party_doctype, "width": 130},
		{"fieldname": party_name, "label": _(party_doctype + " Name"), "fieldtype": "Data", "width": 150},
		{"fieldname": "item_code", "label": _("Item Code"), "fieldtype": "Link", "options": "Item", "width": 120},
		{"fieldname": "item_name", "label": _("Item Name"), "fieldtype": "Data", "width": 160},
		{"fieldname": "item_group", "label": _("Item Group"), "fieldtype": "Link", "options": "Item Group", "width": 120},
		{"fieldname": "stock_qty", "label": _("Quantity"), "fieldtype": "Float", "width": 90},
		{"fieldname": "stock_uom", "label": _("UOM"), "fieldtype": "Link", "options": "UOM", "width": 70},
		{"fieldname": "rate", "label": _("Rate"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "total_tax", "label": _("Tax"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "total", "label": _("Total"), "fieldtype": "Currency", "width": 110},
	]
	out = {"columns": cols, "result": rows, "total": None}
	if with_total:
		n, qty, amount, taxes = frappe.db.sql(
			f"select count(*), coalesce(sum(i.stock_qty), 0), coalesce(sum(i.base_net_amount), 0), coalesce(sum({tax}), 0) from {frm} where {where}", values)[0]
		out["total"] = n
		out["total_row"] = {"invoice": _("Total"), "stock_qty": flt(qty), "amount": flt(amount), "total_tax": flt(taxes), "total": flt(amount) + flt(taxes)}
	return out


@frappe.whitelist()
def run(report, filters=None, start=0, page_length=100, search=None, with_total=0, export=0):
	"""One page of Sales / Purchase Analytics or an item-wise register: {columns, result, total, total_row}."""
	if report not in REPORTS and report not in REGISTERS:
		frappe.throw(_("Unknown report {0}").format(report))
	doctype = (REPORTS.get(report) or REGISTERS.get(report))[0]
	frappe.has_permission(doctype, "read", throw=True)
	f = frappe.parse_json(filters) if filters else {}
	limit = EXPORT_PAGE if cint(export) else MAX_PAGE
	args = (f, max(cint(start), 0), min(max(cint(page_length), 1), limit), search, cint(with_total))
	return register(report, *args) if report in REGISTERS else analytics(report, *args)
