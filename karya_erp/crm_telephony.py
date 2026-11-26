"""Click-to-call from a Lead / Opportunity through Twilio or Exotel, with the call logged on its timeline.

How a call runs: the provider first rings the salesperson's own phone; when they answer it dials the customer and
connects the two. We log a phone Communication straight away and the provider's status callback fills in how it
ended and how long it lasted. The callback addresses are signed with a per-site secret, so nobody can post fake
call results, and the account token is kept in an encrypted Password field and never sent to the browser.
"""

import hashlib
import hmac
import re
from urllib.parse import quote
from xml.sax.saxutils import escape

import frappe
import requests
from frappe import _
from frappe.utils import cint, now_datetime
from frappe.utils.password import get_decrypted_password

SETTINGS = "CRM Telephony Settings"
CRM_DOCTYPES = ("Lead", "Opportunity")
PHONE_FIELDS = {"Lead": ("mobile_no", "phone", "whatsapp_no"), "Opportunity": ("contact_mobile",)}
MANAGER_ROLES = ("System Manager", "Sales Manager")
TIMEOUT = 15
FIELDS = ("enabled", "provider", "account_sid", "api_key", "subdomain", "country_code", "from_number", "agent_number")


def _manager():
	if not set(MANAGER_ROLES) & set(frappe.get_roles()):
		frappe.throw(_("Only a Sales Manager can change telephony settings."), frappe.PermissionError)


def _cfg():
	return frappe.get_single(SETTINGS)


def _secret():
	"""Signing secret for the callback links; made on first use."""
	doc = _cfg()
	secret = get_decrypted_password(SETTINGS, SETTINGS, "webhook_secret", raise_exception=False)
	if not secret:
		secret = frappe.generate_hash(length=32)
		doc.webhook_secret = secret
		doc.flags.ignore_permissions = True
		doc.save()
	return secret


def sign(*parts):
	return hmac.new(_secret().encode(), "|".join(str(p) for p in parts).encode(), hashlib.sha256).hexdigest()[:24]


def _cc(doc):
	return (doc.get("country_code") or "+971").strip()


def _token():
	return get_decrypted_password(SETTINGS, SETTINGS, "auth_token", raise_exception=False) or ""


def clean_number(value, country_code=""):
	"""International form (+971501234567), or '' when it cannot be a phone number.

	A local number that starts with a single 0 gets `country_code` in front of it (050… -> +97150…)."""
	v = re.sub(r"[^\d+]", "", value or "")
	if v.startswith("00"):
		v = "+" + v[2:]
	elif v.startswith("0") and country_code:
		v = "+" + re.sub(r"\D", "", country_code) + v[1:]
	v = ("+" + v.replace("+", "")) if v.startswith("+") else v.replace("+", "")
	return v if 7 <= len(v.replace("+", "")) <= 15 else ""


# ------------------------------------------------------------------ settings

@frappe.whitelist()
def get_settings():
	"""Non-secret settings for the settings screen; `enabled` also tells forms whether to show the Call button."""
	doc = _cfg()
	can_edit = bool(set(MANAGER_ROLES) & set(frappe.get_roles()))
	out = {"can_edit": can_edit, "enabled": cint(doc.enabled) and bool(doc.account_sid and _token() and doc.from_number)}
	if can_edit:
		out.update({k: doc.get(k) for k in FIELDS})
		out["country_code"] = _cc(doc)
		out["token_set"] = bool(_token())
		out["status_url"] = frappe.utils.get_url("/api/method/karya_erp.crm_telephony.status")
	return out


@frappe.whitelist(methods=["POST"])
def save_settings(**values):
	_manager()
	doc = _cfg()
	if values.get("provider") and values["provider"] not in ("Twilio", "Exotel"):
		frappe.throw(_("Pick Twilio or Exotel."))
	for k in FIELDS:
		if k in values:
			doc.set(k, cint(values[k]) if k == "enabled" else (values[k] or "").strip())
	if values.get("auth_token"):  # blank keeps the saved one
		doc.auth_token = values["auth_token"].strip()
	for k in ("from_number", "agent_number"):
		if doc.get(k) and not clean_number(doc.get(k), _cc(doc)):
			frappe.throw(_("{0} is not a valid phone number.").format(doc.get(k)))
	if cint(doc.enabled) and not (doc.account_sid and doc.from_number and (values.get("auth_token") or _token())):
		frappe.throw(_("Fill in the account SID, auth token and caller ID before turning calling on."))
	if doc.provider == "Exotel" and cint(doc.enabled) and not doc.api_key:
		frappe.throw(_("Exotel needs the API key as well."))
	doc.flags.ignore_permissions = True
	doc.save()
	_secret()
	return get_settings()


# ------------------------------------------------------------------ provider calls (split out so tests can replace them)

def _post(url, data, auth):
	return requests.post(url, data=data, auth=auth, timeout=TIMEOUT)


def _get(url, auth, params=None):
	return requests.get(url, auth=auth, params=params, timeout=TIMEOUT)


def _auth(doc):
	return (doc.account_sid, _token()) if doc.provider == "Twilio" else (doc.api_key, _token())


def _api_error(resp):
	try:
		j = resp.json()
		msg = j.get("message") or j.get("RestException", {}).get("Message") or j.get("error") or resp.text
	except Exception:
		msg = resp.text
	return (str(msg) or f"HTTP {resp.status_code}")[:300]


@frappe.whitelist(methods=["POST"])
def test_connection():
	"""Ask the provider for the account so a wrong SID / token shows up before the first call."""
	_manager()
	doc = _cfg()
	if not (doc.account_sid and _token()):
		frappe.throw(_("Save the account SID and token first."))
	try:
		if doc.provider == "Twilio":
			r = _get(f"https://api.twilio.com/2010-04-01/Accounts/{doc.account_sid}.json", _auth(doc))
		else:
			r = _get(f"https://{doc.subdomain or 'api.exotel.com'}/v1/Accounts/{doc.account_sid}/Calls.json", _auth(doc), {"PageSize": 1})
	except requests.RequestException as e:
		frappe.throw(_("Could not reach {0}: {1}").format(doc.provider, str(e)[:200]))
	if r.status_code >= 400:
		frappe.throw(_("{0} refused the details: {1}").format(doc.provider, _api_error(r)))
	return {"ok": True, "provider": doc.provider}


# ------------------------------------------------------------------ calling

def _target_number(doctype, name, to, cc=""):
	if to:
		return clean_number(to, cc)
	doc = frappe.get_doc(doctype, name)
	for f in PHONE_FIELDS[doctype]:
		n = clean_number(doc.get(f), cc)
		if n:
			return n
	return ""


def _agent_number(doc):
	return clean_number(frappe.db.get_value("User", frappe.session.user, "mobile_no"), _cc(doc)) or clean_number(doc.agent_number, _cc(doc))


@frappe.whitelist(methods=["POST"])
def call(doctype, name, to=None):
	"""Ring the salesperson, then connect them to the lead's number; the call is logged on the record."""
	if doctype not in CRM_DOCTYPES:
		frappe.throw(_("Only Lead and Opportunity can be called from here."))
	frappe.has_permission(doctype, "write", name, throw=True)
	doc = _cfg()
	if not get_settings()["enabled"]:
		frappe.throw(_("Calling is not set up. A Sales Manager can turn it on under CRM → Telephony."))
	customer = _target_number(doctype, name, to, _cc(doc))
	if not customer:
		frappe.throw(_("This record has no valid phone number to call."))
	agent = _agent_number(doc)
	if not agent:
		frappe.throw(_("Add your mobile number to your user profile (or ask a manager to set a default agent phone) so we know where to ring you first."))
	frm = clean_number(doc.from_number, _cc(doc))

	comm = frappe.get_doc({
		"doctype": "Communication", "communication_type": "Communication", "communication_medium": "Phone", "communication_date": now_datetime(),
		"sent_or_received": "Sent", "subject": _("Call to {0}").format(customer), "content": _("Calling… ({0})").format(doc.provider),
		"reference_doctype": doctype, "reference_name": name, "sender": frappe.session.user, "phone_no": customer, "status": "Linked",
	}).insert(ignore_permissions=True)
	cb = f"c={quote(comm.name)}&s={sign('status', comm.name)}"
	status_url = frappe.utils.get_url(f"/api/method/karya_erp.crm_telephony.status?{cb}")
	try:
		if doc.provider == "Twilio":
			voice = frappe.utils.get_url(f"/api/method/karya_erp.crm_telephony.voice?to={quote(customer)}&s={sign('voice', customer)}")
			r = _post(f"https://api.twilio.com/2010-04-01/Accounts/{doc.account_sid}/Calls.json",
				{"To": agent, "From": frm, "Url": voice, "StatusCallback": status_url, "StatusCallbackEvent": "completed"}, _auth(doc))
		else:
			r = _post(f"https://{doc.subdomain or 'api.exotel.com'}/v1/Accounts/{doc.account_sid}/Calls/connect.json",
				{"From": agent, "To": customer, "CallerId": frm, "StatusCallback": status_url}, _auth(doc))
	except requests.RequestException as e:
		_finish(comm.name, _("Could not reach {0}: {1}").format(doc.provider, str(e)[:150]))
		frappe.db.commit()
		frappe.throw(_("Could not reach {0}. Try again in a moment.").format(doc.provider))
	if r.status_code >= 400:
		msg = _api_error(r)
		_finish(comm.name, _("Not placed: {0}").format(msg))
		frappe.db.commit()
		frappe.throw(_("{0} did not place the call: {1}").format(doc.provider, msg))
	_finish(comm.name, _("Ringing your phone ({0}) — answer it to be connected to {1}.").format(agent, customer))
	return {"communication": comm.name, "agent": agent, "customer": customer}


def _finish(comm, text):
	frappe.db.set_value("Communication", comm, "content", text, update_modified=False)


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def voice(to="", s=""):
	"""Twilio asks what to do when the salesperson answers: dial the customer. Signed, so only our own calls work."""
	if not hmac.compare_digest(s or "", sign("voice", to or "")) or not clean_number(to):
		frappe.throw(_("Invalid request"), frappe.PermissionError)
	doc = _cfg()
	frappe.local.response["type"] = "binary"
	frappe.local.response["filename"] = "call.xml"
	frappe.local.response["content_type"] = "text/xml"
	frappe.local.response["filecontent"] = f'<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="{escape(clean_number(doc.from_number, _cc(doc)))}">{escape(clean_number(to))}</Dial></Response>'.encode()


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def status(c="", s="", **kw):
	"""Provider call-status callback: records how the call ended and how long it lasted."""
	if not c or not hmac.compare_digest(s or "", sign("status", c)) or not frappe.db.exists("Communication", c):
		frappe.throw(_("Invalid request"), frappe.PermissionError)
	form = frappe.form_dict
	state = (form.get("CallStatus") or form.get("Status") or "").strip().lower()
	secs = cint(form.get("CallDuration") or form.get("ConversationDuration") or form.get("DialCallDuration") or 0)
	nice = {"completed": _("Completed"), "busy": _("Busy"), "no-answer": _("No answer"), "failed": _("Failed"), "canceled": _("Cancelled"), "in-progress": _("In progress")}.get(state, state.title() or _("Finished"))
	text = nice + (f" · {secs // 60}m {secs % 60:02d}s" if secs else "")
	frappe.db.set_value("Communication", c, "content", text[:140], update_modified=False)
	frappe.db.commit()
	return "ok"
