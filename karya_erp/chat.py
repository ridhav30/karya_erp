"""Staff chat: direct messages and small groups, with file (PDF, image, document) sharing.

  rooms()           the person's chats, newest activity first, with the last message and unread count
  people()          users to start a chat with
  open_direct()     the one-to-one chat with a user (created on first use)
  create_group()    a named chat with several people
  search()          find messages (text or file name) across your chats, or inside one
  messages()        one page of a chat, newest first, paged by an "older than" cursor
  send()            a message and / or an uploaded file, optionally as a reply to an earlier message
  share_document()  a document (invoice, quotation ...) as a card with its PDF
  mark_read()       move the person's read marker to now
  unread()          total unread, for the badge
  download()        a shared file, for members only

Everything goes through these functions: the doctypes themselves are closed to everyone but System Managers,
so membership is checked here, on the server, for every call. Files are private; they are served by download()
after the same check. Chat is never written to the operation log.
"""

import mimetypes
import os

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, now_datetime

MAX_FILE_MB = 10
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".ppt", ".pptx", ".zip"}


def _me():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to chat"), frappe.PermissionError)
	return frappe.session.user


def _members(room):
	return [m.user for m in frappe.get_all("Karya Erp Chat Room Member", filters={"parent": room, "parenttype": "Karya Erp Chat Room"}, fields=["user"], order_by="idx")]


def _room(name, need_member=True):
	me = _me()
	if not frappe.db.exists("Karya Erp Chat Room", name):
		frappe.throw(_("Chat not found"), frappe.DoesNotExistError)
	if need_member and me not in _members(name):
		frappe.throw(_("You are not in this chat"), frappe.PermissionError)
	return frappe.get_doc("Karya Erp Chat Room", name)


def _name_of(user):
	return frappe.db.get_value("User", user, "full_name") or user


def _preview(msg):
	text = (msg.get("message") or "").strip()
	if text:
		return text[:140]
	return f"📎 {msg.get('file_name') or _('File')}"


@frappe.whitelist()
def people(q=None):
	"""Enabled staff to start a chat with (not yourself, not the built-in accounts)."""
	me = _me()
	filters = {"enabled": 1, "user_type": "System User", "name": ["not in", [me, "Administrator", "Guest"]]}
	or_filters = {"full_name": ["like", f"%{q.strip()}%"], "name": ["like", f"%{q.strip()}%"]} if q and q.strip() else None
	return frappe.get_all("User", filters=filters, or_filters=or_filters, fields=["name", "full_name", "user_image"], order_by="full_name", limit_page_length=50)


@frappe.whitelist()
def rooms():
	me = _me()
	# No raw table-name SQL in this file: generated apps rename doctypes, and only quoted doctype names are renamed.
	names = frappe.get_all("Karya Erp Chat Room Member", filters={"parenttype": "Karya Erp Chat Room", "user": me}, pluck="parent")
	if not names:
		return []
	# Whoever is polling has the app open, so everything sent to them so far has been delivered.
	frappe.db.set_value("Karya Erp Chat Room Member", {"parenttype": "Karya Erp Chat Room", "user": me}, "delivered_at", now_datetime(), update_modified=False)
	out = frappe.get_all("Karya Erp Chat Room", filters={"name": ["in", names]}, fields=["name", "room_type", "title", "last_message_at", "last_message", "creation"], order_by="last_message_at desc, creation desc")
	reads = {r.parent: r.last_read for r in frappe.get_all("Karya Erp Chat Room Member", filters={"parent": ["in", names], "user": me}, fields=["parent", "last_read"])}
	for r in out:
		members = _members(r.name)
		r.members = [{"user": u, "name": _name_of(u)} for u in members]
		if r.room_type == "Direct":
			other = next((u for u in members if u != me), me)
			r.title = _name_of(other)
			r.other = other
			r.image = frappe.db.get_value("User", other, "user_image")
		tail = frappe.get_all("Karya Erp Chat Message", filters={"room": r.name}, fields=["sender", "sent"], order_by="sent desc, creation desc", limit_page_length=1)
		r.last_sender = tail[0].sender if tail else None
		r.last_mine = bool(tail) and tail[0].sender == me
		r.last_sender_name = _name_of(tail[0].sender) if tail else None
		last = reads.get(r.name)
		r.unread = cint(frappe.db.count("Karya Erp Chat Message", {"room": r.name, "sender": ["!=", me], **({"sent": [">", last]} if last else {})}))
	return out


@frappe.whitelist()
def unread():
	me = _me()
	return sum(cint(r["unread"]) for r in rooms()) if frappe.db.exists("Karya Erp Chat Room Member", {"user": me}) else 0


@frappe.whitelist(methods=["POST"])
def open_direct(user):
	me = _me()
	if user == me or not frappe.db.exists("User", {"name": user, "enabled": 1}):
		frappe.throw(_("Choose someone else to chat with"))
	key = "|".join(sorted([me, user]))
	name = frappe.db.get_value("Karya Erp Chat Room", {"direct_key": key}, "name")
	if not name:
		doc = frappe.get_doc({"doctype": "Karya Erp Chat Room", "room_type": "Direct", "direct_key": key, "created_by": me,
			"members": [{"user": me, "last_read": now_datetime()}, {"user": user}]}).insert(ignore_permissions=True)
		name = doc.name
	return {"name": name}


@frappe.whitelist(methods=["POST"])
def create_group(title, users):
	me = _me()
	users = frappe.parse_json(users) if isinstance(users, str) else users
	users = [u for u in dict.fromkeys(users or []) if u != me and frappe.db.exists("User", {"name": u, "enabled": 1})]
	if not (title or "").strip():
		frappe.throw(_("Give the group a name"))
	if not users:
		frappe.throw(_("Add at least one person"))
	doc = frappe.get_doc({"doctype": "Karya Erp Chat Room", "room_type": "Group", "title": title.strip()[:100], "created_by": me,
		"members": [{"user": me, "last_read": now_datetime()}, *({"user": u} for u in users)]}).insert(ignore_permissions=True)
	return {"name": doc.name}


def _replies(rows, room):
	"""The messages `rows` answer, keyed by name, trimmed to what a quote needs. Only ones from the same chat."""
	names = list({m.reply_to for m in rows if m.get("reply_to")})
	if not names:
		return {}
	found = frappe.get_all("Karya Erp Chat Message", filters={"name": ["in", names], "room": room}, fields=["name", "sender", "message", "file_name", "file_url"])
	return {r.name: {"name": r.name, "sender_name": _name_of(r.sender), "mine": r.sender == frappe.session.user, "text": _preview(r),
		"is_image": bool(r.file_url) and os.path.splitext(r.file_name or "")[1].lower() in IMAGE_EXT} for r in found}


def _shape(m, me, replies=None):
	return {
		"name": m.name, "sender": m.sender, "sender_name": _name_of(m.sender), "mine": m.sender == me, "message": m.message,
		"file_name": m.file_name, "file_url": f"/api/method/karya_erp.chat.download?message={m.name}" if m.file_url else None,
		"is_image": bool(m.file_url) and os.path.splitext(m.file_name or "")[1].lower() in IMAGE_EXT,
		"sent": m.sent,
		"document": {"doctype": m.ref_doctype, "name": m.ref_name, "label": m.ref_label} if m.get("ref_doctype") and m.get("ref_name") else None,
		"reply_to": m.get("reply_to") or None,
		# the quoted message; a reply to something no longer there still shows as a reply
		"reply": (replies or {}).get(m.get("reply_to")) or ({"name": m.reply_to, "sender_name": "", "mine": False, "text": _("Message unavailable"), "is_image": False} if m.get("reply_to") else None),
	}


@frappe.whitelist()
def messages(room, before=None, limit=30):
	"""Newest-first page. Pass the oldest `sent` you already have as `before` for the next older page."""
	me = _me()
	_room(room)
	limit = min(cint(limit) or 30, 100)
	filters = {"room": room}
	if before:
		filters["sent"] = ["<", get_datetime(before)]
	rows = frappe.get_all("Karya Erp Chat Message", filters=filters, fields=["name", "sender", "message", "file_url", "file_name", "sent", "reply_to", "ref_doctype", "ref_name", "ref_label"], order_by="sent desc, creation desc", limit_page_length=limit + 1)
	more = len(rows) > limit
	rows = rows[:limit]
	replies = _replies(rows, room)
	members = {u: _name_of(u) for u in _members(room)}
	frappe.db.set_value("Karya Erp Chat Room Member", {"parent": room, "user": me}, "delivered_at", now_datetime(), update_modified=False)
	others = frappe.get_all("Karya Erp Chat Room Member", filters={"parent": room, "user": ["!=", me]}, fields=["last_read", "delivered_at"])
	# A message is delivered / read once every other member has got / read it (reading implies delivery).
	seen = [o.last_read for o in others]
	got = [max([t for t in (o.delivered_at, o.last_read) if t], default=None) for o in others]
	seen_until = min(seen) if seen and all(seen) else None
	delivered_until = min(got) if got and all(got) else None
	return {"messages": [_shape(m, me, replies) for m in reversed(rows)], "has_more": more, "members": members, "seen_until": seen_until, "delivered_until": delivered_until}


@frappe.whitelist(methods=["POST"])
def send(room, message=None, file_url=None, reply_to=None):
	return _send(room, message, file_url, reply_to)


def _send(room, message=None, file_url=None, reply_to=None, ref=None):
	me = _me()
	_room(room)
	text = (message or "").strip()
	file_name = None
	if file_url:
		file_name = _check_file(file_url)
	if not text and not file_url:
		frappe.throw(_("Write a message or attach a file"))
	if len(text) > 4000:
		frappe.throw(_("That message is too long"))
	if reply_to and not frappe.db.exists("Karya Erp Chat Message", {"name": reply_to, "room": room}):
		frappe.throw(_("The message you are replying to is not in this chat"))
	sent = now_datetime()
	msg = frappe.get_doc({"doctype": "Karya Erp Chat Message", "room": room, "reply_to": reply_to or None, **(ref or {}), "sender": me, "message": text or None, "file_url": file_url or None, "file_name": file_name, "sent": sent}).insert(ignore_permissions=True)
	frappe.db.set_value("Karya Erp Chat Room", room, {"last_message_at": sent, "last_message": _preview(msg)}, update_modified=False)
	frappe.db.set_value("Karya Erp Chat Room Member", {"parent": room, "user": me}, "last_read", sent, update_modified=False)
	return _shape(msg, me, _replies([msg], room))


def _check_file(file_url):
	"""A file the sender just uploaded, private, within the size and type limits."""
	f = frappe.db.get_value("File", {"file_url": file_url, "owner": frappe.session.user}, ["name", "file_name", "file_size", "is_private"], as_dict=True)
	if not f:
		frappe.throw(_("Upload the file first"))
	ext = os.path.splitext(f.file_name or "")[1].lower()
	if ext not in ALLOWED_EXT:
		frappe.throw(_("{0} files cannot be shared here").format(ext or _("This type of")))
	if cint(f.file_size) > MAX_FILE_MB * 1024 * 1024:
		frappe.throw(_("Files can be up to {0} MB").format(MAX_FILE_MB))
	if not cint(f.is_private):
		frappe.throw(_("Chat files must be private"))
	return f.file_name


@frappe.whitelist(methods=["POST"])
def mark_read(room):
	me = _me()
	_room(room)
	frappe.db.set_value("Karya Erp Chat Room Member", {"parent": room, "user": me}, {"last_read": now_datetime(), "delivered_at": now_datetime()}, update_modified=False)
	return {"ok": 1}


@frappe.whitelist()
def download(message):
	"""Stream a shared file to a member of its chat."""
	me = _me()
	m = frappe.db.get_value("Karya Erp Chat Message", message, ["room", "file_url", "file_name"], as_dict=True)
	if not m or not m.file_url:
		frappe.throw(_("File not found"), frappe.DoesNotExistError)
	if me not in _members(m.room):
		frappe.throw(_("You are not in this chat"), frappe.PermissionError)
	f = frappe.get_doc("File", {"file_url": m.file_url})
	frappe.local.response.filename = m.file_name or f.file_name
	with open(f.get_full_path(), "rb") as fh:  # raw bytes: File.get_content() may decode text-like files (PDFs included)
		frappe.local.response.filecontent = fh.read()
	frappe.local.response.type = "download"
	mime = mimetypes.guess_type(m.file_name or "")[0]
	if mime:
		frappe.local.response.content_type = mime


def _doc_label(doc):
	"""'Crescent Cafe · AED 1,200.00' style one-liner for the card in the chat."""
	party = doc.get("customer_name") or doc.get("supplier_name") or doc.get("party_name") or doc.get("employee_name") or doc.get("title")
	amount = doc.get("rounded_total") or doc.get("grand_total") or doc.get("net_pay") or doc.get("paid_amount")
	cur = doc.get("currency") or (frappe.get_cached_value("Company", doc.company, "default_currency") if doc.get("company") else "")
	return " · ".join(x for x in (str(party) if party else "", f"{cur} {frappe.utils.fmt_money(amount)}".strip() if amount else "") if x)[:140]


@frappe.whitelist(methods=["POST"])
def share_document(doctype, name, room=None, user=None, message=None, print_format=None, letterhead=0, attach_pdf=1):
	"""Send a document (invoice, quotation, ...) into a chat: a card that opens it, and its PDF as an attachment.

	The sender must be allowed to read the document. Give `room`, or `user` for a one-to-one chat (created if needed).
	"""
	import re

	_me()  # signed-in users only
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	if not room:
		if not user:
			frappe.throw(_("Choose who to send it to"))
		room = open_direct(user)["name"]
	_room(room)
	file_url = None
	if cint(attach_pdf):
		pdf = frappe.get_print(doctype, name, print_format or None, doc=doc, as_pdf=True, no_letterhead=0 if cint(letterhead) else 1)
		fname = re.sub(r"[^\w.-]+", "_", f"{name}.pdf")
		f = frappe.get_doc({"doctype": "File", "file_name": fname, "content": pdf, "is_private": 1}).insert(ignore_permissions=True)
		file_url = f.file_url
	ref = {"ref_doctype": doctype, "ref_name": name, "ref_label": _doc_label(doc)}
	out = _send(room, message, file_url, None, ref) if (message or "").strip() or file_url else None
	if out is None:  # card only: no text and no PDF
		out = _send(room, _("Shared {0} {1}").format(_(doctype), name), None, None, ref)
	out["room"] = room
	return out


@frappe.whitelist()
def search(q, room=None, start=0, limit=30):
	"""Messages matching `q` (in the text or the file name), newest first, only from chats the person is in."""
	me = _me()
	q = (q or "").strip()
	if len(q) < 2:
		return {"results": [], "has_more": False}
	if room:
		_room(room)
		rooms = [room]
	else:
		rooms = frappe.get_all("Karya Erp Chat Room Member", filters={"parenttype": "Karya Erp Chat Room", "user": me}, pluck="parent")
	if not rooms:
		return {"results": [], "has_more": False}
	limit, start = min(cint(limit) or 30, 100), cint(start)
	like = ["like", f"%{q}%"]
	rows = frappe.get_all("Karya Erp Chat Message", filters={"room": ["in", rooms]}, or_filters={"message": like, "file_name": like, "ref_name": like},
		fields=["name", "room", "sender", "message", "file_name", "ref_doctype", "ref_name", "sent"],
		order_by="sent desc, creation desc", start=start, limit_page_length=limit + 1)
	more = len(rows) > limit
	titles = {}
	for r in rows[:limit]:
		if r.room not in titles:
			doc = frappe.get_doc("Karya Erp Chat Room", r.room)
			titles[r.room] = _name_of(next((u for u in _members(r.room) if u != me), me)) if doc.room_type == "Direct" else doc.title
	return {"results": [{
		"name": r.name, "room": r.room, "room_title": titles[r.room], "sender_name": "" if r.sender == me else _name_of(r.sender), "mine": r.sender == me,
		"text": (r.message or (f"{r.ref_doctype} {r.ref_name}" if r.ref_name else None) or f"📎 {r.file_name}")[:200], "sent": r.sent,
	} for r in rows[:limit]], "has_more": more}
