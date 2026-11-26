"""Performance (Frappe HR appraisals) for the React app.

Flow (yearly cycle, 1–5 scale):
  HR starts the Appraisal Cycle (creates an Appraisal per employee from their template)
  → employee does the self-appraisal (rates the criteria, writes reflections, updates goal progress)
  → manager (Employee.reports_to) gives feedback (criteria ratings + KRA scores + comments)
  → HR finalises (submits the Appraisal; Frappe HR computes the final score)
  → employee acknowledges.

Stages are derived from the documents themselves — no Workflow or custom fields needed.
Ratings use Frappe's Rating field: stored 0–1, shown as 1–5 stars.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt

from karya_erp.hr import employee_of, is_hr

ACK_PREFIX = "Acknowledged the appraisal"


def _require_employee():
	employee = employee_of()
	if not employee:
		frappe.throw(_("Your user is not linked to an active employee"))
	return employee


def _manager_of(employee):
	return frappe.db.get_value("Employee", employee, "reports_to")


def _feedback_from(appraisal, reviewer):
	return frappe.db.get_value(
		"Employee Performance Feedback", {"appraisal": appraisal, "reviewer": reviewer, "docstatus": 1}, "name",
	)


def _acknowledged(appraisal):
	return frappe.db.exists("Comment", {
		"reference_doctype": "Appraisal", "reference_name": appraisal, "comment_type": "Info", "content": ["like", f"{ACK_PREFIX}%"],
	})


def _self_done(doc):
	rows = doc.get("self_ratings") or []
	return bool(rows) and all(flt(r.rating) > 0 for r in rows)


def stage_of(doc):
	if doc.docstatus == 2:
		return "Cancelled"
	if doc.docstatus == 1:
		return "Acknowledged" if _acknowledged(doc.name) else "To Acknowledge"
	if not _self_done(doc):
		return "Self Appraisal"
	manager = _manager_of(doc.employee)
	if manager and not _feedback_from(doc.name, manager):
		return "Manager Review"
	return "HR Review"


def _rows(table):
	return [
		{k: r.get(k) for k in ("name", "criteria", "kra", "per_weightage", "rating", "goal_completion", "goal_score") if r.get(k) is not None}
		for r in table or []
	]


def _appraisal_payload(doc):
	cycle = frappe.db.get_value("Appraisal Cycle", doc.appraisal_cycle, ["cycle_name", "start_date", "end_date", "status", "kra_evaluation_method"], as_dict=True) or {}
	goals = frappe.get_all(
		"Goal",
		filters={"employee": doc.employee, "appraisal_cycle": doc.appraisal_cycle},
		fields=["name", "goal_name", "kra", "progress", "status", "end_date", "is_group", "parent_goal"],
		order_by="kra asc, goal_name asc",
	)
	feedback = frappe.get_all(
		"Employee Performance Feedback",
		filters={"appraisal": doc.name, "docstatus": 1},
		fields=["name", "reviewer", "reviewer_name", "total_score", "feedback", "modified"],
		order_by="modified desc",
	)
	for f in feedback:
		f.feedback = frappe.utils.strip_html(f.feedback or "")
		f.ratings = _rows(frappe.get_all("Employee Feedback Rating", filters={"parent": f.name, "parenttype": "Employee Performance Feedback"}, fields=["criteria", "per_weightage", "rating"]))
	return {
		"name": doc.name,
		"employee": doc.employee,
		"employee_name": doc.employee_name,
		"designation": doc.get("designation"),
		"department": doc.get("department"),
		"cycle": {"name": doc.appraisal_cycle, **cycle},
		"template": doc.get("appraisal_template"),
		"stage": stage_of(doc),
		"docstatus": doc.docstatus,
		"manual": bool(cint(doc.get("rate_goals_manually"))),
		# Manual rating (v15+/v16): KRAs live in "goals" with a 0–5 score; automated: "appraisal_kra" from goal progress.
		"kras": [
			{"name": r.name, "kra": r.kra, "per_weightage": flt(r.per_weightage), "score": flt(r.get("score")), "score_earned": flt(r.get("score_earned"))}
			for r in doc.get("goals") or []
		] if cint(doc.get("rate_goals_manually")) else _rows(doc.get("appraisal_kra")),
		"self_ratings": _rows(doc.get("self_ratings")),
		"reflections": frappe.utils.strip_html(doc.get("reflections") or ""),
		"scores": {k: flt(doc.get(k)) for k in ("total_score", "self_score", "avg_feedback_score", "final_score")},
		"goals": goals,
		"feedback": feedback,
		"manager": _manager_of(doc.employee),
	}


# ---------------------------------------------------------------- employee

@frappe.whitelist()
def my_appraisal(name=None):
	employee = _require_employee()
	filters = {"employee": employee, "docstatus": ["<", 2]}
	if name:
		filters["name"] = name
	names = frappe.get_all("Appraisal", filters=filters, pluck="name", order_by="creation desc", limit_page_length=5)
	if not names:
		return {"current": None, "history": []}
	current = frappe.get_doc("Appraisal", names[0])
	history = frappe.get_all(
		"Appraisal", filters={"employee": employee, "docstatus": 1, "name": ["!=", current.name]},
		fields=["name", "appraisal_cycle", "final_score"], order_by="creation desc", limit_page_length=5,
	)
	return {"current": _appraisal_payload(current), "history": history}


@frappe.whitelist(methods=["POST"])
def save_self(appraisal, ratings, reflections=None):
	"""ratings: [{criteria, rating 0–1}] for the employee's own draft appraisal."""
	employee = _require_employee()
	doc = frappe.get_doc("Appraisal", appraisal)
	if doc.employee != employee:
		frappe.throw(_("This is not your appraisal"), frappe.PermissionError)
	if doc.docstatus != 0:
		frappe.throw(_("This appraisal is already finalised"))
	ratings = json.loads(ratings) if isinstance(ratings, str) else ratings
	by = {r["criteria"]: min(1.0, max(0.0, flt(r.get("rating")))) for r in ratings or []}
	for row in doc.get("self_ratings") or []:
		if row.criteria in by:
			row.rating = by[row.criteria]
	if reflections is not None and doc.meta.has_field("reflections"):
		doc.reflections = reflections
	doc.flags.ignore_permissions = True  # ownership checked above
	doc.save()
	return {"stage": stage_of(doc), "self_score": flt(doc.get("self_score"))}


@frappe.whitelist(methods=["POST"])
def update_goal(goal, progress):
	employee = _require_employee()
	g = frappe.get_doc("Goal", goal)
	manager_of_owner = _manager_of(g.employee)
	if g.employee != employee and manager_of_owner != employee and not is_hr():
		frappe.throw(_("You can only update your own or your team's goals"), frappe.PermissionError)
	if cint(g.get("is_group")):
		frappe.throw(_("Progress of a group goal comes from its sub-goals"))
	g.progress = min(100, max(0, flt(progress)))
	if g.meta.has_field("status") and g.status in ("Pending", "In Progress", "Completed"):
		g.status = "Completed" if g.progress >= 100 else ("In Progress" if g.progress > 0 else "Pending")
	g.flags.ignore_permissions = True
	g.save()
	return {"progress": g.progress, "status": g.get("status")}


@frappe.whitelist(methods=["POST"])
def acknowledge(appraisal):
	employee = _require_employee()
	doc = frappe.get_doc("Appraisal", appraisal)
	if doc.employee != employee or doc.docstatus != 1:
		frappe.throw(_("Only your own finalised appraisal can be acknowledged"))
	if not _acknowledged(doc.name):
		frappe.get_doc({
			"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Appraisal", "reference_name": doc.name,
			"content": f"{ACK_PREFIX} on {frappe.utils.formatdate(frappe.utils.nowdate())}",
			"comment_email": frappe.session.user, "comment_by": frappe.utils.get_fullname(),
		}).insert(ignore_permissions=True)
	return True


# ---------------------------------------------------------------- manager

@frappe.whitelist()
def team(cycle=None):
	"""Appraisals of the current user's direct reports (open cycles unless a cycle is given)."""
	me = _require_employee()
	reports = frappe.get_all("Employee", filters={"reports_to": me, "status": "Active"}, fields=["name", "employee_name", "designation", "department"])
	if not reports:
		return {"rows": [], "cycles": []}
	filters = {"employee": ["in", [r.name for r in reports]], "docstatus": ["<", 2]}
	if cycle:
		filters["appraisal_cycle"] = cycle
	apps = frappe.get_all("Appraisal", filters=filters, fields=["name", "employee", "appraisal_cycle", "creation"], order_by="creation desc")
	latest = {}
	for a in apps:
		latest.setdefault(a.employee, a)
	rows = []
	for r in reports:
		a = latest.get(r.name)
		doc = a and frappe.get_doc("Appraisal", a.name)
		rows.append({
			**r,
			"appraisal": a and a.name,
			"cycle": a and a.appraisal_cycle,
			"stage": doc and stage_of(doc),
			"my_feedback": a and _feedback_from(a.name, me),
			"self_score": doc and flt(doc.get("self_score")),
			"final_score": doc and flt(doc.get("final_score")),
		})
	return {"rows": rows, "cycles": sorted({a.appraisal_cycle for a in apps})}


@frappe.whitelist()
def appraisal_for_review(appraisal):
	me = _require_employee()
	doc = frappe.get_doc("Appraisal", appraisal)
	if _manager_of(doc.employee) != me and not is_hr():
		frappe.throw(_("You are not this employee's manager"), frappe.PermissionError)
	return _appraisal_payload(doc)


@frappe.whitelist(methods=["POST"])
def give_feedback(appraisal, ratings, feedback=None, kra_scores=None):
	"""Manager review: Employee Performance Feedback (criteria ratings 0–1 + comments), plus KRA completion % when rated manually."""
	me = _require_employee()
	doc = frappe.get_doc("Appraisal", appraisal)
	if _manager_of(doc.employee) != me and not is_hr():
		frappe.throw(_("You are not this employee's manager"), frappe.PermissionError)
	if doc.docstatus != 0:
		frappe.throw(_("This appraisal is already finalised"))
	if _feedback_from(doc.name, me):
		frappe.throw(_("You have already given feedback on this appraisal"))
	ratings = json.loads(ratings) if isinstance(ratings, str) else (ratings or [])

	fb = frappe.new_doc("Employee Performance Feedback")
	fb.update({
		"employee": doc.employee, "reviewer": me, "appraisal": doc.name, "appraisal_cycle": doc.appraisal_cycle,
		"feedback": feedback or "",
	})
	weights = {r.criteria: r.per_weightage for r in doc.get("self_ratings") or []}
	for r in ratings:
		if r.get("criteria"):
			fb.append("feedback_ratings", {"criteria": r["criteria"], "per_weightage": weights.get(r["criteria"], 0), "rating": min(1.0, max(0.0, flt(r.get("rating"))))})
	fb.flags.ignore_permissions = True  # reviewer = manager, checked above
	fb.insert()
	fb.submit()

	kra_scores = json.loads(kra_scores) if isinstance(kra_scores, str) else (kra_scores or [])
	if kra_scores and cint(doc.get("rate_goals_manually")):
		# score 0–5 per KRA row ("goals" table); Frappe HR computes score_earned and the total on save
		by = {k.get("name") or k.get("kra"): flt(k.get("score")) for k in kra_scores}
		changed = False
		for row in doc.get("goals") or []:
			value = by.get(row.name, by.get(row.kra))
			if value is not None:
				row.score = min(5, max(0, value))
				changed = True
		if changed:
			doc.flags.ignore_permissions = True
			doc.save()
	return {"feedback": fb.name}


# ---------------------------------------------------------------- HR

def _require_hr():
	if not is_hr():
		frappe.throw(_("Only HR can manage appraisal cycles"), frappe.PermissionError)


@frappe.whitelist()
def cycle_overview(cycle):
	_require_hr()
	c = frappe.get_doc("Appraisal Cycle", cycle)
	apps = frappe.get_all("Appraisal", filters={"appraisal_cycle": cycle, "docstatus": ["<", 2]}, pluck="name")
	rows, stages, scores = [], {}, []
	for name in apps:
		doc = frappe.get_doc("Appraisal", name)
		st = stage_of(doc)
		stages[st] = stages.get(st, 0) + 1
		final = flt(doc.get("final_score"))
		if doc.docstatus == 1:
			scores.append(final)
		rows.append({
			"appraisal": name, "employee": doc.employee, "employee_name": doc.employee_name,
			"department": doc.get("department"), "stage": st,
			"self_score": flt(doc.get("self_score")), "avg_feedback_score": flt(doc.get("avg_feedback_score")),
			"total_score": flt(doc.get("total_score")), "final_score": final,
		})
	distribution = {str(i): 0 for i in range(1, 6)}
	for s in scores:
		bucket = str(min(5, max(1, int(round(s)))))
		distribution[bucket] += 1
	return {
		"cycle": {"name": c.name, "cycle_name": c.get("cycle_name"), "status": c.get("status"), "start_date": str(c.start_date), "end_date": str(c.end_date)},
		"appraisees": len(c.get("appraisees") or []),
		"rows": sorted(rows, key=lambda r: r["employee_name"] or ""),
		"stages": stages,
		"distribution": distribution,
	}


@frappe.whitelist(methods=["POST"])
def cycle_action(cycle, action):
	"""HR: get_employees | create_appraisals | complete (Frappe HR's own Appraisal Cycle methods)."""
	_require_hr()
	c = frappe.get_doc("Appraisal Cycle", cycle)
	c.check_permission("write")

	def call(*names):
		for n in names:
			if hasattr(c, n):
				return getattr(c, n)()
		frappe.throw(_("This Frappe HR version has none of: {0}").format(", ".join(names)))

	if action == "get_employees":
		call("set_employees")
		c.save()
		return {"appraisees": len(c.appraisees)}
	if action == "create_appraisals":
		call("create_appraisals")
		if frappe.db.get_value("Appraisal Cycle", c.name, "status") == "Not Started":
			frappe.db.set_value("Appraisal Cycle", c.name, "status", "In Progress")  # v16 leaves it unchanged
		return {"ok": True}
	if action == "complete":
		if hasattr(c, "complete_cycle"):
			c.complete_cycle()
		else:
			c.db_set("status", "Completed")
		return {"ok": True}
	frappe.throw(_("Unknown action {0}").format(action))


@frappe.whitelist(methods=["POST"])
def finalise(appraisals):
	"""HR: submit appraisals (Frappe HR computes the final score). appraisals: JSON list of names."""
	_require_hr()
	names = json.loads(appraisals) if isinstance(appraisals, str) else appraisals
	done, failed = [], []
	for name in names or []:
		try:
			doc = frappe.get_doc("Appraisal", name)
			if doc.docstatus == 0:
				doc.submit()
				frappe.db.commit()
			done.append(name)
		except Exception as ex:
			frappe.db.rollback()
			frappe.clear_last_message()
			failed.append({"appraisal": name, "error": frappe.utils.strip_html(str(ex))[:200]})
	return {"done": done, "failed": failed}
