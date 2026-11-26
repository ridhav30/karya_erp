"""Hiring board over Frappe HR's standard recruitment documents (Job Opening, Job Applicant, Interview, Job Offer).

  board()            open (or all) job openings with their applicants placed in a stage:
                     New → Shortlisted → Interview → Offer → Hired, plus Hold / Rejected
  set_status()       moves an applicant between the statuses HR Job Applicant allows
  schedule()         books an interview through HRMS's own schedule_interview
No custom fields or doctypes.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint

STAGES = ["New", "Shortlisted", "Interview", "Offer", "Hired", "Hold", "Rejected"]
STATUSES = ["Open", "Replied", "Shortlisted", "Hold", "Rejected", "Accepted"]


def _rows(doctype, fields, filters=None):
	if not frappe.has_permission(doctype, "read"):
		return []
	return frappe.get_list(doctype, filters=filters or {}, fields=fields, limit_page_length=0, order_by="creation desc")


@frappe.whitelist()
def board(job_opening=None, include_closed=0):
	"""Applicants of one opening (or all open ones) grouped by hiring stage."""
	openings = _rows("Job Opening", ["name", "job_title", "designation", "department", "status", "vacancies", "closes_on", "company"],
		{} if cint(include_closed) else {"status": "Open"})
	if job_opening:
		openings = [o for o in openings if o.name == job_opening]
	names = [o.name for o in openings]
	applicants = _rows("Job Applicant", ["name", "applicant_name", "email_id", "phone_number", "status", "job_title", "designation", "source", "applicant_rating", "creation", "resume_attachment"],
		{"job_title": ["in", names]} if names else {"job_title": ["is", "set"]}) if names else []

	# What each applicant has in flight (interviews not rejected, offers awaiting / accepted, already hired)
	appl = [a.name for a in applicants]
	interviews, offers, hired = {}, {}, set()
	if appl:
		for i in _rows("Interview", ["name", "job_applicant", "status", "scheduled_on", "docstatus"], {"job_applicant": ["in", appl], "docstatus": ["<", 2]}):
			interviews.setdefault(i.job_applicant, []).append(i)
		for o in _rows("Job Offer", ["name", "job_applicant", "status", "docstatus"], {"job_applicant": ["in", appl], "docstatus": ["<", 2]}):
			offers.setdefault(o.job_applicant, []).append(o)
		if frappe.has_permission("Employee", "read") and frappe.get_meta("Employee").has_field("job_applicant"):
			hired = {e.job_applicant for e in frappe.get_all("Employee", filters={"job_applicant": ["in", appl]}, fields=["job_applicant"])}

	out = {s: [] for s in STAGES}
	for a in applicants:
		ivs, ofs = interviews.get(a.name, []), offers.get(a.name, [])
		a["interviews"] = [{"name": i.name, "status": i.status, "scheduled_on": i.scheduled_on} for i in ivs]
		a["offers"] = [{"name": o.name, "status": o.status} for o in ofs]
		if a.name in hired or any(o.status == "Accepted" for o in ofs) or a.status == "Accepted":
			stage = "Hired"
		elif a.status == "Rejected":
			stage = "Rejected"
		elif a.status == "Hold":
			stage = "Hold"
		elif any(o.status == "Awaiting Response" for o in ofs):
			stage = "Offer"
		elif any(i.status in ("Pending", "Under Review", "Cleared") for i in ivs):
			stage = "Interview"
		elif a.status == "Shortlisted":
			stage = "Shortlisted"
		else:
			stage = "New"
		a["stage"] = stage
		a["hired"] = a.name in hired
		out[stage].append(a)

	counts = {}
	for a in applicants:
		counts.setdefault(a.job_title, {"total": 0, "hired": 0})
		counts[a.job_title]["total"] += 1
		counts[a.job_title]["hired"] += 1 if a["stage"] == "Hired" else 0
	for o in openings:
		o["applicants"] = counts.get(o.name, {}).get("total", 0)
		o["hired"] = counts.get(o.name, {}).get("hired", 0)

	return {
		"openings": openings, "stages": STAGES, "applicants": out, "statuses": STATUSES,
		"can_write": bool(frappe.has_permission("Job Applicant", "write")),
		"can_interview": bool(frappe.has_permission("Interview", "create")),
		"can_offer": bool(frappe.has_permission("Job Offer", "create")),
	}


@frappe.whitelist(methods=["POST"])
def set_status(applicant, status):
	"""Move an applicant: Open / Replied / Shortlisted / Hold / Rejected / Accepted."""
	if status not in STATUSES:
		frappe.throw(_("Unknown status {0}").format(status))
	doc = frappe.get_doc("Job Applicant", applicant)
	doc.check_permission("write")
	doc.status = status
	doc.save()
	return doc.status


@frappe.whitelist(methods=["POST"])
def schedule(applicant, interview_type, scheduled_on, from_time=None, to_time=None, interviewers=None):
	"""Book an interview (interviewers: JSON list of user ids) using HRMS's own method."""
	from hrms.hr.doctype.job_applicant.job_applicant import schedule_interview

	users = json.loads(interviewers) if isinstance(interviewers, str) and interviewers else (interviewers or [])
	return schedule_interview(applicant, interview_type, scheduled_on, from_time, to_time, json.dumps([{"interviewer": u} for u in users]))
