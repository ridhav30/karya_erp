import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { ArrowLeft, ChevronRight, Download, HandCoins, History, Search } from 'lucide-react'
import { SIDES } from '../../lib/partySides.js'
import Button from '../../components/Button.jsx'
import FilterPopover from '../../components/FilterPopover.jsx'
import ColumnPicker from '../../components/ColumnPicker.jsx'
import Pager from '../../components/Pager.jsx'
import { useColumnPrefs } from '../../lib/useColumnPrefs.js'
import { FullPageSpinner } from '../../components/Spinner.jsx'
import NotFound from '../NotFound.jsx'
import { useBoot } from '../../app/boot-context.js'
import { useCall } from '../../lib/useCall.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney, formatNumber } from '../../lib/format.js'
import { reportByKey } from '../../lib/reports.js'
import { ROUTE_OF } from '../../lib/doctypes.js'
import { cn } from '../../lib/utils.js'

const RIGHT = new Set(['Currency', 'Float', 'Int', 'Percent'])
// From/to date fields shown as one inline range.
const DATE_PAIRS = [['from_date', 'to_date'], ['period_start_date', 'period_end_date']]
const PAGE = 200 // rows per page: from the server for paged reports, otherwise sliced here (tree reports show everything)
const EXPORT_CHUNK = 2000 // rows per request when exporting a paged report

/** Old-style column strings: "Label:Currency/currency:120". */
function parseColumn(c) {
  if (typeof c !== 'string') return { ...c, fieldname: c.fieldname || c.id || slug(c.label) }
  const [label, type = 'Data', width] = c.split(':')
  const [fieldtype, options] = type.split('/')
  return { label, fieldtype: fieldtype || 'Data', options, width, fieldname: slug(label) }
}
const slug = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const unquote = (v) => (typeof v === 'string' ? v.replace(/^'(.*)'$/, '$1') : v)

export default function ReportPage({ reportKey }) {
  const params = useParams()
  const key = reportKey ?? params.report
  const def = reportByKey(key)
  const boot = useBoot()
  const { data: ctxData, isLoading: ctxLoading } = useFrappeGetCall('karya_erp.accounts.context', { company: boot.company }, `acc-ctx:${boot.company}`, { revalidateOnFocus: false })
  const ctx = ctxData?.message

  if (!def) return <NotFound />
  if (ctxLoading || !ctx) return <FullPageSpinner />
  return <Report key={key} def={def} ctx={ctx} />
}

function Report({ def, ctx }) {
  const payAct = def.payAction ? SIDES[def.payAction] : null
  const boot = useBoot()
  const call = useCall()
  const [params, setParams] = useSearchParams()

  // URL params (e.g. ?account=… from the chart of accounts) override the defaults.
  const [filters, setFilters] = useState(() => {
    const f = { ...def.defaults(ctx) }
    for (const flt of def.filters) if (params.get(flt.field) != null) f[flt.field] = params.get(flt.field)
    return f
  })
  const [state, setState] = useState({ loading: false, error: null, data: null })
  const [clientStart, setClientStart] = useState(0) // first row on screen for reports paged here in the browser
  const reqRef = useRef(0)
  // Server-paged reports: the server sends one page at a time (and the row count with the first one).
  const [start, setStart] = useState(0)
  const [search, setSearch] = useState('')
  const totalRef = useRef(null)
  const summaryRef = useRef([])
  const totalRowRef = useRef(null)

  // def.paged can depend on the filters (the analytics group views are not paged on the server)
  const paged = typeof def.paged === 'function' ? def.paged(filters) : Boolean(def.paged)
  // Everything else except the tree statements (P&L, balance sheet …) is also sent a page at a time: the server runs
  // the ERPNext report and returns a slice, so a huge result can never freeze the tab. Only `paged` ones have search.
  const sliced = !paged && !def.tree
  const serverPaged = paged || sliced
  const pageCall = (offset, size, extra = {}) => (paged
    ? [api, { report: def.key, filters: JSON.stringify(sentFilters()), start: offset, page_length: size, search, ...extra }]
    : ['karya_erp.report_slice.run', { report_name: def.report, filters: JSON.stringify(sentFilters()), start: offset, page_length: size, ...(extra.export ? { export: 1 } : {}) }])
  const api = def.api ?? 'karya_erp.stock_reports.run'
  const missing = def.filters.filter((f) => f.reqd && !filters[f.field])
  const visibleFilters = def.filters.filter((f) => !f.hidden)
  // Dates sit outside the Filters popover (inline, applied at once); the rest go in the popover.
  const dateFilters = visibleFilters.filter((f) => f.type === 'Date')
  const popoverFilters = visibleFilters.filter((f) => f.type !== 'Date')
  const datePairs = DATE_PAIRS.filter(([a, b]) => dateFilters.some((f) => f.field === a) && dateFilters.some((f) => f.field === b))
  const pairedFields = new Set(datePairs.flat())
  const singleDates = dateFilters.filter((f) => !pairedFields.has(f.field))

  const sentFilters = () => {
    let sent = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null))
    for (const f of def.filters) if (f.multi && sent[f.field] && !Array.isArray(sent[f.field])) sent[f.field] = [sent[f.field]]
    if (def.map) sent = def.map(sent)
    return sent
  }

  async function run(offset = 0) {
    if (missing.length) return
    const id = ++reqRef.current
    setState((s) => ({ ...s, loading: true, error: null }))
    const sent = sentFilters()
    try {
      if (serverPaged) {
        const [endpoint, body] = pageCall(offset, PAGE, { with_total: offset === 0 ? 1 : 0 })
        const res = await call.post(endpoint, body)
        if (id !== reqRef.current) return
        const msg = res?.message ?? {}
        if (offset === 0) { totalRef.current = msg.total ?? 0; summaryRef.current = msg.report_summary ?? []; totalRowRef.current = msg.total_row ?? null }
        setStart(offset)
        setState({ loading: false, error: null, data: { ...msg, total: totalRef.current, report_summary: summaryRef.current, total_row: totalRowRef.current } })
        return
      }
      const res = await call.post('frappe.desk.query_report.run', { report_name: def.report, filters: JSON.stringify(sent), ignore_prepared_report: 1 })
      if (id !== reqRef.current) return
      setState({ loading: false, error: null, data: res?.message ?? null })
      setClientStart(0)
    } catch (e) {
      if (id === reqRef.current) setState({ loading: false, error: errorText(e, `Could not run ${def.title}.`), data: null })
    }
  }

  // Re-run (debounced) whenever a filter changes; keep shareable filters in the URL.
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    // heavier (ERPNext-built) reports wait a little longer after the last filter change before running
    const t = setTimeout(() => run(0), paged ? 350 : 700)
    return () => clearTimeout(t)
  }, [filtersKey, search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filters popover "Apply": update the report filters and keep the visible ones in the URL.
  const applyFilters = (next) => {
    setFilters((f) => ({ ...f, ...next }))
    setParams((p) => {
      for (const flt of visibleFilters) {
        const v = next[flt.field]
        if (v) p.set(flt.field, v); else p.delete(flt.field)
      }
      return p
    }, { replace: true })
  }
  const defaultValues = useMemo(() => def.defaults(ctx), [def, ctx])
  // Popover fields: each from/to pair becomes one "Period" range, single dates next, then the rest.
  const pairKey = ([a, b]) => `${a}|${b}`
  const popoverFields = [
    ...datePairs.map((pr) => ({ field: pairKey(pr), label: 'Period', type: 'Date', range: true, reqd: true })),
    ...singleDates,
    ...popoverFilters,
  ]
  const toPopover = (src) => ({
    ...Object.fromEntries(popoverFilters.concat(singleDates).map((f) => [f.field, src[f.field] ?? null])),
    ...Object.fromEntries(datePairs.map((pr) => [pairKey(pr), [src[pr[0]] ?? '', src[pr[1]] ?? '']])),
  })
  const popoverValues = toPopover(filters)
  const popoverDefaults = toPopover(defaultValues)
  const applyPopover = (v) => {
    const next = { ...v }
    for (const pr of datePairs) {
      const [from, to] = v[pairKey(pr)] ?? []
      delete next[pairKey(pr)]
      next[pr[0]] = from || filters[pr[0]] // report dates are required: keep the old one if cleared
      next[pr[1]] = to || filters[pr[1]]
    }
    for (const f of singleDates) if (!next[f.field] && f.reqd) next[f.field] = filters[f.field]
    applyFilters(next)
  }

  const allColumns = useMemo(() => (state.data?.columns ?? []).map(parseColumn).filter((c) => !c.hidden), [state.data])
  // Configurable columns (saved per report); def.columns = what shows by default.
  const defaultCols = useMemo(() => (def.columns ? def.columns.filter((f) => allColumns.some((c) => c.fieldname === f)) : null), [def.columns, allColumns])
  // Up to 8 columns by default (financial statements keep all their period columns).
  const initialCols = defaultCols?.length ? defaultCols.slice(0, 8) : def.tree ? null : allColumns.slice(0, 8).map((c) => c.fieldname)
  const columnSettings = useColumnPrefs(`report:${def.key}`, allColumns, initialCols)
  const columns = columnSettings.columns

  const rows = useMemo(() => {
    const raw = [...(state.data?.head_row ? [{ ...state.data.head_row, __total: true }] : []), ...(state.data?.result ?? []), ...(state.data?.total_row && state.data.result?.length ? [{ ...state.data.total_row, __total: true }] : [])]
    return raw
      .filter((r) => r && (Array.isArray(r) ? r.length : Object.keys(r).length))
      .map((r) => {
        if (!Array.isArray(r)) return r
        const o = { __total: true }
        ;(state.data.columns ?? []).map(parseColumn).forEach((c, i) => { o[c.fieldname] = r[i] })
        return o
      })
  }, [state.data])
  // Tree reports (P&L, Balance Sheet, Trial Balance …): rows carry an `indent`; a row followed by a
  // deeper row is a group that can be collapsed. Collapsed groups keep showing their own totals.
  const isTree = useMemo(() => rows.some((r) => Number(r.indent) > 0), [rows])
  const treeInfo = useMemo(() => {
    if (!isTree) return { keys: [], groups: new Set() }
    const keys = rows.map((r, i) => String(r.account || r.account_name || `#${i}`))
    const groups = new Set()
    rows.forEach((r, i) => { if (i + 1 < rows.length && Number(rows[i + 1].indent ?? 0) > Number(r.indent ?? 0)) groups.add(keys[i]) })
    return { keys, groups }
  }, [rows, isTree])
  // Groups start collapsed; `expanded` holds the ones the user opened.
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleRow = (key) => setExpanded((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const visibleRows = useMemo(() => {
    if (!isTree) return rows.map((r, i) => ({ r, i }))
    const out = []
    let hideBelow = null // indent of the collapsed group we're inside
    rows.forEach((r, i) => {
      const indent = Number(r.indent ?? 0)
      if (hideBelow != null) {
        if (indent > hideBelow) return
        hideBelow = null
      }
      out.push({ r, i })
      if (!expanded.has(treeInfo.keys[i]) && treeInfo.groups.has(treeInfo.keys[i])) hideBelow = indent
    })
    return out
  }, [rows, isTree, expanded, treeInfo])

  const summary = state.data?.report_summary ?? []
  const firstCol = columns[0]?.fieldname
  const currency = filters.presentation_currency || ctx.currency || boot.currency

  const [exporting, setExporting] = useState(false)
  const exportCsv = async () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [columns.map((c) => esc(c.label)).join(',')]
    let all = rows
    if (serverPaged) {
      // The page on screen is only a slice: fetch every page (in big chunks) for the file.
      setExporting(true)
      try {
        all = []
        const total = state.data?.total ?? 0
        for (let at = 0; at < Math.min(total, 100000); at += EXPORT_CHUNK) {
          const [endpoint, body] = pageCall(at, EXPORT_CHUNK, { export: 1 })
          const res = await call.post(endpoint, body)
          if (at === 0 && res?.message?.head_row) all.push({ ...res.message.head_row, __total: true })
          all.push(...(res?.message?.result ?? []))
        }
        if (state.data?.total_row && all.length) all.push({ ...state.data.total_row, __total: true })
      } catch (e) {
        setExporting(false)
        setState((st) => ({ ...st, error: errorText(e, 'Could not export the report.') }))
        return
      }
      setExporting(false)
    }
    for (const r of all) lines.push(columns.map((c) => esc(unquote(c.fieldname === 'account' && r.account_name ? r.account_name : r[c.fieldname]))).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${def.key}-${filters.to_date || filters.period_end_date || filters.report_date || ctx.today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const cell = (c, r) => {
    let v = r[c.fieldname]
    if (c.fieldname === 'account' && r.account_name) v = r.account_name
    v = unquote(v)
    if (v == null || v === '') return null
    const t = c.fieldtype
    if (t === 'Currency') {
      const cur = (c.options && r[c.options]) || r.currency || currency
      return <span className={cn('num', Number(v) < 0 && 'text-danger')}>{formatMoney(v, cur).replace(`${cur} `, '')}</span>
    }
    if (t === 'Float' || t === 'Int') return <span className="num">{formatNumber(v, t === 'Int' ? 0 : 2)}</span>
    if (t === 'Percent') return <span className="num">{formatNumber(v, 2)}%</span>
    if (t === 'Date') return <span className="num">{formatDate(v)}</span>
    const target = t === 'Link' ? c.options : t === 'Dynamic Link' ? r[c.options] : null
    if (target && ROUTE_OF[target] && !r.__total) {
      return <Link to={`${ROUTE_OF[target]}/${encodeURIComponent(r[c.fieldname])}`} className="text-primary hover:underline">{v}</Link>
    }
    return <span>{String(v)}</span>
  }

  const isBold = (r) => r.__total || Boolean(Number(r.is_group)) || r.bold || (typeof r[firstCol] === 'string' && r[firstCol].startsWith("'")) || (typeof r.account_name === 'string' && r.account_name.startsWith("'"))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link to={def.backTo ?? '/financial-reports'} title={def.backTitle ?? 'All reports'} className="pressable grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted hover:bg-surface-2 hover:text-foreground"><ArrowLeft className="size-4" /></Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{def.title}</div>
            <div className="truncate text-xs text-muted">{def.description}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {paged && (
            <label className="relative">
              <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search" className="input h-8 w-44 ps-7 text-xs" />
            </label>
          )}
          {/* Dates (first) and every other filter live in the Filters popover */}
          <FilterPopover
            fields={popoverFields}
            values={popoverValues}
            defaults={popoverDefaults}
            onApply={applyPopover}
            align="end"
          />
          {allColumns.length > 0 && <ColumnPicker all={allColumns} settings={columnSettings} />}
          {payAct && (
            <>
              <Link to={payAct.history}><Button icon={History}>{payAct.historyTitle}</Button></Link>
              <Link to={payAct.act}><Button variant="primary" icon={HandCoins}>{payAct.actTitle}</Button></Link>
            </>
          )}
          <Button icon={Download} onClick={exportCsv} disabled={!rows.length || exporting} loading={exporting}>CSV</Button>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
          Fill in {missing.map((f) => f.label).join(', ')} to run the report.
        </p>
      )}

      {state.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">
          {state.error}
          {def.key === 'uae-vat-201' && <p className="mt-1 text-muted">This report ships with ERPNext's UAE regional setup. Use <Link to="/vat-return" className="text-primary hover:underline">VAT Return</Link> instead.</p>}
        </div>
      )}

      {/* Summary cards (P&L, Balance Sheet …) */}
      {summary.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.filter((s) => s && s.label).map((s) => (
            <div key={s.label} className="card p-4">
              <p className="text-xs text-muted">{s.label}</p>
              <p className={cn('num mt-1.5 text-lg font-semibold', s.indicator === 'Red' && 'text-danger', s.indicator === 'Green' && 'text-success')}>
                {s.datatype === 'Currency' ? formatMoney(s.value, s.currency || currency) : formatNumber(s.value, 2)}
              </p>
            </div>
          ))}
        </div>
      )}

      {state.data?.message && <p className="text-xs text-muted">{String(state.data.message).replace(/<[^>]+>/g, '')}</p>}

      {/* Result */}
      {!state.error && missing.length === 0 && (
        <div className={cn('card overflow-hidden transition-opacity', state.loading && state.data && 'opacity-60')}>
          {/* One scrollbar: the page scrolls vertically; this box only scrolls sideways for wide reports. */}
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="dt w-max min-w-full">
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.fieldname} className={cn(RIGHT.has(c.fieldtype) && 'text-end')}>{c.label}</th>)}
                  {payAct && <th className="w-px" />}
                </tr>
              </thead>
              <tbody>
                {state.loading && !state.data && Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={Math.max(columns.length, 1)}><span className="block h-4 animate-pulse rounded bg-surface-2" /></td></tr>
                ))}
                {!state.loading && state.data && rows.length === 0 && (
                  <tr><td colSpan={Math.max(columns.length, 1)} className="dt-empty">No data for these filters.</td></tr>
                )}
                {(serverPaged || isTree ? visibleRows : visibleRows.slice(clientStart, clientStart + PAGE)).map(({ r, i }) => {
                  const key = treeInfo.keys[i]
                  const isGroup = isTree && treeInfo.groups.has(key)
                  const isClosed = isGroup && !expanded.has(key)
                  return (
                    <tr key={i} className={cn(isBold(r) && 'dt-total')}>
                      {columns.map((c, ci) => (
                        <td
                          key={c.fieldname}
                          className={cn('whitespace-nowrap', RIGHT.has(c.fieldtype) && 'dt-num')}
                          style={ci === 0 && isTree ? { paddingInlineStart: `${8 + Number(r.indent ?? 0) * 18}px` } : undefined}
                        >
                          {ci === 0 && isTree ? (
                            <span className="inline-flex items-center gap-1">
                              {isGroup ? (
                                <button
                                  type="button" onClick={() => toggleRow(key)} aria-expanded={!isClosed}
                                  aria-label={isClosed ? 'Expand' : 'Collapse'}
                                  className="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-surface-2 hover:text-foreground"
                                >
                                  <ChevronRight className={cn('size-3.5 transition-transform duration-150', !isClosed && 'rotate-90')} />
                                </button>
                              ) : <span className="size-5 shrink-0" />}
                              {cell(c, r)}
                            </span>
                          ) : cell(c, r)}
                        </td>
                      ))}
                      {payAct && (
                        <td className="whitespace-nowrap text-end">
                          {r.party && !r.__total && <Link to={`${payAct.act}/${encodeURIComponent(r.party)}`}><Button size="sm" variant="accent" icon={HandCoins}>{payAct.actVerb}</Button></Link>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {serverPaged && <Pager start={start} pageLength={PAGE} total={state.data?.total ?? 0} onChange={(n) => run(n)} />}
          {!serverPaged && !isTree && <Pager start={clientStart} pageLength={PAGE} total={visibleRows.length} onChange={setClientStart} />}
        </div>
      )}
    </div>
  )
}
