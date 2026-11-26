import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useFrappeDeleteDoc, useFrappeGetDocCount, useFrappeGetDocList, useSWRConfig } from 'frappe-react-sdk'
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react'
import DataTable from '../components/DataTable.jsx'
import ColumnPicker from '../components/ColumnPicker.jsx'
import { useColumnPrefs } from '../lib/useColumnPrefs.js'
import { listColumnChoices } from '../lib/tableLayout.js'
import MobileList from '../components/MobileList.jsx'
import Button from '../components/Button.jsx'
import SourcePicker from '../components/SourcePicker.jsx'
import FilterPopover from '../components/FilterPopover.jsx'
import Combobox from '../components/fields/Combobox.jsx'
import { makeDoc } from '../lib/mappers.js'
import { useCall } from '../lib/useCall.js'
import { useBoot } from '../app/boot-context.js'
import { useToast } from '../app/toast-context.js'
import { useQuickCreate } from '../app/quick-create-context.js'
import { QUICK_CREATE } from '../lib/quickCreate.js'
import { resolveField, useMeta } from '../lib/meta.js'
import { errorText } from '../lib/errors.js'
import { cn } from '../lib/utils.js'
import { confirm } from '../lib/dialogs.js'

const PAGE_SIZES = [10, 20, 50, 100]

// Keyed by the filters, not the tab label: two screens can show the same doctype (invoices vs credit notes).
const countKey = (doctype, filters) => `count:${doctype}:${JSON.stringify(filters ?? [])}`

function useTabCount(doctype, tab, enabled) {
  const { data } = useFrappeGetDocCount(doctype, tab.filters, false, enabled ? countKey(doctype, tab.filters) : null, { refreshInterval: 60_000 })
  return data
}

function TabCount({ doctype, tab, active }) {
  const n = useTabCount(doctype, tab, true)
  if (n == null) return null
  return <span className={cn('num text-[10px]', active ? 'text-muted' : 'text-muted/70')}>{n > 999 ? '999+' : n}</span>
}

/** Page numbers with ellipses: 1 … 4 5 6 … 12 */
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total))
  const sorted = [...set].sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

/** Turn filter-popover values into Frappe filters. */
function toFrappeFilters(fields, values) {
  const out = []
  for (const f of fields) {
    const v = values?.[f.field]
    if (f.range) {
      const [a, b] = Array.isArray(v) ? v : []
      if (a && b) out.push([f.field, 'between', [a, b]])
      else if (a) out.push([f.field, '>=', a])
      else if (b) out.push([f.field, '<=', b])
    } else if (v != null && v !== '') {
      out.push([f.field, f.type === 'Data' ? 'like' : '=', f.type === 'Data' ? `%${v}%` : v])
    }
  }
  return out
}

export default function ListPage({ slug, config }) {
  const boot = useBoot()
  const toast = useToast()
  const navigate = useNavigate()
  const { mutate: globalMutate } = useSWRConfig()
  const { deleteDoc } = useFrappeDeleteDoc()
  const quick = useQuickCreate()
  const call = useCall()
  const [picking, setPicking] = useState(false)
  const [making, setMaking] = useState(false)
  const [params, setParams] = useSearchParams()
  const [deleting, setDeleting] = useState(null)
  const { meta, error: metaError, isLoading: metaLoading } = useMeta(config.doctype)

  const q = params.get('q') ?? ''
  const pageSize = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : 20
  const page = Math.max(0, Number(params.get('page') ?? 0))
  const [defField, defOrder] = (config.sort ?? 'modified desc').split(' ')
  const sort = { field: params.get('sort') ?? defField, order: params.get('order') ?? defOrder }

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, String(v))))
    setParams(next, { replace: true })
  }
  // Field filters live in the URL as ?f={json}; empty values are dropped.
  const applyFieldValues = (values, patch = {}) => {
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.some(Boolean))))
    update({ f: Object.keys(clean).length ? JSON.stringify(clean) : '', page: '', ...patch })
  }

  const columns = useMemo(
    () => (meta ? config.list.map((c) => resolveField(meta, c)).filter(Boolean) : []),
    [meta, config.list],
  )

  // Field filters (popover): config.filterFields, else the list's Link / Select / Check / Date columns.
  const filterFields = useMemo(() => {
    if (!meta) return []
    const source = config.filterFields ?? columns.filter((c) => ['Link', 'Select', 'Check', 'Date'].includes(c.fieldtype) && !['Active', 'DocStatus'].includes(c.type) && c.fieldname !== 'company')
    return source.map((c) => {
      const f = typeof c === 'string' || c.field ? resolveField(meta, c) : c
      if (!f) return null
      return { field: f.fieldname, label: f.label, type: f.fieldtype, options: f.options, range: f.fieldtype === 'Date' }
    }).filter(Boolean)
  }, [meta, columns, config.filterFields])
  const fieldValues = useMemo(() => {
    try { return JSON.parse(params.get('f') || '{}') } catch { return {} }
  }, [params])
  const extraFilters = useMemo(() => toFrappeFilters(filterFields, fieldValues), [filterFields, fieldValues])

  // Status tabs carry the field filters too, so every count matches what the list shows.
  // The working company (when there are several) and branch chosen in the profile menu scope every list.
  const scopeFilters = useMemo(() => {
    const out = []
    if ((boot.companies?.length ?? 0) > 1 && boot.company && meta?.fieldMap?.company) out.push(['company', '=', boot.company])
    if (boot.branch && meta?.fieldMap?.branch) out.push(['branch', '=', boot.branch])
    return out
  }, [boot.companies, boot.company, boot.branch, meta])
  const tabs = useMemo(
    () => (config.tabs ?? [{ label: 'All', filters: [] }]).map((t) => ({ ...t, filters: [...t.filters, ...extraFilters, ...scopeFilters] })),
    [config.tabs, extraFilters, scopeFilters],
  )
  const tab = tabs.find((t) => t.label === params.get('tab')) ?? tabs[0]
  const hasFilters = Boolean(q) || tab.label !== tabs[0].label || extraFilters.length > 0

  // Configurable table: every column the user can pick, and the ones they chose (saved per list).
  const columnChoices = useMemo(() => {
    // The screen's own columns + its default ones (some defaults aren't in config.list), then ERPNext's list fields.
    const extraDefaults = (config.columns ?? []).filter((f) => !columns.some((c) => c.fieldname === f)).map((f) => resolveField(meta, f)).filter(Boolean)
    return listColumnChoices(meta, [...columns, ...extraDefaults], (e) => resolveField(meta, e))
  }, [meta, columns, config.columns])
  // Default table: config.columns (up to 8, the most useful), skipping fields this site doesn't have,
  // topped up from config.list so a table still starts with up to 8 columns.
  const defaultFields = useMemo(() => {
    const has = (f) => columnChoices.some((c) => c.fieldname === f)
    const picked = (config.columns ?? []).filter(has)
    for (const c of columns) if (picked.length < 8 && !picked.includes(c.fieldname)) picked.push(c.fieldname)
    return picked.slice(0, 8)
  }, [config.columns, columns, columnChoices])
  const columnSettings = useColumnPrefs(`list:${slug}`, columnChoices, defaultFields)
  const tableColumns = columnSettings.columns

  const fields = useMemo(() => {
    const set = new Set(['name', 'docstatus', ...columns.map((c) => c.fieldname), ...tableColumns.map((c) => c.fieldname)])
    if (meta?.fieldMap?.currency) set.add('currency')
    if (meta?.fieldMap?.status) set.add('status')
    if (config.statusFromDisabled && meta?.fieldMap?.disabled) set.add('disabled')
    if (config.titleField && meta?.fieldMap?.[config.titleField]) set.add(config.titleField)
    return [...set]
  }, [columns, tableColumns, meta, config.titleField, config.statusFromDisabled])

  const orFilters = q && config.search?.length
    ? config.search.filter((f) => f === 'name' || meta?.fieldMap?.[f]).map((f) => [f, 'like', `%${q}%`])
    : undefined

  const { data: rows, error, isLoading, mutate } = useFrappeGetDocList(
    config.doctype,
    {
      fields, filters: tab.filters, orFilters,
      orderBy: { field: sort.field, order: sort.order }, limit_start: page * pageSize, limit: pageSize,
    },
    meta ? undefined : null, // wait for meta so we only ask for fields that exist
    { keepPreviousData: true },
  )

  // Total for the current tab (shared cache with the tab badge) -> numbered pages when not searching.
  const tabTotal = useTabCount(config.doctype, tab, Boolean(meta))
  const totalPages = !q && tabTotal != null ? Math.max(1, Math.ceil(tabTotal / pageSize)) : null
  const hasNext = totalPages != null ? page + 1 < totalPages : (rows?.length ?? 0) >= pageSize

  const refresh = () => {
    mutate()
    globalMutate((k) => typeof k === 'string' && k.startsWith(`count:${config.doctype}:`))
  }

  const onSort = (field) => {
    const order = sort.field === field && sort.order === 'desc' ? 'asc' : 'desc'
    update({ sort: field, order, page: '' })
  }

  // Masters (Customer, Item …) are created in a popup; transactions open the full form.
  const createNew = () => {
    if (config.createFrom) { setPicking(true); return }
    if (QUICK_CREATE[config.doctype] && quick) quick.openQuickCreate({ doctype: config.doctype, onCreated: () => refresh() })
    else navigate(`/${slug}/new`)
  }

  // Credit / debit notes start from the invoice they reverse (ERPNext copies items, negates qty).
  const createFromSource = async (source) => {
    setMaking(true)
    try {
      const doc = await makeDoc(call, config.createFrom.method, config.createFrom.args(source))
      setPicking(false)
      navigate(`/${slug}/new`, { state: { prefill: doc } })
    } catch (e) {
      toast({ tone: 'error', title: 'Could not start the document', description: errorText(e) })
    } finally {
      setMaking(false)
    }
  }

  // "/customers?new=1" (old /customers/new links, dashboard shortcuts) opens the create popup here.
  const wantNew = params.get('new') === '1'
  useEffect(() => {
    if (!wantNew) return
    const t = setTimeout(() => {
      setParams((p) => { p.delete('new'); return p }, { replace: true })
      createNew()
    }, 0)
    return () => clearTimeout(t)
  }, [wantNew]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDoc = (r) => navigate(`/${slug}/${encodeURIComponent(r.name)}`)
  const editDoc = (r) => navigate(`/${slug}/${encodeURIComponent(r.name)}?edit=1`)
  const removeDoc = async (r) => {
    if (!(await confirm({ title: `Delete ${config.single}?`, message: `Delete ${r.name}?`, confirmLabel: 'Delete', tone: 'danger' }))) return
    setDeleting(r.name)
    try {
      await deleteDoc(config.doctype, r.name)
      toast({ tone: 'success', title: `${config.single} deleted`, description: r.name })
      refresh()
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: errorText(e) })
    } finally {
      setDeleting(null)
    }
  }

  const loadError = metaError || error
  const emptyText = q ? `No results for “${q}”.` : `Nothing in “${tab.label}” yet.`
  const loading = metaLoading || (isLoading && !rows)

  return (
    <>
      {/* Unified toolbar: status tabs left, search + actions right (page title is in the top bar) */}
      <div className="relative flex items-center justify-between gap-2 pb-1 sm:gap-3">
        <div className="hidden min-w-0 overflow-x-auto [scrollbar-width:none] sm:block">
          <div className="inline-flex rounded-md border bg-surface-2 p-0.5 dark:bg-zinc-900">
            {tabs.map((t) => {
              const active = t.label === tab.label
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => update({ tab: t.label === tabs[0].label ? '' : t.label, page: '' })}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs transition-colors',
                    active ? 'bg-background font-semibold text-foreground dark:bg-zinc-800' : 'font-medium text-muted hover:text-foreground',
                  )}
                >
                  {t.label}
                  {meta && <TabCount doctype={config.doctype} tab={t} active={active} />}
                </button>
              )
            })}
          </div>
        </div>


        <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
          {/* Filters popover: date ranges first, then the other fields. On phones it also holds search + status. */}
          <FilterPopover
            className={cn(filterFields.length === 0 && 'sm:hidden')}
            fields={filterFields}
            values={fieldValues}
            defaults={{}}
            onApply={(next) => {
              const { __q, __tab, ...rest } = next
              applyFieldValues(rest, {
                ...(__q !== undefined ? { q: __q.trim() } : {}),
                ...(__tab !== undefined ? { tab: __tab === tabs[0].label ? '' : __tab } : {}),
              })
            }}
            extra={({ draft, setDraft }) => (
              <div className="space-y-3 border-b pb-3 sm:hidden">
                <div className="space-y-1.5">
                  <label className="label">Search</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                    <input value={draft.__q ?? q} onChange={(e) => setDraft((d) => ({ ...d, __q: e.target.value }))} placeholder="ID, name…" className="input ps-8 text-xs" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="label">Status</label>
                  <div className="flex flex-wrap gap-1.5">
                    {tabs.map((t) => {
                      const on = (draft.__tab ?? tab.label) === t.label
                      return (
                        <button
                          key={t.label} type="button" onClick={() => setDraft((d) => ({ ...d, __tab: t.label }))}
                          className={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium', on ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-background text-muted')}
                        >
                          {t.label}
                          {meta && <TabCount doctype={config.doctype} tab={t} active={on} />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          />
          <div className="relative hidden w-48 sm:block lg:w-64">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              key={q}
              defaultValue={q}
              placeholder="Search & press Enter…"
              onKeyDown={(e) => { if (e.key === 'Enter') update({ q: e.currentTarget.value.trim(), page: '' }) }}
              className="input h-8 ps-8 pe-7 text-xs"
            />
            {q && (
              <button type="button" onClick={() => update({ q: '', page: '' })} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {meta && <ColumnPicker all={columnChoices} settings={columnSettings} className="hidden md:inline-flex" />}
          {!config.readOnly && (
            <Button variant="primary" icon={Plus} onClick={createNew}>
              <span className="hidden sm:inline">New {config.single}</span>
              <span className="sm:hidden">New</span>
            </Button>
          )}
        </div>

        {config.createFrom && (
          <SourcePicker open={picking} config={config.createFrom} busy={making} onClose={() => setPicking(false)} onPick={createFromSource} />
        )}
      </div>

      {/* Phone: active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5 sm:hidden">
          {tab.label !== tabs[0].label && (
            <button type="button" onClick={() => update({ tab: '', page: '' })} className="inline-flex h-6 items-center gap-1 rounded border bg-background px-2 text-[11px]">
              {tab.label} <X className="size-3 text-muted" />
            </button>
          )}
          {q && (
            <button type="button" onClick={() => update({ q: '', page: '' })} className="inline-flex h-6 items-center gap-1 rounded border bg-background px-2 text-[11px]">
              “{q}” <X className="size-3 text-muted" />
            </button>
          )}
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">
          {errorText(loadError, `Could not load ${config.title}.`)}
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <div className="card overflow-hidden md:hidden">
            <MobileList
              config={config} columns={columns} rows={rows ?? []} loading={loading}
              currency={boot.currency} empty={emptyText}
              onView={openDoc} onEdit={editDoc} onDelete={removeDoc} deleting={deleting}
            />
          </div>

          {/* Tablet / desktop: table */}
          <div className="hidden md:block">
            <DataTable
              columns={tableColumns.length ? tableColumns : [{ fieldname: 'name', label: 'ID', fieldtype: 'Data' }]}
              rows={rows ?? []}
              loading={loading}
              sort={sort}
              onSort={onSort}
              currency={boot.currency}
              onRowClick={config.noDocPage ? undefined : openDoc}
              empty={emptyText}
            />
          </div>
        </>
      )}

      {/* Pagination */}
      <div className="flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <span className="num text-[11px]">
          {rows?.length
            ? `${page * pageSize + 1}–${page * pageSize + rows.length}${totalPages != null ? ` of ${tabTotal}` : ''}`
            : ''}
        </span>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">Rows</span>
            <Combobox
              className="w-16" minDropdownWidth={80} searchable={false}
              options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))} value={pageSize}
              onChange={(v) => update({ size: !v || Number(v) === 20 ? '' : String(v), page: '' })}
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button" disabled={page === 0} onClick={() => update({ page: page - 1 || '' })}
              className="pressable flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
              title="Previous page"
            >
              <ChevronLeft className="size-3" /><span className="hidden sm:inline">Prev</span>
            </button>
            {totalPages != null && pageNumbers(page + 1, totalPages).map((p, i) => (
              p === '…'
                ? <span key={`d${i}`} className="num grid h-7 w-5 place-items-center text-muted">…</span>
                : (
                  <button
                    key={p} type="button" onClick={() => update({ page: p - 1 || '' })}
                    className={cn(
                      'num grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs font-medium',
                      p === page + 1 ? 'bg-strong font-semibold text-strong-foreground' : 'border bg-background text-foreground hover:bg-surface-2',
                    )}
                  >
                    {p}
                  </button>
                )
            ))}
            <button
              type="button" disabled={!hasNext} onClick={() => update({ page: page + 1 })}
              className="pressable flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-40"
              title="Next page"
            >
              <span className="hidden sm:inline">Next</span><ChevronRight className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
