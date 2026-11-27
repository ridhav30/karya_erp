"""Point of sale till over ERPNext's POS Profile / POS Opening Entry / POS Closing Entry.

  session()       profiles the user may sell on, the open shift (if any), invoice type, setup state
  setup()         one click: walk-in customer, "Till Cash" / "Till Card" payment modes and a POS Profile
  items()         catalogue page for the till (ERPNext's own get_items: price list, stock, barcode search)
  open_shift()    POS Opening Entry with the opening cash per payment mode
  checkout()      builds the sale as a POS-flagged Sales Invoice (or POS Invoice when POS Settings says so), takes
                  the payments, submits, returns the invoice and change due
  shift_summary() / close_shift()   expected vs counted per payment mode, then POS Closing Entry
No custom fields or doctypes.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from erpnext.selling.page.point_of_sale.point_of_sale import check_pos_profile_access, get_items, get_parent_item_group


def _invoice_type():
	return frappe.db.get_single_value("POS Settings", "invoice_type") or "Sales Invoice"


def _loads(v, default):
	if v in (None, ""):
		return default
	return json.loads(v) if isinstance(v, str) else v


def _profile_data(name):
	p = frappe.get_cached_doc("POS Profile", name)
	return {
		"name": p.name, "company": p.company, "customer": p.customer, "warehouse": p.warehouse,
		"price_list": p.selling_price_list, "currency": p.currency or frappe.get_cached_value("Company", p.company, "default_currency"),
		"update_stock": cint(p.update_stock), "allow_rate_change": cint(p.allow_rate_change), "allow_discount_change": cint(p.allow_discount_change),
		"allow_partial_payment": cint(p.allow_partial_payment), "taxes_and_charges": p.taxes_and_charges,
		"payments": [{"mode_of_payment": m.mode_of_payment, "default": cint(m.default), "type": frappe.get_cached_value("Mode of Payment", m.mode_of_payment, "type")} for m in p.payments],
		"print_format": p.print_format,
	}


def _is_manager():
	"""A manager (Sales / System Manager) may open and close any counter and sees every shift."""
	return bool(frappe.has_permission("POS Closing Entry", "create"))


def _cashiers(profile):
	return frappe.get_all("POS Profile User", filters={"parent": profile, "parenttype": "POS Profile"}, pluck="user")


def _may_use(profile):
	"""Managers use any counter. Everyone else only the counters they are listed on; a counter with nobody listed is for managers."""
	return _is_manager() or frappe.session.user in _cashiers(profile)


def _allowed_profiles():
	if not frappe.has_permission("POS Profile", "read") and not frappe.only_has_select_perm("POS Profile"):
		return []
	out = []
	for name in frappe.get_all("POS Profile", filters={"disabled": 0}, pluck="name"):
		if _may_use(name):
			try:
				check_pos_profile_access(name)
			except frappe.PermissionError:
				continue
			out.append(name)
	return out


@frappe.whitelist()
def session():
	profiles = [_profile_data(n) for n in _allowed_profiles()]
	opening = frappe.get_all(
		"POS Opening Entry",
		filters={"user": frappe.session.user, "status": "Open", "docstatus": 1},
		fields=["name", "pos_profile", "company", "period_start_date"], order_by="period_start_date desc", limit=1,
	)
	opening = opening[0] if opening else None
	if opening:
		# ERPNext refuses sales on a shift that was opened on an earlier day: the till tells the cashier to close it and start a new one.
		opening["stale"] = frappe.utils.getdate(opening.period_start_date) != frappe.utils.getdate(frappe.utils.nowdate())
		opening["balances"] = frappe.get_all("POS Opening Entry Detail", filters={"parent": opening.name}, fields=["mode_of_payment", "opening_amount"])
	# Shifts someone else has open on a counter this user can use: ERPNext allows one open shift per counter, so
	# they block "Open shift" there. A manager sees who and may close them; a cashier is only told the counter is in use.
	mine = {p["name"] for p in profiles}
	others = frappe.get_all(
		"POS Opening Entry",
		filters={"status": "Open", "docstatus": 1, "user": ["!=", frappe.session.user], "pos_profile": ["in", list(mine) or [""]]},
		fields=["name", "pos_profile", "user", "period_start_date"], order_by="period_start_date desc",
	)
	manager = _is_manager()
	busy = {o.pos_profile for o in others}
	for p in profiles:
		p["busy"] = p["name"] in busy
	if manager:
		for o in others:
			o["user_name"] = frappe.db.get_value("User", o.user, "full_name") or o.user
	else:
		others = []  # other people's sessions are not a cashier's business
	return {
		"others": others, "can_close_others": manager,
		"profiles": profiles, "opening": opening, "invoice_type": _invoice_type(),
		"can_setup": bool(frappe.has_permission("POS Profile", "create")),
		"can_sell": bool(frappe.has_permission(_invoice_type(), "create")),
		"company": frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company"),
	}


@frappe.whitelist(methods=["POST"])
def setup(company=None):
	"""Walk-in customer, two payment modes and a first POS Profile — only what is missing."""
	frappe.only_for(["System Manager", "Accounts Manager", "Sales Manager"])
	company = company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	co = frappe.get_cached_doc("Company", company)
	made = []

	customer = frappe.db.get_value("Customer", {"customer_name": "Walk-in Customer"})
	if not customer:
		c = frappe.get_doc({"doctype": "Customer", "customer_name": "Walk-in Customer", "customer_type": "Individual",
			"customer_group": frappe.db.get_single_value("Selling Settings", "customer_group") or "Individual",
			"territory": frappe.db.get_single_value("Selling Settings", "territory") or "All Territories"}).insert()
		customer = c.name
		made.append("Walk-in Customer")

	def mode(name, mtype, account):
		if frappe.db.exists("Mode of Payment", name):
			return
		if not account or not frappe.db.exists("Account", account):
			frappe.throw(_("No account found for {0}. Set the default cash / bank accounts on the company first.").format(name))
		frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": name, "type": mtype, "enabled": 1,
			"accounts": [{"company": company, "default_account": account}]}).insert()
		made.append(name)

	card_account = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 0, "account_name": ["like", "%Credit Card%"]}) or co.default_bank_account
	mode("Till Cash", "Cash", co.default_cash_account)
	mode("Till Card", "Bank", card_account)

	if not frappe.db.exists("POS Profile", {"company": company}):
		warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "warehouse_name": "Stores"}) or frappe.db.get_value("Warehouse", {"company": company, "is_group": 0})
		tax = frappe.db.get_value("Sales Taxes and Charges Template", {"company": company, "is_default": 1})
		p = frappe.get_doc({
			"doctype": "POS Profile", "name": f"{co.abbr} Counter", "company": company, "customer": customer,
			"warehouse": warehouse, "currency": co.default_currency, "selling_price_list": frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling",
			"update_stock": 1, "taxes_and_charges": tax, "allow_rate_change": 0, "allow_discount_change": 1,
			"write_off_account": co.write_off_account, "write_off_cost_center": co.cost_center, "cost_center": co.cost_center,
			"payments": [{"mode_of_payment": "Till Cash", "default": 1}, {"mode_of_payment": "Till Card"}],
		}).insert()
		made.append(p.name)
	return made


class _profile_read:
	"""ERPNext's item and group lookups insist on read access to POS Profile, which only the Accounts roles have by
	default, so a cashier with Sales User alone got "does not have doctype access via role permission for document
	POS Profile". Once the user is known to be allowed on this profile, that one read-only lookup runs as
	Administrator and the real user is put back straight after."""

	def __init__(self, pos_profile):
		self.pos_profile = pos_profile

	def __enter__(self):
		if not _may_use(self.pos_profile) and "System Manager" not in frappe.get_roles():
			frappe.throw(_("You are not allowed to use the POS Profile {0}").format(self.pos_profile), frappe.PermissionError)
		self.user = frappe.session.user
		frappe.set_user("Administrator")

	def __exit__(self, *exc):
		frappe.set_user(self.user)


@frappe.whitelist()
def groups(pos_profile):
	with _profile_read(pos_profile):
		check_pos_profile_access(pos_profile)
		root = get_parent_item_group(pos_profile)
		kids = frappe.get_all("Item Group", filters={"parent_item_group": root}, pluck="name", order_by="name")
	return {"root": root, "groups": kids}


@frappe.whitelist()
def items(pos_profile, search="", item_group=None, start=0, page_length=40, price_list=None):
	with _profile_read(pos_profile):
		check_pos_profile_access(pos_profile)
		p = frappe.get_cached_doc("POS Profile", pos_profile)
		res = get_items(cint(start), cint(page_length), price_list or p.selling_price_list, item_group or get_parent_item_group(pos_profile), pos_profile, search or "")
	rows = (res or {}).get("items", []) if isinstance(res, dict) else (res or [])
	# Items without a price can't be sold from the till
	return [r for r in rows if flt(r.get("price_list_rate")) > 0]


@frappe.whitelist(methods=["POST"])
def open_shift(pos_profile, balances=None):
	"""balances: JSON [{mode_of_payment, opening_amount}]"""
	from erpnext.selling.page.point_of_sale.point_of_sale import create_opening_voucher

	if not _may_use(pos_profile):
		frappe.throw(_("You are not a cashier on {0}. Ask a manager to add you to this counter.").format(pos_profile), frappe.PermissionError)
	taken = frappe.db.get_value("POS Opening Entry", {"pos_profile": pos_profile, "status": "Open", "docstatus": 1, "user": ["!=", frappe.session.user]}, "user")
	if taken:
		frappe.throw(_("{0} is in use by another session.").format(pos_profile) + (" " + _("Opened by {0}.").format(taken) if _is_manager() else " " + _("Ask a manager if it should be closed.")))
	company = frappe.db.get_value("POS Profile", pos_profile, "company")
	rows = _loads(balances, [])
	if not rows:
		rows = [{"mode_of_payment": m, "opening_amount": 0} for m in frappe.get_all("POS Payment Method", filters={"parent": pos_profile}, pluck="mode_of_payment")]
	return create_opening_voucher(pos_profile, company, json.dumps(rows))["name"]


def _opening(name):
	o = frappe.get_doc("POS Opening Entry", name)
	if o.status != "Open" or o.docstatus != 1:
		frappe.throw(_("This shift is not open"))
	if o.user != frappe.session.user and not frappe.has_permission("POS Closing Entry", "create"):
		frappe.throw(_("This shift belongs to {0}").format(o.user), frappe.PermissionError)
	return o


def _build(opening, customer, items, discount_amount=0, remarks=None, price_list=None):
	o = _opening(opening)
	prof = frappe.get_cached_doc("POS Profile", o.pos_profile)
	lines = _loads(items, [])
	if not lines:
		frappe.throw(_("The basket is empty"))

	dt = _invoice_type()
	doc = frappe.new_doc(dt)
	doc.update({
		"company": o.company, "customer": customer or prof.customer, "is_pos": 1, "pos_profile": prof.name,
		"posting_date": nowdate(), "set_posting_time": 0, "update_stock": cint(prof.update_stock),
		"selling_price_list": price_list or prof.selling_price_list, "currency": prof.currency, "ignore_pricing_rule": cint(prof.ignore_pricing_rule),
		"taxes_and_charges": prof.taxes_and_charges, "remarks": remarks or "",
		"cost_center": prof.cost_center, "write_off_account": prof.write_off_account, "write_off_cost_center": prof.write_off_cost_center,
		"account_for_change_amount": prof.account_for_change_amount or frappe.get_cached_value("Company", o.company, "default_cash_account"),
		"letter_head": prof.letter_head, "tc_name": prof.tc_name, "apply_discount_on": "Net Total",  # a till discount comes off before VAT, so VAT is charged on what the customer really pays
	})
	if prof.update_stock and prof.warehouse:
		doc.set_warehouse = prof.warehouse
	if dt == "Sales Invoice":
		doc.is_created_using_pos = 1  # lets the closing entry pick it up
	for l in lines:
		row = {"item_code": l["item_code"], "qty": flt(l.get("qty")) or 1}
		if l.get("uom"):
			row["uom"] = l["uom"]
		if prof.warehouse and prof.update_stock:
			row["warehouse"] = prof.warehouse
		if prof.income_account:
			row["income_account"] = prof.income_account
		if l.get("rate") not in (None, "") and cint(prof.allow_rate_change):
			row["rate"] = flt(l["rate"])
		if l.get("discount_percentage") and cint(prof.allow_discount_change):
			row["discount_percentage"] = flt(l["discount_percentage"])
		doc.append("items", row)
	if flt(discount_amount) and cint(prof.allow_discount_change):
		doc.discount_amount = flt(discount_amount)

	doc.set_missing_values()
	doc.apply_discount_on = "Net Total"  # set_missing_values copies the profile's setting over ours
	doc.disable_rounded_total = 0  # the till always rounds the bill off to a whole amount
	doc.calculate_taxes_and_totals()
	return doc, prof


@frappe.whitelist()
def customer_price_list(customer, pos_profile=None):
	"""The price list ERPNext would use for this customer: their own, else their group's, else the counter's."""
	if not frappe.has_permission("Customer", "read", customer):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	c = frappe.db.get_value("Customer", customer, ["default_price_list", "customer_group"], as_dict=True) or {}
	pl = c.get("default_price_list")
	if not pl and c.get("customer_group"):
		pl = frappe.db.get_value("Customer Group", c["customer_group"], "default_price_list")
	if not pl and pos_profile:
		pl = frappe.db.get_value("POS Profile", pos_profile, "selling_price_list")
	return pl


@frappe.whitelist(methods=["POST"])
def price(opening, customer, items, discount_amount=0, price_list=None):
	"""Totals for the basket (prices, VAT, rounding) without saving anything."""
	doc, _prof = _build(opening, customer, items, discount_amount, price_list=price_list)
	return {
		"lines": [{"item_code": i.item_code, "rate": flt(i.rate), "amount": flt(i.amount)} for i in doc.items],
		"subtotal": flt(doc.total), "net_total": flt(doc.net_total), "taxes": flt(doc.total_taxes_and_charges), "discount": flt(doc.discount_amount),
		"grand_total": flt(doc.grand_total), "round_off": flt(doc.rounding_adjustment), "total": flt(doc.rounded_total or doc.grand_total),
	}


@frappe.whitelist(methods=["POST"])
def checkout(opening, customer, items, payments, discount_amount=0, remarks=None, price_list=None):
	"""items: JSON [{item_code, qty, rate?, uom?, discount_percentage?}], payments: JSON [{mode_of_payment, amount}]"""
	doc, prof = _build(opening, customer, items, discount_amount, remarks, price_list)
	pays = [p for p in _loads(payments, []) if flt(p.get("amount")) > 0]
	allowed = {m.mode_of_payment for m in prof.payments}
	total = flt(doc.rounded_total or doc.grand_total)
	paid = 0
	doc.set("payments", [])
	for p in pays:
		if p["mode_of_payment"] not in allowed:
			frappe.throw(_("{0} is not a payment method of {1}").format(p["mode_of_payment"], prof.name))
		doc.append("payments", {"mode_of_payment": p["mode_of_payment"], "amount": flt(p["amount"])})
		paid += flt(p["amount"])
	if paid + 0.005 < total and not cint(prof.allow_partial_payment):
		frappe.throw(_("Payment {0} is less than the total {1}").format(flt(paid, 2), flt(total, 2)))
	doc.paid_amount = paid
	doc.calculate_taxes_and_totals()
	doc.insert()
	# Submit a fresh copy from the database so the version log doesn't record
	# in-memory blanks (None vs 0.0) as edits made by Administrator.
	doc = frappe.get_doc(doc.doctype, doc.name)
	doc.submit()
	return {"name": doc.name, "doctype": doc.doctype, "grand_total": doc.grand_total, "rounded_total": doc.rounded_total, "paid": paid, "change": flt(doc.change_amount), "customer": doc.customer, "customer_name": doc.customer_name}


@frappe.whitelist()
def shift_summary(opening):
	"""What the till should hold per payment mode right now, plus the day's takings."""
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening

	o = _opening(opening)
	c = make_closing_entry_from_opening(o)
	opening_by_mode = {d.mode_of_payment: flt(d.opening_amount) for d in o.balance_details}
	modes = {}
	for p in c.payment_reconciliation:
		modes[p.mode_of_payment] = flt(p.expected_amount)
	for m, a in opening_by_mode.items():
		modes.setdefault(m, 0)
	return {
		"opening": o.name, "pos_profile": o.pos_profile, "started": o.period_start_date, "invoices": len(c.pos_invoices) + len(c.sales_invoices),
		"grand_total": flt(c.grand_total), "net_total": flt(c.net_total), "taxes": flt(c.total_taxes_and_charges),
		"modes": [{"mode_of_payment": m, "opening": opening_by_mode.get(m, 0), "sales": modes[m], "expected": opening_by_mode.get(m, 0) + modes[m]} for m in modes],
	}


@frappe.whitelist(methods=["POST"])
def close_shift(opening, counted=None):
	"""counted: JSON {mode_of_payment: closing_amount}. Creates and submits the POS Closing Entry."""
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening

	o = _opening(opening)
	counted = _loads(counted, {})
	c = make_closing_entry_from_opening(o)
	opening_by_mode = {d.mode_of_payment: flt(d.opening_amount) for d in o.balance_details}
	seen = set()
	for r in c.payment_reconciliation:
		seen.add(r.mode_of_payment)
		r.opening_amount = opening_by_mode.get(r.mode_of_payment, 0)
		r.expected_amount = flt(r.expected_amount) + r.opening_amount
		r.closing_amount = flt(counted.get(r.mode_of_payment, r.expected_amount))
		r.difference = r.closing_amount - r.expected_amount
	for m, a in opening_by_mode.items():
		if m not in seen:
			c.append("payment_reconciliation", {"mode_of_payment": m, "opening_amount": a, "expected_amount": a, "closing_amount": flt(counted.get(m, a)), "difference": flt(counted.get(m, a)) - a})
	c.insert()
	c.submit()
	return {"name": c.name, "status": c.status, "grand_total": c.grand_total, "differences": [{"mode_of_payment": r.mode_of_payment, "difference": flt(r.difference)} for r in c.payment_reconciliation if flt(r.difference)]}
