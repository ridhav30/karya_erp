"""Send documents from the Karya Erp UI: email with the PDF attached, or a WhatsApp message with a PDF link.

Email uses Frappe's own Communication flow (frappe.core.doctype.communication.email.make), so the
mail is logged on the document's timeline and goes out through the default outgoing Email Account.
WhatsApp uses click-to-chat (wa.me): no WhatsApp Business API account is needed — the user's own
WhatsApp opens with the message ready. The PDF link carries a Frappe Document Share Key, so the
recipient can open that one document without logging in; it expires (System Settings, default 30 days).
"""

import re
from urllib.parse import urlencode

import frappe
from frappe import _
from frappe.utils import cint, get_url

# doctype → (email field(s), mobile field(s), party link) used to pre-fill the recipient
CONTACT_FIELDS = {
	"Sales Invoice": ("contact_email", "contact_mobile", ("Customer", "customer")),
	"Sales Order": ("contact_email", "contact_mobile", ("Customer", "customer")),
	"Quotation": ("contact_email", "contact_mobile", None),
	"Delivery Note": ("contact_email", "contact_mobile", ("Customer", "customer")),
	"Purchase Order": ("contact_email", "contact_mobile", ("Supplier", "supplier")),
	"Purchase Invoice": ("contact_email", "contact_mobile", ("Supplier", "supplier")),
	"Request for Quotation": (None, None, None),
	"Payment Entry": ("contact_email", None, None),
	"Dunning": ("contact_email", None, ("Customer", "customer")),
	"Salary Slip": (None, None, ("Employee", "employee")),
}


def _doc(doctype, name, ptype="read"):
	doc = frappe.get_doc(doctype, name)
	doc.check_permission(ptype)
	return doc


def _party_contact(link_doctype, link_name):
	if link_doctype == "Employee":
		e = frappe.db.get_value("Employee", link_name, ["prefered_email", "company_email", "personal_email", "cell_number", "employee_name"], as_dict=True) or {}
		return (e.get("prefered_email") or e.get("company_email") or e.get("personal_email")), e.get("cell_number"), e.get("employee_name")
	d = frappe.db.get_value(link_doctype, link_name, ["email_id", "mobile_no"], as_dict=True) if frappe.get_meta(link_doctype).has_field("email_id") else None
	return (d or {}).get("email_id"), (d or {}).get("mobile_no"), None


def _company_name(doc):
	company = doc.get("company") or frappe.defaults.get_user_default("Company")
	return frappe.db.get_value("Company", company, "company_name") if company else ""


def _greeting_and_text(doc, party_name):
	title = _(doc.doctype)
	company = _company_name(doc)
	amount = doc.get("rounded_total") or doc.get("grand_total") or doc.get("net_pay") or doc.get("paid_amount")
	currency = doc.get("currency") or (frappe.get_cached_value("Company", doc.company, "default_currency") if doc.get("company") else None)
	parts = [_("Dear {0},").format(party_name) if party_name else _("Hello,"), ""]
	line = _("Please find attached {0} {1}").format(title.lower(), doc.name)
	if amount:
		line += _(" for {0} {1}").format(currency or "", frappe.utils.fmt_money(amount)).replace("for  ", "for ")
	if doc.get("due_date") and doc.doctype in ("Sales Invoice", "Purchase Invoice"):
		line += _(", due on {0}").format(frappe.utils.formatdate(doc.due_date))
	parts.append(line + ".")
	parts += ["", _("Regards,"), company]
	subject = f"{title} {doc.name}" + (f" — {company}" if company else "")
	return subject, "\n".join(parts)


def normalize_mobile(number, default_country_code="971"):
	"""'050 123 4567' → '971501234567' (wa.me wants digits with the country code, no +)."""
	digits = re.sub(r"\D", "", str(number or ""))
	if not digits:
		return ""
	if digits.startswith("00"):
		digits = digits[2:]
	elif digits.startswith("0"):
		digits = default_country_code + digits[1:]
	elif len(digits) == 9 and digits.startswith("5"):  # UAE mobile without the leading 0
		digits = default_country_code + digits
	return digits


@frappe.whitelist()
def defaults(doctype, name):
	doc = _doc(doctype, name)
	email_f, mobile_f, party = CONTACT_FIELDS.get(doctype, ("contact_email", "contact_mobile", None))
	email = doc.get(email_f) if email_f else None
	mobile = doc.get(mobile_f) if mobile_f else None
	party_name = doc.get("customer_name") or doc.get("supplier_name") or doc.get("party_name") or doc.get("employee_name") or doc.get("title")
	if party and doc.get(party[1]):
		p_email, p_mobile, p_name = _party_contact(party[0], doc.get(party[1]))
		email, mobile = email or p_email, mobile or p_mobile
		party_name = party_name or p_name
	if doctype == "Quotation" and doc.get("quotation_to") in ("Customer", "Lead") and doc.get("party_name"):
		p_email, p_mobile, _n = _party_contact(doc.quotation_to, doc.party_name) if doc.quotation_to == "Customer" else (
			frappe.db.get_value("Lead", doc.party_name, "email_id"), frappe.db.get_value("Lead", doc.party_name, "mobile_no"), None)
		email, mobile = email or p_email, mobile or p_mobile
	subject, message = _greeting_and_text(doc, party_name)
	outgoing = frappe.db.get_value("Email Account", {"enable_outgoing": 1, "default_outgoing": 1}, "email_id") or frappe.db.get_value("Email Account", {"enable_outgoing": 1}, "email_id")
	return {
		"email": email or "", "mobile": mobile or "", "whatsapp_number": normalize_mobile(mobile), "subject": subject, "message": message,
		"outgoing_account": outgoing, "can_email": bool(outgoing) and bool(frappe.has_permission(doctype, "email", doc) or frappe.has_permission(doctype, "read", doc)),
		"docstatus": doc.docstatus,
	}


@frappe.whitelist(methods=["POST"])
def send_email(doctype, name, recipients, subject, message, cc=None, print_format=None, letterhead=None, attach_pdf=1):
	doc = _doc(doctype, name)
	if not frappe.db.exists("Email Account", {"enable_outgoing": 1}):
		frappe.throw(_("No outgoing email account — set one up in Settings → Email"))
	recipients = ",".join(r.strip() for r in re.split(r"[,;\s]+", recipients or "") if r.strip())
	if not recipients:
		frappe.throw(_("Enter at least one email address"))
	for r in recipients.split(",") + [c.strip() for c in re.split(r"[,;\s]+", cc or "") if c.strip()]:
		if not frappe.utils.validate_email_address(r):
			frappe.throw(_("{0} is not a valid email address").format(r))
	from frappe.core.doctype.communication.email import make

	html = "<p>" + "<br>".join(frappe.utils.escape_html(line) for line in (message or "").split("\n")) + "</p>"
	res = make(
		doctype=doctype, name=name, content=html, subject=subject, recipients=recipients, cc=cc or None,
		send_email=1, print_html=None, print_format=(print_format or "Standard") if cint(attach_pdf) else None,
		attachments=[], send_me_a_copy=0, print_letterhead=bool(letterhead),
	)
	return {"communication": res.get("name") if isinstance(res, dict) else res}


@frappe.whitelist(methods=["POST"])
def share_link(doctype, name, print_format=None, letterhead=None):
	"""A PDF link anyone can open (this document only), valid until the share key expires."""
	doc = _doc(doctype, name)
	if not (frappe.has_permission(doctype, "print", doc) or frappe.has_permission(doctype, "read", doc)):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	# Reuse a key that is still valid for at least a week, so repeated shares don't pile up keys.
	key = frappe.db.get_value(
		"Document Share Key",
		{"reference_doctype": doctype, "reference_docname": name, "expires_on": [">", frappe.utils.add_days(frappe.utils.nowdate(), 7)]},
		"key", order_by="expires_on desc",
	) or doc.get_document_share_key()
	q = {"doctype": doctype, "name": name, "format": print_format or "Standard", "key": key, "no_letterhead": 0 if letterhead else 1}
	if letterhead:
		q["letterhead"] = letterhead
	expiry = cint(frappe.db.get_single_value("System Settings", "document_share_key_expiry"))
	return {"url": get_url("/api/method/frappe.utils.print_format.download_pdf?" + urlencode(q)), "expires_in_days": expiry or None}


@frappe.whitelist(methods=["POST"])
def whatsapp_link(doctype, name, number, message, print_format=None, letterhead=None, include_pdf=1):
	"""wa.me click-to-chat URL with the message (and a PDF link). Logged on the document's timeline."""
	doc = _doc(doctype, name)
	number = normalize_mobile(number)
	if len(number) < 8:
		frappe.throw(_("Enter a mobile number with country code (e.g. +971 50 123 4567)"))
	text = message or ""
	if cint(include_pdf):
		link = share_link(doctype, name, print_format, letterhead)["url"]
		text = f"{text}\n\n{link}" if text else link
	doc.add_comment("Comment", frappe.utils.escape_html(_("Shared on WhatsApp with +{0}").format(number)))
	return {"url": f"https://wa.me/{number}?" + urlencode({"text": text}), "number": number}


# ---------------------------------------------------------------- outgoing email account (Settings → Email)

PROVIDERS = {
	"Gmail / Google Workspace": ("smtp.gmail.com", 587, "tls"),
	"Microsoft 365 / Outlook": ("smtp.office365.com", 587, "tls"),
	"Zoho Mail": ("smtp.zoho.com", 587, "tls"),
	"Other (SMTP)": (None, 587, "tls"),
}


@frappe.whitelist()
def email_account():
	if not frappe.has_permission("Email Account", "read"):
		return {"can": False}
	name = frappe.db.get_value("Email Account", {"enable_outgoing": 1, "default_outgoing": 1}, "name") or frappe.db.get_value("Email Account", {"enable_outgoing": 1}, "name")
	acc = frappe.db.get_value("Email Account", name, ["name", "email_id", "email_account_name", "smtp_server", "smtp_port", "use_tls", "use_ssl_for_outgoing"], as_dict=True) if name else None
	return {"can": bool(frappe.has_permission("Email Account", "write")), "account": acc, "providers": {k: {"server": v[0], "port": v[1]} for k, v in PROVIDERS.items()}}


@frappe.whitelist(methods=["POST"])
def save_email_account(email_id, password=None, smtp_server=None, smtp_port=587, sender_name=None, security="tls"):
	"""Create / update the default outgoing Email Account (password stored encrypted by Frappe)."""
	if not frappe.has_permission("Email Account", "write"):
		frappe.throw(_("Only a System Manager can set up email"), frappe.PermissionError)
	if not frappe.utils.validate_email_address(email_id):
		frappe.throw(_("Enter a valid email address"))
	if not smtp_server:
		frappe.throw(_("SMTP server is required"))
	name = frappe.db.get_value("Email Account", {"email_id": email_id}, "name")
	doc = frappe.get_doc("Email Account", name) if name else frappe.new_doc("Email Account")
	if doc.is_new():
		doc.email_account_name = sender_name or email_id
		doc.email_id = email_id
		doc.enable_incoming = 0
		if not password:
			frappe.throw(_("Password is required"))
	elif sender_name:
		doc.email_account_name = doc.email_account_name or sender_name
	doc.update({
		"enable_outgoing": 1, "default_outgoing": 1, "smtp_server": smtp_server.strip(), "smtp_port": cint(smtp_port) or 587,
		"use_tls": 1 if security == "tls" else 0, "use_ssl_for_outgoing": 1 if security == "ssl" else 0,
		"always_use_account_email_id_as_sender": 1, "always_use_account_name_as_sender_name": 1 if sender_name else 0,
	})
	if doc.meta.has_field("service"):
		doc.service = ""
	if password:
		doc.password = password
	doc.flags.ignore_validate = False
	doc.save()  # Frappe validates the SMTP login on save
	return {"name": doc.name}
