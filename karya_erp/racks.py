"""Racks inside a warehouse, built on plain ERPNext warehouses (no custom doctype).

A rack is a leaf Warehouse. All racks of a warehouse W live under one group warehouse called
"<W name> Racks - <abbr>", so W keeps working as the normal receiving point:
  * Purchases are received into W as usual - nobody has to choose a rack there.
  * Warehouse staff "put away" stock from W into a rack (a Material Transfer stock entry).
  * When a Sales Invoice (with stock update) or Delivery Note is saved with W as the warehouse, the lines are
    split automatically across W's racks, taking from the rack holding the oldest stock first (FIFO).
Racks therefore get their own stock, ledger and balance from standard ERPNext.
"""
import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate, nowtime


def _abbr(company):
	return frappe.get_cached_value("Company", company, "abbr")


def _group_name(wh):
	return f"{wh.warehouse_name} Racks - {_abbr(wh.company)}"


def _rack_group(wh, create=False):
	name = _group_name(wh)
	if frappe.db.exists("Warehouse", name):
		return name
	if not create:
		return None
	g = frappe.get_doc({
		"doctype": "Warehouse", "warehouse_name": f"{wh.warehouse_name} Racks", "company": wh.company,
		"parent_warehouse": wh.parent_warehouse, "is_group": 1,
	})
	g.insert()
	return g.name


def _check(warehouse, write=False):
	wh = frappe.get_doc("Warehouse", warehouse)
	frappe.has_permission("Warehouse", "write" if write else "read", wh, throw=True)
	if cint(wh.is_group):
		frappe.throw(_("{0} is a group. Pick a warehouse that holds stock.").format(warehouse))
	return wh


def _rack_rows(group):
	return frappe.get_all("Warehouse", filters={"parent_warehouse": group}, fields=["name", "warehouse_name", "disabled"], order_by="warehouse_name asc") if group else []


def _bins(warehouses):
	if not warehouses:
		return []
	return frappe.db.sql(
		"""select b.warehouse, b.item_code, i.item_name, b.actual_qty qty, b.stock_value value
		from `tabBin` b join `tabItem` i on i.name = b.item_code
		where b.warehouse in %(w)s and b.actual_qty != 0 order by i.item_name""",
		{"w": tuple(warehouses)}, as_dict=True,
	)


@frappe.whitelist()
def overview(warehouse):
	"""The warehouse's racks (with what each holds) and the stock still sitting un-racked in the warehouse itself."""
	wh = _check(warehouse)
	group = _rack_group(wh)
	racks = _rack_rows(group)
	names = [r.name for r in racks]
	prefix = f"{wh.warehouse_name} "
	by = {}
	for b in _bins(names):
		by.setdefault(b.warehouse, []).append({"item_code": b.item_code, "item_name": b.item_name, "qty": flt(b.qty), "value": flt(b.value)})
	out = []
	for r in racks:
		items = by.get(r.name, [])
		label = r.warehouse_name[len(prefix):] if r.warehouse_name.startswith(prefix) else r.warehouse_name
		out.append({"name": r.name, "label": label, "disabled": cint(r.disabled), "items": items,
			"qty": sum(i["qty"] for i in items), "value": sum(i["value"] for i in items)})
	unracked = [{"item_code": b.item_code, "item_name": b.item_name, "qty": flt(b.qty)} for b in _bins([wh.name])]
	return {"warehouse": wh.name, "company": wh.company, "group": group, "racks": out, "unracked": unracked}


@frappe.whitelist(methods=["POST"])
def create_rack(warehouse, rack):
	wh = _check(warehouse, write=True)
	rack = (rack or "").strip()
	if not rack:
		frappe.throw(_("Enter a rack name"))
	group = _rack_group(wh, create=True)
	doc = frappe.get_doc({
		"doctype": "Warehouse", "warehouse_name": f"{wh.warehouse_name} {rack}", "company": wh.company,
		"parent_warehouse": group, "is_group": 0, "warehouse_type": frappe.db.get_value("Warehouse", wh.name, "warehouse_type"),
	})
	doc.insert()
	return doc.name


def _own_rack(warehouse, rack):
	wh = _check(warehouse, write=True)
	group = _rack_group(wh)
	if not group or frappe.db.get_value("Warehouse", rack, "parent_warehouse") != group:
		frappe.throw(_("{0} is not a rack of {1}").format(rack, warehouse))
	return wh


@frappe.whitelist(methods=["POST"])
def set_rack_enabled(warehouse, rack, enabled):
	_own_rack(warehouse, rack)
	frappe.db.set_value("Warehouse", rack, "disabled", 0 if cint(enabled) else 1)
	return True


@frappe.whitelist(methods=["POST"])
def delete_rack(warehouse, rack):
	_own_rack(warehouse, rack)
	if frappe.db.sql("select 1 from `tabBin` where warehouse=%s and actual_qty != 0 limit 1", rack):
		frappe.throw(_("{0} still holds stock. Move it to another rack first.").format(rack))
	frappe.delete_doc("Warehouse", rack)
	return True


@frappe.whitelist(methods=["POST"])
def putaway(warehouse, rack, items):
	"""Move stock from the warehouse into one of its racks. items: JSON [{item_code, qty}]"""
	wh = _own_rack(warehouse, rack)
	if cint(frappe.db.get_value("Warehouse", rack, "disabled")):
		frappe.throw(_("{0} is disabled").format(rack))
	rows = [r for r in frappe.parse_json(items) if flt(r.get("qty")) > 0]
	if not rows:
		frappe.throw(_("Enter a quantity to move"))
	se = frappe.new_doc("Stock Entry")
	se.update({"stock_entry_type": "Material Transfer", "purpose": "Material Transfer", "company": wh.company,
		"from_warehouse": wh.name, "to_warehouse": rack, "posting_date": nowdate(), "posting_time": nowtime()})
	for r in rows:
		flags = frappe.db.get_value("Item", r["item_code"], ["has_batch_no", "has_serial_no"], as_dict=True) or {}
		if flags.get("has_batch_no") or flags.get("has_serial_no"):
			frappe.throw(_("{0} uses batches or serial numbers. Move it with a Stock Entry so you can pick them.").format(r["item_code"]))
		se.append("items", {"item_code": r["item_code"], "qty": flt(r["qty"]), "s_warehouse": wh.name, "t_warehouse": rack})
	se.insert()
	se.submit()
	return se.name


# ---------------------------------------------------------------- automatic pick on sale / delivery

def _oldest_first(item_code, racks):
	"""Racks ordered by when their stock of this item first arrived (the oldest first)."""
	rows = frappe.db.sql(
		"""select warehouse, min(timestamp(posting_date, posting_time)) first_in
		from `tabStock Ledger Entry`
		where item_code=%s and warehouse in %s and actual_qty > 0 and is_cancelled = 0 group by warehouse""",
		(item_code, tuple(racks)), as_dict=True,
	)
	first = {r.warehouse: r.first_in for r in rows}
	return sorted(racks, key=lambda w: (first.get(w) is None, first.get(w), w))


def auto_pick_racks(doc, method=None):
	"""before_validate on Sales Invoice / POS Invoice / Delivery Note: take stock from racks, oldest first."""
	if doc.doctype in ("Sales Invoice", "POS Invoice") and (not cint(doc.get("update_stock")) or cint(doc.get("is_return"))):
		return
	if doc.doctype == "Delivery Note" and cint(doc.get("is_return")):
		return
	cache, used, out, changed = {}, {}, [], False

	def racks_of(w):
		if w not in cache:
			cache[w] = []
			wh = frappe.db.get_value("Warehouse", w, ["warehouse_name", "company", "is_group"], as_dict=True)
			if wh and not cint(wh.is_group):
				g = f"{wh.warehouse_name} Racks - {_abbr(wh.company)}"
				if frappe.db.exists("Warehouse", g):
					cache[w] = frappe.get_all("Warehouse", filters={"parent_warehouse": g, "disabled": 0, "is_group": 0}, pluck="name")
		return cache[w]

	for row in doc.get("items"):
		d = row.as_dict()
		w = row.get("warehouse") or doc.get("set_warehouse")
		racks = racks_of(w) if (w and row.get("item_code")) else []
		if not racks:
			out.append(d)
			continue
		item = frappe.db.get_value("Item", row.item_code, ["is_stock_item", "has_batch_no", "has_serial_no"], as_dict=True)
		if not item or not item.is_stock_item or item.has_batch_no or item.has_serial_no or row.get("batch_no") or row.get("serial_no"):
			out.append(d)
			continue
		factor = flt(row.get("conversion_factor")) or 1
		left = flt(row.qty)
		parts = []
		for rack in _oldest_first(row.item_code, racks):
			if left <= 0:
				break
			free = flt(frappe.db.get_value("Bin", {"item_code": row.item_code, "warehouse": rack}, "actual_qty")) - used.get((row.item_code, rack), 0)
			take = min(left, max(free, 0) / factor)
			if take > 0:
				parts.append((rack, take))
				used[(row.item_code, rack)] = used.get((row.item_code, rack), 0) + take * factor
				left -= take
		if not parts:
			out.append(d)
			continue
		changed = True
		for rack, qty in parts:
			p = dict(d)
			p["warehouse"], p["qty"] = rack, qty
			out.append(p)
		if left > 0.000001:  # not enough in racks: the rest stays on the warehouse itself (ERPNext checks it there)
			p = dict(d)
			p["qty"] = left
			out.append(p)
	if not changed:
		return
	skip = {"name", "idx", "parent", "parentfield", "parenttype", "creation", "modified", "modified_by", "owner", "doctype", "docstatus"}
	doc.set("items", [])
	for p in out:
		doc.append("items", {k: v for k, v in p.items() if k not in skip})
