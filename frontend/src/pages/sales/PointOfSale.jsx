import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router'
import Link from '../../components/AccessLink.jsx'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { LogOut, Minus, Plus, Search, Settings2, ShoppingBasket, Store, Trash2, Utensils, Wallet } from 'lucide-react'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import LinkField from '../../components/fields/LinkField.jsx'
import Select from '../../components/fields/Select.jsx'
import { useToast } from '../../app/toast-context.js'
import { useCall } from '../../lib/useCall.js'
import { errorText } from '../../lib/errors.js'
import { formatDate, formatMoney, formatNumber } from '../../lib/format.js'
import { PayModal, Done, Row, Err } from '../../components/sales/PosParts.jsx'
import { useDebounced } from '../../lib/useDebounced.js'
import { POS_STYLE } from '../../lib/posConfig.js'
import RestaurantPOS from './RestaurantPOS.jsx'
import { t } from '../../lib/i18n.js'
import { cn } from '../../lib/utils.js'


/** Point of sale: open a shift, ring up sales, take cash / card, close the shift against the counted drawer. */
export default function PointOfSale() {
  const [mode, setModeState] = useState(() => {
    if (POS_STYLE !== 'both') return POS_STYLE
    try { return localStorage.getItem('pos-mode') === 'restaurant' ? 'restaurant' : 'normal' } catch { return 'normal' }
  })
  const setMode = (m) => { setModeState(m); try { localStorage.setItem('pos-mode', m) } catch { /* remembered only when storage is allowed */ } }
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.pos.session', {}, 'pos-session', { revalidateOnFocus: false })
  const s = data?.message
  if (error) return <Err error={error} />
  if (isLoading || !s) return <div className="card h-64 animate-pulse" />
  if (s.profiles.length === 0) return <Setup s={s} onDone={mutate} />
  // No open session: the till has nothing to sell against. Sessions (and the New session popup) live on the Point of Sale list.
  if (!s.opening) return <Navigate to="/pos" replace />
  const profile = s.profiles.find((p) => p.name === s.opening.pos_profile) ?? s.profiles[0]
  const modeSwitch = POS_STYLE === 'both' ? <ModeSwitch mode={mode} onChange={setMode} /> : null
  if (mode === 'restaurant') return <RestaurantShell s={s} profile={profile} onClosed={mutate} modeSwitch={modeSwitch} />
  return <Till s={s} profile={profile} onClosed={mutate} modeSwitch={modeSwitch} />
}

/** Normal till (search / scan) or restaurant (cards, tables, kitchen). */
function ModeSwitch({ mode, onChange }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5 text-xs" role="group" aria-label="POS style">
      {[['normal', 'Counter POS', Store], ['restaurant', 'Restaurant POS', Utensils]].map(([k, label, Icon]) => (
        <button key={k} type="button" aria-pressed={mode === k} onClick={() => onChange(k)} className={cn('pressable inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5', mode === k ? 'bg-surface-2 font-semibold' : 'text-muted')}><Icon className="size-3.5" />{t(label)}</button>
      ))}
    </div>
  )
}

function RestaurantShell({ s, profile, onClosed, modeSwitch }) {
  const [closing, setClosing] = useState(false)
  return (
    <>
      <PageHeader title="Restaurant POS" subtitle={`${profile.name} · ${t('shift since')} ${formatDate(s.opening.period_start_date)}`}>
        {modeSwitch}
        <Button icon={LogOut} onClick={() => setClosing(true)}>Close shift</Button>
      </PageHeader>
      <RestaurantPOS s={s} profile={profile} />
      {closing && <CloseShift opening={s.opening.name} money={(v) => formatMoney(v ?? 0, profile.currency)} onClose={() => setClosing(false)} onClosed={onClosed} />}
    </>
  )
}

export function Setup({ s, onDone }) {
  const call = useCall()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try { await call.post('karya_erp.pos.setup', {}); await onDone() } catch (e) { toast({ tone: 'error', title: 'Could not set up the till', description: errorText(e) }) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="Point of sale" subtitle="Counter sales with cash and card" />
      <div className="card flex flex-col items-center gap-2 p-10 text-center text-xs text-muted">
        <Store className="size-7 stroke-1" />
        <p className="font-semibold text-foreground">No till set up yet</p>
        <p>One click creates a walk-in customer, Till Cash and Till Card payment methods and a POS profile with your default VAT.</p>
        {s.can_setup
          ? <Button variant="primary" icon={Settings2} loading={busy} onClick={run}>Set up point of sale</Button>
          : <p>Ask an administrator to set up a POS profile for you.</p>}
        <Link to="/pos-profiles" className="text-primary hover:underline">POS profiles</Link>
      </div>
    </>
  )
}

/** "New session" popup: pick the counter, enter the opening cash, open the shift. A shift left open on that counter is offered for closing first. */
export function OpenShiftModal({ s, onClose, onOpened }) {
  const call = useCall()
  const toast = useToast()
  // Only the counters this person may use (a manager: all of them); a counter someone else has open comes last.
  const [name, setName] = useState((s.profiles.find((p) => !p.busy) ?? s.profiles[0])?.name ?? '')
  const profile = s.profiles.find((p) => p.name === name)
  const [cash, setCash] = useState({})
  const [busy, setBusy] = useState(false)
  const [closingOther, setClosingOther] = useState(null)
  const blocking = (s.others ?? []).filter((o) => o.pos_profile === name)
  async function open() {
    setBusy(true)
    try {
      const balances = profile.payments.map((p) => ({ mode_of_payment: p.mode_of_payment, opening_amount: Number(cash[p.mode_of_payment]) || 0 }))
      const res = await call.post('karya_erp.pos.open_shift', { pos_profile: name, balances: JSON.stringify(balances) })
      await onOpened(res?.message)
    } catch (e) {
      toast({ tone: 'error', title: 'Could not open the session', description: errorText(e) })
      setBusy(false)
    }
  }
  return (
    <>
      <Modal title="New session" subtitle="Open a shift on a counter to start selling" icon={Wallet} tone="emerald" onClose={onClose}
        footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Wallet} loading={busy} disabled={!profile || profile.busy || blocking.length > 0} onClick={open}>Open session</Button></>}>
        <div className="space-y-4 text-xs">
          <label className="block"><span className="mb-1 block font-medium">{t('Counter')}</span>
            <Select value={name} onChange={(e) => e.target.value && setName(e.target.value)} placeholder={t('Choose a counter')} aria-label={t('Counter')}>
              {s.profiles.map((p) => <option key={p.name} value={p.name}>{p.name}{p.busy ? ` — ${t('in use')}` : ''}</option>)}
            </Select>
          </label>
          {!s.profiles.length && <p className="text-danger">{s.can_setup ? t('No counter yet. Add one below.') : t('No counter is assigned to you. Ask a manager to add you as a cashier on a counter.')}</p>}
          {profile?.busy && !blocking.length && <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">{t('This counter is in use by another session. Ask a manager if it should be closed.')}</p>}
          {blocking.map((o) => (
            <div key={o.name} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <span>{o.pos_profile} {t('is already open')}: <b>{o.user_name}</b> {t('opened a session on')} {formatDate(o.period_start_date)}. {s.can_close_others ? t('Close it to open a new one.') : t('Ask them, or a manager, to close it first.')}</span>
              {s.can_close_others && <Button size="sm" onClick={() => setClosingOther(o)}>{t('Close that session')}</Button>}
            </div>
          ))}
          <div className="space-y-2">
            <p className="font-medium">{t('Opening amount in the drawer')}</p>
            {(profile?.payments ?? []).map((p) => (
              <label key={p.mode_of_payment} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-muted">{p.mode_of_payment}</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" className="input num w-full text-end" placeholder="0.00" value={cash[p.mode_of_payment] ?? ''} onChange={(e) => setCash((c) => ({ ...c, [p.mode_of_payment]: e.target.value }))} />
              </label>
            ))}
          </div>
          {/* Counter setup is for people who may create counters; everyone else is not offered links that lead to “no access”. */}
          {s.can_setup && (
            <p className="flex flex-wrap justify-between gap-2 border-t pt-3 text-muted">
              {profile && <Link to={`/pos-profiles/${encodeURIComponent(name)}`} className="text-primary hover:underline">{t('Edit this counter')}</Link>}
              <Link to="/pos-profiles/new" className="text-primary hover:underline">{t('Add a counter')}</Link>
            </p>
          )}
        </div>
      </Modal>
      {closingOther && <CloseShift opening={closingOther.name} money={(v) => formatMoney(v ?? 0, profile?.currency)} onClose={() => setClosingOther(null)} onClosed={async () => { setClosingOther(null); await onOpened(null) }} />}
    </>
  )
}

function Till({ s, profile, onClosed, modeSwitch }) {
  const call = useCall()
  const toast = useToast()
  const opening = s.opening.name
  const money = (v) => formatMoney(v ?? 0, profile.currency)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState(profile.customer ?? '')
  const [priceList, setPriceList] = useState(profile.price_list ?? '')
  const [discount, setDiscount] = useState('')
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState(null)
  const [closing, setClosing] = useState(false)
  const [totals, setTotals] = useState(null)
  const searchRef = useRef(null)

  const q = useDebounced(search.trim(), 200)
  const itemsRes = useFrappeGetCall('karya_erp.pos.items', { pos_profile: profile.name, search: q, price_list: priceList || undefined }, `pos-items:${profile.name}:${q}:${priceList}`, { revalidateOnFocus: false, isPaused: () => !q })
  const found = q ? (itemsRes.data?.message ?? []) : []

  const lines = useMemo(() => cart.map((l) => ({ item_code: l.item_code, qty: l.qty, uom: l.uom })), [cart])
  const linesKey = JSON.stringify(lines)
  useEffect(() => {
    let live = true
    if (!lines.length) return () => { live = false }
    call.post('karya_erp.pos.price', { opening, customer, items: JSON.stringify(lines), discount_amount: Number(discount) || 0, price_list: priceList || undefined })
      .then((r) => { if (live) setTotals(r.message) })
      .catch((e) => { if (live) toast({ tone: 'error', title: 'Could not price the basket', description: errorText(e) }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, customer, discount, opening, priceList])
  const shown = lines.length ? totals : null

  function add(item) {
    setCart((c) => {
      const i = c.findIndex((l) => l.item_code === item.item_code && l.uom === item.uom)
      if (i >= 0) return c.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l))
      return [...c, { item_code: item.item_code, item_name: item.item_name, uom: item.uom, rate: item.price_list_rate, qty: 1 }]
    })
  }
  const setQty = (i, qty) => setCart((c) => (qty <= 0 ? c.filter((_, k) => k !== i) : c.map((l, k) => (k === i ? { ...l, qty } : l))))

  // Barcode scanners type the code and press Enter: an exact code match is added straight away,
  // otherwise the highlighted suggestion.
  function pick(it) { add(it); setSearch(''); setActive(0); searchRef.current?.focus() }
  function onSearchKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, found.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape') setSearch('')
    else if (e.key === 'Enter' && search.trim()) {
      const code = search.trim()
      const exact = found.find((x) => x.item_code === code || x.barcode === code)
      const it = exact ?? found[active]
      if (it) pick(it)
    }
  }

  // Like ERPNext: choosing a customer switches to that customer's price list (or their group's).
  async function pickCustomer(v) {
    const c = v || profile.customer || ''
    setCustomer(c)
    try {
      const r = await call.get('karya_erp.pos.customer_price_list', { customer: c, pos_profile: profile.name })
      if (r.message) setPriceList(r.message)
    } catch { /* keep the current list */ }
  }

  function reset() { setCart([]); setDiscount(''); setTotals(null); setCustomer(profile.customer ?? ''); setPriceList(profile.price_list ?? ''); searchRef.current?.focus() }

  return (
    <>
      <PageHeader title="Point of sale" subtitle={`${profile.name} · ${t('shift since')} ${formatDate(s.opening.period_start_date)}`}>
        {modeSwitch}
        <Button icon={LogOut} onClick={() => setClosing(true)}>Close shift</Button>
      </PageHeader>
      {s.opening.stale && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span>{t('This shift was opened on')} <b>{formatDate(s.opening.period_start_date)}</b>. {t('Sales are refused on a shift from an earlier day: close it, count the drawer, and open a new shift.')}</span>
          <Button size="sm" onClick={() => setClosing(true)}>{t('Close shift')}</Button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_30rem]">
        <section className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input ref={searchRef} autoFocus className="input w-full ps-9" placeholder={t('Scan barcode or search item')} value={search} onChange={(e) => { setSearch(e.target.value); setActive(0) }} onKeyDown={onSearchKey} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} />
            {focused && q && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-background shadow-lg">
                {itemsRes.error ? <div className="p-3"><Err error={itemsRes.error} /></div> : found.length === 0 ? (
                  <p className="p-3 text-xs text-muted">{itemsRes.isLoading ? t('Looking…') : <>{t('No priced item matches.')} <Link to="/item-prices/new" className="text-primary hover:underline">{t('Add an item price')}</Link></>}</p>
                ) : found.map((it, k) => (
                  <button key={it.item_code + it.uom} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(it)} onMouseEnter={() => setActive(k)}
                    className={cn('flex w-full items-center gap-3 px-3 py-2 text-start text-xs', k === active && 'bg-surface-2')}>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.item_name || it.item_code}</span><span className="num block truncate text-[11px] text-muted">{it.item_code} · {it.uom}{it.is_stock_item ? ` · ${formatNumber(it.actual_qty)} ${t('in stock')}` : ''}</span></span>
                    <span className="num font-semibold">{money(it.price_list_rate)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="border-b bg-surface-2 text-muted">
                <th className="w-10 px-3 py-2 text-start font-medium">#</th>
                <th className="px-3 py-2 text-start font-medium">{t('Item')}</th>
                <th className="hidden px-3 py-2 text-end font-medium sm:table-cell">{t('Rate')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('Qty')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('Amount')}</th>
                <th className="w-10" />
              </tr></thead>
              <tbody className="divide-y">
                {cart.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-14 text-center text-muted"><ShoppingBasket className="mx-auto mb-2 size-7 stroke-1" />{t('Scan a barcode or search to add items')}</td></tr>
                )}
                {cart.map((l, i) => {
                  const priced = shown?.lines?.[i]
                  return (
                    <tr key={l.item_code + l.uom}>
                      <td className="num px-3 py-2 text-muted">{i + 1}</td>
                      <td className="px-3 py-2"><p className="font-medium">{l.item_name || l.item_code}</p><p className="num text-[11px] text-muted">{l.item_code} · {l.uom}</p></td>
                      <td className="num hidden px-3 py-2 text-end sm:table-cell">{money(priced?.rate ?? l.rate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" className="pressable grid size-7 place-items-center rounded-md border" onClick={() => setQty(i, l.qty - 1)} aria-label="Less"><Minus className="size-3.5" /></button>
                          <input type="number" min="0" step="1" inputMode="decimal" className="input num h-7 w-14 px-1 text-center" value={l.qty} onChange={(e) => setQty(i, Number(e.target.value))} />
                          <button type="button" className="pressable grid size-7 place-items-center rounded-md border" onClick={() => setQty(i, l.qty + 1)} aria-label="More"><Plus className="size-3.5" /></button>
                        </div>
                      </td>
                      <td className="num px-3 py-2 text-end font-semibold">{money(priced?.amount ?? l.rate * l.qty)}</td>
                      <td className="px-2"><button type="button" className="text-muted hover:text-danger" onClick={() => setQty(i, 0)} aria-label="Remove"><Trash2 className="size-3.5" /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card space-y-4 p-5 text-sm lg:sticky lg:top-16">
          <label className="block"><span className="mb-1 block font-medium">{t('Customer')}</span>
            <LinkField doctype="Customer" value={customer} onChange={pickCustomer} placeholder={t('Customer')} clearable={false} />
          </label>
          <label className="block"><span className="mb-1 block font-medium">{t('Price list')}</span>
            <LinkField doctype="Price List" value={priceList} onChange={(v) => setPriceList(v || profile.price_list || '')} filters={{ selling: 1, enabled: 1 }} placeholder={t('Price list')} clearable={false} />
          </label>
          <div className="space-y-1.5 border-t pt-3">
            <Row label="Items" value={formatNumber(cart.reduce((n, l) => n + l.qty, 0))} />
            {profile.allow_discount_change === 1 && (
              <label className="flex items-center justify-between gap-2"><span className="text-muted">{t('Discount')}</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" className="input num h-7 w-28 text-end" placeholder="0.00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </label>
            )}
            <Row label="Subtotal" value={money(shown?.subtotal)} />
            {Math.abs(shown?.discount ?? 0) > 0 && <Row label="Discount" value={`− ${money(shown.discount)}`} />}
            <Row label="VAT" value={money(shown?.taxes)} />
            {Math.abs(shown?.round_off ?? 0) > 0 && <Row label="Round off" value={money(shown.round_off)} />}
            <div className="flex items-center justify-between border-t pt-2 text-2xl font-bold"><span>{t('Total')}</span><span className="num">{money(shown?.total)}</span></div>
          </div>
          <div className="flex gap-2">
            <Button className="shrink-0" onClick={reset} disabled={!cart.length}>Clear</Button>
            <Button variant="primary" className="min-w-0 flex-1" disabled={!cart.length || !shown || !s.can_sell || s.opening.stale} onClick={() => setPaying(true)}>Pay {shown ? money(shown.total) : ''}</Button>
          </div>
        </aside>
      </div>

      {paying && shown && <PayModal profile={profile} total={shown.total} money={money} onClose={() => setPaying(false)}
        onPay={async (payments) => {
          const r = await call.post('karya_erp.pos.checkout', { opening, customer, items: JSON.stringify(lines), payments: JSON.stringify(payments), discount_amount: Number(discount) || 0, price_list: priceList || undefined })
          setPaying(false); setDone(r.message); reset()
        }} />}
      {done && <Done sale={done} money={money} onClose={() => { setDone(null); searchRef.current?.focus() }} />}
      {closing && <CloseShift opening={opening} money={money} onClose={() => setClosing(false)} onClosed={onClosed} />}
    </>
  )
}

export function CloseShift({ opening, money, onClose, onClosed }) {
  const call = useCall()
  const toast = useToast()
  const { data, error, isLoading } = useFrappeGetCall('karya_erp.pos.shift_summary', { opening }, `pos-sum:${opening}`, { revalidateOnFocus: false })
  const sum = data?.message
  const [counted, setCounted] = useState({})
  const [busy, setBusy] = useState(false)

  async function close() {
    setBusy(true)
    try {
      const res = Object.fromEntries(sum.modes.map((m) => [m.mode_of_payment, counted[m.mode_of_payment] === undefined || counted[m.mode_of_payment] === '' ? m.expected : Number(counted[m.mode_of_payment])]))
      await call.post('karya_erp.pos.close_shift', { opening, counted: JSON.stringify(res) })
      toast({ tone: 'success', title: 'Shift closed' })
      await onClosed()
      setBusy(false)
    } catch (e) {
      toast({ tone: 'error', title: 'Could not close the shift', description: errorText(e) })
      setBusy(false)
    }
  }

  return (
    <Modal title="Close shift" subtitle={sum ? `${sum.invoices} ${t('sales')} · ${money(sum.grand_total)}` : ''} icon={LogOut} tone="amber" size="lg" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!sum} onClick={close}>Close shift</Button></>}>
      {error ? <Err error={error} /> : isLoading || !sum ? <div className="h-32 animate-pulse rounded-md bg-surface-2" /> : (
        <div className="overflow-x-auto">
          <table data-no-cards className="w-full min-w-[34rem] table-fixed text-xs">
            <colgroup><col /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-36" /></colgroup>
            <thead>
              <tr className="border-b text-muted">
                <th className="px-3 py-2 text-start font-medium">{t('Payment method')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('Opening')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('Sales')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('Expected')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('Counted')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sum.modes.map((m) => {
                const diff = (counted[m.mode_of_payment] === undefined || counted[m.mode_of_payment] === '' ? m.expected : Number(counted[m.mode_of_payment])) - m.expected
                return (
                  <tr key={m.mode_of_payment} className="align-top">
                    <td className="truncate px-3 py-2.5 font-medium">{m.mode_of_payment}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-end">{money(m.opening)}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-end">{money(m.sales)}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-end">{money(m.expected)}</td>
                    <td className="px-3 py-2 text-end">
                      <input type="number" step="0.01" inputMode="decimal" className="input num h-8 w-full text-end" placeholder={String(m.expected)} value={counted[m.mode_of_payment] ?? ''} onChange={(e) => setCounted((c) => ({ ...c, [m.mode_of_payment]: e.target.value }))} />
                      {Math.abs(diff) > 0.004 && <span className={cn('num mt-0.5 block text-[11px]', diff < 0 ? 'text-danger' : 'text-amber-600')}>{diff < 0 ? t('Short') : t('Over')} {money(Math.abs(diff))}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
