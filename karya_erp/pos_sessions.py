"""POS sessions (shifts): the list the Point of Sale opens on, and one session's takings.

  sessions()         POS Opening Entries, paged by the server, filtered by status / counter / cashier / dates,
                     each with its sales so far and whether it is still open
  session_detail()   one session: counter, cashier, times, opening and counted cash, sales by payment method,
                     and its invoices (paged, with a date filter)

A cashier sees their own sessions; anyone who may create POS Closing Entries (a manager) sees everybody's.
Sales of a session are the POS invoices its cashier made on that counter between the opening and the closing
(or now, while it is open). Plain ERPNext documents only; no custom fields.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now

from karya_erp.pos import _invoice_type


def _is_manager():
	return bool(frappe.has_permission("POS Closing Entry", "create"))


def _join(inv):
	"""FROM ... for 'session o' with its closing entry c and the invoices i made in it."""
	pos = " and i.is_pos = 1" if inv == "Sales Invoice" else ""
	return f"""from `tabPOS Opening Entry` o
		left join `tabPOS Closing Entry` c on c.name = o.pos_closing_entry and c.docstatus = 1
		left join `tab{inv}` i on i.pos_profile = o.pos_profile and i.owner = o.user and i.docstatus = 1{pos}
			and i.creation >= o.period_start_date and i.creation <= coalesce(c.period_end_date, %(now)s)"""


def _where(user, status, pos_profile, from_date, to_date, search):
	cond, v = ["o.docstatus = 1"], {"now": now()}
	if not _is_manager():
		user = frappe.session.user
	if user:
		cond.append("o.user = %(user)s")
		v["user"] = user
	if status in ("Open", "Closed"):
		cond.append("o.status = %(status)s")
		v["status"] = status
	if pos_profile:
		cond.append("o.pos_profile = %(profile)s")
		v["profile"] = pos_profile
	if from_date:
		cond.append("date(o.period_start_date) >= %(from)s")
		v["from"] = getdate(from_date)
	if to_date:
		cond.append("date(o.period_start_date) <= %(to)s")
		v["to"] = getdate(to_date)
	if search and search.strip():
		cond.append("(o.name like %(q)s or o.pos_profile like %(q)s or o.user like %(q)s)")
		v["q"] = f"%{search.strip()}%"
	return " and ".join(cond), v


@frappe.whitelist()
def sessions(user=None, status=None, pos_profile=None, from_date=None, to_date=None, search=None, start=0, page_length=20):
	"""One page of sessions, newest first, plus totals over everything the filters match."""
	if not frappe.has_permission("POS Opening Entry", "read"):
		frappe.throw(_("You do not have permission to see POS sessions"), frappe.PermissionError)
	inv = _invoice_type()
	start, page_length = cint(start), min(cint(page_length) or 20, 100)
	where, v = _where(user, status, pos_profile, from_date, to_date, search)
	join = _join(inv)

	n, open_n = frappe.db.sql(f"select count(*), coalesce(sum(o.status = 'Open'), 0) from `tabPOS Opening Entry` o where {where}", v)[0]
	tot = frappe.db.sql(f"select count(i.name), coalesce(sum(i.grand_total), 0) {join} where {where}", v)[0]

	rows = frappe.db.sql(
		f"""select o.name, o.pos_profile, o.user, o.company, o.status, o.period_start_date, o.pos_closing_entry,
			c.period_end_date as period_end_date
		from `tabPOS Opening Entry` o left join `tabPOS Closing Entry` c on c.name = o.pos_closing_entry and c.docstatus = 1
		where {where} order by o.period_start_date desc, o.name desc limit %(n)s offset %(s)s""",
		{**v, "n": page_length, "s": start}, as_dict=True,
	)
	if rows:
		sales = {r.name: r for r in frappe.db.sql(
			f"select o.name, count(i.name) as invoices, coalesce(sum(i.grand_total), 0) as sales {join} where o.name in %(names)s group by o.name",
			{**v, "names": [r.name for r in rows]}, as_dict=True)}
		names = {r.name: r.full_name for r in frappe.get_all("User", filters={"name": ["in", list({r.user for r in rows})]}, fields=["name", "full_name"])}
		for r in rows:
			s = sales.get(r.name)
			r.invoices, r.sales = (cint(s.invoices), flt(s.sales)) if s else (0, 0.0)
			r.user_name = names.get(r.user) or r.user
			r.mine = r.user == frappe.session.user
	return {
		"rows": rows, "total": cint(n), "open": cint(open_n), "invoices": cint(tot[0]), "sales": flt(tot[1]),
		"start": start, "page_length": page_length, "manager": _is_manager(), "invoice_type": inv,
		"currency": frappe.db.get_value("Company", frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company"), "default_currency"),
	}


@frappe.whitelist()
def session_detail(opening, from_date=None, to_date=None, search=None, start=0, page_length=20):
	"""One session's header, takings by payment method, and a page of its invoices."""
	o = frappe.get_doc("POS Opening Entry", opening)
	if o.user != frappe.session.user and not _is_manager():
		frappe.throw(_("This session belongs to {0}").format(o.user), frappe.PermissionError)
	inv = _invoice_type()
	start, page_length = cint(start), min(cint(page_length) or 20, 100)
	closing = frappe.get_doc("POS Closing Entry", o.pos_closing_entry) if o.pos_closing_entry and frappe.db.exists("POS Closing Entry", o.pos_closing_entry) else None
	end = closing.period_end_date if closing and closing.docstatus == 1 else None
	pos = " and is_pos = 1" if inv == "Sales Invoice" else ""
	base = f"pos_profile = %(profile)s and owner = %(user)s and docstatus = 1{pos} and creation >= %(from_dt)s and creation <= %(to_dt)s"
	v = {"profile": o.pos_profile, "user": o.user, "from_dt": o.period_start_date, "to_dt": end or now()}
	cond = base
	if from_date:
		cond += " and posting_date >= %(from)s"
		v["from"] = getdate(from_date)
	if to_date:
		cond += " and posting_date <= %(to)s"
		v["to"] = getdate(to_date)
	if search and search.strip():
		cond += " and (name like %(q)s or customer like %(q)s or customer_name like %(q)s)"
		v["q"] = f"%{search.strip()}%"

	t = frappe.db.sql(
		f"""select count(*), coalesce(sum(grand_total), 0), coalesce(sum(net_total), 0), coalesce(sum(total_taxes_and_charges), 0),
			coalesce(sum(is_return), 0), coalesce(sum(case when is_return = 1 then grand_total else 0 end), 0)
		from `tab{inv}` where {cond}""", v)[0]
	rows = frappe.db.sql(
		f"""select name, posting_date, posting_time, customer, customer_name, grand_total, paid_amount, change_amount, is_return, status
		from `tab{inv}` where {cond} order by creation desc limit %(n)s offset %(s)s""",
		{**v, "n": page_length, "s": start}, as_dict=True,
	)
	by_mode = frappe.db.sql(
		f"""select p.mode_of_payment, coalesce(sum(p.amount), 0) as amount, count(distinct p.parent) as invoices
		from `tabSales Invoice Payment` p join `tab{inv}` i on i.name = p.parent and p.parenttype = '{inv}'
		where i.pos_profile = %(profile)s and i.owner = %(user)s and i.docstatus = 1{pos.replace('is_pos', 'i.is_pos')} and i.creation >= %(from_dt)s and i.creation <= %(to_dt)s
		{"and i.posting_date >= %(from)s" if from_date else ""} {"and i.posting_date <= %(to)s" if to_date else ""}
		group by p.mode_of_payment order by amount desc""", v, as_dict=True,
	)
	currency = frappe.db.get_value("Company", o.company, "default_currency")
	return {
		"name": o.name, "pos_profile": o.pos_profile, "company": o.company, "user": o.user,
		"user_name": frappe.db.get_value("User", o.user, "full_name") or o.user,
		"status": o.status, "started": o.period_start_date, "ended": end, "closing_entry": o.pos_closing_entry, "mine": o.user == frappe.session.user,
		"can_close": o.status == "Open" and docstatus_ok(o) and (o.user == frappe.session.user or _is_manager()),
		"opening_balances": [{"mode_of_payment": d.mode_of_payment, "opening_amount": flt(d.opening_amount)} for d in o.balance_details],
		"closing": closing and [{"mode_of_payment": r.mode_of_payment, "opening": flt(r.opening_amount), "expected": flt(r.expected_amount), "counted": flt(r.closing_amount), "difference": flt(r.difference)} for r in closing.payment_reconciliation],
		"totals": {"invoices": cint(t[0]), "grand_total": flt(t[1]), "net_total": flt(t[2]), "taxes": flt(t[3]), "returns": cint(t[4]), "returns_total": flt(t[5])},
		"by_mode": [{"mode_of_payment": r.mode_of_payment, "amount": flt(r.amount), "invoices": cint(r.invoices)} for r in by_mode],
		"rows": rows, "total": cint(t[0]), "start": start, "page_length": page_length, "currency": currency, "invoice_type": inv,
	}


def docstatus_ok(o):
	return o.docstatus == 1
