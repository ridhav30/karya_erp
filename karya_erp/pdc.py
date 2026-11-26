"""Post-dated cheque (PDC) register, built on standard ERPNext Payment Entries.

A PDC is a Payment Entry with mode of payment "Post Dated Cheque", the cheque number in
reference_no and the cheque date in reference_date. Lifecycle (no custom fields or doctypes):

  Received / issued  → Payment Entry saved as Draft, dated the cheque date (nothing posted yet)
  Deposited / paid   → posting date set to the deposit date and submitted (bank ← → party posted)
  Cleared            → clearance_date set (the same field ERPNext's Bank Reconciliation uses)
  Bounced            → submitted entry cancelled (ERPNext reverses it), reason kept as a comment
  Returned           → a cheque handed back before deposit: draft deleted is avoided — it is
                       submitted and cancelled the same day so the record (and the reason) stays

Status comes from docstatus, dates and the last "PDC:" comment.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

MODE = "Post Dated Cheque"
PE = "Payment Entry"
TAG = "PDC:"


def _require(ptype="create"):
	if not frappe.has_permission(PE, ptype):
		frappe.throw(_("You don't have permission to manage cheques"), frappe.PermissionError)


def _company(company=None):
	return company or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")


def _ensure_mode(company):
	"""The 'Post Dated Cheque' mode of payment, pointing at the company's default bank."""
	bank = frappe.get_cached_value("Company", company, "default_bank_account")
	if not frappe.db.exists("Mode of Payment", MODE):
		mop = frappe.new_doc("Mode of Payment")
		mop.update({"mode_of_payment": MODE, "type": "Bank", "enabled": 1})
		if bank:
			mop.append("accounts", {"company": company, "default_account": bank})
		mop.insert(ignore_permissions=True)
	elif bank and not frappe.db.exists("Mode of Payment Account", {"parent": MODE, "company": company}):
		mop = frappe.get_doc("Mode of Payment", MODE)
		mop.append("accounts", {"company": company, "default_account": bank})
		mop.save(ignore_permissions=True)


def _last_tag(names):
	"""{payment entry: (event, reason)} from the latest 'PDC:' comment."""
	if not names:
		return {}
	rows = frappe.get_all(
		"Comment",
		filters={"reference_doctype": PE, "reference_name": ["in", names], "comment_type": "Comment", "content": ["like", f"%{TAG}%"]},
		fields=["reference_name", "content", "creation"], order_by="creation asc",
	)
	out = {}
	for r in rows:
		text = frappe.utils.strip_html(r.content or "").split(TAG, 1)[-1].strip()
		event, _sep, reason = text.partition("—")
		out[r.reference_name] = (event.strip(), reason.strip())
	return out


def _status(row, tag, today):
	if row.docstatus == 2:
		return "Returned" if tag and tag[0].lower().startswith("returned") else "Bounced"
	if row.docstatus == 1:
		return "Cleared" if row.clearance_date else "Deposited"
	due = getdate(row.reference_date or row.posting_date)
	if due < today:
		return "Overdue"
	if due == today:
		return "Due today"
	return "In hand"


def _add_tag(doc, event, reason=None):
	text = f"{TAG} {event}" + (f" — {reason}" if reason else "")
	doc.add_comment("Comment", frappe.utils.escape_html(text))


# ---------------------------------------------------------------- read

@frappe.whitelist()
def register(direction="receive", company=None, status=None, party=None, from_date=None, to_date=None):
	_require("read")
	company = _company(company)
	payment_type = "Receive" if direction == "receive" else "Pay"
	filters = {"mode_of_payment": MODE, "company": company, "payment_type": payment_type}
	if party:
		filters["party"] = party
	if from_date and to_date:
		filters["reference_date"] = ["between", [from_date, to_date]]
	rows = frappe.get_list(
		PE, filters=filters,
		fields=["name", "docstatus", "party_type", "party", "party_name", "paid_amount", "received_amount", "reference_no", "reference_date",
			"posting_date", "clearance_date", "bank", "paid_to", "paid_from", "remarks", "modified"],
		order_by="reference_date asc, name asc", limit_page_length=0,
	)
	tags = _last_tag([r.name for r in rows])
	today = getdate(nowdate())
	week = add_days(today, 7)
	summary = {k: {"count": 0, "amount": 0.0} for k in ("In hand", "Due today", "Overdue", "Deposited", "Cleared", "Bounced", "Returned")}
	due_week = {"count": 0, "amount": 0.0}
	out = []
	for r in rows:
		tag = tags.get(r.name)
		st = _status(r, tag, today)
		amount = flt(r.received_amount if payment_type == "Receive" else r.paid_amount)
		summary[st]["count"] += 1
		summary[st]["amount"] += amount
		if st in ("In hand", "Due today", "Overdue") and getdate(r.reference_date) <= week:
			due_week["count"] += 1
			due_week["amount"] += amount
		if status and st != status:
			continue
		out.append({
			"name": r.name, "status": st, "party_type": r.party_type, "party": r.party, "party_name": r.party_name or r.party,
			"amount": amount, "cheque_no": r.reference_no, "cheque_date": str(r.reference_date) if r.reference_date else None,
			"deposit_date": str(r.posting_date) if r.docstatus == 1 else None,
			"clearance_date": str(r.clearance_date) if r.clearance_date else None,
			"drawer_bank": r.bank, "bank_account": r.paid_to if payment_type == "Receive" else r.paid_from,
			"note": tag[1] if tag else None, "days": (getdate(r.reference_date) - today).days if r.reference_date else None,
		})
	return {
		"company": company, "currency": frappe.get_cached_value("Company", company, "default_currency"),
		"rows": out, "summary": summary, "due_week": due_week,
		"default_bank": frappe.get_cached_value("Company", company, "default_bank_account"),
		"can": {"create": bool(frappe.has_permission(PE, "create")), "submit": bool(frappe.has_permission(PE, "submit")), "cancel": bool(frappe.has_permission(PE, "cancel"))},
	}


@frappe.whitelist()
def open_invoices(party_type, party, company=None):
	"""Unpaid invoices of a party, oldest first, for linking a cheque."""
	_require("read")
	company = _company(company)
	dt = "Sales Invoice" if party_type == "Customer" else "Purchase Invoice"
	field = "customer" if party_type == "Customer" else "supplier"
	return frappe.get_list(
		dt, filters={field: party, "company": company, "docstatus": 1, "outstanding_amount": [">", 0]},
		fields=["name", "posting_date", "due_date", "grand_total", "outstanding_amount"], order_by="due_date asc, posting_date asc",
		limit_page_length=50,
	)


# ---------------------------------------------------------------- write

@frappe.whitelist(methods=["POST"])
def create(direction, party, amount, cheque_no, cheque_date, drawer_bank=None, invoice=None, bank_account=None, received_on=None, note=None, company=None):
	"""Record a cheque received (customer) or issued (supplier) as a draft Payment Entry dated the cheque date."""
	_require("create")
	company = _company(company)
	_ensure_mode(company)
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be more than zero"))
	if not (cheque_no or "").strip():
		frappe.throw(_("Cheque number is required"))
	cheque_date = getdate(cheque_date)
	receive = direction == "receive"
	party_type = "Customer" if receive else "Supplier"
	if not frappe.db.exists(party_type, party):
		frappe.throw(_("{0} {1} not found").format(_(party_type), party))
	if frappe.db.exists(PE, {"mode_of_payment": MODE, "reference_no": cheque_no.strip(), "party": party, "docstatus": ["<", 2]}):
		frappe.throw(_("Cheque {0} from {1} is already in the register").format(cheque_no, party))
	bank_account = bank_account or frappe.get_cached_value("Company", company, "default_bank_account")
	if not bank_account:
		frappe.throw(_("Set a default bank account for {0} (Settings → Default accounts)").format(company))

	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	if invoice:
		dt = "Sales Invoice" if receive else "Purchase Invoice"
		inv = frappe.db.get_value(dt, invoice, ["company", "docstatus", "outstanding_amount", "customer" if receive else "supplier"], as_dict=True)
		if not inv or inv.company != company or inv.docstatus != 1 or inv.get("customer" if receive else "supplier") != party:
			frappe.throw(_("{0} is not an open invoice of {1}").format(invoice, party))
		pe = get_payment_entry(dt, invoice, party_amount=min(amount, flt(inv.outstanding_amount)), bank_account=bank_account)
		if amount > flt(inv.outstanding_amount):  # the rest stays as an unallocated advance
			pe.paid_amount = pe.received_amount = amount
	else:
		from erpnext.accounts.party import get_party_account

		pe = frappe.new_doc(PE)
		party_account = get_party_account(party_type, party, company)
		currency = frappe.get_cached_value("Company", company, "default_currency")
		pe.update({
			"payment_type": "Receive" if receive else "Pay", "company": company, "party_type": party_type, "party": party,
			"paid_from": party_account if receive else bank_account, "paid_to": bank_account if receive else party_account,
			"paid_from_account_currency": currency, "paid_to_account_currency": currency,
			"paid_amount": amount, "received_amount": amount, "source_exchange_rate": 1, "target_exchange_rate": 1,
		})
	pe.update({
		"mode_of_payment": MODE, "reference_no": cheque_no.strip(), "reference_date": cheque_date,
		"posting_date": cheque_date, "bank": (drawer_bank or "").strip() or None,
	})
	remark = _("Post-dated cheque {0} dated {1}").format(cheque_no.strip(), frappe.utils.formatdate(cheque_date))
	if drawer_bank:
		remark += f", {drawer_bank.strip()}"
	if received_on:
		remark += " · " + (_("received on {0}") if receive else _("issued on {0}")).format(frappe.utils.formatdate(received_on))
	if note:
		remark += f" · {note.strip()}"
	pe.custom_remarks = 1
	pe.remarks = remark
	pe.insert()
	_add_tag(pe, _("Received") if receive else _("Issued"), note)
	return {"name": pe.name}


def _open(name, docstatus=None):
	doc = frappe.get_doc(PE, name)
	if doc.mode_of_payment != MODE:
		frappe.throw(_("{0} is not a post-dated cheque").format(name))
	if docstatus is not None and doc.docstatus != docstatus:
		frappe.throw(_("{0} can't be changed in its current state").format(name))
	return doc


@frappe.whitelist(methods=["POST"])
def deposit(name, deposit_date=None, bank_account=None, allow_early=0):
	"""Deposit a received cheque (or mark an issued one as presented): post it on the deposit date."""
	_require("submit")
	doc = _open(name, 0)
	doc.check_permission("submit")
	deposit_date = getdate(deposit_date or nowdate())
	if deposit_date < getdate(doc.reference_date) and not cint(allow_early):
		frappe.throw(_("The cheque is dated {0} — it can't be deposited before then").format(frappe.utils.formatdate(doc.reference_date)))
	doc.posting_date = deposit_date
	if bank_account:
		if doc.payment_type == "Receive":
			doc.paid_to = bank_account
		else:
			doc.paid_from = bank_account
	doc.save()
	doc.submit()
	_add_tag(doc, _("Deposited") if doc.payment_type == "Receive" else _("Presented"))
	return {"name": doc.name, "posting_date": str(doc.posting_date)}


@frappe.whitelist(methods=["POST"])
def clear(name, clearance_date=None):
	_require("submit")
	doc = _open(name, 1)
	doc.check_permission("write")
	clearance_date = getdate(clearance_date or nowdate())
	if clearance_date < getdate(doc.posting_date):
		frappe.throw(_("Clearance date can't be before the deposit date"))
	frappe.db.set_value(PE, name, "clearance_date", clearance_date)
	_add_tag(doc, _("Cleared"))
	return {"name": name, "clearance_date": str(clearance_date)}


@frappe.whitelist(methods=["POST"])
def bounce(name, reason=None):
	"""A deposited cheque came back unpaid: cancel the entry (ERPNext reverses the bank and the invoice allocation)."""
	_require("cancel")
	doc = _open(name, 1)
	doc.check_permission("cancel")
	if doc.clearance_date:
		frappe.db.set_value(PE, name, "clearance_date", None)
		doc.reload()
	_add_tag(doc, _("Bounced"), reason)
	doc.cancel()
	return {"name": name, "status": "Bounced"}


@frappe.whitelist(methods=["POST"])
def return_cheque(name, reason=None):
	"""Hand a cheque back before it was deposited (replaced, cancelled deal). The record is kept as cancelled."""
	_require("cancel")
	doc = _open(name, 0)
	doc.check_permission("submit")
	_add_tag(doc, _("Returned"), reason)
	doc.submit()
	doc.cancel()
	return {"name": name, "status": "Returned"}


# ---------------------------------------------------------------- reminders

def due_reminders():
	"""Daily: notify Accounts users about received cheques due today (scheduler)."""
	today = nowdate()
	rows = frappe.get_all(PE, filters={"mode_of_payment": MODE, "docstatus": 0, "payment_type": "Receive", "reference_date": ["<=", today]}, fields=["name", "party_name", "received_amount", "reference_no", "reference_date"])
	if not rows:
		return
	users = {u for u in frappe.get_all("Has Role", filters={"role": ["in", ["Accounts User", "Accounts Manager"]], "parenttype": "User"}, pluck="parent") if frappe.db.get_value("User", u, "enabled")}
	subject = _("{0} post-dated cheque(s) due for deposit").format(len(rows))
	for u in users:
		if u in ("Administrator", "Guest"):
			continue
		frappe.get_doc({
			"doctype": "Notification Log", "for_user": u, "type": "Alert", "subject": subject,
			"email_content": "<br>".join(f"{r.reference_no} · {r.party_name} · {r.received_amount} · {r.reference_date}" for r in rows[:20]),
			"document_type": PE, "document_name": rows[0].name,
		}).insert(ignore_permissions=True)
