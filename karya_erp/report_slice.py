"""Send a big ERPNext report to the browser one page at a time.

Some reports (the General Ledger grouped by account or party, order status, stock ageing …) are built whole by
ERPNext. Shipping every row to the browser makes a large one freeze the tab, so this runs the report on the
server and returns only a page of it. The finished report is kept for a few minutes per user and filter set, so
paging through it does not run it again; an enormous result is refused with a hint to narrow the filters
instead of being sent.

(Reports that can be answered straight from SQL have their own paged versions — stock_reports, analytics_reports,
ledger_reports — and never build the whole result.)
"""

import hashlib

import frappe
from frappe import _
from frappe.utils import cint

from karya_erp.stock_reports import EXPORT_PAGE, MAX_PAGE

KEEP_SECONDS = 300  # how long a finished report is reused for paging
MAX_ROWS = 200_000  # beyond this the report is refused rather than sent
MAX_CACHED_ROWS = 50_000  # bigger results are paged but rebuilt per request instead of held in the cache


def _key(report_name, filters):
	import json

	parsed = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	body = json.dumps(parsed, sort_keys=True, default=str)
	return "karya_erp:report:" + hashlib.sha1(f"{frappe.session.user}|{report_name}|{body}".encode()).hexdigest()


def _build(report_name, filters):
	from frappe.desk.query_report import run as run_report

	res = run_report(report_name=report_name, filters=filters, ignore_prepared_report=1) or {}
	rows = res.get("result") or []
	if len(rows) > MAX_ROWS:
		frappe.throw(_("{0} has {1} rows — narrow the filters (dates, account, party) and try again").format(_(report_name), f"{len(rows):,}"))
	return {k: res.get(k) for k in ("columns", "message", "report_summary", "skip_total_row", "add_total_row") if k in res} | {"result": rows}


@frappe.whitelist()
def run(report_name, filters=None, start=0, page_length=200, export=0):
	"""One page of an ERPNext report: {columns, result (this page), total (all rows), report_summary, message}."""
	frappe.has_permission("Report", "read", throw=False)  # the report's own roles are checked when it runs
	key = _key(report_name, filters)
	full = None
	try:
		full = frappe.cache.get_value(key)
	except Exception:
		pass
	if full is None:
		full = _build(report_name, filters)
		if len(full["result"]) > cint(page_length) and len(full["result"]) <= MAX_CACHED_ROWS:
			try:
				frappe.cache.set_value(key, full, expires_in_sec=KEEP_SECONDS)
			except Exception:
				pass
	start = max(cint(start), 0)
	size = min(max(cint(page_length), 1), EXPORT_PAGE if cint(export) else MAX_PAGE)
	out = {k: v for k, v in full.items() if k != "result"}
	out["result"] = full["result"][start : start + size]
	out["total"] = len(full["result"])
	return out
