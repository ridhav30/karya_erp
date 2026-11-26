"""First-run company setup: the ERPNext setup wizard, without leaving the app.

A fresh site has ERPNext installed but no Company, so nothing in the ERP can work. The UI shows a
setup screen when `boot()` reports `needs_setup`; this module feeds that screen (countries with their
usual currency and timezone, available charts of accounts) and runs the same steps as the Desk
wizard: region settings, fiscal year, company with its chart of accounts, default price lists and
settings. Only a System Manager can run it, and only while no Company exists.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_days, add_years, cint, getdate, nowdate


def needs_setup():
	"""True when ERPNext is installed but no Company has been created yet."""
	try:
		return not frappe.db.count("Company")
	except Exception:
		return False


def _require():
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only a System Manager can set up the company"), frappe.PermissionError)


def _country_info(country):
	from frappe.geo.country_info import get_country_info

	info = get_country_info(country) or {}
	zones = info.get("timezones") or []
	return {"currency": info.get("currency"), "timezone": zones[0] if zones else None}


def _charts(country):
	try:
		from erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts import get_charts_for_country

		return sorted(set(get_charts_for_country(country, with_standard=True) or []))
	except Exception:
		return ["Standard"]


@frappe.whitelist()
def options(country=None):
	"""Lists for the setup screen. With `country`, also that country's currency, timezone and charts."""
	_require()
	out = {
		"needs_setup": needs_setup(),
		"countries": frappe.get_all("Country", pluck="name", order_by="name"),
		"currencies": frappe.get_all("Currency", filters={"enabled": 1}, pluck="name", order_by="name")
		or frappe.get_all("Currency", pluck="name", order_by="name"),
		"timezones": _timezones(),
		"user": frappe.db.get_value("User", frappe.session.user, ["full_name", "email"], as_dict=True),
	}
	year = getdate(nowdate()).year
	out["fy_start_date"] = f"{year}-01-01"
	out["fy_end_date"] = f"{year}-12-31"
	if country:
		out.update(_country_info(country))
		out["charts"] = _charts(country)
	return out


def _timezones():
	try:
		from frappe.geo.country_info import get_all

		zones = set()
		for info in get_all().values():
			zones.update(info.get("timezones") or [])
		return sorted(zones)
	except Exception:
		return []


def _abbr(name):
	words = [w for w in "".join(c if c.isalnum() else " " for c in name).split() if w]
	return ("".join(w[0] for w in words)[:5] or name[:3]).upper()


@frappe.whitelist()
def complete(company_name, country, currency, timezone=None, fy_start_date=None, fy_end_date=None,
             company_abbr=None, chart_of_accounts=None, language="en"):
	"""Create the first company and mark the site as set up."""
	_require()
	company_name = (company_name or "").strip()
	if not company_name:
		frappe.throw(_("Company name is required"))
	if not needs_setup():
		frappe.throw(_("A company already exists"))
	if not (country and currency):
		frappe.throw(_("Country and currency are required"))

	start = getdate(fy_start_date or f"{getdate(nowdate()).year}-01-01")
	end = getdate(fy_end_date) if fy_end_date else add_days(add_years(start, 1), -1)
	if end <= start:
		frappe.throw(_("Fiscal year must end after it starts"))

	info = _country_info(country)
	user = frappe.db.get_value("User", frappe.session.user, ["full_name", "email"], as_dict=True) or {}
	args = frappe._dict(
		language=language or "en",
		country=country,
		currency=currency,
		timezone=timezone or info.get("timezone") or "UTC",
		time_zone=timezone or info.get("timezone") or "UTC",
		company_name=company_name,
		company_abbr=(company_abbr or _abbr(company_name))[:10],
		chart_of_accounts=chart_of_accounts or "Standard",
		fy_start_date=str(start),
		fy_end_date=str(end),
		# The signed-in user already exists; passing no e-mail keeps the wizard from creating another.
		full_name=user.get("full_name"),
		domain=None,
		enable_telemetry=0,
	)

	if frappe.is_setup_complete():
		# Desk wizard already ran on this site (e.g. company deleted later): only the ERPNext part remains.
		from erpnext.setup.setup_wizard.setup_wizard import setup_company, setup_defaults, stage_fixtures

		stage_fixtures(args)
		setup_company(args)
		setup_defaults(args)
		frappe.db.commit()
	else:
		from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

		setup_complete(json.dumps(args))

	if needs_setup():
		frappe.throw(_("Setup did not finish. Check the Error Log for details."))
	frappe.db.set_single_value("Global Defaults", "default_company", company_name)
	frappe.clear_cache()
	return {"company": company_name}
