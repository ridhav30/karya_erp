"""Receivables and payables, one party at a time.

  balances()       customers (receive) or suppliers (pay) that owe / are owed, with overdue and advance, paged
  open_invoices()  one party's open invoices and what is left to allocate
  settle()         record a payment: a Payment Entry (Receive from a customer / Pay to a supplier) that
                   allocates the amount to chosen invoices, oldest first when none are chosen; whatever
                   is left over stays on the party as an advance
  history()        a party's (or everybody's) payments, paged, with the invoices each one settled

Plain ERPNext documents only: Sales/Purchase Invoice for what is open, Payment Entry for what was paid.
No custom fields or doctypes.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

SIDES = {
	"receive": {"party_type": "Customer", "invoice": "Sales Invoice", "name_field": "customer_name", "party_field": "customer", "pe_type": "Receive"},
	"pay": {"party_type": "Supplier", "invoice": "Purchase Invoice", "name_field": "supplier_name", "party_field": "supplier", "pe_type": "Pay"},
}


# Only invoices that are in the accounts count. History imports are saved without ledger entries
# (see importer._history_invoice) so they never add to what a party owes.
_POSTED = "exists (select 1 from `tabPayment Ledger Entry` ple where ple.voucher_type = '{inv}' and ple.voucher_no = `tab{inv}`.name and ple.delinked = 0)"


def _side(side):
	if side not in SIDES:
		frappe.throw(_("Unknown side {0}").format(side))
	return SIDES[side]


def _company(company=None):
	company = company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		frappe.throw(_("No company found"))
	return company


def _need(doctype, ptype="read"):
	if not frappe.has_permission(doctype, ptype):
		frappe.throw(_("You do not have permission to {0} {1}").format(_(ptype), _(doctype)), frappe.PermissionError)


def _like(q):
	return f"%{q.strip()}%" if q and q.strip() else None


@frappe.whitelist()
def balances(side, company=None, search=None, start=0, page_length=20, include_settled=0):
	"""One row per party: outstanding, overdue, open invoice count, advance on account, last payment."""
	s = _side(side)
	_need(s["invoice"])
	company = _company(company)
	start, page_length = cint(start), min(cint(page_length) or 20, 200)
	inv, pf, nf = s["invoice"], s["party_field"], s["name_field"]
	like = _like(search)
	cond = f"and (`{pf}` like %(q)s or `{nf}` like %(q)s)" if like else ""
	having = "" if cint(include_settled) else "having outstanding > 0.005"
	values = {"company": company, "today": nowdate(), "q": like, "pt": s["party_type"], "start": start, "n": page_length}
	base = f"""
		select `{pf}` as party, max(`{nf}`) as party_name, sum(outstanding_amount) as outstanding,
			sum(case when outstanding_amount > 0 and due_date < %(today)s then outstanding_amount else 0 end) as overdue,
			sum(case when outstanding_amount > 0 then 1 else 0 end) as open_invoices,
			min(case when outstanding_amount > 0 then due_date end) as oldest_due
		from `tab{inv}` where docstatus = 1 and company = %(company)s and outstanding_amount != 0 {cond}
			and {_POSTED.format(inv=inv)}
		group by `{pf}` {having}"""
	totals = frappe.db.sql(f"select count(*), coalesce(sum(outstanding), 0), coalesce(sum(overdue), 0) from ({base}) t", values)[0]
	rows = frappe.db.sql(f"{base} order by outstanding desc, party limit %(n)s offset %(start)s", values, as_dict=True)

	parties = [r.party for r in rows]
	if parties:
		adv = {r.party: r.adv for r in frappe.db.sql(
			"""select party, sum(unallocated_amount) as adv from `tabPayment Entry`
			where docstatus = 1 and company = %s and party_type = %s and party in %s group by party""",
			(company, s["party_type"], parties), as_dict=True)}
		last = {r.party: r for r in frappe.db.sql(
			"""select party, max(posting_date) as last_date, count(*) as payments from `tabPayment Entry`
			where docstatus = 1 and company = %s and party_type = %s and party in %s and payment_type = %s group by party""",
			(company, s["party_type"], parties, s["pe_type"]), as_dict=True)}
		for r in rows:
			r.advance = flt(adv.get(r.party))
			r.last_payment = last.get(r.party) and last[r.party].last_date
			r.payments = last.get(r.party) and last[r.party].payments or 0
	return {
		"rows": rows, "total": cint(totals[0]), "outstanding": flt(totals[1]), "overdue": flt(totals[2]),
		"start": start, "page_length": page_length, "company": company, "party_type": s["party_type"],
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
	}


@frappe.whitelist()
def open_invoices(side, party, company=None):
	"""A party's open invoices (oldest first) plus the figures the payment form needs."""
	s = _side(side)
	_need(s["invoice"])
	company = _company(company)
	if not frappe.db.exists(s["party_type"], party):
		frappe.throw(_("{0} {1} does not exist").format(_(s["party_type"]), party))
	posted = frappe.db.sql_list(
		"select distinct voucher_no from `tabPayment Ledger Entry` where voucher_type = %s and party_type = %s and party = %s and company = %s and delinked = 0",
		(s["invoice"], s["party_type"], party, company),
	)
	rows = frappe.get_all(
		s["invoice"],
		filters={"docstatus": 1, "company": company, s["party_field"]: party, "outstanding_amount": ["!=", 0], "name": ["in", posted or [""]]},
		fields=["name", "posting_date", "due_date", "bill_no" if side == "pay" else "po_no as bill_no", "grand_total", "outstanding_amount", "is_return", "currency"],
		order_by="due_date asc, posting_date asc, name asc", limit_page_length=500,
	)
	today = getdate(nowdate())
	for r in rows:
		r.days_overdue = max(0, (today - getdate(r.due_date)).days) if r.due_date and r.outstanding_amount > 0 else 0
	advance = frappe.db.sql(
		"select coalesce(sum(unallocated_amount), 0) from `tabPayment Entry` where docstatus = 1 and company = %s and party_type = %s and party = %s",
		(company, s["party_type"], party),
	)[0][0]
	positive = [r for r in rows if r.outstanding_amount > 0]
	return {
		"party": party, "party_name": frappe.db.get_value(s["party_type"], party, f"{s['party_type'].lower()}_name"),
		"party_type": s["party_type"], "invoices": rows, "company": company,
		"outstanding": flt(sum(r.outstanding_amount for r in rows)), "payable_now": flt(sum(r.outstanding_amount for r in positive)),
		"overdue": flt(sum(r.outstanding_amount for r in positive if r.days_overdue)),
		"advance": flt(advance), "currency": frappe.get_cached_value("Company", company, "default_currency"),
		"modes": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name", order_by="name"),
	}


def _allocations(pe, side, party, company, amount, chosen):
	"""(reference row, amount) pairs for the payment: the chosen invoices, else oldest first up to the amount.
	Rows come from ERPNext's own outstanding list so invoices split by payment terms are allocated term by term."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_outstanding_reference_documents

	s = SIDES[side]
	rows = get_outstanding_reference_documents({
		"posting_date": pe.posting_date, "company": company, "party_type": s["party_type"], "payment_type": s["pe_type"],
		"party": party, "party_account": pe.paid_from if s["pe_type"] == "Receive" else pe.paid_to,
		"get_outstanding_invoices": True, "get_orders_to_be_billed": False,
	})
	rows = [frappe._dict(r) for r in rows if r.get("voucher_type") == s["invoice"] and flt(r.get("outstanding_amount")) > 0]
	rows.sort(key=lambda r: (str(r.get("due_date") or r.get("posting_date") or ""), str(r.get("posting_date") or ""), r.voucher_no))
	if chosen:
		cap = {}
		for c in chosen:
			if flt(c.get("amount")) > 0:
				cap[c.get("invoice")] = cap.get(c.get("invoice"), 0) + flt(c.get("amount"))
		known = {r.voucher_no for r in rows}
		for inv in cap:
			if inv not in known:
				frappe.throw(_("{0} is not an open invoice of {1}").format(inv, party))
		if sum(cap.values()) > flt(amount) + 0.005:
			frappe.throw(_("The invoices add up to more than the amount paid"))
	else:
		cap = None
	out, left = [], flt(amount)
	for r in rows:
		want = left if cap is None else min(left, cap.get(r.voucher_no, 0))
		take = min(want, flt(r.outstanding_amount))
		if take <= 0.005:
			continue
		out.append((r, take))
		left -= take
		if cap is not None:
			cap[r.voucher_no] -= take
	return out


@frappe.whitelist(methods=["POST"])
def settle(side, party, amount, mode_of_payment, posting_date=None, reference_no=None, reference_date=None,
           allocations=None, remarks=None, company=None, submit=1):
	"""Record a payment. Returns the Payment Entry name and how the amount was split."""
	s = _side(side)
	_need("Payment Entry", "create")
	company = _company(company)
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Enter an amount above zero"))
	if not mode_of_payment:
		frappe.throw(_("Choose a mode of payment"))
	if not frappe.db.exists(s["party_type"], party):
		frappe.throw(_("{0} {1} does not exist").format(_(s["party_type"]), party))
	chosen = json.loads(allocations) if isinstance(allocations, str) and allocations else (allocations or [])
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	account = get_bank_cash_account(mode_of_payment, company)["account"]
	currency = frappe.get_cached_value("Company", company, "default_currency")
	if frappe.get_cached_value("Account", account, "account_currency") not in (None, "", currency):
		frappe.throw(_("{0} is in a different currency than the company. Record this one from Payments.").format(account))

	pe = frappe.new_doc("Payment Entry")
	pe.update({
		"payment_type": s["pe_type"], "company": company, "posting_date": posting_date or nowdate(),
		"mode_of_payment": mode_of_payment, "party_type": s["party_type"], "party": party,
		"reference_no": reference_no or None, "reference_date": reference_date or posting_date or nowdate(),
		"remarks": remarks or None,
	})
	pe.setup_party_account_field()
	pe.set_missing_values()
	if s["pe_type"] == "Receive":
		pe.paid_to = account
	else:
		pe.paid_from = account
	pe.paid_amount = pe.received_amount = amount
	pe.source_exchange_rate = pe.target_exchange_rate = 1
	rows = _allocations(pe, side, party, company, amount, chosen)
	for r, take in rows:
		pe.append("references", {
			"reference_doctype": s["invoice"], "reference_name": r.voucher_no, "total_amount": r.get("invoice_amount"),
			"outstanding_amount": r.outstanding_amount, "allocated_amount": take, "due_date": r.get("due_date"),
			"payment_term": r.get("payment_term"), "exchange_rate": r.get("exchange_rate") or 1,
		})
	pe.insert()
	if cint(submit):
		pe.submit()
	allocated = flt(sum(t for _r, t in rows))
	return {
		"name": pe.name, "docstatus": pe.docstatus, "amount": amount, "allocated": allocated,
		"advance": flt(amount - allocated), "invoices": [{"invoice": r.voucher_no, "amount": t} for r, t in rows],
	}


@frappe.whitelist()
def history(side, party=None, company=None, from_date=None, to_date=None, status="Submitted", search=None, start=0, page_length=20):
	"""Payments to or from parties, newest first, paged. With `party`, only that party's."""
	s = _side(side)
	_need("Payment Entry")
	company = _company(company)
	start, page_length = cint(start), min(cint(page_length) or 20, 200)
	filters = {"company": company, "party_type": s["party_type"], "payment_type": s["pe_type"]}
	if party:
		filters["party"] = party
	filters["docstatus"] = {"Submitted": 1, "Cancelled": 2, "Draft": 0}.get(status, ["in", [1, 2]])
	if from_date:
		filters["posting_date"] = [">=", from_date]
	if to_date:
		filters["posting_date"] = ["between", [from_date, to_date]] if from_date else ["<=", to_date]
	or_filters = None
	if search and search.strip():
		q = f"%{search.strip()}%"
		or_filters = {"name": ["like", q], "party": ["like", q], "party_name": ["like", q], "reference_no": ["like", q]}
	# The database counts and slices: only the requested page is ever read into memory.
	total = cint(frappe.get_all("Payment Entry", filters=filters, or_filters=or_filters, fields=[{"COUNT": "name", "as": "n"}])[0].n)
	rows = frappe.get_all(
		"Payment Entry", filters=filters, or_filters=or_filters,
		fields=["name", "posting_date", "party", "party_name", "mode_of_payment", "paid_amount", "unallocated_amount", "total_allocated_amount",
			"reference_no", "reference_date", "docstatus", "remarks", "paid_from", "paid_to"],
		order_by="posting_date desc, creation desc", start=start, page_length=page_length,
	)
	refs = {}
	if rows:
		for r in frappe.get_all("Payment Entry Reference", filters={"parent": ["in", [r.name for r in rows]]}, fields=["parent", "reference_doctype", "reference_name", "allocated_amount"], order_by="idx"):
			refs.setdefault(r.parent, []).append(r)
	for r in rows:
		r.references = refs.get(r.name, [])
	paid = frappe.get_all("Payment Entry", filters={**filters, "docstatus": 1}, or_filters=or_filters, fields=[{"SUM": "paid_amount", "as": "t"}])
	return {
		"rows": rows, "total": total, "start": start, "page_length": page_length,
		"paid_total": flt(paid and paid[0].t),
		"currency": frappe.get_cached_value("Company", company, "default_currency"), "party_type": s["party_type"], "company": company,
	}


@frappe.whitelist()
def party_summary(party_type, party, company=None):
	"""The figures at the top of a customer's / supplier's Payments tab."""
	side = "receive" if party_type == "Customer" else "pay" if party_type == "Supplier" else None
	if not side:
		frappe.throw(_("Only customers and suppliers have a payment account"))
	s = SIDES[side]
	company = _company(company)
	o = open_invoices(side, party, company)
	posted = frappe.db.sql_list(
		"select distinct voucher_no from `tabPayment Ledger Entry` where voucher_type = %s and party_type = %s and party = %s and company = %s and delinked = 0",
		(s["invoice"], s["party_type"], party, company),
	)
	billed = frappe.db.sql(
		f"select coalesce(sum(grand_total), 0), count(*) from `tab{s['invoice']}` where docstatus = 1 and is_return = 0 and company = %s and `{s['party_field']}` = %s and name in %s",
		(company, party, posted or [""]),
	)[0]
	paid = frappe.db.sql(
		"""select coalesce(sum(paid_amount), 0), count(*), max(posting_date) from `tabPayment Entry`
		where docstatus = 1 and company = %s and party_type = %s and party = %s and payment_type = %s""",
		(company, s["party_type"], party, s["pe_type"]),
	)[0]
	return {
		"side": side, "party": party, "currency": o["currency"], "company": company,
		"outstanding": o["outstanding"], "overdue": o["overdue"], "advance": o["advance"],
		"billed": flt(billed[0]), "invoices": cint(billed[1]),
		"paid": flt(paid[0]), "payments": cint(paid[1]), "last_payment": paid[2],
		"open": [i for i in o["invoices"]][:10], "open_count": len(o["invoices"]),
	}
