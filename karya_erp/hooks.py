app_name = "karya_erp"
app_title = "Karya Erp"
app_publisher = "ridhav30"
app_description = "Karya Erp"
app_email = "ridhav30@gmail.com"
app_license = "mit"
website_route_rules = [
    {"from_route": "/karya_erp/<path:app_path>", "to_route": "karya_erp"},
]
# Apps
# ------------------

required_apps = ["erpnext"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "karya_erp",
# 		"logo": "/assets/karya_erp/logo.png",
# 		"title": "Karya Erp",
# 		"route": "/karya_erp",
# 		"has_permission": "karya_erp.api.permission.has_app_permission",
# 	}
# ]

# The dock, the rail down the left of the desk, is a document rather than a hook. Author it in
# Manage Dock on a developer-mode site and press Export to App, and it is written to
# `karya_erp/dock/karya_erp/karya_erp.json` for git to carry. An app that ships none has no
# rail: its sidebar gets a switcher in the header instead.
#
# A companion app, one that extends a host app rather than standing on its own, says so with
# `mount_on` on that same record, and its entries are appended to the host's rail. Mounting keeps
# the companion off the apps screen, so it takes precedence over any add_to_apps_screen above.

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/karya_erp/css/karya_erp.css"
# app_include_js = "/assets/karya_erp/js/karya_erp.js"

# include js, css files in header of web template
# web_include_css = "/assets/karya_erp/css/karya_erp.css"
# web_include_js = "/assets/karya_erp/js/karya_erp.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "karya_erp/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_kanban_js = {"doctype" : "public/js/doctype_kanban.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "karya_erp/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "karya_erp.utils.jinja_methods",
# 	"filters": "karya_erp.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "karya_erp.install.before_install"
# after_install = "karya_erp.install.after_install"

# Keep the bundled print formats (UAE Tax Invoice) in sync with templates/print/*.html
after_install = "karya_erp.print_formats.sync"
after_migrate = ["karya_erp.print_formats.sync"]

# Uninstallation
# ------------

# before_uninstall = "karya_erp.uninstall.before_uninstall"
# after_uninstall = "karya_erp.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "karya_erp.utils.before_app_install"
# after_app_install = "karya_erp.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "karya_erp.utils.before_app_uninstall"
# after_app_uninstall = "karya_erp.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "karya_erp.build.after_build"

# To hook into the build process of other apps
# The list of apps being built is passed as an argument

# after_app_build = "karya_erp.build.after_app_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "karya_erp.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["karya_erp.search.awesomebar_results"]

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
	"Karya Erp Employee Document": "karya_erp.karya_erp.doctype.karya_erp_employee_document.karya_erp_employee_document.get_permission_query_conditions",
}

has_permission = {
	"Karya Erp Employee Document": "karya_erp.karya_erp.doctype.karya_erp_employee_document.karya_erp_employee_document.has_permission",
}

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	# Operation log: every create / change / submit / cancel / delete / rename, by user and company.
	"*": {
		"after_insert": "karya_erp.audit.on_create",
		"on_change": "karya_erp.audit.on_change",
		"on_trash": "karya_erp.audit.on_delete",
		"after_rename": "karya_erp.audit.on_rename",
	},
	"Sales Invoice": {"before_validate": "karya_erp.racks.auto_pick_racks"},
	"POS Invoice": {"before_validate": "karya_erp.racks.auto_pick_racks"},
	"Delivery Note": {"before_validate": "karya_erp.racks.auto_pick_racks"},
}

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"karya_erp.karya_erp.doctype.karya_erp_employee_document.karya_erp_employee_document.update_statuses",
		"karya_erp.karya_erp.doctype.karya_erp_employee_document.karya_erp_employee_document.send_expiry_alerts",
		"karya_erp.pdc.due_reminders",
	],
}

# scheduler_events = {
# 	"all": [
# 		"karya_erp.tasks.all"
# 	],
# 	"daily": [
# 		"karya_erp.tasks.daily"
# 	],
# 	"hourly": [
# 		"karya_erp.tasks.hourly"
# 	],
# 	"weekly": [
# 		"karya_erp.tasks.weekly"
# 	],
# 	"monthly": [
# 		"karya_erp.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "karya_erp.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "karya_erp.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "karya_erp.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "karya_erp.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["karya_erp.utils.before_request"]
# after_request = ["karya_erp.utils.after_request"]

# Job Events
# ----------
# before_job = ["karya_erp.utils.before_job"]
# after_job = ["karya_erp.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"karya_erp.auth.validate"
# ]

# on_social_login = "karya_erp.auth.on_social_login"

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

# Front door: / and /login open the app instead of Frappe's home page and login page.
website_redirects = [
    {"source": "/", "target": "/karya_erp", "redirect_http_status": 302},
    {"source": "/login", "target": "/karya_erp", "redirect_http_status": 302},
]

# Stock method chosen in the Operator.
for _hook in ("after_install", "after_migrate"):
	_cur = globals().get(_hook) or []
	_cur = [_cur] if isinstance(_cur, str) else list(_cur)
	globals()[_hook] = _cur + ["karya_erp.setup_defaults.apply"]
