"""Zoho-style CRM tools for the Karya Erp front end, on top of ERPNext Lead / Opportunity.

- Deal board: open Opportunities grouped by Sales Stage; moving a card changes the stage (and the win probability).
- Activities: calls, notes, tasks and meetings logged against a Lead / Opportunity (Communication, Comment, ToDo, Event).
- Custom fields: managers add a field to Lead / Opportunity without Desk; the forms show it.
- Email tracking: tracked emails (open pixel + signed link redirects) with opens and clicks on the record's timeline.
- Forecast: pipeline and weighted value by closing month against per-person monthly targets.
"""

import base64
import hashlib
import hmac
import re
from urllib.parse import quote, urlparse

import frappe
from frappe import _
from frappe.utils import add_months, cint, flt, get_first_day, get_last_day, getdate, nowdate, now_datetime

CRM_DOCTYPES = ("Lead", "Opportunity")
OPEN_STATUSES = ("Open", "Replied", "Quotation")
BOARD_LIMIT = 100  # cards loaded per column
NO_STAGE = "(No stage)"
TARGET = "CRM Sales Target"
FIELD_TYPES = ("Data", "Small Text", "Int", "Float", "Currency", "Date", "Check", "Select", "Link", "Phone")
MANAGER_ROLES = ("System Manager", "Sales Manager")


def _check(doctype, perm="read", doc=None):
	if doctype not in CRM_DOCTYPES:
		frappe.throw(_("Only Lead and Opportunity are supported here."))
	frappe.has_permission(doctype, perm, doc=doc, throw=True)


def _manager():
	if not set(MANAGER_ROLES) & set(frappe.get_roles()):
		frappe.throw(_("Only a Sales Manager can do this."), frappe.PermissionError)


def ensure_setup():
	"""Win probability on each Sales Stage (safe to re-run after every migrate)."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields({"Sales Stage": [{"fieldname": "crm_probability", "fieldtype": "Percent", "label": "Win probability", "description": "Applied to an opportunity when it is moved to this stage", "insert_after": "stage_name"}]}, update=True)
	defaults = {"Prospecting": 10, "Qualification": 20, "Needs Analysis": 40, "Value Proposition": 50, "Identifying Decision Makers": 60, "Perception Analysis": 70, "Proposal/Price Quote": 80, "Negotiation/Review": 90}
	for stage, pct in defaults.items():
		if frappe.db.exists("Sales Stage", stage) and not flt(frappe.db.get_value("Sales Stage", stage, "crm_probability")):
			frappe.db.set_value("Sales Stage", stage, "crm_probability", pct, update_modified=False)


# ------------------------------------------------------------------ deal board

@frappe.whitelist()
def board(owner=None, company=None):
	"""Columns of open deals by stage, with count / amount / weighted amount per column."""
	frappe.has_permission("Opportunity", "read", throw=True)
	stages = frappe.get_all("Sales Stage", fields=["name", "crm_probability"], order_by="creation asc")
	filters = {"status": ["in", OPEN_STATUSES]}
	if owner:
		filters["opportunity_owner"] = owner
	if company:
		filters["company"] = company
	cols = []
	for s in stages + [frappe._dict(name=NO_STAGE, crm_probability=None)]:
		f = dict(filters)
		f["sales_stage"] = s.name if s.name != NO_STAGE else ["is", "not set"]
		rows = frappe.get_list(
			"Opportunity", filters=f, order_by="expected_closing asc, modified desc", limit_page_length=0,
			fields=["name", "title", "customer_name", "party_name", "opportunity_from", "opportunity_amount", "probability", "expected_closing", "opportunity_owner", "currency", "status"],
		)
		cards = rows[:BOARD_LIMIT]
		if s.name == NO_STAGE and not rows:
			continue
		cols.append({"stage": s.name, "probability": s.crm_probability, "count": len(rows), "amount": sum(flt(r.opportunity_amount) for r in rows), "weighted": sum(flt(r.opportunity_amount) * flt(r.probability) / 100 for r in rows), "cards": cards, "more": max(0, len(rows) - len(cards))})
	return {"columns": cols, "can_write": frappe.has_permission("Opportunity", "write"), "owners": [r.opportunity_owner for r in frappe.get_all("Opportunity", filters={"status": ["in", OPEN_STATUSES], "opportunity_owner": ["is", "set"]}, fields=["opportunity_owner"], group_by="opportunity_owner")]}


@frappe.whitelist(methods=["POST"])
def move_deal(name, stage):
	doc = frappe.get_doc("Opportunity", name)
	doc.check_permission("write")
	if stage == NO_STAGE:
		stage = None
	elif not frappe.db.exists("Sales Stage", stage):
		frappe.throw(_("Unknown stage {0}").format(stage))
	doc.sales_stage = stage
	pct = frappe.db.get_value("Sales Stage", stage, "crm_probability") if stage else None
	if pct is not None and pct != "":
		doc.probability = flt(pct)
	doc.save()
	return {"name": doc.name, "sales_stage": doc.sales_stage, "probability": doc.probability}


@frappe.whitelist(methods=["POST"])
def set_stage_probability(stage, probability):
	_manager()
	frappe.db.set_value("Sales Stage", stage, "crm_probability", max(0, min(100, flt(probability))))


# ------------------------------------------------------------------ activities

def _ref(doctype, name):
	_check(doctype)
	frappe.has_permission(doctype, "read", name, throw=True)


@frappe.whitelist()
def activities(doctype, name):
	_ref(doctype, name)
	out = []
	for c in frappe.get_all("Communication", filters={"reference_doctype": doctype, "reference_name": name, "communication_type": ["in", ("Communication", "Automated Message")]}, fields=["name", "subject", "content", "communication_medium", "sent_or_received", "sender", "recipients", "creation", "read_by_recipient", "read_by_recipient"]):
		kind = "call" if c.communication_medium == "Phone" else "email"
		out.append({"id": c.name, "kind": kind, "title": c.subject or "", "text": frappe.utils.strip_html_tags(c.content or "")[:600], "when": c.creation, "who": c.sender, "direction": c.sent_or_received, "opened": cint(c.get("read_by_recipient"))})
	for c in frappe.get_all("Comment", filters={"reference_doctype": doctype, "reference_name": name, "comment_type": ["in", ("Comment", "Info")]}, fields=["name", "content", "comment_type", "comment_email", "creation"]):
		txt = frappe.utils.strip_html_tags(c.content or "")
		kind = "click" if txt.startswith("Link clicked") else "note"
		out.append({"id": c.name, "kind": kind, "title": "", "text": txt[:600], "when": c.creation, "who": c.comment_email})
	for t in frappe.get_all("ToDo", filters={"reference_type": doctype, "reference_name": name, "status": ["!=", "Cancelled"]}, fields=["name", "description", "date", "status", "allocated_to", "creation", "priority"]):
		out.append({"id": t.name, "kind": "task", "title": frappe.utils.strip_html_tags(t.description or "")[:200], "text": "", "when": t.creation, "due": t.date, "done": t.status == "Closed", "who": t.allocated_to, "priority": t.priority})
	ev = frappe.get_all("Event Participants", filters={"reference_doctype": doctype, "reference_docname": name, "parenttype": "Event"}, pluck="parent")
	if ev:
		for e in frappe.get_all("Event", filters={"name": ["in", ev]}, fields=["name", "subject", "description", "starts_on", "ends_on", "owner", "status", "creation"]):
			out.append({"id": e.name, "kind": "meeting", "title": e.subject, "text": frappe.utils.strip_html_tags(e.description or "")[:400], "when": e.starts_on or e.creation, "ends": e.ends_on, "who": e.owner, "done": e.status == "Closed"})
	out.sort(key=lambda r: str(r["when"]), reverse=True)
	counts = {}
	for r in out:
		counts[r["kind"]] = counts.get(r["kind"], 0) + 1
	return {"items": out[:300], "counts": counts, "can_write": frappe.has_permission(doctype, "write", name)}


@frappe.whitelist(methods=["POST"])
def add_activity(doctype, name, kind, title=None, text=None, when=None, ends=None, due=None, assign_to=None, direction="Sent"):
	_check(doctype, "write", name)
	title = (title or "").strip()
	text = (text or "").strip()
	if kind == "note":
		if not text:
			frappe.throw(_("Write the note first."))
		doc = frappe.get_doc(doctype, name)
		doc.add_comment("Comment", text)
	elif kind == "call":
		if not (title or text):
			frappe.throw(_("Say what the call was about."))
		frappe.get_doc({
			"doctype": "Communication", "communication_type": "Communication", "communication_medium": "Phone", "communication_date": now_datetime(),
			"sent_or_received": "Received" if direction == "Received" else "Sent", "subject": title or _("Phone call"), "content": text or title,
			"reference_doctype": doctype, "reference_name": name, "sender": frappe.session.user, "status": "Linked",
		}).insert(ignore_permissions=True)
	elif kind == "task":
		if not title:
			frappe.throw(_("Give the task a title."))
		frappe.get_doc({"doctype": "ToDo", "description": title, "date": due or None, "allocated_to": assign_to or frappe.session.user, "reference_type": doctype, "reference_name": name, "priority": "Medium"}).insert(ignore_permissions=True)
	elif kind == "meeting":
		if not title or not when:
			frappe.throw(_("A meeting needs a title and a start time."))
		ev = frappe.get_doc({"doctype": "Event", "subject": title, "description": text, "starts_on": when, "ends_on": ends or None, "event_type": "Private", "status": "Open", "event_participants": [{"reference_doctype": doctype, "reference_docname": name}]})
		ev.insert(ignore_permissions=True)
	else:
		frappe.throw(_("Unknown activity type."))
	return True


@frappe.whitelist(methods=["POST"])
def complete_task(todo, done=1):
	t = frappe.get_doc("ToDo", todo)
	if not t.reference_type in CRM_DOCTYPES:
		frappe.throw(_("Not a CRM task."))
	frappe.has_permission(t.reference_type, "write", t.reference_name, throw=True)
	t.status = "Closed" if cint(done) else "Open"
	t.save(ignore_permissions=True)
	return True


@frappe.whitelist()
def my_follow_ups():
	"""Open CRM tasks of the current user (overdue first) for the dashboard-style list."""
	rows = frappe.get_all("ToDo", filters={"allocated_to": frappe.session.user, "status": "Open", "reference_type": ["in", CRM_DOCTYPES]}, fields=["name", "description", "date", "reference_type", "reference_name"], order_by="date asc", limit_page_length=100)
	rows.sort(key=lambda r: (r.date is None, str(r.date or "")))  # undated last
	today = getdate(nowdate())
	for r in rows:
		r["overdue"] = bool(r.date and getdate(r.date) < today)
		r["description"] = frappe.utils.strip_html_tags(r.description or "")[:160]
	return rows


# ------------------------------------------------------------------ custom fields

def _slug(label):
	s = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")
	return ("custom_" + s)[:60] if s else ""


@frappe.whitelist()
def custom_fields(doctype):
	_check(doctype)
	return frappe.get_all("Custom Field", filters={"dt": doctype, "fieldname": ["like", "custom\\_%"]}, fields=["name", "fieldname", "label", "fieldtype", "options", "reqd", "insert_after"], order_by="idx asc, creation asc") 


@frappe.whitelist()
def custom_field_meta():
	return {"types": FIELD_TYPES, "doctypes": CRM_DOCTYPES, "can_edit": bool(set(MANAGER_ROLES) & set(frappe.get_roles()))}


@frappe.whitelist(methods=["POST"])
def add_custom_field(doctype, label, fieldtype, options=None, reqd=0, insert_after=None):
	_check(doctype)
	_manager()
	label = (label or "").strip()
	if not label:
		frappe.throw(_("Give the field a label."))
	if fieldtype not in FIELD_TYPES:
		frappe.throw(_("Field type {0} is not supported.").format(fieldtype))
	fieldname = _slug(label)
	if not fieldname:
		frappe.throw(_("Use letters or numbers in the label."))
	if frappe.get_meta(doctype).has_field(fieldname):
		frappe.throw(_("A field called {0} already exists on {1}.").format(label, doctype))
	opts = (options or "").strip()
	if fieldtype == "Select":
		items = [o.strip() for o in re.split(r"[\n,]", opts) if o.strip()]
		if len(items) < 2:
			frappe.throw(_("A dropdown needs at least two choices (comma separated)."))
		opts = "\n" + "\n".join(items)
	elif fieldtype == "Link":
		if not opts or not frappe.db.exists("DocType", opts):
			frappe.throw(_("Pick the document type this field links to."))
	else:
		opts = "Phone" if fieldtype == "Phone" else None
		if fieldtype == "Phone":
			fieldtype = "Data"
	cf = frappe.get_doc({"doctype": "Custom Field", "dt": doctype, "fieldname": fieldname, "label": label, "fieldtype": fieldtype, "options": opts, "reqd": cint(reqd), "insert_after": insert_after or _last_field(doctype)})
	cf.insert(ignore_permissions=True)
	frappe.clear_cache(doctype=doctype)
	return {"fieldname": fieldname}


def _last_field(doctype):
	fields = [f.fieldname for f in frappe.get_meta(doctype).fields if f.fieldtype not in ("Section Break", "Column Break", "Tab Break") and not f.hidden]
	return fields[-1] if fields else None


@frappe.whitelist(methods=["POST"])
def delete_custom_field(doctype, fieldname):
	_check(doctype)
	_manager()
	if not fieldname.startswith("custom_") or fieldname in ("custom_lead_score",):
		frappe.throw(_("This field cannot be removed here."))
	name = frappe.db.get_value("Custom Field", {"dt": doctype, "fieldname": fieldname})
	if not name:
		frappe.throw(_("Field not found."))
	frappe.delete_doc("Custom Field", name, ignore_permissions=True)
	frappe.clear_cache(doctype=doctype)
	return True


# ------------------------------------------------------------------ email tracking

def _sign(*parts):
	key = (frappe.local.conf.get("encryption_key") or frappe.local.site).encode()
	return hmac.new(key, "|".join(parts).encode(), hashlib.sha256).hexdigest()[:24]


def _track_url(doctype, name, url):
	u = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
	return frappe.utils.get_url(f"/api/method/karya_erp.crm_pipeline.click?u={u}&d={quote(doctype)}&n={quote(name)}&s={_sign(doctype, name, url)}")


def track_links(html, doctype, name):
	def sub(m):
		url = m.group(2)
		if not re.match(r"https?://", url) or "/api/method/karya_erp.crm_pipeline.click" in url:
			return m.group(0)
		return f'{m.group(1)}{_track_url(doctype, name, url)}{m.group(3)}'
	return re.sub(r'(<a\s[^>]*href=")([^"]+)(")', sub, html or "", flags=re.I)


@frappe.whitelist(allow_guest=True)
def click(u, d, n, s):
	"""Signed redirect: records the click on the record, then forwards. Unsigned links are refused (no open redirect)."""
	pad = "=" * (-len(u) % 4)
	try:
		url = base64.urlsafe_b64decode(u + pad).decode()
	except Exception:
		frappe.throw(_("Invalid link"), frappe.PermissionError)
	if not hmac.compare_digest(s or "", _sign(d, n, url)) or urlparse(url).scheme not in ("http", "https"):
		frappe.throw(_("Invalid link"), frappe.PermissionError)
	if d in CRM_DOCTYPES and frappe.db.exists(d, n):
		frappe.get_doc(d, n).add_comment("Info", f"Link clicked: {url}"[:400])
	frappe.local.response["type"] = "redirect"
	frappe.local.response["location"] = url


@frappe.whitelist(methods=["POST"])
def send_tracked_email(doctype, name, recipients, subject, message):
	"""Send an email from a Lead / Opportunity: logged on its timeline, with an open pixel and tracked links."""
	_check(doctype, "write", name)
	if not (recipients or "").strip() or not (subject or "").strip():
		frappe.throw(_("Recipient and subject are required."))
	to = [r.strip() for r in re.split(r"[;,]", recipients) if r.strip()]
	for r in to:
		frappe.utils.validate_email_address(r, throw=True)
	frappe.sendmail(
		recipients=to, subject=subject, message=track_links(message, doctype, name), reference_doctype=doctype, reference_name=name,
		read_receipt=1, now=False,
	)
	return {"sent": len(to)}


# ------------------------------------------------------------------ forecast & targets

def _month_keys(start, months):
	first = get_first_day(getdate(start))
	return [add_months(first, i) for i in range(months)]


@frappe.whitelist()
def forecast(months=6, start=None, owner=None):
	"""Per month: pipeline, weighted forecast, sales booked (Sales Orders) and the target, for everyone or one person."""
	frappe.has_permission("Opportunity", "read", throw=True)
	months = max(1, min(cint(months) or 6, 24))
	keys = _month_keys(start or nowdate(), months)
	lo, hi = keys[0], get_last_day(keys[-1])
	f = {"status": ["in", OPEN_STATUSES], "expected_closing": ["between", [lo, hi]]}
	if owner:
		f["opportunity_owner"] = owner
	deals = frappe.get_list("Opportunity", filters=f, fields=["expected_closing", "opportunity_amount", "probability"], limit_page_length=0)
	so_f = {"docstatus": 1, "transaction_date": ["between", [lo, hi]]}
	if owner:
		so_f["owner"] = owner
	orders = frappe.get_list("Sales Order", filters=so_f, fields=["transaction_date", "base_grand_total"], limit_page_length=0) if frappe.has_permission("Sales Order", "read") else []
	tf = {"period_start": ["between", [lo, hi]]}
	if owner:
		tf["user"] = owner
	targets = frappe.get_all(TARGET, filters=tf, fields=["period_start", "target"]) if frappe.db.exists("DocType", TARGET) else []
	rows = []
	for k in keys:
		ym = k.strftime("%Y-%m")
		d = [x for x in deals if x.expected_closing.strftime("%Y-%m") == ym]
		rows.append({
			"month": ym, "deals": len(d), "pipeline": sum(flt(x.opportunity_amount) for x in d),
			"weighted": sum(flt(x.opportunity_amount) * flt(x.probability) / 100 for x in d),
			"commit": sum(flt(x.opportunity_amount) for x in d if flt(x.probability) >= 70),
			"booked": sum(flt(x.base_grand_total) for x in orders if getdate(x.transaction_date).strftime("%Y-%m") == ym),
			"target": sum(flt(x.target) for x in targets if getdate(x.period_start).strftime("%Y-%m") == ym),
		})
	return {"rows": rows, "total": {k: sum(r[k] for r in rows) for k in ("deals", "pipeline", "weighted", "commit", "booked", "target")}}


@frappe.whitelist()
def targets(year=None):
	frappe.has_permission(TARGET, "read", throw=True)
	year = cint(year) or getdate(nowdate()).year
	rows = frappe.get_all(TARGET, filters={"period_start": ["between", [f"{year}-01-01", f"{year}-12-31"]]}, fields=["name", "user", "period_start", "target"], order_by="user, period_start")
	return {"year": year, "rows": rows, "can_edit": frappe.has_permission(TARGET, "write")}


@frappe.whitelist(methods=["POST"])
def save_target(user, month, target):
	"""Set one person's target for a month (YYYY-MM). A blank / zero value removes it."""
	frappe.has_permission(TARGET, "write", throw=True)
	if not frappe.db.exists("User", user):
		frappe.throw(_("Unknown user {0}").format(user))
	start = get_first_day(getdate(f"{month}-01"))
	existing = frappe.db.get_value(TARGET, {"user": user, "period_start": start})
	if flt(target) <= 0:
		if existing:
			frappe.delete_doc(TARGET, existing)
		return True
	if existing:
		frappe.db.set_value(TARGET, existing, "target", flt(target))
	else:
		frappe.get_doc({"doctype": TARGET, "user": user, "period_start": start, "target": flt(target)}).insert()
	return True
