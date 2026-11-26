"""Read-only accounts helpers for the Karya Erp React UI.

Everything is computed from standard ERPNext data (Account, GL Entry, Sales/Purchase Invoice,
Payment Entry). No custom doctypes, nothing is written.
"""

import frappe
from frappe import _
from frappe.utils import add_months, flt, get_first_day, getdate, nowdate


# ---------------------------------------------------------------- helpers

def _company(company=None):
	company = company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if not company:
		frappe.throw(_("Set a default company first (Setup > Global Defaults)."))
	from frappe.permissions import get_user_permissions

	allowed = [p.get("doc") for p in get_user_permissions(frappe.session.user).get("Company", [])]
	if allowed and company not in allowed:  # user is restricted to certain companies
		frappe.throw(_("Not permitted for company {0}").format(company), frappe.PermissionError)
	return company


def _require(doctype):
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted to read {0}").format(_(doctype)), frappe.PermissionError)


def _can(doctype):
	try:
		return bool(frappe.has_permission(doctype, "read"))
	except Exception:
		return False


def _gl_balances(company, accounts=None, to_date=None):
	"""{account: debit - credit} from posted GL entries."""
	conditions = ["company = %(company)s", "is_cancelled = 0"]
	values = {"company": company}
	if accounts is not None:
		if not accounts:
			return {}
		conditions.append("account in %(accounts)s")
		values["accounts"] = tuple(accounts)
	if to_date:
		conditions.append("posting_date <= %(to_date)s")
		values["to_date"] = to_date
	rows = frappe.db.sql(
		f"""select account, sum(debit) - sum(credit)
		from `tabGL Entry` where {' and '.join(conditions)} group by account""",
		values,
	)
	return {r[0]: flt(r[1]) for r in rows}


# ---------------------------------------------------------------- context

@frappe.whitelist()
def context(company=None):
	"""Company, currency and fiscal year for report filters."""
	company = _company(company)
	today = nowdate()
	fiscal_year = None
	try:
		from erpnext.accounts.utils import get_fiscal_year

		fy = get_fiscal_year(today, company=company, as_dict=True)
		fiscal_year = {"name": fy.name, "start": str(fy.year_start_date), "end": str(fy.year_end_date)}
	except Exception:
		pass

	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"today": today,
		"fiscal_year": fiscal_year,
		"fiscal_years": frappe.get_all(
			"Fiscal Year", filters={"disabled": 0}, pluck="name", order_by="year_start_date desc"
		),
	}


# ---------------------------------------------------------------- chart of accounts

@frappe.whitelist()
def chart_of_accounts(company=None):
	"""All accounts of a company in tree order with their balance (groups = sum of children)."""
	company = _company(company)
	accounts = frappe.get_list(
		"Account",
		filters={"company": company},
		fields=[
			"name", "account_name", "account_number", "parent_account", "is_group", "root_type",
			"report_type", "account_type", "account_currency", "disabled", "freeze_account", "lft", "rgt",
		],
		order_by="lft asc",
		limit_page_length=0,
	)
	balances = _gl_balances(company) if _can("GL Entry") else {}

	by_name = {a.name: a for a in accounts}
	for a in accounts:
		a["balance"] = 0.0 if a.is_group else balances.get(a.name, 0.0)
	# Children come after parents in lft order: walk backwards and push each total up one level.
	for a in reversed(accounts):
		parent = by_name.get(a.parent_account)
		if parent:
			parent["balance"] += a["balance"]

	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"show_balances": bool(balances) or _can("GL Entry"),
		"accounts": accounts,
	}


# ---------------------------------------------------------------- dashboard

@frappe.whitelist()
def dashboard(company=None):
	"""Numbers for the Accounts overview page. A section is None when the user can't read its source."""
	company = _company(company)
	today = getdate(nowdate())
	currency = frappe.get_cached_value("Company", company, "default_currency")
	out = {"company": company, "currency": currency, "today": str(today)}

	def outstanding(doctype):
		if not _can(doctype):
			return None
		row = frappe.db.sql(
			f"""select
				coalesce(sum(outstanding_amount), 0),
				coalesce(sum(case when due_date < %(today)s and outstanding_amount > 0 then outstanding_amount else 0 end), 0),
				coalesce(sum(case when due_date < %(today)s and outstanding_amount > 0 then 1 else 0 end), 0)
			from `tab{doctype}` where docstatus = 1 and company = %(company)s""",
			{"company": company, "today": today},
		)[0]
		return {"total": flt(row[0]), "overdue": flt(row[1]), "overdue_count": int(row[2] or 0)}

	out["receivable"] = outstanding("Sales Invoice")
	out["payable"] = outstanding("Purchase Invoice")

	# Receivable ageing by days past due date.
	if _can("Sales Invoice"):
		rows = frappe.db.sql(
			"""select due_date, outstanding_amount from `tabSales Invoice`
			where docstatus = 1 and company = %(company)s and outstanding_amount > 0""",
			{"company": company},
		)
		buckets = {"Not due": 0.0, "1-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
		for due, amount in rows:
			days = (today - getdate(due)).days if due else 0
			key = "Not due" if days <= 0 else "1-30" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"
			buckets[key] += flt(amount)
		out["ageing"] = [{"label": k, "amount": v} for k, v in buckets.items()]
	else:
		out["ageing"] = None

	# Cash & bank balances + 6 months of income vs expense from the general ledger.
	if _can("GL Entry") and _can("Account"):
		banks = frappe.get_all(
			"Account",
			filters={"company": company, "is_group": 0, "disabled": 0, "account_type": ["in", ["Bank", "Cash"]]},
			fields=["name", "account_name", "account_type", "account_currency"],
			order_by="account_type, account_name",
		)
		bal = _gl_balances(company, [b.name for b in banks])
		for b in banks:
			b["balance"] = bal.get(b.name, 0.0)
		out["cash_bank"] = banks

		start = get_first_day(add_months(today, -5))
		rows = frappe.db.sql(
			"""select extract(year from gle.posting_date) as y, extract(month from gle.posting_date) as m,
				acc.root_type, sum(gle.debit) - sum(gle.credit)
			from `tabGL Entry` gle join `tabAccount` acc on acc.name = gle.account
			where gle.company = %(company)s and gle.is_cancelled = 0 and gle.posting_date >= %(start)s
				and acc.root_type in ('Income', 'Expense')
			group by y, m, acc.root_type""",
			{"company": company, "start": start},
		)
		months = []
		cursor = start
		for _i in range(6):
			months.append({"key": f"{cursor.year}-{cursor.month:02d}", "income": 0.0, "expense": 0.0})
			cursor = add_months(cursor, 1)
		index = {m["key"]: m for m in months}
		for y, m, root_type, amount in rows:
			slot = index.get(f"{int(y)}-{int(m):02d}")
			if not slot:
				continue
			if root_type == "Income":
				slot["income"] += -flt(amount)  # income is a credit balance
			else:
				slot["expense"] += flt(amount)
		out["income_expense"] = months
	else:
		out["cash_bank"] = None
		out["income_expense"] = None

	out["overdue_invoices"] = (
		frappe.get_list(
			"Sales Invoice",
			filters={"docstatus": 1, "company": company, "outstanding_amount": [">", 0], "due_date": ["<", today]},
			fields=["name", "customer_name", "due_date", "outstanding_amount", "currency"],
			order_by="due_date asc",
			limit_page_length=6,
		)
		if _can("Sales Invoice")
		else None
	)
	out["recent_payments"] = (
		frappe.get_list(
			"Payment Entry",
			filters={"docstatus": 1, "company": company},
			fields=["name", "payment_type", "party_name", "posting_date", "paid_amount", "paid_from_account_currency as currency", "mode_of_payment"],
			order_by="posting_date desc, creation desc",
			limit_page_length=6,
		)
		if _can("Payment Entry")
		else None
	)
	out["drafts"] = {
		dt: frappe.db.count(dt, {"docstatus": 0, "company": company})
		for dt in ("Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry")
		if _can(dt)
	}
	return out


# ---------------------------------------------------------------- UAE VAT return

@frappe.whitelist()
def vat_return(from_date, to_date, company=None):
	"""VAT 201-style summary from submitted invoices (credit/debit notes are negative, so they net off).

	Standard-rated = invoices that carry tax; zero-rated / exempt = invoices without tax.
	"""
	company = _company(company)
	if getdate(from_date) > getdate(to_date):
		frappe.throw(_("From date must be before to date."))
	values = {"company": company, "from_date": from_date, "to_date": to_date}

	def side(doctype, tax_table):
		if not _can(doctype):
			return None
		totals = frappe.db.sql(
			f"""select
				coalesce(sum(case when base_total_taxes_and_charges != 0 then base_net_total else 0 end), 0),
				coalesce(sum(case when base_total_taxes_and_charges != 0 then base_total_taxes_and_charges else 0 end), 0),
				coalesce(sum(case when base_total_taxes_and_charges = 0 then base_net_total else 0 end), 0),
				count(*),
				coalesce(sum(case when is_return = 1 then 1 else 0 end), 0)
			from `tab{doctype}`
			where docstatus = 1 and company = %(company)s and posting_date between %(from_date)s and %(to_date)s""",
			values,
		)[0]
		sign = "case when t.add_deduct_tax = 'Deduct' then -1 else 1 end *" if doctype == "Purchase Invoice" else ""
		by_account = frappe.db.sql(
			f"""select t.account_head, sum({sign} t.base_tax_amount_after_discount_amount)
			from `tab{tax_table}` t join `tab{doctype}` d on d.name = t.parent
			where t.parenttype = %(parenttype)s and d.docstatus = 1 and d.company = %(company)s
				and d.posting_date between %(from_date)s and %(to_date)s
			group by t.account_head order by t.account_head""",
			{**values, "parenttype": doctype},
		)
		return {
			"standard_amount": flt(totals[0]),
			"standard_vat": flt(totals[1]),
			"zero_exempt_amount": flt(totals[2]),
			"documents": int(totals[3] or 0),
			"returns": int(totals[4] or 0),
			"by_account": [{"account": r[0], "amount": flt(r[1])} for r in by_account],
		}

	sales = side("Sales Invoice", "Sales Taxes and Charges")
	purchases = side("Purchase Invoice", "Purchase Taxes and Charges")
	output_vat = sales["standard_vat"] if sales else 0.0
	input_vat = purchases["standard_vat"] if purchases else 0.0
	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"trn": frappe.get_cached_value("Company", company, "tax_id"),
		"from_date": from_date,
		"to_date": to_date,
		"sales": sales,
		"purchases": purchases,
		"output_vat": output_vat,
		"input_vat": input_vat,
		"net_vat": output_vat - input_vat,
	}
