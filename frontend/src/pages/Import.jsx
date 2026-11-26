import { Fragment, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload, XCircle } from 'lucide-react'
import Button from '../components/Button.jsx'
import PageHeader from '../components/PageHeader.jsx'
import TabScroller from '../components/TabScroller.jsx'
import { useBoot } from '../app/boot-context.js'
import { useToast } from '../app/toast-context.js'
import { DOCTYPES } from '../lib/doctypes.js'
import { uploadFile } from '../lib/activity.js'
import { useCall } from '../lib/useCall.js'
import { errorText } from '../lib/errors.js'
import { formatNumber } from '../lib/format.js'
import { cn } from '../lib/utils.js'
import { confirm } from '../lib/dialogs.js'

const OPENING = new Set(['opening-stock', 'opening-balances'])
const HISTORY_NOTES = {
  'opening-balances': 'One opening entry for the whole trial balance. For what customers owe you and what you owe suppliers, fill Party Type and Party (the receivable / payable account is filled in); other rows use Account. Any difference goes to Temporary Opening. For invoice-by-invoice balances use Opening invoices instead, not both.',
  'sales-history': 'Past invoices for your reports only — nothing is posted to the accounts or stock, so load opening balances separately. VAT is added from your default tax template. Import customers and items first.',
  'purchase-history': 'Past supplier invoices for your reports only — nothing is posted to the accounts or stock. VAT is added from your default tax template. Import suppliers and items first.',
  'attendance-history': 'One row per employee per day. Days already marked are skipped. Import employees first.',
  'salary-history': 'Monthly pay totals per employee, kept as a record. It is not a payslip and posts nothing.',
}
const STATUS = {
  new: { label: 'Ready', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  exists: { label: 'Already exists', tone: 'bg-surface-2 text-muted' },
  error: { label: 'Error', tone: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

function download(name, text) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** One line per spreadsheet row: what happened to it and why, to hand back to whoever prepared the file. */
function reportCsv(kindLabel, fileName, result) {
  const rows = [
    ...result.created.map((c) => [c.row, 'Created', c.name, '']),
    ...result.failed.map((f) => [f.row, 'Failed', '', f.error]),
    ...(result.skipped_rows ?? []).map((r) => [r.row, r.status === 'exists' ? 'Skipped: already exists' : 'Skipped: has errors', '', (r.errors ?? []).join('; ')]),
  ].sort((a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0))
  const head = [['Import report'], ['Type', kindLabel], ['File', fileName ?? ''], ['Created', result.created.length], ['Failed', result.failed.length], ['Skipped', result.skipped ?? 0], [], ['Row', 'Result', 'Record', 'Detail']]
  return [...head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Link to a created record when the UI has a page for its doctype. */
function docLink(doctype, name) {
  const dts = doctype === 'Sales Invoice / Purchase Invoice' ? ['Sales Invoice', 'Purchase Invoice'] : [doctype]
  const slug = Object.keys(DOCTYPES).find((s) => dts.includes(DOCTYPES[s].doctype) && !DOCTYPES[s].alias)
  return slug ? <Link to={`/${slug}/${encodeURIComponent(name)}`} className="text-primary hover:underline">{name}</Link> : name
}

/** Bulk import from Excel / CSV: pick a type → template → upload → preview → import. */
export default function Import() {
  const boot = useBoot()
  const call = useCall()
  const toast = useToast()
  const fileRef = useRef(null)
  const [sp, setSp] = useSearchParams()
  const { data, error } = useFrappeGetCall('karya_erp.importer.kinds', undefined, 'import-kinds', { revalidateOnFocus: false })
  const kinds = useMemo(() => data?.message ?? [], [data])
  const kind = kinds.find((k) => k.kind === sp.get('type')) ?? kinds.find((k) => k.can)
  const [file, setFile] = useState(null) // { name, url }
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState('')
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [postingDate, setPostingDate] = useState(() => new Date().toLocaleDateString('en-CA'))

  const reset = () => { setFile(null); setPreview(null); setResult(null); setOnlyErrors(false); if (fileRef.current) fileRef.current.value = '' }
  const choose = (k) => { reset(); setSp({ type: k }) }

  function template(withExample) {
    const head = kind.columns.map((c) => csvCell(c.label + (c.required ? '*' : '')))
    const lines = [head.join(',')]
    if (withExample) lines.push(kind.columns.map((c) => csvCell(c.example ?? '')).join(','))
    download(`${kind.kind}-${withExample ? 'example' : 'template'}.csv`, lines.join('\r\n') + '\r\n')
  }

  async function pick(f) {
    if (!f) return
    reset()
    setBusy('upload')
    try {
      const up = await uploadFile(f)
      setFile({ name: f.name, url: up.file_url })
      setBusy('preview')
      const res = await call.get('karya_erp.importer.preview', { kind: kind.kind, file_url: up.file_url, company: boot.company })
      setPreview(res.message)
      setOnlyErrors(res.message.counts.error > 0)
    } catch (e) {
      toast({ tone: 'error', title: 'Could not read the file', description: errorText(e) })
    } finally {
      setBusy('')
    }
  }

  async function runImport() {
    const n = preview.counts.new
    if (!(await confirm({ title: 'Import data?', message: `Import ${n} row${n === 1 ? '' : 's'} as ${kind.label.toLowerCase()}?${OPENING.has(kind.kind) ? `\nPosting date: ${postingDate}` : ''}`, confirmLabel: 'Import' }))) return
    setBusy('import')
    try {
      const res = await call.post('karya_erp.importer.run', { kind: kind.kind, file_url: file.url, company: boot.company, posting_date: postingDate })
      setResult(res.message)
      const r = res.message
      toast({ tone: r.failed.length ? 'error' : 'success', title: `${r.created.length} created${r.failed.length ? `, ${r.failed.length} failed` : ''}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Import failed', description: errorText(e) })
    } finally {
      setBusy('')
    }
  }

  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error)}</div>
  if (!kind) return <div className="card h-64 animate-pulse" />

  const shown = preview ? preview.rows.filter((r) => !onlyErrors || r.status === 'error') : []
  const keyCols = preview ? preview.columns.slice(0, 4) : []

  return (
    <>
      <PageHeader title="Import data" subtitle="Load records from Excel (.xlsx) or CSV" />

      <TabScroller>
        {kinds.map((k, i) => (
          <Fragment key={k.kind}>
            {k.group !== kinds[i - 1]?.group && (
              <span className={cn('flex shrink-0 items-center gap-1.5 self-center whitespace-nowrap text-xs font-semibold text-muted !snap-align-none', i > 0 && 'ms-2 border-s ps-3')}>{k.group}</span>
            )}
            <button type="button" data-active={k.kind === kind.kind} disabled={!k.can} onClick={() => choose(k.kind)} title={k.can ? undefined : 'You don’t have permission'}
              className={cn('pressable shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs disabled:opacity-40', k.kind === kind.kind ? 'border-transparent bg-strong font-medium text-strong-foreground' : 'bg-background text-muted hover:text-foreground')}>
              {k.label}
            </button>
          </Fragment>
        ))}
      </TabScroller>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card overflow-hidden">
          <div className="dt-bar"><h3 className="dt-title">Columns for {kind.label.toLowerCase()}</h3>
            <div className="flex gap-1.5"><Button icon={Download} onClick={() => template(false)}>Template</Button><Button onClick={() => template(true)}>Example</Button></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <tbody className="divide-y">
                {kind.columns.map((c) => (
                  <tr key={c.fieldname}>
                    <td className="w-44 px-4 py-1.5 font-medium">{c.label}{c.required && <span className="text-danger"> *</span>}</td>
                    <td className="px-2 py-1.5 text-muted">{c.hint}</td>
                    <td className="px-4 py-1.5 text-end font-mono text-[11px] text-muted">{c.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h3 className="text-xs font-semibold">Upload</h3>
          {OPENING.has(kind.kind) && (
            <label className="block space-y-1.5"><span className="label">Opening date</span><input type="date" className="input" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} /><span className="block text-[11px] text-muted">Usually the day before you start using the system.</span></label>
          )}
          {HISTORY_NOTES[kind.kind] && <p className="text-[11px] text-muted">{HISTORY_NOTES[kind.kind]}</p>}
          {kind.kind === 'opening-invoices' && <p className="text-[11px] text-muted">Each row becomes an opening invoice for the amount still unpaid. Import customers and suppliers first.</p>}
          <label className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-xs text-muted hover:border-gray-400', busy && 'pointer-events-none opacity-60')}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]) }}>
            {busy === 'upload' || busy === 'preview' ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            {file ? <span className="flex items-center gap-1.5 font-medium text-foreground"><FileSpreadsheet className="size-3.5" />{file.name}</span> : <span>Drop a file here or <span className="text-primary">choose one</span></span>}
            <span className="text-[11px]">.xlsx or .csv · first row = column names</span>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {file && <Button icon={RotateCcw} onClick={reset} className="w-full">Start over</Button>}
        </section>
      </div>

      {preview && !result && (
        <section className="card overflow-hidden">
          <div className="dt-bar flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {Object.entries(preview.counts).map(([s, n]) => n > 0 && <span key={s} className={cn('rounded px-2 py-0.5 font-medium', STATUS[s].tone)}>{formatNumber(n)} {STATUS[s].label.toLowerCase()}</span>)}
              {preview.counts.error > 0 && (
                <label className="ms-2 flex items-center gap-1.5 text-muted"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />Only errors</label>
              )}
            </div>
            <Button variant="primary" icon={Upload} onClick={runImport} loading={busy === 'import'} disabled={!preview.counts.new}>
              Import {formatNumber(preview.counts.new)} row{preview.counts.new === 1 ? '' : 's'}
            </Button>
          </div>
          {(preview.missing.length > 0 || preview.unknown.length > 0) && (
            <div className="space-y-1 border-b bg-amber-50 px-4 py-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {preview.missing.length > 0 && <p className="flex items-center gap-1.5"><AlertTriangle className="size-3" />Missing required column{preview.missing.length > 1 ? 's' : ''}: {preview.missing.join(', ')}</p>}
              {preview.unknown.length > 0 && <p>Ignored column{preview.unknown.length > 1 ? 's' : ''}: {preview.unknown.join(', ')}</p>}
            </div>
          )}
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="sticky top-0 bg-background"><tr className="border-b text-start text-muted">
                <th className="w-14 px-4 py-2 font-medium">Row</th><th className="w-28 px-2 py-2 font-medium">Status</th>
                {keyCols.map((c) => <th key={c.fieldname} className="px-2 py-2 font-medium">{c.label}</th>)}
                <th className="px-4 py-2 font-medium">Problems</th>
              </tr></thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={r.row} className={r.status === 'error' ? 'bg-red-50/40 dark:bg-red-950/20' : undefined}>
                    <td className="num px-4 py-1.5 text-muted">{r.row}</td>
                    <td className="px-2 py-1.5"><span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', STATUS[r.status].tone)}>{STATUS[r.status].label}</span></td>
                    {keyCols.map((c) => <td key={c.fieldname} className="max-w-[12rem] truncate px-2 py-1.5">{r.values[c.fieldname] ?? ''}</td>)}
                    <td className="px-4 py-1.5 text-danger">{r.errors.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="p-6 text-center text-xs text-muted">No rows to show.</p>}
            {preview.total > preview.rows.length && <p className="border-t px-4 py-2 text-[11px] text-muted">Showing the first {preview.rows.length} of {formatNumber(preview.total)} rows; all rows are checked and imported.</p>}
          </div>
        </section>
      )}

      {result && (
        <section className="card space-y-3 p-4 text-xs">
          <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-emerald-600" />{formatNumber(result.created.length)} created{result.skipped ? ` · ${result.skipped} skipped (existing or with errors)` : ''}</p>
          {result.queued && <p className="text-muted">More than 50 invoices — ERPNext is creating them in the background. Check Sales / Purchase Invoices in a few minutes.</p>}
          {result.balanced_to_temporary ? <p className="text-muted">Debits and credits differed by {formatNumber(Math.abs(result.balanced_to_temporary), 2)}; the difference went to Temporary Opening.</p> : null}
          {result.created.length > 0 && (
            <div className="flex max-h-48 flex-wrap gap-x-3 gap-y-1 overflow-auto">{result.created.map((c) => <span key={c.name}>{docLink(result.doctype, c.name)}</span>)}</div>
          )}
          {result.failed.length > 0 && (
            <div className="space-y-1 rounded-md bg-red-50 p-3 text-red-800 dark:bg-red-950/40 dark:text-red-300">
              <p className="flex items-center gap-1.5 font-medium"><XCircle className="size-3.5" />{result.failed.length} failed</p>
              {result.failed.map((f) => <p key={f.row}>Row {f.row}: {f.error}</p>)}
            </div>
          )}
          <div className="flex gap-2">
            <Button icon={Download} onClick={() => download(`${kind.kind}-import-report.csv`, reportCsv(kind.label, file?.name, result))}>Download report</Button>
            <Button icon={RotateCcw} onClick={reset}>Import another file</Button>
          </div>
        </section>
      )}
    </>
  )
}
