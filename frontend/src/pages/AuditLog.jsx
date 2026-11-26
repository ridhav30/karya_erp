import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { ChevronDown, ChevronRight, Download, Search, X } from 'lucide-react'
import Button from '../components/Button.jsx'
import Combobox from '../components/fields/Combobox.jsx'
import PageHeader from '../components/PageHeader.jsx'
import Pager from '../components/Pager.jsx'
import { DOCTYPES } from '../lib/doctypes.js'
import { serverMs } from '../lib/serverTime.js'
import { useCall } from '../lib/useCall.js'
import { errorText } from '../lib/errors.js'
import { cn } from '../lib/utils.js'

const TONE = {
  Create: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  Update: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  Submit: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
  Cancel: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  Delete: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  Rename: 'bg-surface-2 text-muted',
}
const csvCell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))
const when = (iso) => new Date(serverMs(iso)).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })
const EMPTY = { user: '', company: '', doctype: '', action: '', name: '', q: '', from_date: '', to_date: '' }

function docLink(doctype, name) {
  const slug = Object.keys(DOCTYPES).find((s) => DOCTYPES[s].doctype === doctype && !DOCTYPES[s].alias)
  return slug ? <Link to={`/${slug}/${encodeURIComponent(name)}`} className="text-primary hover:underline">{name}</Link> : name
}

/** Who created, changed, submitted, cancelled or deleted what, in which company (System Manager / Auditor). */
export default function AuditLog() {
  const call = useCall()
  const [f, setF] = useState(EMPTY)
  const [start, setStart] = useState(0)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v ?? '' })); setStart(0) }
  const params = useMemo(() => ({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), start }), [f, start])
  const key = `audit:${JSON.stringify(params)}`
  const { data, error, isLoading } = useFrappeGetCall('karya_erp.audit.entries', params, key, { revalidateOnFocus: false, keepPreviousData: true })
  const { data: fx } = useFrappeGetCall('karya_erp.audit.facets', undefined, 'audit-facets', { revalidateOnFocus: false })
  const d = data?.message
  const facets = fx?.message ?? { users: [], companies: [], doctypes: [], actions: [] }
  const opts = (list) => list.map((v) => ({ value: v, label: v }))
  const filtered = Object.values(f).some(Boolean)

  async function exportCsv() {
    setBusy(true)
    setErr('')
    try {
      const res = await call.get('karya_erp.audit.export', Object.fromEntries(Object.entries(f).filter(([, v]) => v)))
      const rows = res?.message ?? res ?? []
      const head = ['When', 'User', 'Full name', 'Company', 'Action', 'Document type', 'Document', 'Summary', 'IP address']
      const lines = [head, ...rows.map((r) => [r.creation, r.user, r.full_name, r.company, r.action, r.reference_doctype, r.reference_name, r.summary, r.ip_address])]
      const url = URL.createObjectURL(new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }))
      Object.assign(document.createElement('a'), { href: url, download: 'audit-log.csv' }).click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every create, change, submit, cancel and delete: by whom, in which company, and what changed">
        <Button icon={Download} loading={busy} disabled={!d?.total} onClick={exportCsv}>Export CSV</Button>
      </PageHeader>
      {(error || err) && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error) || err}</div>}
      <section className="card overflow-hidden">
        <div className="grid gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Combobox clearable placeholder="User" options={opts(facets.users)} value={f.user} onChange={set('user')} />
          <Combobox clearable placeholder="Company" options={opts(facets.companies)} value={f.company} onChange={set('company')} />
          <Combobox clearable placeholder="Document type" options={opts(facets.doctypes)} value={f.doctype} onChange={set('doctype')} />
          <Combobox clearable searchable={false} placeholder="Action" options={opts(facets.actions)} value={f.action} onChange={set('action')} />
          <input type="date" className="input" aria-label="From date" value={f.from_date} onChange={(e) => set('from_date')(e.target.value)} />
          <input type="date" className="input" aria-label="To date" value={f.to_date} onChange={(e) => set('to_date')(e.target.value)} />
          <div className="relative"><Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><input className="input ps-8" placeholder="Document name" value={f.name} onChange={(e) => set('name')(e.target.value)} /></div>
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><input className="input ps-8" placeholder="Search summary" value={f.q} onChange={(e) => set('q')(e.target.value)} /></div>
            {filtered && <Button icon={X} onClick={() => { setF(EMPTY); setStart(0) }}>Clear</Button>}
          </div>
        </div>
        {isLoading && !d ? <div className="h-48 animate-pulse" /> : (
          <div className="overflow-x-auto">
            <table className="rt w-full md:min-w-[860px] text-xs">
              <thead><tr className="border-b text-start text-muted">
                <th className="w-6 px-2 py-2" /><th className="px-2 py-2 font-medium">When</th><th className="px-2 py-2 font-medium">User</th><th className="px-2 py-2 font-medium">Company</th>
                <th className="px-2 py-2 font-medium">Action</th><th className="px-2 py-2 font-medium">Document</th><th className="px-4 py-2 font-medium">Summary</th>
              </tr></thead>
              <tbody className="divide-y">
                {(d?.rows ?? []).map((r) => {
                  const has = r.changes?.length > 0
                  return (
                    <Fragment key={r.name}>
                      <tr className={cn(has && 'cursor-pointer hover:bg-surface-2')} onClick={() => has && setOpen(open === r.name ? null : r.name)}>
                        <td className="px-2 py-2 text-muted">{has ? (open === r.name ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : null}</td>
                        <td data-label="When" className="whitespace-nowrap px-2 py-2 text-muted">{when(r.creation)}</td>
                        <td data-label="User" className="px-2 py-2"><span className="font-medium">{r.full_name || r.user}</span><span className="block text-[11px] text-muted">{r.user}</span></td>
                        <td data-label="Company" className="px-2 py-2 text-muted">{r.company || '—'}</td>
                        <td data-label="Action" className="px-2 py-2"><span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', TONE[r.action])}>{r.action}</span></td>
                        <td data-label="Document" className="px-2 py-2"><span className="block text-[11px] text-muted">{r.reference_doctype}</span>{r.action === 'Delete' ? r.reference_name : docLink(r.reference_doctype, r.reference_name)}</td>
                        <td data-label="Summary" className="px-4 py-2">{r.summary}{has && <span className="ms-1 text-muted">· {r.changes.length} field{r.changes.length > 1 ? 's' : ''}</span>}</td>
                      </tr>
                      {open === r.name && has && (
                        <tr className="bg-surface/60"><td /><td colSpan={6} className="px-2 py-2">
                          <table className="w-full text-[11px]"><tbody>
                            {r.changes.map((c) => (
                              <tr key={c.field}><td className="w-40 py-0.5 pe-3 text-muted">{c.label}</td><td className="py-0.5 pe-2 text-danger line-through">{c.old || '—'}</td><td className="py-0.5">{c.new || '—'}</td></tr>
                            ))}
                          </tbody></table>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            {(d?.rows?.length ?? 0) === 0 && <p className="p-8 text-center text-xs text-muted">{filtered ? 'Nothing matches these filters.' : 'Nothing has been logged yet.'}</p>}
          </div>
        )}
        {d && <Pager start={d.start} pageLength={d.page_length} total={d.total} onChange={setStart} />}
      </section>
    </>
  )
}
