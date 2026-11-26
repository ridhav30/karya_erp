import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { BookOpen, ChevronRight, Folder, FolderOpen, Plus, Search, X } from 'lucide-react'
import Button from '../../components/Button.jsx'
import FilterPopover from '../../components/FilterPopover.jsx'
import { useBoot } from '../../app/boot-context.js'
import { formatMoney } from '../../lib/format.js'
import { errorText } from '../../lib/errors.js'
import { cn } from '../../lib/utils.js'

const ROOT_TONE = {
  Asset: 'text-sky-700 bg-sky-50 ring-sky-200 dark:text-sky-300 dark:bg-sky-950/50 dark:ring-sky-900',
  Liability: 'text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-950/50 dark:ring-amber-900',
  Equity: 'text-violet-700 bg-violet-50 ring-violet-200 dark:text-violet-300 dark:bg-violet-950/50 dark:ring-violet-900',
  Income: 'text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 dark:ring-emerald-900',
  Expense: 'text-rose-700 bg-rose-50 ring-rose-200 dark:text-rose-300 dark:bg-rose-950/50 dark:ring-rose-900',
}

/** 1250 -> "AED 1,250.00 Dr", -300 -> "AED 300.00 Cr" */
function drCr(value, currency) {
  const v = Number(value) || 0
  if (Math.abs(v) < 0.005) return <span className="text-muted">—</span>
  return <>{formatMoney(Math.abs(v), currency)} <span className="text-[10px] font-semibold text-muted">{v > 0 ? 'Dr' : 'Cr'}</span></>
}

export default function ChartOfAccounts() {
  const boot = useBoot()
  const navigate = useNavigate()
  const { data, error, isLoading } = useFrappeGetCall(
    'karya_erp.accounts.chart_of_accounts', { company: boot.company }, `coa:${boot.company}`, { revalidateOnFocus: false },
  )
  const res = data?.message
  const accounts = useMemo(() => res?.accounts ?? [], [res])
  const currency = res?.currency || boot.currency
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set()) // groups the user opened; everything starts collapsed
  const [opts, setOpts] = useState({ root_type: null, account_type: null, show_disabled: 0 })
  const showDisabled = Boolean(Number(opts.show_disabled))

  const { children, roots, depth } = useMemo(() => {
    const children = {}
    const depth = {}
    const roots = []
    for (const a of accounts) {
      depth[a.name] = a.parent_account ? (depth[a.parent_account] ?? 0) + 1 : 0
      if (a.parent_account) (children[a.parent_account] ??= []).push(a)
      else roots.push(a)
    }
    return { children, roots, depth }
  }, [accounts])

  // Search: show matches plus their ancestors, everything expanded.
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return null
    const byName = Object.fromEntries(accounts.map((a) => [a.name, a]))
    const keep = new Set()
    for (const a of accounts) {
      if (`${a.account_number ?? ''} ${a.account_name}`.toLowerCase().includes(term)) {
        let cur = a
        while (cur) { keep.add(cur.name); cur = byName[cur.parent_account] }
      }
    }
    return keep
  }, [q, accounts])

  const isOpen = (name) => (visible ? true : open.has(name))
  const toggle = (name) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })

  const totals = useMemo(() => roots.reduce((o, r) => ({ ...o, [r.root_type]: (o[r.root_type] ?? 0) + (Number(r.balance) || 0) }), {}), [roots])

  // Account type filter keeps groups that contain a matching ledger.
  const hasType = (a) => a.account_type === opts.account_type || (children[a.name] ?? []).some(hasType)
  const rows = []
  const walk = (list) => {
    for (const a of list) {
      if (visible && !visible.has(a.name)) continue
      if (!showDisabled && Number(a.disabled)) continue
      if (opts.root_type && a.root_type !== opts.root_type) continue
      if (opts.account_type && !hasType(a)) continue
      rows.push(a)
      if (a.is_group && isOpen(a.name)) walk(children[a.name] ?? [])
    }
  }
  walk(roots)

  const addChild = (parent) => navigate('/chart-of-accounts/new', {
    state: { defaults: { company: boot.company, parent_account: parent?.name, ...(parent ? {} : { is_group: 1 }) } },
  })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(totals).map(([root, v]) => (
            <span key={root} className={cn('num inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ring-1 ring-inset', ROOT_TONE[root])}>
              <span className="font-semibold">{root}</span> {drCr(v, currency)}
            </span>
          ))}
        </div>
        <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
        <FilterPopover
          fields={[
            { field: 'root_type', label: 'Root type', type: 'Select', options: '\nAsset\nLiability\nEquity\nIncome\nExpense' },
            { field: 'account_type', label: 'Account type', type: 'Select', options: '\nBank\nCash\nReceivable\nPayable\nTax\nStock\nCost of Goods Sold\nFixed Asset\nIncome Account\nExpense Account\nChargeable\nEquity' },
            { field: 'show_disabled', label: 'Show disabled accounts', type: 'Check' },
          ]}
          values={opts}
          defaults={{ root_type: null, account_type: null, show_disabled: 0 }}
          onApply={(v) => setOpts({ root_type: v.root_type || null, account_type: v.account_type || null, show_disabled: Number(v.show_disabled) ? 1 : 0 })}
        />
          <div className="relative w-48 lg:w-64">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find account…" className="input h-8 ps-8 pe-7 text-xs" />
            {q && <button type="button" onClick={() => setQ('')} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Clear"><X className="size-3.5" /></button>}
          </div>
          <Button variant="primary" icon={Plus} onClick={() => addChild(null)}><span className="hidden sm:inline">New account</span></Button>
        </div>
      </div>


      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error, 'Could not load the chart of accounts.')}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-surface px-3 py-2.5 text-xs font-semibold text-gray-600 dark:text-zinc-400 sm:grid-cols-[1fr_9rem_12rem]">
            <span>Account</span>
            <span className="hidden sm:block">Type</span>
            <span className="text-end">Balance</span>
          </div>
          {isLoading && Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="border-b border-border-subtle px-3 py-3 last:border-0"><span className="block h-4 animate-pulse rounded bg-surface-2" style={{ width: `${40 + ((i * 17) % 40)}%` }} /></div>
          ))}
          {!isLoading && rows.length === 0 && <p className="px-4 py-14 text-center text-xs text-muted">{q ? `No account matches “${q}”.` : 'No accounts for this company yet.'}</p>}
          <ul>
            {rows.map((a) => {
              const level = depth[a.name] ?? 0
              const expanded = a.is_group && isOpen(a.name)
              return (
                <li key={a.name} className={cn('group grid min-h-10 grid-cols-[1fr_auto] items-center gap-3 border-b border-border-subtle px-3 transition-colors last:border-0 hover:bg-surface/70 sm:grid-cols-[1fr_9rem_12rem]', Number(a.disabled) && 'opacity-50')}>
                  <div className="flex min-w-0 items-center gap-1.5 py-2" style={{ paddingInlineStart: `${level * 18}px` }}>
                    {a.is_group ? (
                      <button type="button" onClick={() => toggle(a.name)} className="pressable grid size-6 shrink-0 place-items-center rounded text-muted hover:bg-surface-2 hover:text-foreground" aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded}>
                        <ChevronRight className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-90')} />
                      </button>
                    ) : <span className="size-6 shrink-0" />}
                    {a.is_group
                      ? (expanded ? <FolderOpen className="size-4 shrink-0 text-amber-500" /> : <Folder className="size-4 shrink-0 text-amber-500" />)
                      : <BookOpen className="size-4 shrink-0 text-gray-400 dark:text-zinc-500" />}
                    <Link to={`/chart-of-accounts/${encodeURIComponent(a.name)}`} className={cn('truncate text-[13px] hover:text-primary hover:underline', a.is_group && 'font-semibold', level === 0 && 'tracking-tight')}>
                      {a.account_number && <span className="num me-1.5 text-muted">{a.account_number}</span>}
                      {a.account_name}
                    </Link>
                    {level === 0 && <span className={cn('ms-1 hidden rounded px-1.5 text-[10px] font-medium ring-1 ring-inset sm:inline', ROOT_TONE[a.root_type])}>{a.root_type}</span>}
                    <span className="ms-auto hidden shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                      {a.is_group ? (
                        <button type="button" onClick={() => addChild(a)} className="pressable inline-flex h-6 items-center gap-1 rounded border bg-background px-1.5 text-[11px] text-muted hover:text-foreground"><Plus className="size-3" /> Add</button>
                      ) : (
                        <Link to={`/financial-reports/general-ledger?account=${encodeURIComponent(a.name)}`} className="pressable inline-flex h-6 items-center rounded border bg-background px-1.5 text-[11px] text-muted hover:text-foreground">Ledger</Link>
                      )}
                    </span>
                  </div>
                  <span className="hidden truncate text-xs text-muted sm:block">{a.account_type || (a.is_group ? 'Group' : '—')}</span>
                  <span className={cn('num text-end text-[13px]', a.is_group && 'font-semibold')}>{res?.show_balances ? drCr(a.balance, currency) : <span className="text-muted">—</span>}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
