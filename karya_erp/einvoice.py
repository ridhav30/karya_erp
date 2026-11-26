"""UAE e-invoicing readiness (PINT AE) for the Karya Erp UI.

What this does
  - Checks a company and its sales invoices / credit notes against the data the UAE e-invoice needs
    (TRN → TIN → Peppol endpoint 0235:<TIN>, addresses incl. emirate, buyer identification, VAT
    category per line, currency, unit codes …) and lists what is missing, per invoice.
  - Produces a PINT AE UBL 2.1 XML file per invoice to hand to the Accredited Service Provider (ASP).

What it does not do
  - Transmit: in the UAE every invoice goes through an MoF-accredited ASP over Peppol; the ASP
    validates against the official schematron, signs and delivers. Treat this XML as the data
    hand-off / pre-check — the ASP's validation is the authority.

Identifiers (MoF guidelines / PINT AE 1.0.x): CustomizationID urn:peppol:pint:billing-1@ae-1,
ProfileID urn:peppol:bis:billing, ProfileExecutionID 8-digit transaction flags (00000000 standard,
00000001 export), EndpointID scheme 0235 = first 10 digits of the TRN; buyer without a Peppol ID:
0235:9900000098 (UAE), 0235:9900000099 (outside the UAE).
"""

import uuid
import xml.etree.ElementTree as ET

import frappe
from frappe import _
from frappe.utils import cint, flt, get_url, getdate

CUSTOMIZATION_ID = "urn:peppol:pint:billing-1@ae-1"
PROFILE_ID = "urn:peppol:bis:billing"
EAS = "0235"
UAE_NOT_ON_PEPPOL, OUTSIDE_UAE = "9900000098", "9900000099"
EMIRATE_CODES = {"Abu Dhabi": "AUH", "Dubai": "DXB", "Sharjah": "SHJ", "Ajman": "AJM", "Umm Al Quwain": "UAQ", "Ras Al Khaimah": "RAK", "Fujairah": "FUJ"}
UOM_CODES = {"nos": "H87", "unit": "C62", "pcs": "H87", "piece": "H87", "kg": "KGM", "box": "BX", "hour": "HUR", "day": "DAY", "month": "MON",
	"meter": "MTR", "litre": "LTR", "liter": "LTR", "set": "SET", "pair": "PR", "carton": "CT", "pack": "PK", "gram": "GRM", "ton": "TNE"}

NS = {
	"": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
	"cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
	"cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}
CN_NS = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"


def tin_of(trn):
	digits = "".join(c for c in str(trn or "") if c.isdigit())
	return digits[:10] if len(digits) >= 10 else None


def _require():
	if not frappe.has_permission("Sales Invoice", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _address(link_doctype, link_name, address_name=None):
	name = address_name
	if not name:
		r = frappe.db.sql(
			"""select a.name from `tabAddress` a join `tabDynamic Link` l on l.parent = a.name and l.parenttype = 'Address'
			where l.link_doctype = %s and l.link_name = %s and a.disabled = 0 order by a.is_primary_address desc, a.creation asc limit 1""",
			(link_doctype, link_name),
		)
		name = r[0][0] if r else None
	if not name:
		return None
	a = frappe.get_doc("Address", name)
	emirate = a.get("emirate") or a.get("state")
	return frappe._dict({
		"name": a.name, "line1": a.address_line1, "line2": a.address_line2, "city": a.city, "emirate": emirate,
		"emirate_code": EMIRATE_CODES.get((emirate or "").strip()), "pincode": a.pincode,
		"country_code": (frappe.db.get_value("Country", a.country, "code") or "").upper() if a.country else None,
	})


def _uom_code(uom):
	return UOM_CODES.get((uom or "").strip().lower())


def _line_category(inv, item):
	"""(category, rate) from the line's item tax template, else the invoice's VAT rows."""
	tpl = item.get("item_tax_template") or ""
	low = tpl.lower()
	if "exempt" in low:
		return "E", 0.0
	if "zero" in low:
		return "Z", 0.0
	if "out of scope" in low:
		return "O", 0.0
	vat_rows = [t for t in inv.get("taxes") or [] if flt(t.rate) or "vat" in (t.account_head or "").lower()]
	if not vat_rows:
		return ("O", 0.0) if not inv.get("taxes") else ("Z", 0.0)
	acc = (vat_rows[0].account_head or "").lower()
	if "exempt" in acc:
		return "E", 0.0
	if "zero" in acc or flt(vat_rows[0].rate) == 0:
		return "Z", 0.0
	return "S", flt(vat_rows[0].rate)


def _context(name):
	inv = frappe.get_doc("Sales Invoice", name)
	inv.check_permission("read")
	company = frappe.get_cached_doc("Company", inv.company)
	seller_addr = _address("Company", inv.company, inv.get("company_address"))
	buyer_addr = _address("Customer", inv.customer, inv.get("customer_address"))
	buyer_trn = (inv.get("tax_id") or frappe.db.get_value("Customer", inv.customer, "tax_id") or "").strip()
	buyer_type = frappe.db.get_value("Customer", inv.customer, "customer_type")
	return inv, company, seller_addr, buyer_addr, buyer_trn, buyer_type


def check_invoice(name):
	"""[{level: error|warning, field, message}] for one sales invoice."""
	inv, company, sa, ba, buyer_trn, buyer_type = _context(name)
	issues = []
	add = lambda level, field, msg: issues.append({"level": level, "field": field, "message": msg})
	if inv.docstatus != 1:
		add("error", "status", _("Submit the invoice first"))
	if not tin_of(company.tax_id):
		add("error", "seller_trn", _("Company TRN is missing (Settings → Company)"))
	if not sa:
		add("error", "seller_address", _("Company address is missing (Settings → Company)"))
	else:
		if not (sa.line1 and sa.city):
			add("error", "seller_address", _("Company address needs street and city"))
		if sa.country_code == "AE" and not sa.emirate_code:
			add("error", "seller_emirate", _("Company address needs the emirate"))
	if not ba:
		add("error", "buyer_address", _("Customer {0} has no address").format(inv.customer_name))
	else:
		if not ba.country_code:
			add("error", "buyer_country", _("Customer address needs a country"))
		elif ba.country_code == "AE" and not ba.emirate_code:
			add("warning", "buyer_emirate", _("Customer address has no emirate"))
	abroad = bool(ba and ba.country_code and ba.country_code != "AE")
	if buyer_trn and not tin_of(buyer_trn):
		add("error", "buyer_trn", _("Customer TRN '{0}' is not valid").format(buyer_trn))
	if not buyer_trn and not abroad and buyer_type == "Company":
		add("warning", "buyer_trn", _("Customer has no TRN — sent to the 'not on Peppol' endpoint {0}").format(UAE_NOT_ON_PEPPOL))
	if inv.currency != "AED" and not flt(inv.conversion_rate):
		add("error", "currency", _("Exchange rate to AED is missing"))
	if not inv.items:
		add("error", "items", _("No items"))
	for it in inv.items:
		if not _uom_code(it.uom):
			add("warning", "uom", _("Row {0}: unit '{1}' has no UN/ECE code mapping — sent as C62 (unit)").format(it.idx, it.uom))
		if flt(it.qty) == 0:
			add("error", "qty", _("Row {0}: quantity is zero").format(it.idx))
		cat, rate = _line_category(inv, it)
		if cat == "O" and tin_of(company.tax_id):
			add("warning", "vat", _("Row {0}: no VAT on the invoice — treated as out of scope; add the VAT template if it is a taxable supply").format(it.idx))
	if inv.is_return and not inv.return_against:
		add("error", "return_against", _("Credit note must refer to the original invoice"))
	return issues


# ---------------------------------------------------------------- XML

def _el(parent, tag, text=None, **attrs):
	prefix, _sep, local = tag.partition(":")
	e = ET.SubElement(parent, f"{{{NS[prefix]}}}{local}", {k.replace("_", ""): str(v) for k, v in attrs.items() if v is not None})
	if text is not None:
		e.text = str(text)
	return e


def _amt(parent, tag, value, currency):
	return _el(parent, tag, f"{flt(value, 2):.2f}", currencyID=currency)


def _party(parent, tag, name, trn, endpoint, addr, legal_name=None):
	wrap = _el(parent, tag)
	p = _el(wrap, "cac:Party")
	_el(p, "cbc:EndpointID", endpoint, schemeID=EAS)
	pn = _el(p, "cac:PartyName")
	_el(pn, "cbc:Name", name)
	if addr:
		pa = _el(p, "cac:PostalAddress")
		if addr.line1:
			_el(pa, "cbc:StreetName", addr.line1)
		if addr.line2:
			_el(pa, "cbc:AdditionalStreetName", addr.line2)
		if addr.city:
			_el(pa, "cbc:CityName", addr.city)
		if addr.pincode:
			_el(pa, "cbc:PostalZone", addr.pincode)
		if addr.emirate_code:
			_el(pa, "cbc:CountrySubentity", addr.emirate_code)
		c = _el(pa, "cac:Country")
		_el(c, "cbc:IdentificationCode", addr.country_code or "AE")
	if trn:
		pts = _el(p, "cac:PartyTaxScheme")
		_el(pts, "cbc:CompanyID", trn)
		ts = _el(pts, "cac:TaxScheme")
		_el(ts, "cbc:ID", "VAT")
	ple = _el(p, "cac:PartyLegalEntity")
	_el(ple, "cbc:RegistrationName", legal_name or name)
	return wrap


def build_xml(name):
	inv, company, sa, ba, buyer_trn, _bt = _context(name)
	credit = cint(inv.is_return)
	cur = inv.currency
	root_ns = CN_NS if credit else NS[""]
	ET.register_namespace("", root_ns)
	ET.register_namespace("cac", NS["cac"])
	ET.register_namespace("cbc", NS["cbc"])
	root = ET.Element(f"{{{root_ns}}}{'CreditNote' if credit else 'Invoice'}")

	abroad = bool(ba and ba.country_code and ba.country_code != "AE")
	seller_tin = tin_of(company.tax_id) or ""
	buyer_endpoint = tin_of(buyer_trn) or (OUTSIDE_UAE if abroad else UAE_NOT_ON_PEPPOL)
	flags = "00000001" if abroad else "00000000"

	_el(root, "cbc:CustomizationID", CUSTOMIZATION_ID)
	_el(root, "cbc:ProfileID", PROFILE_ID)
	_el(root, "cbc:ProfileExecutionID", flags)
	_el(root, "cbc:ID", inv.name)
	_el(root, "cbc:UUID", str(uuid.uuid5(uuid.NAMESPACE_URL, get_url(f"/einvoice/{inv.name}"))))
	_el(root, "cbc:IssueDate", str(getdate(inv.posting_date)))
	if inv.get("posting_time"):
		_el(root, "cbc:IssueTime", str(inv.posting_time).split(".")[0].rjust(8, "0"))
	if inv.due_date and not credit:
		_el(root, "cbc:DueDate", str(getdate(inv.due_date)))
	_el(root, "cbc:CreditNoteTypeCode" if credit else "cbc:InvoiceTypeCode", "381" if credit else "380")
	if inv.get("remarks") and inv.remarks != "No Remarks":
		_el(root, "cbc:Note", inv.remarks[:500])
	_el(root, "cbc:DocumentCurrencyCode", cur)
	if cur != "AED":
		_el(root, "cbc:TaxCurrencyCode", "AED")
	if inv.get("po_no"):
		_el(_el(root, "cac:OrderReference"), "cbc:ID", inv.po_no)
	if credit and inv.return_against:
		br = _el(root, "cac:BillingReference")
		idr = _el(br, "cac:InvoiceDocumentReference")
		_el(idr, "cbc:ID", inv.return_against)
		orig = frappe.db.get_value("Sales Invoice", inv.return_against, "posting_date")
		if orig:
			_el(idr, "cbc:IssueDate", str(orig))

	_party(root, "cac:AccountingSupplierParty", company.company_name, company.tax_id, seller_tin, sa)
	_party(root, "cac:AccountingCustomerParty", inv.customer_name, buyer_trn or None, buyer_endpoint, ba)

	if not credit:
		pm = _el(root, "cac:PaymentMeans")
		_el(pm, "cbc:PaymentMeansCode", "30")  # credit transfer
		if inv.get("payment_terms_template") or inv.due_date:
			pt = _el(root, "cac:PaymentTerms")
			_el(pt, "cbc:Note", inv.get("payment_terms_template") or _("Due {0}").format(getdate(inv.due_date)))

	sign = -1 if credit else 1  # ERPNext stores returns as negatives; UBL credit notes use positive amounts
	cats = {}
	for it in inv.items:
		cat, rate = _line_category(inv, it)
		key = (cat, rate)
		cats.setdefault(key, 0.0)
		cats[key] += sign * flt(it.net_amount)
	tax_total = sign * flt(inv.total_taxes_and_charges)
	tt = _el(root, "cac:TaxTotal")
	_amt(tt, "cbc:TaxAmount", tax_total, cur)
	for (cat, rate), taxable in cats.items():
		st = _el(tt, "cac:TaxSubtotal")
		_amt(st, "cbc:TaxableAmount", taxable, cur)
		_amt(st, "cbc:TaxAmount", taxable * rate / 100 if cat == "S" else 0, cur)
		tc = _el(st, "cac:TaxCategory")
		_el(tc, "cbc:ID", cat)
		_el(tc, "cbc:Percent", f"{rate:g}")
		if cat in ("E", "O"):
			_el(tc, "cbc:TaxExemptionReason", _("Exempt supply") if cat == "E" else _("Outside the scope of UAE VAT"))
		_el(_el(tc, "cac:TaxScheme"), "cbc:ID", "VAT")
	if cur != "AED":
		tt2 = _el(root, "cac:TaxTotal")
		_amt(tt2, "cbc:TaxAmount", tax_total * flt(inv.conversion_rate), "AED")

	lmt = _el(root, "cac:LegalMonetaryTotal")
	net = sign * flt(inv.net_total)
	_amt(lmt, "cbc:LineExtensionAmount", net, cur)
	_amt(lmt, "cbc:TaxExclusiveAmount", net, cur)
	_amt(lmt, "cbc:TaxInclusiveAmount", sign * flt(inv.grand_total), cur)
	paid = 0 if credit else flt(inv.grand_total) - flt(inv.outstanding_amount) if flt(inv.outstanding_amount) < flt(inv.grand_total) else 0
	if paid:
		_amt(lmt, "cbc:PrepaidAmount", paid, cur)
	if flt(inv.get("rounding_adjustment")):
		_amt(lmt, "cbc:PayableRoundingAmount", sign * flt(inv.rounding_adjustment), cur)
	payable = sign * flt(inv.rounded_total or inv.grand_total) - paid
	_amt(lmt, "cbc:PayableAmount", payable, cur)

	for it in inv.items:
		cat, rate = _line_category(inv, it)
		line = _el(root, "cac:CreditNoteLine" if credit else "cac:InvoiceLine")
		_el(line, "cbc:ID", it.idx)
		_el(line, "cbc:CreditedQuantity" if credit else "cbc:InvoicedQuantity", f"{abs(flt(it.qty)):g}", unitCode=_uom_code(it.uom) or "C62")
		_amt(line, "cbc:LineExtensionAmount", sign * flt(it.net_amount), cur)
		item = _el(line, "cac:Item")
		if it.description:
			_el(item, "cbc:Description", frappe.utils.strip_html(it.description)[:500])
		_el(item, "cbc:Name", (it.item_name or it.item_code)[:200])
		si = _el(item, "cac:SellersItemIdentification")
		_el(si, "cbc:ID", it.item_code)
		ctc = _el(item, "cac:ClassifiedTaxCategory")
		_el(ctc, "cbc:ID", cat)
		_el(ctc, "cbc:Percent", f"{rate:g}")
		_el(_el(ctc, "cac:TaxScheme"), "cbc:ID", "VAT")
		price = _el(line, "cac:Price")
		_amt(price, "cbc:PriceAmount", flt(it.net_rate), cur)
		_el(price, "cbc:BaseQuantity", "1", unitCode=_uom_code(it.uom) or "C62")

	ET.indent(root)
	return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")


# ---------------------------------------------------------------- API

@frappe.whitelist()
def invoice(name):
	"""Readiness of one invoice + its XML (when there are no blocking errors)."""
	_require()
	issues = check_invoice(name)
	errors = [i for i in issues if i["level"] == "error"]
	return {"issues": issues, "ready": not errors, "filename": f"{name}.xml", "xml": None if errors else build_xml(name)}


@frappe.whitelist()
def overview(company=None, from_date=None, to_date=None):
	_require()
	company = company or frappe.defaults.get_user_default("Company")
	c = frappe.get_cached_doc("Company", company)
	sa = _address("Company", company)
	tin = tin_of(c.tax_id)
	company_checks = [
		{"label": _("TRN"), "ok": bool(tin), "value": c.tax_id or None, "fix": "/settings?section=company"},
		{"label": _("Peppol participant ID"), "ok": bool(tin), "value": f"{EAS}:{tin}" if tin else None, "fix": "/settings?section=company"},
		{"label": _("Registered address with emirate"), "ok": bool(sa and sa.line1 and sa.city and sa.emirate_code), "value": sa and ", ".join(x for x in (sa.line1, sa.city, sa.emirate) if x), "fix": "/settings?section=company"},
		{"label": _("Default sales VAT template"), "ok": bool(frappe.db.exists("Sales Taxes and Charges Template", {"company": company, "is_default": 1})), "value": None, "fix": "/settings?section=vat"},
	]
	filters = {"company": company, "docstatus": 1}
	if from_date and to_date:
		filters["posting_date"] = ["between", [from_date, to_date]]
	rows = []
	for inv in frappe.get_list("Sales Invoice", filters=filters, fields=["name", "customer_name", "posting_date", "grand_total", "currency", "is_return"], order_by="posting_date desc", limit_page_length=200):
		issues = check_invoice(inv.name)
		rows.append({**inv, "errors": [i["message"] for i in issues if i["level"] == "error"], "warnings": [i["message"] for i in issues if i["level"] == "warning"]})
	customers_missing_trn = frappe.db.count("Customer", {"customer_type": "Company", "disabled": 0, "tax_id": ["in", ["", None]]})
	return {
		"company": company, "company_checks": company_checks, "invoices": rows,
		"customers_missing_trn": customers_missing_trn,
		"ids": {"customization_id": CUSTOMIZATION_ID, "profile_id": PROFILE_ID, "scheme": EAS},
	}
