"""Server-paged General Ledger and receivable / payable ageing for the Karya Erp UI.

ERPNext's reports build every row in Python before anything reaches the screen; with years of postings that
is slow and heavy. These answer from SQL, one page at a time, and give the whole-set figures (opening / totals /
closing, or invoiced / paid / outstanding and the ageing buckets) with the first page only.

  general-ledger                one row per posting, or per voucher and account ("Group by Voucher (Consolidated)"),
                                with a running balance that continues across pages
  accounts-receivable / -payable                 one row per open invoice (or unallocated payment)
  accounts-receivable-summary / -payable-summary one row per customer / supplier

Figures follow ERPNext's: outstanding comes from the Payment Ledger as on the report date, ageing is by due date
or posting date, balance-sheet accounts open from the beginning and profit-and-loss accounts from the fiscal year.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from karya_erp.stock_reports import EXPORT_PAGE, MAX_PAGE, _restricted, _search, _tree


def C(fieldname, label, fieldtype="Data", options=None, width=120):
	return {"fieldname": fieldname, "label": label, "fieldtype": fieldtype, "options": options, "width": width}


def _company(f):
	company = f.get("company") or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	limit = _restricted("Company")
	if limit and company not in limit:
		frappe.throw(_("You are not permitted to see {0}").format(company), frappe.PermissionError)
	return company


def _list(v):
	"""A filter value that may be one name or a list of them."""
	if v in (None, "", []):
		return []
	return [x for x in (v if isinstance(v, (list, tuple)) else [v]) if x]


# ---------------------------------------------------------------- general ledger

GL_COLUMNS = [
	C("posting_date", "Posting Date", "Date", width=95), C("account", "Account", "Link", "Account", 200),
	C("party_type", "Party Type", "Link", "Party Type", 90), C("party", "Party", "Dynamic Link", "party_type", 150),
	C("voucher_type", "Voucher Type", width=130), C("voucher_no", "Voucher #", "Dynamic Link", "voucher_type", 160),
	C("against", "Against", width=180), C("cost_center", "Cost Center", "Link", "Cost Center", 140), C("remarks", "Remarks", width=200),
	C("debit", "Debit", "Currency", width=110), C("credit", "Credit", "Currency", width=110), C("balance", "Balance", "Currency", width=120),
]


def _gl_where(f, company, search):
	"""(conditions, values) shared by the opening, page and total queries. Account groups include their children."""
	values = {"company": company}
	cond = ["g.company = %(company)s", "g.is_cancelled = 0"]
	accounts = _list(f.get("account"))
	if accounts:
		names = tuple({n for a in accounts for n in _tree("Account", a)}) or ("",)
		values["accounts"] = names
		cond.append("g.account in %(accounts)s")
	allowed = _restricted("Account")
	if allowed:
		values["ur_account"] = allowed
		cond.append("g.account in %(ur_account)s")
	if f.get("party_type"):
		values["party_type"] = f["party_type"]
		cond.append("g.party_type = %(party_type)s")
	parties = _list(f.get("party"))
	if parties:
		values["parties"] = tuple(parties)
		cond.append("g.party in %(parties)s")
	if f.get("voucher_no"):
		values["voucher_no"] = f["voucher_no"]
		cond.append("g.voucher_no = %(voucher_no)s")
	centers = _list(f.get("cost_center"))
	if centers:
		values["centers"] = tuple({n for c in centers for n in _tree("Cost Center", c)}) or ("",)
		cond.append("g.cost_center in %(centers)s")
	if f.get("project"):
		values["project"] = f["project"]
		cond.append("g.project = %(project)s")
	cond += _search(search, ["g.account", "g.party", "g.voucher_no", "g.remarks", "g.against"], values)
	return cond, values


def _opening(f, company, search):
	"""Debit - credit before the period. Profit-and-loss accounts open at the start of the fiscal year, the rest at the beginning."""
	from erpnext.accounts.utils import get_fiscal_year

	cond, values = _gl_where(f, company, search)
	try:
		values["fy_start"] = str(get_fiscal_year(f["from_date"], company=company)[1])
	except Exception:
		frappe.clear_last_message()
		values["fy_start"] = str(f["from_date"])
	values["from_date"], values["to_date"] = f["from_date"], f["to_date"]
	row = frappe.db.sql(
		f"""select coalesce(sum(case when a.report_type = 'Balance Sheet' or g.posting_date >= %(fy_start)s then g.debit - g.credit else 0 end), 0)
		from `tabGL Entry` g join `tabAccount` a on a.name = g.account
		where {" and ".join(cond)} and (g.posting_date < %(from_date)s or (g.is_opening = 'Yes' and g.posting_date <= %(to_date)s))""", values)
	return flt(row[0][0], 2)


def general_ledger(f, start, page_length, q, with_total):
	company = _company(f)
	if not (f.get("from_date") and f.get("to_date")):
		frappe.throw(_("From and To dates are required"))
	if getdate(f["from_date"]) > getdate(f["to_date"]):
		frappe.throw(_("From date is after the To date"))
	cond, values = _gl_where(f, company, q)
	# opening entries dated inside the period belong to the opening balance, as in ERPNext's report
	cond.append("g.posting_date between %(from_date)s and %(to_date)s and g.is_opening = 'No'")
	values.update({"from_date": f["from_date"], "to_date": f["to_date"]})
	where = " and ".join(cond)
	consolidated = (f.get("group_by") or "") == "Group by Voucher (Consolidated)"

	if consolidated:
		inner = f"""select g.posting_date, g.account, g.party_type, g.party, g.voucher_type, g.voucher_no, max(g.against) as against,
				max(g.cost_center) as cost_center, null as remarks, sum(g.debit) as debit, sum(g.credit) as credit
			from `tabGL Entry` g where {where}
			group by g.posting_date, g.voucher_type, g.voucher_no, g.account, g.party_type, g.party
			order by g.posting_date, g.voucher_no, g.account, g.party"""
	else:
		inner = f"""select g.posting_date, g.account, g.party_type, g.party, g.voucher_type, g.voucher_no, g.against, g.cost_center, g.remarks, g.debit, g.credit
			from `tabGL Entry` g where {where}
			order by g.posting_date, g.creation, g.name"""

	opening = _opening(f, company, q)
	# the balance carried into this page: opening plus everything on the pages before it
	carried = opening
	if start:
		carried += flt(frappe.db.sql(f"select coalesce(sum(t.debit - t.credit), 0) from ({inner} limit %(start)s) t", {**values, "start": start})[0][0], 2)
	rows = frappe.db.sql(f"{inner} limit %(start)s, %(page_length)s", {**values, "start": start, "page_length": page_length}, as_dict=True)
	balance = carried
	for r in rows:
		balance = flt(balance + flt(r["debit"]) - flt(r["credit"]), 2)
		r["balance"] = balance

	out = {"columns": GL_COLUMNS, "result": rows, "total": None}
	if start == 0:
		out["head_row"] = {"account": _("Opening"), "balance": opening}
	if with_total:
		if consolidated:
			n, dr, cr = frappe.db.sql(f"select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0) from ({inner.rsplit('order by', 1)[0]}) t", values)[0]
		else:
			n, dr, cr = frappe.db.sql(f"select count(*), coalesce(sum(g.debit), 0), coalesce(sum(g.credit), 0) from `tabGL Entry` g where {where}", values)[0]
		closing = flt(opening + flt(dr) - flt(cr), 2)
		out["total"] = n
		out["total_row"] = {"account": _("Total"), "debit": flt(dr), "credit": flt(cr), "balance": closing}
		out["report_summary"] = [
			{"label": _("Opening"), "value": opening, "datatype": "Currency"}, {"label": _("Debit"), "value": flt(dr), "datatype": "Currency"},
			{"label": _("Credit"), "value": flt(cr), "datatype": "Currency"}, {"label": _("Closing"), "value": closing, "datatype": "Currency"},
		]
	return out


# ---------------------------------------------------------------- receivables / payables

AGE_COLUMNS = ["range1", "range2", "range3", "range4", "range5"]


def _ranges(f):
	raw = f.get("range") or f"{f.get('range1', 30)}, {f.get('range2', 60)}, {f.get('range3', 90)}, {f.get('range4', 120)}"
	try:
		r = [int(x) for x in str(raw).replace(";", ",").split(",") if str(x).strip()]
	except ValueError:
		frappe.throw(_("Ageing ranges must be whole numbers, like 30, 60, 90, 120"))
	r = sorted(set(r))[:4] or [30, 60, 90, 120]
	while len(r) < 4:
		r.append(r[-1] + 30)
	return r


def _bucket_labels(r):
	return [f"0-{r[0]}", f"{r[0] + 1}-{r[1]}", f"{r[1] + 1}-{r[2]}", f"{r[2] + 1}-{r[3]}", f"{r[3] + 1}-Above"]


def _age_sql(r, basis):
	"""Per-bucket sums of `outstanding`, by age on the report date (not-yet-due counts in the first bucket)."""
	age = f"datediff(%(age_date)s, coalesce({'due_date' if basis == 'Due Date' else 'posting_date'}, posting_date))"
	edges = [f"{age} <= {r[0]}", f"{age} > {r[0]} and {age} <= {r[1]}", f"{age} > {r[1]} and {age} <= {r[2]}", f"{age} > {r[2]} and {age} <= {r[3]}", f"{age} > {r[3]}"]
	return age, [f"sum(case when {e} then outstanding else 0 end) as range{i + 1}" for i, e in enumerate(edges)]


def _open_items(party_type, f, company, q, values):
	"""One row per open voucher (invoice, credit note or unallocated payment) as on the report date."""
	# the Payment Ledger already stores payable amounts positive (credit - debit), so no sign flip is needed
	account_type, sign = ("Receivable", 1) if party_type == "Customer" else ("Payable", 1)
	values.update({"company": company, "account_type": account_type, "party_type": party_type, "report_date": str(getdate(f.get("report_date") or nowdate()))})
	# like ERPNext (v16) the age is counted to today unless "Age as on" is set to the report date
	values["age_date"] = values["report_date"] if f.get("age_as_on") == "Report Date" else str(getdate(nowdate()))
	cond = ["ple.delinked = 0", "ple.company = %(company)s", "ple.account_type = %(account_type)s", "ple.party_type = %(party_type)s", "ple.posting_date <= %(report_date)s"]
	parties = _list(f.get("party")) or _list(f.get(party_type.lower()))
	if parties:
		values["parties"] = tuple(parties)
		cond.append("ple.party in %(parties)s")
	allowed = _restricted(party_type)
	if allowed:
		values["ur_party"] = allowed
		cond.append("ple.party in %(ur_party)s")
	cond += _search(q, ["ple.party", "ple.against_voucher_no"], values)
	return f"""select ple.party, ple.against_voucher_type as voucher_type, ple.against_voucher_no as voucher_no,
			coalesce(min(case when ple.voucher_no = ple.against_voucher_no then ple.posting_date end), min(ple.posting_date)) as posting_date,
			max(case when ple.voucher_no = ple.against_voucher_no then ple.due_date end) as due_date,
			{sign} * sum(case when ple.voucher_no = ple.against_voucher_no then ple.amount else 0 end) as invoiced,
			{sign} * -sum(case when ple.voucher_no != ple.against_voucher_no and ple.voucher_type in ('Sales Invoice', 'Purchase Invoice') then ple.amount else 0 end) as credit_note,
			{sign} * sum(ple.amount) as outstanding
		from `tabPayment Ledger Entry` ple where {" and ".join(cond)}
		group by ple.party, ple.against_voucher_type, ple.against_voucher_no
		having abs(sum(ple.amount)) > 0.005"""


def _party_names(party_type, parties):
	field = "customer_name" if party_type == "Customer" else "supplier_name"
	if not parties:
		return {}
	return dict(frappe.db.sql(f"select name, {field} from `tab{party_type}` where name in %s", (tuple(set(parties)),)))


def ageing_detail(party_type, f, start, page_length, q, with_total):
	company = _company(f)
	values = {}
	inner = _open_items(party_type, f, company, q, values)
	r = _ranges(f)
	basis = f.get("ageing_based_on") or "Due Date"
	age_sql, bucket_sql = _age_sql(r, basis)
	rows = frappe.db.sql(f"{inner} order by party, posting_date, voucher_no limit %(start)s, %(page_length)s", {**values, "start": start, "page_length": page_length}, as_dict=True)
	names = _party_names(party_type, [x["party"] for x in rows])
	age_date = getdate(values["age_date"])
	for x in rows:
		x["party_name"] = names.get(x["party"])
		x["invoiced"], x["credit_note"], x["outstanding"] = flt(x["invoiced"]), flt(x["credit_note"]), flt(x["outstanding"])
		x["paid"] = flt(x["invoiced"] - x["credit_note"] - x["outstanding"], 2)
		ref = (x["due_date"] if basis == "Due Date" else None) or x["posting_date"]
		age = (age_date - getdate(ref)).days if ref else 0
		x["age"] = max(age, 0)
		for i, edge in enumerate(r):
			if age <= edge:
				x[f"range{i + 1}"] = x["outstanding"]
				break
		else:
			x["range5"] = x["outstanding"]
		x["currency"] = None
	labels = _bucket_labels(r)
	cols = [
		C("posting_date", "Posting Date", "Date", width=95), C("party", party_type, "Link", party_type, 150), C("party_name", f"{party_type} Name", width=170),
		C("voucher_type", "Voucher Type", width=120), C("voucher_no", "Voucher #", "Dynamic Link", "voucher_type", 160), C("due_date", "Due Date", "Date", width=95),
		C("invoiced", "Invoiced", "Currency", width=110), C("paid", "Paid", "Currency", width=110), C("credit_note", "Credit Note", "Currency", width=110),
		C("outstanding", "Outstanding", "Currency", width=120), C("age", "Age (Days)", "Int", width=80),
	] + [C(f"range{i + 1}", labels[i], "Currency", width=110) for i in range(5)]
	out = {"columns": cols, "result": rows, "total": None}
	if with_total:
		sums = "coalesce(sum(invoiced), 0) as invoiced, coalesce(sum(credit_note), 0) as credit_note, coalesce(sum(outstanding), 0) as outstanding"
		tot = frappe.db.sql(f"select count(*) as n, {sums}, {', '.join(bucket_sql)} from ({inner}) t", values, as_dict=True)[0]
		out["total"] = tot["n"]
		row = {"party": _("Total"), "invoiced": flt(tot["invoiced"]), "credit_note": flt(tot["credit_note"]), "outstanding": flt(tot["outstanding"]),
			"paid": flt(tot["invoiced"] - tot["credit_note"] - tot["outstanding"], 2)}
		row.update({k: flt(tot[k] or 0) for k in AGE_COLUMNS})
		out["total_row"] = row
		out["report_summary"] = [{"label": _("Outstanding"), "value": row["outstanding"], "datatype": "Currency"}, {"label": _("Invoiced"), "value": row["invoiced"], "datatype": "Currency"},
			{"label": _("Open items"), "value": tot["n"], "datatype": "Int"}]
	return out


def ageing_summary(party_type, f, start, page_length, q, with_total):
	company = _company(f)
	values = {}
	inner = _open_items(party_type, f, company, q, values)
	r = _ranges(f)
	basis = f.get("ageing_based_on") or "Due Date"
	_age, bucket_sql = _age_sql(r, basis)
	sums = "sum(invoiced) as invoiced, sum(credit_note) as credit_note, sum(outstanding) as outstanding"
	rows = frappe.db.sql(
		f"select party, {sums}, {', '.join(bucket_sql)} from ({inner}) t group by party order by party limit %(start)s, %(page_length)s",
		{**values, "start": start, "page_length": page_length}, as_dict=True)
	names = _party_names(party_type, [x["party"] for x in rows])
	for x in rows:
		x["party_name"] = names.get(x["party"])
		for k in ("invoiced", "credit_note", "outstanding", *AGE_COLUMNS):
			x[k] = flt(x[k])
		x["paid"] = flt(x["invoiced"] - x["credit_note"] - x["outstanding"], 2)
	labels = _bucket_labels(r)
	cols = [C("party", party_type, "Link", party_type, 150), C("party_name", f"{party_type} Name", width=180), C("invoiced", "Invoiced", "Currency", width=110),
		C("paid", "Paid", "Currency", width=110), C("credit_note", "Credit Note", "Currency", width=110), C("outstanding", "Outstanding", "Currency", width=120)
	] + [C(f"range{i + 1}", labels[i], "Currency", width=110) for i in range(5)]
	out = {"columns": cols, "result": rows, "total": None}
	if with_total:
		tot = frappe.db.sql(f"select count(distinct party) as n, coalesce(sum(invoiced), 0) as invoiced, coalesce(sum(credit_note), 0) as credit_note, coalesce(sum(outstanding), 0) as outstanding, {', '.join(bucket_sql)} from ({inner}) t", values, as_dict=True)[0]
		out["total"] = tot["n"]
		row = {"party": _("Total"), "invoiced": flt(tot["invoiced"]), "credit_note": flt(tot["credit_note"]), "outstanding": flt(tot["outstanding"]), "paid": flt(tot["invoiced"] - tot["credit_note"] - tot["outstanding"], 2)}
		row.update({k: flt(tot[k] or 0) for k in AGE_COLUMNS})
		out["total_row"] = row
		out["report_summary"] = [{"label": _("Outstanding"), "value": row["outstanding"], "datatype": "Currency"}, {"label": _(party_type + "s"), "value": tot["n"], "datatype": "Int"}]
	return out


REPORTS = {
	"general-ledger": (lambda *a: general_ledger(*a), "GL Entry"),
	"accounts-receivable": (lambda *a: ageing_detail("Customer", *a), "Payment Ledger Entry"),
	"accounts-receivable-summary": (lambda *a: ageing_summary("Customer", *a), "Payment Ledger Entry"),
	"accounts-payable": (lambda *a: ageing_detail("Supplier", *a), "Payment Ledger Entry"),
	"accounts-payable-summary": (lambda *a: ageing_summary("Supplier", *a), "Payment Ledger Entry"),
}


@frappe.whitelist()
def run(report, filters=None, start=0, page_length=100, search=None, with_total=0, export=0):
	"""One page of a ledger / ageing report: {columns, result, total, total_row, report_summary, head_row}."""
	if report not in REPORTS:
		frappe.throw(_("Unknown report {0}").format(report))
	fn, doctype = REPORTS[report]
	frappe.has_permission(doctype, "read", throw=True)
	f = frappe.parse_json(filters) if filters else {}
	limit = EXPORT_PAGE if cint(export) else MAX_PAGE
	return fn(f, max(cint(start), 0), min(max(cint(page_length), 1), limit), search, cint(with_total))
