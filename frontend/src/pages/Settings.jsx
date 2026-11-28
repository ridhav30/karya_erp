import Select from '../components/fields/Select.jsx'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useFrappeGetCall, useFrappeGetDocList } from 'frappe-react-sdk'
import { ArrowLeft, Building2, CalendarDays, Landmark, Mail, Percent, Plus, Save, Trash2, UserCheck, Warehouse, Wallet, Info } from 'lucide-react'
import Button from '../components/Button.jsx'
import PageHeader from '../components/PageHeader.jsx'
import LinkField from '../components/fields/LinkField.jsx'
import Combobox from '../components/fields/Combobox.jsx'
import AttachInput from '../components/fields/AttachInput.jsx'
import { useBoot } from '../app/boot-context.js'
import { useToast } from '../app/toast-context.js'
import { useCall } from '../lib/useCall.js'
import { errorText } from '../lib/errors.js'
import { cn } from '../lib/utils.js'

const SECTIONS = [
  { key: 'company', label: 'Company', icon: Building2, hint: 'Legal details, TRN and address printed on invoices' },
  { key: 'accounts', label: 'Default accounts', icon: Wallet, hint: 'Where ERPNext posts receivables, payables, cash, payroll and rounding' },
  { key: 'vat', label: 'VAT', icon: Percent, hint: 'Default UAE VAT templates for sales and purchases' },
  { key: 'stock', label: 'Stock', icon: Warehouse, hint: 'Default warehouse and negative stock' },
  { key: 'approvers', label: 'Approvers', icon: UserCheck, hint: 'Who approves leave and expense claims, per department' },
  { key: 'wps', label: 'WPS', icon: Landmark, hint: 'Employer details for the salary SIF file' },
  { key: 'email', label: 'Email', icon: Mail, hint: 'Outgoing mail account for invoices, payslips, alerts and password emails' },
]
const HOLIDAY_SECTION = { key: 'holidays', label: 'Holidays', icon: CalendarDays, hint: 'Weekly off days and public holidays for the year' }
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function Field({ label, hint, children, className }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

function Section({ title, hint, canEdit, busy, onSave, children, footer }) {
  return (
    <section className="card animate-fade-in">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      <fieldset disabled={!canEdit || busy} className="grid gap-4 p-4 sm:grid-cols-2">{children}</fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
        {!canEdit && <p className="me-auto text-[11px] text-muted">You can view these settings but not change them.</p>}
        {footer}
        {canEdit && <Button variant="primary" icon={Save} onClick={onSave} loading={busy}>Save</Button>}
      </div>
    </section>
  )
}

function Directory({ title, hint, newTo, newLabel, canCreate, loading, empty, children }) {
  return (
    <section className="card animate-fade-in">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="me-auto">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        {canCreate && <Link to={newTo}><Button variant="primary" icon={Plus}>{newLabel}</Button></Link>}
      </div>
      {loading ? <div className="h-32 animate-pulse" /> : empty ? <p className="px-4 py-10 text-center text-xs text-muted">{empty}</p> : <div className="overflow-x-auto">{children}</div>}
    </section>
  )
}

function CompaniesSection() {
  const boot = useBoot()
  const call = useCall()
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const { data, isLoading } = useFrappeGetDocList('Company', { fields: ['name', 'company_name', 'abbr', 'default_currency', 'country', 'tax_id', 'is_group'], orderBy: { field: 'name', order: 'asc' }, limit: 200 }, 'settings-companies')
  async function use(company) {
    setBusy(company)
    try {
      await call.post('karya_erp.api.set_scope', { company })
      window.location.reload()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not switch company', description: errorText(e) })
      setBusy(null)
    }
  }
  return (
    <Directory title="Companies" hint="Every legal entity in this ERP. Open one for its TRN, accounts, VAT, stock, approvers, WPS and email. The current one is used for new documents, dashboards and reports." newTo="/companies/new" newLabel="New company"
      canCreate={boot.can_create?.Company ?? boot.is_system_manager} loading={isLoading} empty={data && !data.length ? 'No companies yet.' : null}>
      <table className="rt w-full min-w-[640px] text-xs">
        <thead><tr className="border-b text-muted">
          <th className="px-4 py-2 text-start font-medium">Company</th>
          <th className="px-3 py-2 text-start font-medium">Abbr.</th>
          <th className="px-3 py-2 text-start font-medium">Country · currency</th>
          <th className="px-3 py-2 text-start font-medium">TRN</th>
          <th className="px-4 py-2 text-end font-medium"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody className="divide-y">
          {(data ?? []).map((c) => (
            <tr key={c.name}>
              <td data-main className="px-4 py-2 font-medium">
                <Link to={`/settings?company=${encodeURIComponent(c.name)}`} className="hover:text-primary hover:underline">{c.company_name || c.name}</Link>
                {c.name === boot.company && <span className="ms-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Current</span>}
                {Boolean(c.is_group) && <span className="ms-2 text-[10px] text-muted">Group</span>}
              </td>
              <td data-label="Abbr." className="num px-3 py-2">{c.abbr}</td>
              <td data-label="Country · currency" className="px-3 py-2">{[c.country, c.default_currency].filter(Boolean).join(' · ')}</td>
              <td data-label="TRN" className="num px-3 py-2">{c.tax_id || <span className="text-muted">—</span>}</td>
              <td className="px-4 py-2 text-end">
                <span className="inline-flex items-center gap-2">
                  {c.name !== boot.company && <Button onClick={() => use(c.name)} loading={busy === c.name}>Use this company</Button>}
                  <Link to={`/settings?company=${encodeURIComponent(c.name)}`}><Button>Settings</Button></Link>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Directory>
  )
}

function BranchesSection() {
  const boot = useBoot()
  const { data, isLoading } = useFrappeGetDocList('Branch', { fields: ['name'], orderBy: { field: 'name', order: 'asc' }, limit: 500 }, 'settings-branches')
  const { data: counts } = useFrappeGetDocList('Employee', { fields: ['branch', 'count(name) as n'], filters: [['status', '=', 'Active']], groupBy: 'branch', limit: 500 }, 'settings-branch-counts')
  const count = Object.fromEntries((counts ?? []).filter((r) => r.branch).map((r) => [r.branch, r.n]))
  return (
    <Directory title="Branches" hint="Offices and sites employees belong to. Pick one in the profile menu to work in a single branch." newTo="/branches/new" newLabel="New branch"
      canCreate={boot.can_create?.Branch ?? boot.is_system_manager} loading={isLoading} empty={data && !data.length ? 'No branches yet.' : null}>
      <table className="rt w-full min-w-[420px] text-xs">
        <thead><tr className="border-b text-muted">
          <th className="px-4 py-2 text-start font-medium">Branch</th>
          <th className="px-4 py-2 text-end font-medium">Active employees</th>
        </tr></thead>
        <tbody className="divide-y">
          {(data ?? []).map((b) => (
            <tr key={b.name}>
              <td data-main className="px-4 py-2 font-medium">
                <Link to={`/branches/${encodeURIComponent(b.name)}`} className="hover:text-primary hover:underline">{b.name}</Link>
                {b.name === boot.branch && <span className="ms-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Working in</span>}
              </td>
              <td data-label="Active employees" className="num px-4 py-2 text-end">{count[b.name] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Directory>
  )
}

const acct = (company) => ({ company, is_group: 0 })

function EmailSection({ meta }) {
  const call = useCall()
  const toast = useToast()
  const { data, mutate } = useFrappeGetCall('karya_erp.sharing.email_account', undefined, 'email-account', { revalidateOnFocus: false })
  const info = data?.message
  const acc = info?.account
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  if (info && !f) setF({ provider: 'Other (SMTP)', email_id: acc?.email_id ?? '', sender_name: acc?.email_account_name ?? '', smtp_server: acc?.smtp_server ?? '', smtp_port: acc?.smtp_port ?? 587, security: acc?.use_ssl_for_outgoing ? 'ssl' : 'tls', password: '' })
  if (!info || !f) return <div className="card h-64 animate-pulse" />
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const provider = (e) => { const p = info.providers?.[e.target.value]; setF((x) => ({ ...x, provider: e.target.value, ...(p?.server ? { smtp_server: p.server, smtp_port: p.port, security: 'tls' } : {}) })) }

  async function save() {
    setBusy(true)
    try {
      await call.post('karya_erp.sharing.save_email_account', Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'provider')))
      toast({ tone: 'success', title: 'Email account saved', description: 'The login was checked with the mail server.' })
      setF((x) => ({ ...x, password: '' }))
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save the email account', description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={meta.label} hint={meta.hint} canEdit={info.can} busy={busy} onSave={save}
      footer={acc && <span className="me-auto text-[11px] text-muted">Sending as {acc.email_id}</span>}>
      <Field label="Provider"><Select className="input" value={f.provider} onChange={provider}>{Object.keys(info.providers ?? {}).map((p) => <option key={p}>{p}</option>)}</Select></Field>
      <Field label="Sender name" hint="Shown to customers, e.g. ROKN Accounts"><input className="input" value={f.sender_name} onChange={set('sender_name')} /></Field>
      <Field label="Email address"><input type="email" className="input" value={f.email_id} onChange={set('email_id')} /></Field>
      <Field label="Password" hint={acc ? 'Leave empty to keep the saved password. Gmail / Microsoft 365 need an app password.' : 'Gmail / Microsoft 365 need an app password.'}><input type="password" autoComplete="new-password" className="input" value={f.password} onChange={set('password')} /></Field>
      <Field label="SMTP server"><input className="input" value={f.smtp_server} onChange={set('smtp_server')} placeholder="smtp.example.com" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Port"><input type="number" className="input num" value={f.smtp_port} onChange={set('smtp_port')} /></Field>
        <Field label="Security"><Select className="input" value={f.security} onChange={set('security')}><option value="tls">STARTTLS</option><option value="ssl">SSL</option></Select></Field>
      </div>
    </Section>
  )
}

function toDraft(s) {
  const hl = s.holiday_list
  return {
    company: { ...s.company, address: { ...s.address } },
    accounts: { ...s.accounts },
    vat: { ...s.vat },
    stock: { ...s.stock },
    approvers: { departments: s.departments.map((d) => ({ ...d })) },
    holidays: {
      year: hl ? Number(hl.from_date.slice(0, 4)) : new Date().getFullYear(),
      name: hl?.name ?? '',
      weekly_off: hl?.weekly_off?.length ? hl.weekly_off : ['Saturday', 'Sunday'],
      public_holidays: hl?.public_holidays ?? [],
    },
    wps: { ...s.wps },
  }
}

/** Go-live settings on standard ERPNext / Frappe HR records — one section at a time. */
export default function Settings({ only }) {
  const boot = useBoot()
  const [sp] = useSearchParams()
  if (only === 'holidays') return <CompanySettings company={boot.company} only="holidays" />
  // Old links (?section=email) still land on the current company.
  const company = sp.get('company') || (sp.get('section') ? boot.company : null)
  if (!company) {
    return (
      <>
        <PageHeader title="Settings" subtitle="Pick a company to set up" />
        <CompaniesSection />
      </>
    )
  }
  return <CompanySettings key={company} company={company} />
}

function CompanySettings({ company, only }) {
  const boot = useBoot()
  const call = useCall()
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const all = only ? [HOLIDAY_SECTION] : SECTIONS
  const active = only || (SECTIONS.some((s) => s.key === sp.get('section')) ? sp.get('section') : 'company')
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.settings.get', { company }, `settings:${company}`, { revalidateOnFocus: false })
  const s = data?.message
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)

  // Fresh draft whenever the server copy changes (adjusting state during render, not in an effect).
  const [src, setSrc] = useState(null)
  if (s && s !== src) {
    setSrc(s)
    setDraft(toDraft(s))
  }

  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error, 'Could not load settings.')}</div>
  if (isLoading || !s || !draft) return <div className="card h-96 animate-pulse" />

  const d = draft[active]
  const set = (k, v) => setDraft((x) => ({ ...x, [active]: { ...x[active], [k]: v } }))
  const setIn = (k) => (e) => set(k, e.target.value)
  const meta = all.find((x) => x.key === active)

  async function save() {
    setBusy(true)
    try {
      const values = active === 'company' ? { ...d, address: d.address } : d
      const res = await call.post('karya_erp.settings.save', { section: active, values: JSON.stringify(values), company })
      await mutate({ message: res.message }, { revalidate: false })
      toast({ tone: 'success', title: `${meta.label} saved` })
    } catch (e) {
      toast({ tone: 'error', title: `Could not save ${meta.label.toLowerCase()}`, description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const common = { title: meta.label, hint: meta.hint, canEdit: Boolean(s.can[active]), busy, onSave: save }

  let body = null
  if (active === 'company') {
    const a = d.address || {}
    const setA = (k) => (e) => set('address', { ...a, [k]: e.target.value })
    body = (
      <div className="min-w-0 space-y-4">
      <Section {...common}>
        <Field label="Company"><input className="input" value={`${s.company.company_name} (${s.company.abbr})`} disabled /></Field>
        <Field label="Country · currency"><input className="input" value={`${s.company.country} · ${s.company.currency}`} disabled /></Field>
        <Field label="TRN (Tax Registration Number)" hint="15 digits, printed on every tax invoice"><input className="input num" inputMode="numeric" maxLength={20} value={d.tax_id ?? ''} onChange={setIn('tax_id')} placeholder="100xxxxxxxxxxx3" /></Field>
        <Field label="Established on"><input type="date" className="input" value={d.date_of_establishment ?? ''} onChange={setIn('date_of_establishment')} /></Field>
        <Field label="Phone"><input className="input" value={d.phone_no ?? ''} onChange={setIn('phone_no')} /></Field>
        <Field label="Email"><input type="email" className="input" value={d.email ?? ''} onChange={setIn('email')} /></Field>
        <Field label="Website"><input className="input" value={d.website ?? ''} onChange={setIn('website')} /></Field>
        <Field label="Logo"><AttachInput value={d.company_logo} onChange={(v) => set('company_logo', v)} accept="image/*" /></Field>
        <h3 className="pt-2 text-xs font-semibold text-muted sm:col-span-2">Registered address</h3>
        <Field label="Address line 1" className="sm:col-span-2"><input className="input" value={a.address_line1 ?? ''} onChange={setA('address_line1')} /></Field>
        <Field label="Address line 2" className="sm:col-span-2"><input className="input" value={a.address_line2 ?? ''} onChange={setA('address_line2')} /></Field>
        <Field label="City"><input className="input" value={a.city ?? ''} onChange={setA('city')} /></Field>
        <Field label="Emirate"><Select className="input" value={a.state ?? ''} onChange={setA('state')}><option value="" />{['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'].map((e) => <option key={e}>{e}</option>)}</Select></Field>
        <Field label="P.O. Box"><input className="input" value={a.pincode ?? ''} onChange={setA('pincode')} /></Field>
        <Field label="Address phone"><input className="input" value={a.phone ?? ''} onChange={setA('phone')} /></Field>
      </Section>
      <BranchesSection />
      </div>
    )
  } else if (active === 'accounts') {
    const f = acct(company)
    const L = (k, label, extra, hint) => <Field key={k} label={label} hint={hint}><LinkField doctype={k === 'cost_center' ? 'Cost Center' : 'Account'} filters={{ ...f, ...extra }} value={d[k] ?? ''} onChange={(v) => set(k, v)} disabled={!s.can.accounts} /></Field>
    body = (
      <Section {...common}>
        {L('default_receivable_account', 'Customer receivables', { account_type: 'Receivable' })}
        {L('default_payable_account', 'Supplier payables', { account_type: 'Payable' })}
        {L('default_bank_account', 'Default bank', { account_type: 'Bank' })}
        {L('default_cash_account', 'Default cash', { account_type: 'Cash' })}
        {L('default_income_account', 'Sales income', { root_type: 'Income' })}
        {L('default_expense_account', 'Cost of goods sold', { root_type: 'Expense' })}
        {L('cost_center', 'Main cost center', {})}
        {L('round_off_account', 'Round off', {})}
        {L('write_off_account', 'Write off', {})}
        {L('exchange_gain_loss_account', 'Exchange gain / loss', {})}
        {L('default_payroll_payable_account', 'Payroll payable', { root_type: 'Liability' }, 'Salaries owed until the bank transfer is posted')}
        {L('default_employee_advance_account', 'Employee advances', { root_type: 'Asset' })}
        {L('default_expense_claim_payable_account', 'Expense claims payable', { root_type: 'Liability' })}
      </Section>
    )
  } else if (active === 'vat') {
    body = (
      <Section {...common}>
        <Field label="Sales — default VAT" hint="Added to new quotations, orders and invoices"><LinkField doctype="Sales Taxes and Charges Template" filters={{ company }} value={d.sales_template ?? ''} onChange={(v) => set('sales_template', v)} disabled={!s.can.vat} /></Field>
        <Field label="Purchases — default VAT" hint="Input VAT you can recover"><LinkField doctype="Purchase Taxes and Charges Template" filters={{ company }} value={d.purchase_template ?? ''} onChange={(v) => set('purchase_template', v)} disabled={!s.can.vat} /></Field>
        <p className="flex items-start gap-1.5 text-[11px] text-muted sm:col-span-2"><Info className="mt-px size-3 shrink-0" />Zero-rated and exempt templates can be picked on each document. The VAT return is on <Link to="/vat-return" className="text-primary hover:underline">VAT Return</Link>; your TRN is under Company.</p>
      </Section>
    )
  } else if (active === 'stock') {
    body = (
      <Section {...common}>
        <Field label="Default warehouse"><LinkField doctype="Warehouse" filters={{ company, is_group: 0 }} value={d.default_warehouse ?? ''} onChange={(v) => set('default_warehouse', v)} disabled={!s.can.stock} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" checked={Boolean(d.allow_negative_stock)} onChange={(e) => set('allow_negative_stock', e.target.checked ? 1 : 0)} />Allow selling more than is in stock (negative stock)</label>
      </Section>
    )
  } else if (active === 'approvers') {
    const setDept = (i, k, v) => set('departments', d.departments.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
    body = (
      <Section {...common}>
        <p className="text-xs text-muted sm:col-span-2">Used when an employee has no personal leave / expense approver. Approvers need a login.</p>
        <div className="overflow-x-auto sm:col-span-2">
          <table className="w-full min-w-[520px] text-xs">
            <thead><tr className="text-start text-muted"><th className="py-1.5 pe-3 font-medium">Department</th><th className="py-1.5 pe-3 font-medium">Leave approver</th><th className="py-1.5 font-medium">Expense approver</th></tr></thead>
            <tbody className="divide-y">
              {d.departments.map((x, i) => (
                <tr key={x.name}>
                  <td className="py-1.5 pe-3">{x.label}</td>
                  <td className="py-1.5 pe-3"><LinkField doctype="User" filters={{ enabled: 1, user_type: 'System User' }} value={x.leave_approver ?? ''} onChange={(v) => setDept(i, 'leave_approver', v)} disabled={!s.can.approvers} /></td>
                  <td className="py-1.5"><LinkField doctype="User" filters={{ enabled: 1, user_type: 'System User' }} value={x.expense_approver ?? ''} onChange={(v) => setDept(i, 'expense_approver', v)} disabled={!s.can.approvers} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    )
  } else if (active === 'holidays') {
    const toggle = (day) => set('weekly_off', d.weekly_off.includes(day) ? d.weekly_off.filter((x) => x !== day) : [...d.weekly_off, day])
    const setPH = (i, k, v) => set('public_holidays', d.public_holidays.map((h, j) => (j === i ? { ...h, [k]: v } : h)))
    body = (
      <Section {...common} footer={s.holiday_list && <Link to={`/holiday-lists/${encodeURIComponent(s.holiday_list.name)}`} className="me-auto text-xs text-primary hover:underline">Open {s.holiday_list.name}</Link>}>
        <Field label="Year"><input type="number" className="input num" value={d.year} onChange={(e) => setDraft((x) => ({ ...x, holidays: { ...x.holidays, year: Number(e.target.value), name: '' } }))} /></Field>
        <Field label="Holiday list" hint={s.holiday_list ? `Currently assigned: ${s.holiday_list.name}` : 'None assigned yet — saving creates and assigns one'}><input className="input" value={d.name || `${company} ${d.year}`} onChange={setIn('name')} /></Field>
        <div className="space-y-1.5 sm:col-span-2">
          <span className="label">Weekly off</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => (
              <button key={day} type="button" onClick={() => toggle(day)} aria-pressed={d.weekly_off.includes(day)}
                className={cn('pressable rounded-md border px-2.5 py-1 text-xs', d.weekly_off.includes(day) ? 'border-transparent bg-strong text-strong-foreground' : 'bg-background text-muted hover:text-foreground')}>
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <span className="label">Public holidays</span>
          {d.public_holidays.length === 0 && <p className="text-[11px] text-muted">Add the dates announced for the private sector (Islamic holidays move each year).</p>}
          {d.public_holidays.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" className="input w-40 shrink-0" value={h.date} onChange={(e) => setPH(i, 'date', e.target.value)} />
              <input className="input min-w-0 flex-1" value={h.description} placeholder="e.g. Eid Al Fitr" onChange={(e) => setPH(i, 'description', e.target.value)} />
              <button type="button" className="pressable grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-danger" aria-label="Remove holiday" onClick={() => set('public_holidays', d.public_holidays.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
            </div>
          ))}
          <Button icon={Plus} onClick={() => set('public_holidays', [...d.public_holidays, { date: '', description: '' }])}>Add holiday</Button>
        </div>
      </Section>
    )
  } else if (active === 'email') {
    body = <EmailSection meta={meta} />
  } else if (active === 'wps') {
    body = (
      <Section {...common} footer={s.wps_exists && <Link to={`/wps-settings/${encodeURIComponent(company)}`} className="me-auto text-xs text-primary hover:underline">Employee bank routing codes</Link>}>
        <Field label="Employer ID (MOHRE establishment ID)" hint="13 digits, from your labour card"><input className="input num" inputMode="numeric" value={d.employer_id ?? ''} onChange={setIn('employer_id')} /></Field>
        <Field label="Employer bank routing code" hint="9 digits — the bank that pays salaries"><input className="input num" inputMode="numeric" maxLength={9} value={d.employer_bank_routing_code ?? ''} onChange={setIn('employer_bank_routing_code')} /></Field>
        <Field label="Employer reference" hint="Optional; shown on the SCR record"><input className="input" value={d.employer_reference ?? ''} onChange={setIn('employer_reference')} /></Field>
      </Section>
    )
  }

  if (only) {
    return (
      <>
        <PageHeader title="Holidays" subtitle={`${s.company.company_name} · weekly off days and public holidays`} />
        {body}
      </>
    )
  }

  return (
    <>
      <PageHeader title={s.company.company_name} subtitle="Company settings">
        <Combobox className="w-52" options={boot.companies ?? []} value={company} placeholder="Company"
          onChange={(v) => v && v !== company && setSp({ company: v, section: active })} />
        <Link to="/settings"><Button icon={ArrowLeft}>All companies</Button></Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label="Settings sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setSp({ company, section: key })} aria-current={key === active ? 'page' : undefined}
              className={cn('pressable flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-start text-xs', key === active ? 'bg-surface-2 font-semibold text-foreground' : 'text-muted hover:bg-surface-2 hover:text-foreground')}>
              <Icon className="size-3.5" />{label}
              {key === 'company' && !s.company.tax_id && <span className="ms-auto size-1.5 rounded-full bg-amber-500" title="TRN missing" />}
              {key === 'wps' && !s.wps.employer_id && <span className="ms-auto size-1.5 rounded-full bg-amber-500" title="Employer ID missing" />}
            </button>
          ))}
        </nav>
        {body}
      </div>
    </>
  )
}
