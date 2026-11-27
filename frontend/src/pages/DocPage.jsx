import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useFrappeCreateDoc, useFrappeDeleteDoc, useFrappeGetDoc, useFrappeUpdateDoc } from 'frappe-react-sdk'
import { ArrowLeft, Ban, ChevronRight, Pencil, Save, Send, Trash2, X } from 'lucide-react'
import Button from '../components/Button.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import FieldInput from '../components/fields/FieldInput.jsx'
import FieldValue from '../components/fields/FieldValue.jsx'
import ItemsTable from '../components/ItemsTable.jsx'
import ItemTaxToolbar from '../components/ItemTaxToolbar.jsx'
import ChildTable from '../components/ChildTable.jsx'
import CreateMenu from '../components/CreateMenu.jsx'
import ApprovalBar from '../components/approvals/ApprovalBar.jsx'
import Activity from '../components/activity/Activity.jsx'
import CrmActivities from '../components/activity/CrmActivities.jsx'
import PrintButton from '../components/print/PrintButton.jsx'
import SendButton from '../components/print/SendButton.jsx'
import { SENDABLE } from '../lib/print.js'
import RelatedList from '../components/RelatedList.jsx'
import PartyAccount from '../components/accounts/PartyAccount.jsx'
import { useWorkflow } from '../lib/workflow.js'
import { makeDoc } from '../lib/mappers.js'
import { QUICK_CREATE } from '../lib/quickCreate.js'
import { itemsTotal } from '../lib/items.js'
import TotalsCard from '../components/TotalsCard.jsx'
import { FullPageSpinner } from '../components/Spinner.jsx'
import { useBoot } from '../app/boot-context.js'
import { useToast } from '../app/toast-context.js'
import { resolveField, useMeta } from '../lib/meta.js'
import { useCall } from '../lib/useCall.js'
import { errorText } from '../lib/errors.js'
import { formatMoney } from '../lib/format.js'
import { cn } from '../lib/utils.js'
import { confirm } from '../lib/dialogs.js'

const DOCSTATUS = { 0: 'Draft', 1: 'Submitted', 2: 'Cancelled' }
// Party address fields shown on the form; they live on the linked primary Address, not on the party.
const ADDRESS_FIELDS = ['address_line1', 'address_line2', 'city', 'state', 'pincode', 'country']
const pickAddress = (a) => Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, a?.[f] ?? null]))
const sameAddress = (a, b) => ADDRESS_FIELDS.every((f) => (a?.[f] || '') === (b?.[f] || ''))
const today = () => new Date().toLocaleDateString('en-CA')

/** In the employee panel (or for a plain employee) every form is the person's own: the employee is fixed, never picked. */
const isSelfService = (boot) => Boolean(boot.employee) && (Boolean(boot.employee_only) || boot.menu_view === 'employee')

/** Default values for a new doc: ERPNext meta defaults, then the screen's own defaults. */
function newDoc(config, meta, boot, prefill, preset) {
  // Opened from "Record payment" / "Credit note" …: ERPNext already filled everything in.
  if (prefill) return { ...prefill, doctype: config.doctype }
  const doc = { doctype: config.doctype }
  for (const f of meta?.fields ?? []) {
    const d = f.default
    if (d == null || d === '' || f.fieldtype === 'Table') continue
    if (String(d).startsWith(':') || String(d).startsWith('__')) continue
    if (d === 'Today') doc[f.fieldname] = today()
    else if (d === 'now' || d === 'Now') continue
    else if (['Int', 'Check'].includes(f.fieldtype)) doc[f.fieldname] = Number(d)
    else if (['Float', 'Currency', 'Percent'].includes(f.fieldtype)) doc[f.fieldname] = Number(d)
    else doc[f.fieldname] = d
  }
  if (meta?.fieldMap?.company && config.doctype !== 'Company' && boot.company) doc.company = boot.company
  // The working branch (profile menu) fills a branch field; Payroll Entry / Appraisal Cycle use it as an employee filter, so they stay open.
  if (boot.branch && meta?.fieldMap?.branch && !['Payroll Entry', 'Appraisal Cycle'].includes(config.doctype)) doc.branch = boot.branch
  Object.assign(doc, config.defaults?.(boot) ?? {}, preset ?? {})
  // The person's own employee record (and its name) on every employee form they open for themselves.
  if (isSelfService(boot) && meta?.fieldMap?.employee && !prefill) {
    doc.employee = boot.employee
    if (meta.fieldMap.employee_name) doc.employee_name = boot.employee_name
  } else if (doc.employee && !doc.employee_name && doc.employee === boot.employee && meta?.fieldMap?.employee_name) {
    doc.employee_name = boot.employee_name
  }
  for (const [k, v] of Object.entries(doc)) if (v == null) delete doc[k]
  if (config.items) doc.items = [{ qty: 1 }]
  for (const t of config.tables ?? []) if (t.startRows) doc[t.field] = Array.from({ length: t.startRows }, () => ({ ...(t.newRow?.(doc, [], boot) ?? {}) }))
  return doc
}

function statusOf(config, doc) {
  if (!doc || config.noStatus) return null
  if (config.statusFromDisabled) return Number(doc.disabled) ? 'Disabled' : 'Active'
  if (doc.status) return doc.status
  return DOCSTATUS[doc.docstatus] ?? 'Draft'
}

const TAX_TAB = 'Taxes & Charges'
const TAX_ROWS = {
  field: 'taxes', title: 'Taxes and charges (add freight, customs or any extra charge here)',
  columns: ['category', 'add_deduct_tax', 'charge_type', { field: 'account_head', reqd: true, filters: (row, doc) => ({ is_group: 0, ...(doc.company ? { company: doc.company } : {}) }) }, 'description', 'rate', 'tax_amount'],
  newRow: () => ({ charge_type: 'Actual' }),
}
const ITEM_TAX = {
  field: 'items', title: 'Item tax template (only for items taxed differently)', addRows: false, toolbar: ItemTaxToolbar,
  columns: [{ field: 'item_code', readOnly: true }, { field: 'item_name', readOnly: true }, { field: 'item_tax_template', filters: (row, doc) => ({ disabled: 0, ...(doc.company ? { company: doc.company } : {}) }) }],
}

export default function DocPage({ slug, config }) {
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : rawName
  const isNew = name === 'new'
  const boot = useBoot()
  const toast = useToast()
  const call = useCall()
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = isNew ? location.state?.prefill : null
  const preset = isNew ? location.state?.defaults : null // a few values on top of the normal defaults
  const { meta, metaOf, isLoading: metaLoading, error: metaError } = useMeta(config.doctype)

  const { data: saved, error: loadError, isLoading, mutate } = useFrappeGetDoc(
    config.doctype, isNew ? undefined : name, isNew ? null : undefined,
  )
  // Customer / Supplier: their primary Address is edited on the Address tab.
  const addrField = config.address?.primaryField
  const addrName = addrField && !isNew ? saved?.[addrField] : null
  const { data: primaryAddress, mutate: mutateAddress } = useFrappeGetDoc('Address', addrName ?? undefined, addrName ? undefined : null)
  const addressValues = addrField && primaryAddress ? pickAddress(primaryAddress) : null
  const [savingAddress, setSavingAddress] = useState(false)
  // Frappe Workflow (approvals): state + actions for this user; null when the doctype has none.
  const { workflow, refresh: refreshWorkflow } = useWorkflow(config.doctype, name, !isNew && Boolean(meta?.fieldMap?.workflow_state))
  const { createDoc, loading: creating } = useFrappeCreateDoc()
  const { updateDoc, loading: updating } = useFrappeUpdateDoc()
  const { deleteDoc } = useFrappeDeleteDoc()

  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState(null) // non-null = editing
  const [busy, setBusy] = useState('')
  const [invalid, setInvalid] = useState([])
  const [activeTab, setActiveTab] = useState(null)
  const [openSections, setOpenSections] = useState({}) // collapsed sections the user opened
  const startEdit = () => setDraft({ ...structuredClone(saved), ...(addressValues ?? {}) })

  // Start a new doc once meta is available.
  if (isNew && !draft && meta) setDraft(newDoc(config, meta, boot, prefill, preset))
  // Leaving "new" (e.g. after create) must drop the draft.
  const [lastName, setLastName] = useState(name)
  if (lastName !== name) { setLastName(name); setDraft(null); setInvalid([]) }

  // New selling / buying documents start with the company's default tax template (e.g. UAE VAT 5%), like Desk.
  const needsDefaultTax = Boolean(isNew && draft && config.taxes && !draft[config.taxes.field] && !(draft.taxes?.length) && draft.company)
  const taxCompany = draft?.company
  const defaultTaxFor = useRef(null) // apply once per new document, so clearing the template sticks
  useEffect(() => {
    const key = `${config.doctype}:${location.key}`
    if (!needsDefaultTax || defaultTaxFor.current === key) return
    defaultTaxFor.current = key
    call.post('erpnext.controllers.accounts_controller.get_default_taxes_and_charges', { master_doctype: config.taxes.template, company: taxCompany })
      .then((res) => {
        const m = res?.message
        if (!m?.taxes_and_charges) return
        setDraft((d) => (d && !d[config.taxes.field] && !(d.taxes?.length) ? { ...d, [config.taxes.field]: m.taxes_and_charges, taxes: m.taxes ?? [] } : d))
      })
      .catch(() => {})
  }, [needsDefaultTax, taxCompany, config.taxes, config.doctype, location.key, call])

  // "?edit=1" (from the mobile list's Edit button) opens a saved draft straight in edit mode.
  const wantEdit = params.get('edit') === '1'
  if (wantEdit && saved && !draft && Number(saved.docstatus ?? 0) === 0 && !config.readOnly && (!addrName || primaryAddress)) startEdit()
  useEffect(() => {
    if (wantEdit && draft) setParams((p) => { p.delete('edit'); return p }, { replace: true })
  }, [wantEdit, draft, setParams])

  const editing = Boolean(draft)
  const doc = draft ?? (saved && addressValues ? { ...saved, ...addressValues } : saved)
  const currency = doc?.currency || boot.currency
  const childMeta = config.items && meta ? metaOf(meta.fieldMap?.items?.options) : null

  // Invoices, orders and quotes keep the tax template, tax rows and per-item tax templates on their own tab.
  const taxMeta = meta && config.taxes && !(config.tables ?? []).some((t) => t.field === 'taxes') && !config.readOnly ? metaOf(meta.fieldMap?.taxes?.options) : null
  const taxTab = Boolean(taxMeta)
  const sections = useMemo(() => {
    if (!meta) return []
    const out = (config.sections ?? []).map((s) => ({
      ...s,
      fields: s.fields.filter((f) => !(taxTab && (typeof f === 'string' ? f : f.field) === config.taxes.field)).map((f) => resolveField(meta, f)).filter(Boolean),
    }))
    if (taxTab) {
      const f = resolveField(meta, config.taxes.field)
      if (f) out.push({ title: 'Tax template', tab: TAX_TAB, fields: [f] })
    }
    if (config.customFields) {
      // Fields added from CRM fields (custom_*) that the screen config does not list yet.
      const listed = new Set(out.flatMap((x) => x.fields.map((f) => f.fieldname)))
      const extra = (meta.fields ?? []).filter((f) => f.fieldname?.startsWith('custom_') && !f.hidden && !listed.has(f.fieldname) && !['Section Break', 'Column Break', 'Tab Break'].includes(f.fieldtype)).map((f) => resolveField(meta, f.fieldname)).filter(Boolean)
      if (extra.length) out.push({ title: 'Extra fields', fields: extra })
    }
    return out
  }, [meta, config.sections, config.taxes, taxTab, config.customFields])
  // Live taxes and totals while editing: ERPNext calculates them (item tax templates, extra charges, discounts).
  const [calcRaw, setCalc] = useState(null)
  const calcKey = draft && taxTab ? JSON.stringify([draft.items?.map((r) => [r.item_code, r.qty, r.rate, r.item_tax_template, r.uom, r.conversion_factor]), draft.taxes?.map((r) => [r.charge_type, r.account_head, r.rate, r.tax_amount, r.category, r.add_deduct_tax, r.row_id]), draft.discount_amount, draft.additional_discount_percentage, draft.apply_discount_on, draft.currency, draft.conversion_rate, draft.company]) : ''
  const calc = calcKey && draft?.items?.some((r) => r.item_code) ? calcRaw : null
  useEffect(() => {
    if (!calcKey || !draft?.items?.some((r) => r.item_code)) return undefined
    let live = true
    const h = setTimeout(() => {
      call.post('karya_erp.calc.totals', { doctype: config.doctype, doc: JSON.stringify({ ...draft, items: draft.items.filter((r) => r.item_code) }) })
        .then((r) => { if (live) setCalc(r.message) }).catch(() => { /* keep the last figures */ })
    }, 500)
    return () => { live = false; clearTimeout(h) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey])

  // Sections can be grouped into tabs (config section `tab`); untabbed sections go on the first tab.
  const PAY_TAB = 'Payments'
  const tabNames = [...new Set(sections.map((s) => s.tab ?? sections[0]?.tab ?? 'Details')), ...(!isNew && config.partyAccount ? [PAY_TAB] : [])]
  const onTaxTab = taxTab && activeTab === TAX_TAB
  const currentTab = tabNames.includes(activeTab) ? activeTab : tabNames[0]
  const tabOf = (s) => s.tab ?? sections[0]?.tab ?? 'Details'

  // Masters with a popup (Customer, Supplier, Item, Warehouse) are never created on a separate page.
  if (isNew && QUICK_CREATE[config.doctype] && !prefill) return <Navigate to={`/${slug}?new=1`} replace />
  if (metaLoading || (!isNew && isLoading)) return <FullPageSpinner />
  if (metaError || loadError) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">
        {errorText(metaError || loadError, `Could not load ${config.single}.`)}
        <div className="mt-2"><Link to={`/${slug}`} className="text-primary hover:underline">Back to {config.title}</Link></div>
      </div>
    )
  }
  if (!doc) return <FullPageSpinner />

  const docstatus = Number(doc.docstatus ?? 0)
  const canEdit = !config.readOnly && docstatus === 0
  // With a workflow, submitting / cancelling happens through workflow actions (like Desk).
  const submittable = Boolean(meta?.is_submittable) && !workflow
  const selfService = isSelfService(boot)
  const isFieldEditable = (f) => editing && !f.read_only && docstatus === 0 && !(f.onlyNew && !isNew) && !(selfService && f.fieldname === 'employee')
  // The working company comes from the profile menu, so the Company field is hidden while it matches (an existing doc of another company still shows it).
  const isShown = (f) => (!f.when || f.when(doc)) && !(f.fieldname === 'company' && config.doctype !== 'Company' && (!doc.company || doc.company === boot.company))
  const tables = (config.tables ?? []).map((t) => ({ ...t, meta: meta ? metaOf(meta.fieldMap?.[t.field]?.options) : null })).filter((t) => t.meta && (!t.when || t.when(doc)))

  // A field kept in the first row of a child table (Item: one default tax template).
  const setChildField = (f, value) => setDraft((d) => {
    const rows = d[f.child] ?? []
    return { ...d, [f.child]: value ? [{ ...(rows[0] ?? {}), [f.fieldname]: value }, ...rows.slice(1)] : rows.slice(1) }
  })

  const setField = async (fieldname, value) => {
    setDraft((d) => ({ ...d, [fieldname]: value }))
    setInvalid((list) => list.filter((x) => x !== fieldname))
    // Picking an employee fills their name (the read-only "Employee Name"), like Desk's fetch.
    if (fieldname === 'employee' && meta?.fieldMap?.employee_name) {
      if (!value) setDraft((d) => ({ ...d, employee_name: null }))
      else if (value === boot.employee) setDraft((d) => ({ ...d, employee_name: boot.employee_name }))
      else call.get('frappe.client.get_value', { doctype: 'Employee', filters: value, fieldname: 'employee_name' }).then((r) => setDraft((d) => (d && d.employee === value ? { ...d, employee_name: r?.message?.employee_name ?? null } : d))).catch(() => {})
    }
    // Screen-specific follow-ups (party -> account, mode of payment -> bank account …), like Desk's form scripts.
    if (config.onChange) {
      try {
        const patch = await config.onChange(fieldname, value, { ...draft, [fieldname]: value }, { call, boot })
        if (patch) setDraft((d) => ({ ...d, ...patch }))
      } catch (e) {
        toast({ tone: 'error', title: 'Could not fetch details', description: errorText(e) })
      }
    }
    // Selecting a tax template loads its rows, like Desk does.
    if (config.taxes && fieldname === config.taxes.field) {
      if (!value) { setDraft((d) => ({ ...d, taxes: [] })); return }
      try {
        const res = await call.post('erpnext.controllers.accounts_controller.get_taxes_and_charges', {
          master_doctype: config.taxes.template, master_name: value,
        })
        setDraft((d) => ({ ...d, taxes: res?.message ?? [] }))
      } catch (e) {
        toast({ tone: 'error', title: 'Could not load taxes', description: errorText(e) })
      }
    }
  }

  function validate() {
    const missing = sections.flatMap((s) => s.fields).filter((f) => f.reqd && isShown(f) && isFieldEditable(f) && (draft[f.fieldname] == null || draft[f.fieldname] === ''))
    setInvalid(missing.map((f) => f.fieldname))
    if (missing.length) {
      const first = sections.find((s) => s.fields.includes(missing[0]))
      if (first) setActiveTab(tabOf(first))
      setOpenSections((o) => ({ ...o, ...Object.fromEntries(sections.filter((s) => s.collapsed && s.fields.some((f) => missing.includes(f))).map((s) => [s.title, true])) }))
      toast({ tone: 'error', title: 'Please fill required fields', description: missing.map((f) => f.label).join(', ') })
      return false
    }
    if (config.items && !(draft.items ?? []).some((r) => r.item_code)) {
      toast({ tone: 'error', title: 'Add at least one item' })
      return false
    }
    if (addrField && ADDRESS_FIELDS.some((f) => f !== 'country' && draft[f])) {
      const need = [['address_line1', 'Street address'], ['city', 'City'], ['country', 'Country']].filter(([f]) => !draft[f])
      if (need.length) {
        setInvalid(need.map(([f]) => f))
        const tab = sections.find((s) => s.fields.some((f) => f.fieldname === 'address_line1'))
        if (tab) setActiveTab(tabOf(tab))
        toast({ tone: 'error', title: 'Complete the address', description: `${need.map(([, l]) => l).join(', ')} needed (or clear the address).` })
        return false
      }
    }
    const problem = config.validate?.(payload())
    if (problem) {
      toast({ tone: 'error', title: 'Please check the form', description: problem })
      return false
    }
    return true
  }

  function payload() {
    const p = { ...draft }
    if (config.items) {
      const dateField = config.items.dateField
      p.items = (draft.items ?? []).filter((r) => r.item_code).map((r) => ({
        ...r, ...(dateField && !r[dateField] && draft[dateField] ? { [dateField]: draft[dateField] } : {}),
      }))
    }
    // Drop blank rows from other child tables (first column empty).
    for (const t of config.tables ?? []) {
      const key = typeof t.columns[0] === 'string' ? t.columns[0] : t.columns[0].field
      if (Array.isArray(p[t.field])) p[t.field] = p[t.field].filter((r) => r[key])
    }
    return p
  }

  async function save() {
    if (!validate()) return
    try {
      if (isNew) {
        const created = await createDoc(config.doctype, payload())
        toast({ tone: 'success', title: `${config.single} created`, description: created?.name })
        navigate(created?.name ? `/${slug}/${encodeURIComponent(created.name)}` : `/${slug}`, { replace: true })
      } else {
        const body = payload()
        if (addrField) for (const f of ADDRESS_FIELDS) if (!meta.fieldMap?.[f]) delete body[f] // keep real party fields (Supplier.country)
        let updated = await updateDoc(config.doctype, name, body)
        if (addrField && !sameAddress(draft, addressValues)) updated = (await saveAddress(updated)) ?? updated
        await mutate(updated, false)
        if (workflow) refreshWorkflow()
        setDraft(null)
        toast({ tone: 'success', title: 'Saved' })
      }
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', description: errorText(e) })
    }
  }

  /** Update the primary Address, or create one linked to this party and make it primary. */
  async function saveAddress(party) {
    const fields = pickAddress(draft)
    setSavingAddress(true)
    try {
      if (addrName) {
        await updateDoc('Address', addrName, fields)
        await mutateAddress()
        return null
      }
      if (!fields.address_line1) return null
      const created = await createDoc('Address', {
        ...fields, address_title: party?.[config.titleField] || name, address_type: 'Billing', is_primary_address: 1,
        links: [{ link_doctype: config.doctype, link_name: name }],
      })
      return await updateDoc(config.doctype, name, { [addrField]: created.name })
    } finally {
      setSavingAddress(false)
    }
  }

  async function run(label, fn, success) {
    setBusy(label)
    try {
      await fn()
      if (success) toast({ tone: 'success', title: success })
    } catch (e) {
      toast({ tone: 'error', title: `${label} failed`, description: errorText(e) })
    } finally {
      setBusy('')
    }
  }

  const submit = () => run('Submit', async () => {
    const res = await call.post('frappe.client.submit', { doc: saved })
    await mutate(res?.message ?? undefined, !res?.message)
  }, `${config.single} submitted`)

  const cancel = async () => {
    if (!(await confirm({ title: `Cancel ${config.single}?`, message: `Cancel ${saved.name}? This cannot be undone.`, confirmLabel: 'Cancel document', cancelLabel: 'Keep', tone: 'danger' }))) return
    run('Cancel', async () => {
      await call.post('frappe.client.cancel', { doctype: config.doctype, name: saved.name })
      await mutate()
    }, `${config.single} cancelled`)
  }

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${config.single}?`, message: `Delete ${saved.name}?`, confirmLabel: 'Delete', tone: 'danger' }))) return
    run('Delete', async () => {
      await deleteDoc(config.doctype, saved.name)
      navigate(`/${slug}`, { replace: true })
    }, `${config.single} deleted`)
  }

  const make = (m) => run(m.label, async () => {
    const doc = await makeDoc(call, m.method, m.args(saved))
    navigate(`/${m.target}/new`, { state: { prefill: doc } })
  })

  const discard = () => {
    if (isNew) navigate(`/${slug}`)
    else { setDraft(null); setInvalid([]) }
  }

  const title = isNew ? `New ${config.single}` : (doc[config.titleField] || doc.name)
  const showsTotal = Boolean(config.headerTotal) || config.totals?.includes('grand_total')
  const totalValue = config.headerTotal ? config.headerTotal(doc) : editing ? (calc ? (calc.rounded_total || calc.grand_total) : itemsTotal(doc.items ?? [])) : (doc.rounded_total || doc.grand_total)
  const showTaxCard = (doc.taxes?.length ?? 0) > 0 && !(config.tables ?? []).some((t) => t.field === 'taxes')
  const makeActions = !editing && !isNew ? (config.make ?? []).filter((m) => !m.when || m.when(doc)) : []
  const docActions = !editing && !isNew ? (config.docActions ?? []).filter((a) => !a.when || a.when(doc, boot)) : []

  const actions = editing ? (
    <>
      <Button icon={X} onClick={discard}>Discard</Button>
      <Button variant="primary" icon={Save} onClick={save} loading={creating || updating || savingAddress}>{isNew ? 'Create' : 'Save'}</Button>
    </>
  ) : (
    <>
      {!config.readOnly && docstatus === 0 && <Button variant="danger" icon={Trash2} onClick={remove} loading={busy === 'Delete'} title="Delete draft">Delete</Button>}
      {!config.readOnly && submittable && docstatus === 1 && <Button variant="danger" icon={Ban} onClick={cancel} loading={busy === 'Cancel'}><span className="hidden sm:inline">Cancel</span></Button>}
      {SENDABLE.has(config.doctype) && docstatus !== 2 && <SendButton doctype={config.doctype} name={doc.name} />}
      <PrintButton doctype={config.doctype} name={doc.name} />
      {docActions.map((a) => (
        <Button key={a.label} icon={a.icon} variant={a.variant} loading={busy === a.label} disabled={Boolean(busy)}
          onClick={() => run(a.label, () => a.run({ doc: saved, call, toast, mutate, navigate, boot }), a.success)}>
          {a.label}
        </Button>
      ))}
      <CreateMenu actions={makeActions} onPick={make} busy={busy} />
      {canEdit && <Button icon={Pencil} onClick={startEdit} loading={Boolean(addrName && !primaryAddress)}>Edit</Button>}
      {!config.readOnly && submittable && docstatus === 0 && <Button variant="accent" icon={Send} onClick={submit} loading={busy === 'Submit'}>Submit</Button>}
    </>
  )

  return (
    <div className="space-y-4">
      {/* Header bar: identity left, total + actions right (wraps to a second row on phones) */}
      <div className="flex flex-col gap-2.5 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Link to={`/${slug}`} title={`Back to ${config.title}`} className="pressable grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted hover:bg-surface-2 hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('truncate text-sm font-bold', !isNew && 'num')}>{isNew ? title : doc.name}</span>
              {!isNew && <StatusBadge status={statusOf(config, doc)} />}
              {!isNew && doc.workflow_state && doc.workflow_state !== doc.status && <StatusBadge status={doc.workflow_state} />}
            </div>
            {!isNew && title !== doc.name && <div className="truncate text-xs text-muted">{title}</div>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {showsTotal && (
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300">
              <span className="text-xs font-medium text-blue-500 dark:text-blue-400">{config.headerTotalLabel ?? 'Total'}</span>
              <span className="num font-bold">{formatMoney(totalValue ?? 0, currency)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-1.5">{actions}</div>
        </div>
      </div>

      {/* Approval (Frappe Workflow) */}
      {!isNew && !editing && workflow && (
        <ApprovalBar doctype={config.doctype} name={name} workflow={workflow} onDone={async () => { await mutate(); await refreshWorkflow() }} />
      )}

      {/* Fields */}
      {tabNames.length > 1 && (
        <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
        <div className="inline-flex rounded-md border bg-surface-2 p-0.5 dark:bg-zinc-900" role="tablist">
          {tabNames.map((t) => (
            <button
              key={t} type="button" role="tab" aria-selected={t === currentTab} onClick={() => setActiveTab(t)}
              className={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-xs transition-colors', t === currentTab ? 'bg-background font-semibold text-foreground dark:bg-zinc-800' : 'font-medium text-muted hover:text-foreground')}
            >
              {t}
              {sections.some((s) => tabOf(s) === t && s.fields.some((f) => invalid.includes(f.fieldname))) && <span className="size-1.5 rounded-full bg-danger" />}
            </button>
          ))}
        </div>
        </div>
      )}
      {currentTab === PAY_TAB && <PartyAccount key={doc.name} doctype={config.doctype} name={doc.name} />}
      {sections.length > 0 && currentTab !== PAY_TAB && (
        <div key={currentTab} className="card animate-fade-in divide-y">
          {sections.filter((s) => tabOf(s) === currentTab && (!s.when || s.when(doc)) && s.fields.some(isShown)).map((s) => (
            <section key={s.title} className="p-4">
              {s.collapsed ? (
                <button
                  type="button" onClick={() => setOpenSections((o) => ({ ...o, [s.title]: !o[s.title] }))}
                  aria-expanded={Boolean(openSections[s.title])}
                  className={cn('flex w-full items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground', openSections[s.title] && 'mb-3')}
                >
                  <ChevronRight className={cn('size-3.5 transition-transform duration-200', openSections[s.title] && 'rotate-90')} />
                  {s.title}
                </button>
              ) : (
                <h2 className="mb-3 text-xs font-semibold text-muted">{s.title}</h2>
              )}
              <div className={cn('grid grid-cols-1 items-end gap-3.5 sm:grid-cols-2 lg:grid-cols-3', s.collapsed && !openSections[s.title] && 'hidden')}>
                {s.fields.filter(isShown).map((f) => {
                  const wide = ['Small Text', 'Text', 'Text Editor', 'Long Text'].includes(f.fieldtype)
                  return (
                    <div key={f.fieldname} className={cn('min-w-0 space-y-1.5', wide && 'sm:col-span-2 lg:col-span-3')}>
                      <div className="flex h-5 items-center justify-between gap-2">
                        <label className="label truncate">
                          {f.label}{f.reqd && isFieldEditable(f) && <span className="text-danger"> *</span>}
                        </label>
                      </div>
                      {isFieldEditable(f) ? (
                        <FieldInput field={f} value={f.child ? draft[f.child]?.[0]?.[f.fieldname] : draft[f.fieldname]} doc={draft} onChange={(v) => (f.child ? setChildField(f, v) : setField(f.fieldname, v))} invalid={invalid.includes(f.fieldname)} />
                      ) : (
                        <div className={cn('flex min-h-9 items-center rounded-md border border-border-subtle bg-surface px-3 text-[13px]', wide && 'py-2')}>
                          <FieldValue field={f} value={f.child ? doc[f.child]?.[0]?.[f.fieldname] : doc[f.fieldname]} doc={doc} currency={currency} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Items */}
      {config.items && childMeta && !onTaxTab && (
        <ItemsTable
          rows={doc.items ?? []}
          onChange={(items) => setDraft((d) => ({ ...d, items }))}
          editing={editing}
          childMeta={childMeta}
          itemsConfig={config.items}
          pricing={config.pricing}
          parentDoctype={config.doctype}
          doc={doc}
          currency={currency}
        />
      )}

      {onTaxTab && (
        <>
          <ChildTable
            table={TAX_ROWS} childMeta={taxMeta} doc={doc} currency={currency}
            rows={(doc.taxes ?? []).map((r, i) => (editing && r.charge_type !== 'Actual' && calc?.taxes?.[i] ? { ...r, tax_amount: calc.taxes[i].tax_amount } : r))} editing={editing && docstatus === 0}
            onChange={(rows) => setDraft((d) => ({ ...d, taxes: rows }))}
            patchDoc={(patch) => setDraft((d) => ({ ...d, ...patch }))} call={call} toast={toast} boot={boot}
          />
          {childMeta && metaOf(meta.fieldMap?.items?.options)?.fieldMap?.item_tax_template && (
            <ChildTable
              table={ITEM_TAX} childMeta={childMeta} doc={doc} currency={currency}
              rows={doc.items ?? []} editing={editing && docstatus === 0}
              onChange={(items) => setDraft((d) => ({ ...d, items }))}
              patchDoc={(patch) => setDraft((d) => ({ ...d, ...patch }))} call={call} toast={toast} boot={boot}
            />
          )}
        </>
      )}

      {/* Other child tables (journal lines, payment references, tax rows …) */}
      {!onTaxTab && tables.map((t) => (
        <ChildTable
          key={t.field} table={t} childMeta={t.meta} doc={doc} currency={currency}
          rows={doc[t.field] ?? []} editing={editing && docstatus === 0}
          onChange={(rows) => setDraft((d) => ({ ...d, [t.field]: rows }))}
          patchDoc={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          call={call} toast={toast} boot={boot}
        />
      ))}

      {/* Taxes + summary */}
      {(config.totals || showTaxCard) && (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0 space-y-4">
            {showTaxCard && !onTaxTab && (
              <div className="card overflow-hidden">
                <div className="dt-bar">
                  <h3 className="dt-title">Taxes</h3>
                </div>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="w-24 text-end">Rate</th>
                      <th className="w-40 text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.taxes.map((t, i) => (
                      <tr key={t.name ?? i}>
                        <td>{t.description || t.account_head}</td>
                        <td className="dt-num">{t.rate ? `${t.rate}%` : '—'}</td>
                        <td className="dt-num">{editing ? (calc?.taxes?.[i] ? formatMoney(calc.taxes[i].tax_amount, currency) : <span className="text-muted">…</span>) : formatMoney(t.tax_amount ?? 0, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!isNew && !editing && (config.related ?? []).map((rel) => <RelatedList key={rel.slug} rel={rel} doc={doc} />)}
            {!isNew && !editing && config.crmActivities && <CrmActivities doctype={config.doctype} name={doc.name} email={doc.email_id || doc.contact_email} phone={doc.mobile_no || doc.phone || doc.contact_mobile} />}
            {!isNew && !editing && <Activity doctype={config.doctype} name={doc.name} />}
          </div>
          {config.totals && (
            <TotalsCard meta={meta} fields={config.totals} doc={doc} editing={editing} estimate={itemsTotal(doc.items ?? [])} calc={calc} currency={currency} onDiscount={taxTab && meta?.fieldMap?.discount_amount && docstatus === 0 ? (v) => setDraft((d) => ({ ...d, discount_amount: v, apply_discount_on: 'Net Total' })) : null} />
          )}
        </div>
      )}
    </div>
  )
}
