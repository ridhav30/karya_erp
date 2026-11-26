/**
 * Language + direction for the UI (English / Arabic).
 *
 * t(text): karya_erp's own Arabic wording first (AR below), then ERPNext / Frappe HR's Arabic
 * translations (loaded once from the server and cached), else the English text. The language lives
 * in localStorage ('karya_erp_lang'); switching it reloads the app with <html dir="rtl" lang="ar">.
 */

export const LANGS = [{ code: 'en', label: 'English' }, { code: 'ar', label: 'العربية' }]
const KEY = 'karya_erp_lang'
const CACHE = 'karya_erp_tr_ar'

export function getLang() {
  try { return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en' } catch { return 'en' }
}

let server = {}

/** Load ERPNext's Arabic translations (cached for a day) before the first render. */
export async function initI18n() {
  const lang = getLang()
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  if (lang !== 'ar') return
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE) || 'null')
    if (cached && Date.now() - cached.at < 86_400_000) { server = cached.data; return }
  } catch { /* ignore */ }
  try {
    const res = await fetch('/api/method/karya_erp.api.translations?lang=ar', { credentials: 'include' })
    if (res.ok) {
      server = (await res.json()).message || {}
      try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data: server })) } catch { /* quota */ }
    }
  } catch { /* offline: English fallback */ }
}

export async function setLang(lang, call) {
  try { localStorage.setItem(KEY, lang) } catch { /* private mode */ }
  try { await call?.post('karya_erp.api.set_language', { lang }) } catch { /* UI still switches */ }
  window.location.reload()
}

export const isRtl = () => getLang() === 'ar'

/** Translate a UI string (non-strings are returned unchanged). */
export function t(text) {
  if (typeof text !== 'string' || getLang() !== 'ar' || !text) return text
  return AR[text] ?? server[text] ?? text
}

// karya_erp wording (menus, self-service, buttons). ERPNext doctype / field / status names come from the server.
const AR = {
  // shell
  Dashboard: 'لوحة التحكم', Approvals: 'الموافقات', 'My HR': 'شؤوني الوظيفية', 'My Team': 'فريقي', Reports: 'التقارير', Settings: 'الإعدادات',
  'Import data': 'استيراد البيانات', 'Users & Access': 'المستخدمون والصلاحيات', 'Open Desk': 'فتح المكتب', Collapse: 'طي', 'Log out': 'تسجيل الخروج',
  'My settings': 'إعداداتي', Language: 'اللغة', 'Search…': 'بحث…', Search: 'بحث', 'Create new': 'إنشاء جديد', Notifications: 'الإشعارات', 'Toggle theme': 'تبديل المظهر',
  // groups
  CRM: 'إدارة العملاء', Selling: 'المبيعات', Buying: 'المشتريات', Stock: 'المخزون', Pricing: 'التسعير', Accounts: 'الحسابات', Assets: 'الأصول', 'Bank Statements': 'كشوف الحساب البنكية', 'Import statement': 'استيراد كشف الحساب', 'Match lines': 'مطابقة البنود', 'Auto-match exact': 'مطابقة تلقائية', 'Find match': 'بحث عن مطابقة', 'Post to account': 'ترحيل إلى حساب', Projects: 'المشاريع', Tasks: 'المهام', Timesheets: 'سجلات الوقت', Progress: 'التقدم', Budget: 'الميزانية', 'Cost so far': 'التكلفة حتى الآن', Billed: 'المفوتر', 'Bill hours': 'فوترة الساعات', 'Add task': 'إضافة مهمة', Working: 'قيد العمل', 'Pending Review': 'بانتظار المراجعة', 'Point of Sale': 'نقطة البيع', 'Point of sale': 'نقطة البيع', 'POS Profiles': 'ملفات نقاط البيع', 'Shift Closings': 'إغلاق الورديات', 'Close shift': 'إغلاق الوردية', 'Open shift': 'فتح الوردية', 'Complete sale': 'إتمام البيع', 'Print receipt': 'طباعة الإيصال', 'New sale': 'بيع جديد', Subtotal: 'المجموع الفرعي', 'Change due': 'المتبقي للعميل', Counted: 'المعدود', Expected: 'المتوقع', Recruitment: 'التوظيف', 'Hiring Board': 'لوحة التوظيف', 'Job Openings': 'الوظائف الشاغرة', Applicants: 'المتقدمون', Interviews: 'المقابلات', 'Job Offers': 'عروض العمل', Shortlisted: 'القائمة المختصرة', Interview: 'مقابلة', Offer: 'عرض', Hired: 'تم التعيين', Hold: 'معلق',  'Fixed assets': 'الأصول الثابتة', 'Fixed Assets': 'الأصول الثابتة', 'Asset List': 'قائمة الأصول', 'Asset Movements': 'حركة الأصول', 'Asset Categories': 'فئات الأصول', Locations: 'المواقع', 'Post depreciation': 'ترحيل الإهلاك', 'Book value': 'القيمة الدفترية', 'Accounts Setup': 'إعداد الحسابات',
  HR: 'الموارد البشرية', 'Attendance & Shifts': 'الحضور والمناوبات', Leave: 'الإجازات', Payroll: 'الرواتب', Expenses: 'المصروفات', Performance: 'الأداء',
  // menu items
  Leads: 'العملاء المحتملون', Opportunities: 'الفرص', Customers: 'العملاء', Quotations: 'عروض الأسعار', 'Sales Orders': 'أوامر البيع', 'Delivery Notes': 'إشعارات التسليم',
  'Sales Invoices': 'فواتير المبيعات', Suppliers: 'الموردون', 'Material Requests': 'طلبات المواد', 'Purchase Orders': 'أوامر الشراء', 'Purchase Receipts': 'إيصالات الاستلام',
  'Purchase Invoices': 'فواتير المشتريات', Items: 'الأصناف', Warehouses: 'المستودعات', 'Stock Entries': 'حركات المخزون', 'Stock Balance': 'رصيد المخزون',
  'Stock Reconciliation': 'تسوية المخزون', 'Landed Costs': 'تكاليف الاستيراد', Batches: 'الدفعات', 'Serial Numbers': 'الأرقام التسلسلية', 'Stock Ledger': 'دفتر المخزون',
  'Item Prices': 'أسعار الأصناف', 'Price Lists': 'قوائم الأسعار', 'Pricing Rules': 'قواعد التسعير', Overview: 'نظرة عامة', Payments: 'المدفوعات',
  'Post-dated Cheques': 'الشيكات الآجلة', 'Journal Entries': 'قيود اليومية', 'Credit Notes': 'إشعارات دائنة', 'Debit Notes': 'إشعارات مدينة', 'Chart of Accounts': 'دليل الحسابات',
  'Financial Reports': 'التقارير المالية', 'VAT Return': 'إقرار ضريبة القيمة المضافة', 'E-invoicing': 'الفوترة الإلكترونية', 'Bank Reconciliation': 'التسوية البنكية',
  'Payment Reconciliation': 'تسوية المدفوعات', Dunning: 'المطالبات', Budgets: 'الموازنات', 'Opening Balances': 'الأرصدة الافتتاحية', 'Period Closing': 'إقفال الفترة',
  'Bank Accounts': 'الحسابات البنكية', Banks: 'البنوك', 'Cost Centers': 'مراكز التكلفة', 'Dunning Types': 'أنواع المطالبات', 'Modes of Payment': 'طرق الدفع',
  'Sales Tax Templates': 'قوالب ضريبة المبيعات', 'Purchase Tax Templates': 'قوالب ضريبة المشتريات', 'Fiscal Years': 'السنوات المالية',
  'HR Dashboard': 'لوحة الموارد البشرية', Employees: 'الموظفون', 'Employee Documents': 'وثائق الموظفين', Departments: 'الأقسام', Designations: 'المسميات الوظيفية',
  Branches: 'الفروع', 'Holiday Lists': 'قوائم العطلات', 'Holiday Assignments': 'تعيين العطلات', 'Final Settlement': 'التسوية النهائية', 'Daily Sheet': 'الكشف اليومي',
  'Monthly Register': 'السجل الشهري', 'Attendance Records': 'سجلات الحضور', 'Check-ins': 'تسجيلات الدخول', 'Shift Roster': 'جدول المناوبات', 'Shift Types': 'أنواع المناوبات',
  'Shift Assignments': 'تعيينات المناوبات', 'Shift Requests': 'طلبات المناوبات', 'Leave Applications': 'طلبات الإجازة', 'Allocate Leave': 'تخصيص الإجازات',
  'Leave Allocations': 'أرصدة الإجازات', 'Leave Types': 'أنواع الإجازات', 'Leave Periods': 'فترات الإجازات', 'Attendance Requests': 'طلبات الحضور', 'Payroll Runs': 'دورات الرواتب',
  'Salary Slips': 'قسائم الرواتب', 'Salary Register': 'سجل الرواتب', Overtime: 'العمل الإضافي', 'Employee Loans': 'قروض الموظفين', 'Air Tickets': 'تذاكر الطيران',
  Provisions: 'المخصصات', 'Salary Structures': 'هياكل الرواتب', 'Salary Assignments': 'تعيينات الرواتب', 'Salary Components': 'مكونات الراتب',
  'Additional Salary': 'مبالغ إضافية', 'Karya Erp WPS Settings': 'إعدادات نظام حماية الأجور', 'Expense Claims': 'مطالبات المصروفات', 'Employee Advances': 'سلف الموظفين',
  'Expense Types': 'أنواع المصروفات', 'Appraisal Cycles': 'دورات التقييم', Appraisals: 'التقييمات', Goals: 'الأهداف', Feedback: 'الملاحظات',
  'Appraisal Templates': 'قوالب التقييم', KRAs: 'مجالات الأداء الرئيسية', 'Rating Criteria': 'معايير التقييم',
  // common actions
  New: 'جديد', Expand: 'توسيع', 'Not found': 'غير موجود', 'Quick create': 'إنشاء سريع', 'New document': 'مستند جديد',
  Save: 'حفظ', Cancel: 'إلغاء', Create: 'إنشاء', Submit: 'اعتماد', Delete: 'حذف', Edit: 'تعديل', Close: 'إغلاق', Print: 'طباعة', Send: 'إرسال', Add: 'إضافة',
  Confirm: 'تأكيد', Approve: 'موافقة', Reject: 'رفض', Back: 'رجوع', Next: 'التالي', Filters: 'عوامل التصفية', Columns: 'الأعمدة', Export: 'تصدير', Refresh: 'تحديث',
  View: 'عرض', Pay: 'دفع', 'Pay out': 'صرف', Download: 'تنزيل', Upload: 'رفع', Template: 'نموذج', Example: 'مثال', Policy: 'السياسة', Booked: 'محجوز',
  'New loan': 'قرض جديد', 'Add user': 'إضافة مستخدم', 'Add day': 'إضافة يوم', 'Start over': 'البدء من جديد', 'Send email': 'إرسال بريد', 'Open WhatsApp': 'فتح واتساب',
  'Copy PDF link': 'نسخ رابط PDF', 'Post provision': 'ترحيل المخصص', 'Load from attendance': 'تحميل من الحضور', 'Receive cheque': 'استلام شيك', 'Issue cheque': 'إصدار شيك',
  Deposit: 'إيداع', Cleared: 'تم التحصيل', Bounced: 'مرتجع', Presented: 'مقدَّم', Instalments: 'الأقساط', Repaid: 'تم السداد', XML: 'XML',
  // self-service
  'Check in': 'تسجيل الدخول', 'Check out': 'تسجيل الخروج', 'Apply for leave': 'طلب إجازة', 'Request leave': 'تقديم الطلب', 'Claim expense': 'مطالبة مصروفات',
  'Request advance': 'طلب سلفة', 'Self-appraisal': 'التقييم الذاتي', 'My attendance': 'حضوري', Payslips: 'قسائم الراتب', 'Leave balance': 'رصيد الإجازات',
  'Not checked in yet': 'لم يتم تسجيل الدخول بعد', 'Leave type': 'نوع الإجازة', From: 'من', To: 'إلى', Reason: 'السبب', 'Half day': 'نصف يوم',
  'working days': 'أيام عمل', 'balance now': 'الرصيد الحالي', 'after this': 'بعد الطلب', 'Goes to your leave approver': 'يُرسل إلى معتمد الإجازات',
  'Goes to your expense approver': 'يُرسل إلى معتمد المصروفات', Present: 'حاضر', Absent: 'غائب', Holiday: 'عطلة', Off: 'راحة', Today: 'اليوم',
  // corrections over weak community translations (statuses, common field labels)
  Draft: 'مسودة', Submitted: 'معتمد', Cancelled: 'ملغى', Overdue: 'متأخرة', Unpaid: 'غير مدفوعة', Paid: 'مدفوعة', 'Partly Paid': 'مدفوعة جزئياً',
  Return: 'مرتجع', 'Credit Note Issued': 'صدر إشعار دائن', Open: 'مفتوح', Approved: 'موافق عليه', Rejected: 'مرفوض', Pending: 'قيد الانتظار',
  Completed: 'مكتمل', 'To Deliver and Bill': 'للتسليم والفوترة', 'To Bill': 'للفوترة', 'To Deliver': 'للتسليم', 'To Receive and Bill': 'للاستلام والفوترة',
  'To Receive': 'للاستلام', Ordered: 'تم الطلب', Lost: 'خسارة', Expired: 'منتهي', 'Expiring Soon': 'ينتهي قريباً', Valid: 'ساري', Active: 'نشط', Left: 'غادر',
  Enabled: 'مفعّل', Disabled: 'معطّل', Claimed: 'تمت المطالبة', Returned: 'مُعاد', 'Not Started': 'لم يبدأ', 'In Progress': 'قيد التنفيذ',
  Amount: 'المبلغ', Rate: 'السعر', Qty: 'الكمية', Quantity: 'الكمية', UOM: 'الوحدة', Item: 'الصنف', 'Item Code': 'رمز الصنف', 'Item Name': 'اسم الصنف',
  'Due Date': 'تاريخ الاستحقاق', 'Posting Date': 'تاريخ القيد', Date: 'التاريخ', 'Net Total': 'الصافي', 'Grand Total': 'الإجمالي الكلي',
  'Rounded Total': 'الإجمالي بعد التقريب', 'Total Taxes and Charges': 'إجمالي الضرائب والرسوم', 'Discount Amount': 'مبلغ الخصم', 'Outstanding Amount': 'المبلغ المستحق',
  Customer: 'العميل', 'Customer Name': 'اسم العميل', Supplier: 'المورد', 'Supplier Name': 'اسم المورد', Company: 'الشركة', Warehouse: 'المستودع',
  'Price List': 'قائمة الأسعار', Currency: 'العملة', 'Mode of Payment': 'طريقة الدفع', 'Reference No': 'رقم المرجع', Remarks: 'ملاحظات', Description: 'الوصف',
  Status: 'الحالة', Name: 'الاسم', ID: 'المعرّف', Employee: 'الموظف', 'Employee Name': 'اسم الموظف', Department: 'القسم', Designation: 'المسمى الوظيفي',
  'From Date': 'من تاريخ', 'To Date': 'إلى تاريخ', 'Leave Type': 'نوع الإجازة', 'Total Leave Days': 'إجمالي أيام الإجازة', 'Sales Taxes and Charges Template': 'قالب الضرائب',
  'Delivery Date': 'تاريخ التسليم', 'Transaction Date': 'تاريخ المعاملة', 'Schedule Date': 'التاريخ المطلوب', 'Paid Amount': 'المبلغ المدفوع',
  'Install app': 'تثبيت التطبيق', 'Install Karya Erp': 'تثبيت Karya Erp', 'Add it to your iPhone or iPad home screen': 'أضفه إلى الشاشة الرئيسية لجهازك', 'Got it': 'حسناً',
  'Open this page in Safari.': 'افتح هذه الصفحة في Safari.', 'Tap the Share button': 'اضغط زر المشاركة', 'Choose “Add to Home Screen”': 'اختر «إضافة إلى الشاشة الرئيسية»',
  'Tap Add. Karya Erp now opens full-screen from its own icon.': 'اضغط «إضافة». سيفتح Karya Erp بملء الشاشة من أيقونته.',
  // page titles
  'Users & access': 'المستخدمون والصلاحيات', 'Employee loans': 'قروض الموظفين', 'Air tickets': 'تذاكر الطيران', 'Post-dated cheques': 'الشيكات الآجلة',
  'E-invoicing (UAE)': 'الفوترة الإلكترونية (الإمارات)', 'Gratuity, leave & ticket provision': 'مخصصات نهاية الخدمة والإجازات والتذاكر', 'HR dashboard': 'لوحة الموارد البشرية',
  'Final settlement': 'التسوية النهائية',
}
