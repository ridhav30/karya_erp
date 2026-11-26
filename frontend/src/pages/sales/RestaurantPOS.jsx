import { useEffect, useMemo, useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Armchair, Bike, CalendarClock, ChefHat, ConciergeBell, ImageOff, Minus, Plus, Search, ShoppingBag, Trash2, Utensils } from 'lucide-react'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Combobox from '../../components/fields/Combobox.jsx'
import LinkField from '../../components/fields/LinkField.jsx'
import KitchenBoard from '../../components/sales/KitchenBoard.jsx'
import { PayModal, Done, Row, Err } from '../../components/sales/PosParts.jsx'
import { useToast } from '../../app/toast-context.js'
import { useRestaurantUpdates, useSocketConnected, fallbackInterval } from '../../lib/realtime.js'
import { useCall } from '../../lib/useCall.js'
import { RESTAURANT } from '../../lib/posConfig.js'
import { emptyDraft } from '../../lib/restaurant.js'
import { useDebounced } from '../../lib/useDebounced.js'
import { errorText } from '../../lib/errors.js'
import { formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { cn } from '../../lib/utils.js'
import { confirm } from '../../lib/dialogs.js'

const TYPES = [
  { key: 'Dine In', icon: Utensils },
  { key: 'Takeaway', icon: ShoppingBag },
  { key: 'Delivery', icon: Bike },
]
const TABLE_TONE = {
  Available: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
  Occupied: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
  Reserved: 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40',
  Cleaning: 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60',
}

/** Restaurant point of sale: floor plan, card menu with pictures, kitchen flow, bookings. Needs an open shift to bill. */
export default function RestaurantPOS({ s, profile }) {
  const [view, setView] = useState('floor')
  const [draft, setDraft] = useState(emptyDraft())
  const call = useCall()
  const toast = useToast()
  const tabs = [['floor', 'Tables', Armchair], ['order', 'Order', Utensils], RESTAURANT.kitchenDisplay && ['kitchen', 'Kitchen', ChefHat], RESTAURANT.bookings && ['bookings', 'Bookings', CalendarClock], ['open', 'Open orders', ConciergeBell]].filter(Boolean)

  async function openOrder(name) {
    try {
      const r = (await call.get('karya_erp.restaurant.get_order', { order: name })).message
      setDraft({ id: r.name, status: r.status, paid: Boolean(r.sales_invoice), order_type: r.order_type, table: r.table ?? '', guests: r.guests || '', customer_name: r.customer_name ?? '', phone: r.phone ?? '', remarks: r.remarks ?? '',
        lines: r.items.filter((i) => i.kitchen_status !== 'Cancelled').map((i) => ({ item_code: i.item_code, item_name: i.item_name, rate: i.rate, qty: i.qty, notes: i.notes ?? '', image: null })) })
      setView('order')
    } catch (e) { toast({ tone: 'error', title: 'Could not open the order', description: errorText(e) }) }
  }
  const newOrder = (extra) => { setDraft(emptyDraft(extra)); setView('order') }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={cn('pressable inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium', view === k ? 'border-strong bg-surface-2' : 'text-muted hover:bg-surface')}>
            <Icon className="size-3.5" />{t(label)}
          </button>
        ))}
        <Button className="ms-auto" variant="primary" icon={Plus} onClick={() => newOrder({ order_type: 'Takeaway' })}>{t('New takeaway')}</Button>
      </div>
      {view === 'floor' && <Floor onTable={(tb) => (tb.orders[0] ? openOrder(tb.orders[0].name) : newOrder({ table: tb.name, guests: '' }))} />}
      {view === 'order' && <OrderView key={draft.id ?? 'new'} s={s} profile={profile} draft={draft} setDraft={setDraft} onDone={() => { setDraft(emptyDraft()); setView('floor') }} />}
      {view === 'kitchen' && <KitchenBoard />}
      {view === 'bookings' && <Bookings />}
      {view === 'open' && <OpenOrders profile={profile} onOpen={openOrder} />}
    </div>
  )
}

export function Floor({ onTable }) {
  const call = useCall()
  const toast = useToast()
  const live = useSocketConnected()
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.restaurant.floor', {}, 'rest-floor', { revalidateOnFocus: true, refreshInterval: fallbackInterval(live) })
  useRestaurantUpdates(() => mutate())
  const [area, setArea] = useState('')
  const f = data?.message
  if (error) return <Err error={error} />
  if (isLoading || !f) return <div className="card h-48 animate-pulse" />
  if (!f.tables.length) return <div className="card p-10 text-center text-xs text-muted"><Armchair className="mx-auto mb-2 size-7 stroke-1" />{t('No tables yet. Add them under Restaurant Tables.')}</div>
  const shown = f.tables.filter((x) => !area || x.area === area)
  async function setStatus(tb, status) {
    try { await call.post('karya_erp.restaurant.set_table_status', { table: tb.name, status }); mutate() } catch (e) { toast({ tone: 'error', title: 'Could not change the table', description: errorText(e) }) }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {['', ...f.areas].map((a) => <button key={a} type="button" onClick={() => setArea(a)} className={cn('pressable rounded-full border px-3 py-1', area === a ? 'border-strong bg-surface-2' : 'text-muted')}>{a || t('All areas')}</button>)}
        <span className="ms-auto flex flex-wrap gap-3 text-muted">{Object.keys(TABLE_TONE).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={cn('size-2.5 rounded-sm border', TABLE_TONE[k])} />{t(k)}</span>)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {shown.map((tb) => (
          <div key={tb.name} className={cn('rounded-xl border-2 p-3 text-xs', TABLE_TONE[tb.status] ?? TABLE_TONE.Available)}>
            <button type="button" onClick={() => onTable(tb)} className="block w-full text-start">
              <p className="text-base font-bold">{tb.table_name}</p>
              <p className="text-muted">{tb.area || '—'} · {tb.seats} {t('seats')}</p>
              <div className="mt-2"><StatusBadge status={tb.orders[0]?.status ?? tb.status} /></div>
              {tb.orders[0] && <p className="num mt-1 font-semibold">{formatNumber(tb.orders[0].total, 2)}</p>}
              {tb.orders[0]?.waiter_name && <p className="mt-0.5 text-[11px] text-muted">{tb.orders[0].waiter_name}</p>}
              {tb.booking && <p className="mt-1 text-[11px] text-sky-700 dark:text-sky-300">{t('Booked')} {String(tb.booking.booking_time).slice(0, 5)} · {tb.booking.customer_name}</p>}
            </button>
            {tb.status === 'Cleaning' && <button type="button" className="mt-2 text-[11px] text-primary hover:underline" onClick={() => setStatus(tb, 'Available')}>{t('Mark clean')}</button>}
            {tb.status === 'Reserved' && !tb.orders[0] && <button type="button" className="mt-2 text-[11px] text-primary hover:underline" onClick={() => setStatus(tb, 'Available')}>{t('Release')}</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function OrderView({ s, profile, draft, setDraft, onDone, waiter = false }) {
  const call = useCall()
  const toast = useToast()
  const [group, setGroup] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState(null)
  const [tokenSlip, setTokenSlip] = useState(null)
  const money = (v) => `${profile.currency} ${formatNumber(v ?? 0, 2)}`
  const q = useDebounced(search.trim(), 250)
  const groups = useFrappeGetCall('karya_erp.restaurant.waiter_groups', { pos_profile: profile.name }, `rest-groups:${profile.name}`, { revalidateOnFocus: false })
  const menu = useFrappeGetCall('karya_erp.restaurant.menu', { pos_profile: profile.name, search: q, item_group: group || undefined }, `rest-menu:${profile.name}:${group}:${q}`, { revalidateOnFocus: false })
  const tables = useFrappeGetCall('karya_erp.restaurant.floor', {}, 'rest-floor', { revalidateOnFocus: false })
  useRestaurantUpdates(() => tables.mutate())
  const locked = Boolean(draft.paid) || (draft.status && !['New', 'In Kitchen', 'Preparing', 'Ready', 'Served'].includes(draft.status))

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const total = useMemo(() => draft.lines.reduce((n, l) => n + l.qty * (l.rate || 0), 0), [draft.lines])
  function add(it) {
    setDraft((d) => {
      const i = d.lines.findIndex((l) => l.item_code === it.item_code && !l.notes)
      if (i >= 0) return { ...d, lines: d.lines.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l)) }
      return { ...d, lines: [...d.lines, { item_code: it.item_code, item_name: it.item_name, rate: it.price_list_rate, qty: 1, notes: '', image: it.image }] }
    })
  }
  const setLine = (i, patch) => setDraft((d) => ({ ...d, lines: patch === null || patch.qty <= 0 ? d.lines.filter((_, k) => k !== i) : d.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }))

  function body() {
    return { pos_profile: profile.name, order: draft.id || undefined, order_type: draft.order_type, table: draft.order_type === 'Dine In' ? draft.table : undefined, guests: draft.guests || undefined,
      customer_name: draft.customer_name || undefined, phone: draft.phone || undefined, remarks: draft.remarks || undefined,
      items: JSON.stringify(draft.lines.map((l) => ({ item_code: l.item_code, qty: l.qty, notes: l.notes || undefined }))) }
  }
  async function save(send) {
    if (!draft.lines.length) return toast({ tone: 'error', title: 'Add at least one item' })
    if (draft.order_type === 'Dine In' && !draft.table) return toast({ tone: 'error', title: 'Choose a table first' })
    setBusy(true)
    try {
      const o = (await call.post('karya_erp.restaurant.save_order', body())).message
      if (send && o.status === 'New') await call.post('karya_erp.restaurant.set_status', { order: o.name, status: 'In Kitchen' })
      if (o.order_type !== 'Dine In') { setTokenSlip({ token: o.token_no, type: o.order_type, name: o.customer_name, send }); return }
      toast({ tone: 'success', title: send ? `Sent to the kitchen · token ${o.token_no}` : `Order saved · token ${o.token_no}` })
      onDone()
    } catch (e) { toast({ tone: 'error', title: 'Could not save the order', description: errorText(e) }) } finally { setBusy(false) }
  }
  async function cancel() {
    if (!draft.id) return onDone()
    if (!(await confirm({ title: t('Cancel this order?'), message: t('The kitchen will stop preparing it.'), confirmLabel: t('Cancel order'), cancelLabel: t('Keep order'), tone: 'danger' }))) return
    try { await call.post('karya_erp.restaurant.set_status', { order: draft.id, status: 'Cancelled' }); onDone() } catch (e) { toast({ tone: 'error', title: 'Could not cancel', description: errorText(e) }) }
  }
  async function startBill() {
    if (!draft.lines.length) return
    setBusy(true)
    try {
      const o = (await call.post('karya_erp.restaurant.save_order', body())).message  // bill exactly what is on screen
      setDraft((d) => ({ ...d, id: o.name, status: o.status }))
      setPaying(true)
    } catch (e) { toast({ tone: 'error', title: 'Could not save the order', description: errorText(e) }) } finally { setBusy(false) }
  }

  const freeTables = (tables.data?.message?.tables ?? []).filter((x) => x.status !== 'Cleaning' || x.name === draft.table)
  const items = menu.data?.message ?? []

  return (
    <>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input className="input w-full ps-9" placeholder={t('Search the menu')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {['', ...(groups.data?.message?.groups ?? [])].map((g) => <button key={g} type="button" onClick={() => setGroup(g)} className={cn('pressable rounded-full border px-3 py-1', group === g ? 'border-strong bg-surface-2 font-medium' : 'text-muted')}>{g || t('All')}</button>)}
          </div>
          {menu.error ? <Err error={menu.error} /> : menu.isLoading ? <div className="card h-48 animate-pulse" /> : items.length === 0 ? (
            <div className="card p-10 text-center text-xs text-muted">{t('No priced item found. Add an item price, and a picture on the item, to see it here.')}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((it) => (
                <button key={it.item_code + it.uom} type="button" disabled={locked} onClick={() => add(it)} className="pressable card overflow-hidden text-start transition-shadow hover:shadow-md disabled:opacity-50">
                  <div className="grid aspect-[4/3] place-items-center bg-surface-2">
                    {it.image ? <img src={it.image} alt="" loading="lazy" className="size-full object-cover" /> : <ImageOff className="size-6 stroke-1 text-muted" />}
                  </div>
                  <div className="p-2.5 text-xs">
                    <p className="line-clamp-2 font-medium">{it.item_name || it.item_code}</p>
                    <p className="num mt-0.5 font-semibold">{money(it.price_list_rate)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="card space-y-3 p-4 text-xs lg:sticky lg:top-16">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{draft.id ? draft.id : t('New order')}</p>
            <span className="flex items-center gap-1.5">{draft.paid && <StatusBadge status="Paid" />}{draft.status && <StatusBadge status={draft.status} />}</span>
          </div>
          <div className={cn('grid grid-cols-3 gap-1.5', waiter && 'hidden')}>
            {TYPES.map(({ key, icon: Icon }) => (
              <button key={key} type="button" disabled={locked || !!draft.id} onClick={() => set({ order_type: key })}
                className={cn('pressable flex flex-col items-center gap-1 rounded-lg border py-2 disabled:opacity-60', draft.order_type === key ? 'border-strong bg-surface-2 font-semibold' : 'text-muted')}><Icon className="size-4" />{t(key)}</button>
            ))}
          </div>
          {draft.order_type === 'Dine In' ? (
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Combobox options={freeTables.map((x) => ({ value: x.name, label: x.table_name, sublabel: `${x.area || t('no area')} · ${x.seats} ${t('seats')}`, badge: x.status }))}
                value={draft.table} onChange={(v) => set({ table: v || '' })} placeholder={t('Choose a table')} />
              <input type="number" min="1" className="input h-9 num" placeholder={t('Guests')} value={draft.guests} onChange={(e) => set({ guests: e.target.value })} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input className="input h-9" placeholder={t('Name')} value={draft.customer_name} onChange={(e) => set({ customer_name: e.target.value })} />
              <input className="input h-9" placeholder={t('Phone')} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
          )}
          <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {draft.lines.length === 0 && <p className="p-6 text-center text-muted">{t('Tap a dish to add it')}</p>}
            {draft.lines.map((l, i) => (
              <div key={l.item_code + i} className="space-y-1 p-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium">{l.item_name || l.item_code}</p>
                  <span className="num">{money(l.qty * l.rate)}</span>
                  <button type="button" className="text-muted hover:text-danger" disabled={locked} onClick={() => setLine(i, null)} aria-label="Remove"><Trash2 className="size-3.5" /></button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" disabled={locked} className="pressable grid size-6 place-items-center rounded border" onClick={() => setLine(i, { qty: l.qty - 1 })} aria-label="Less"><Minus className="size-3" /></button>
                  <span className="num w-6 text-center">{l.qty}</span>
                  <button type="button" disabled={locked} className="pressable grid size-6 place-items-center rounded border" onClick={() => setLine(i, { qty: l.qty + 1 })} aria-label="More"><Plus className="size-3" /></button>
                  <input className="input h-6 min-w-0 flex-1 px-2 text-[11px]" placeholder={t('Note (no onion…)')} value={l.notes} onChange={(e) => setLine(i, { notes: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Row label="Items" value={formatNumber(draft.lines.reduce((n, l) => n + l.qty, 0))} />
            <div className="flex items-center justify-between border-t pt-2 text-lg font-bold"><span>{t('Total')}</span><span className="num">{money(total)}</span></div>
            <p className="text-[11px] text-muted">{t('VAT and rounding are added at billing.')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {!waiter && <Button loading={busy} disabled={locked || !draft.lines.length} onClick={() => save(false)}>{t('Save order')}</Button>}
            <Button variant={waiter ? 'primary' : undefined} className={waiter ? 'col-span-2' : undefined} loading={busy} disabled={locked || !draft.lines.length} onClick={() => save(true)}>{t(draft.id ? 'Send new items to kitchen' : 'Send to kitchen')}</Button>
            {!waiter && <Button variant="primary" className="col-span-2" disabled={busy || locked || !draft.lines.length || !s.can_sell} onClick={startBill}>{t('Bill')} {money(total)}</Button>}
          </div>
          {(!waiter || !draft.id || draft.status === 'New') && <Button className="w-full" onClick={cancel}>{draft.id ? t('Cancel order') : t('Discard')}</Button>}
        </aside>
      </div>

      {!waiter && paying && <BillModal order={draft.id} opening={s.opening.name} profile={profile} money={money} onClose={() => setPaying(false)} onDone={(r) => { setPaying(false); setDone(r) }} />}
      {tokenSlip && <TokenModal slip={tokenSlip} onClose={() => { setTokenSlip(null); onDone() }} />}
      {!waiter && done && <Done sale={done} money={money} onClose={() => { setDone(null); onDone() }} />}
    </>
  )
}

/** Big token number for a takeaway / delivery customer, with a small slip to print. */
function TokenModal({ slip, onClose }) {
  function print() {
    const w = window.open('', '_blank', 'width=320,height=420')
    if (!w) return
    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
    w.document.write(`<html><body style="font-family:sans-serif;text-align:center;margin:12px"><div style="font-size:14px">${esc(slip.type)}</div><div style="font-size:72px;font-weight:900;line-height:1.1">#${esc(slip.token)}</div>${slip.name ? `<div style="font-size:16px">${esc(slip.name)}</div>` : ''}<div style="font-size:12px;margin-top:8px">${new Date().toLocaleString()}</div></body></html>`)
    w.document.close(); w.focus(); w.print()
  }
  return (
    <Modal title={slip.send ? 'Sent to the kitchen' : 'Order saved'} subtitle={slip.type} icon={ShoppingBag} tone="emerald" size="sm" onClose={onClose}
      footer={<><Button onClick={print}>{t('Print token')}</Button><Button variant="primary" onClick={onClose}>{t('Done')}</Button></>}>
      <div className="py-4 text-center">
        <p className="text-xs text-muted">{t('Token')}</p>
        <p className="num text-7xl font-black">#{slip.token}</p>
        {slip.name && <p className="mt-2 text-sm">{slip.name}</p>}
      </div>
    </Modal>
  )
}

/** Prices the order (VAT, rounding) then takes payment. */
function BillModal({ order, opening, profile, money, onClose, onDone }) {
  const call = useCall()
  const [total, setTotal] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let live = true
    call.get('karya_erp.restaurant.get_order', { order }).then(async (o) => {
      const lines = o.message.items.filter((i) => i.kitchen_status !== 'Cancelled').map((i) => ({ item_code: i.item_code, qty: i.qty }))
      const r = await call.post('karya_erp.pos.price', { opening, customer: o.message.customer || profile.customer, items: JSON.stringify(lines) })
      if (live) setTotal(r.message.total)
    }).catch((e) => live && setErr(e))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])
  if (err) return <Modal title="Payment" onClose={onClose}><Err error={err} /></Modal>
  if (total == null) return <Modal title="Payment" onClose={onClose}><div className="h-24 animate-pulse rounded-md bg-surface-2" /></Modal>
  return <PayModal profile={profile} total={total} money={money} onClose={onClose}
    onPay={async (payments) => { const r = await call.post('karya_erp.restaurant.bill', { order, opening, payments: JSON.stringify(payments) }); onDone(r.message) }} />
}

function OpenOrders({ profile, onOpen }) {
  const live = useSocketConnected()
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.restaurant.open_orders', {}, 'rest-open', { revalidateOnFocus: true, refreshInterval: fallbackInterval(live) })
  useRestaurantUpdates(() => mutate())
  if (error) return <Err error={error} />
  if (isLoading || !data) return <div className="card h-48 animate-pulse" />
  const rows = data.message
  return (
    <div className="card divide-y text-xs">
      {rows.length === 0 && <p className="p-10 text-center text-muted">{t('No open orders')}</p>}
      {rows.map((o) => (
        <button key={o.name} type="button" onClick={() => onOpen(o.name)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2">
          <span className="num w-10 text-base font-bold">#{o.token_no}</span>
          <span className="min-w-0 flex-1"><span className="block font-medium">{o.order_type}{o.table ? ` · ${o.table}` : ''}</span><span className="block truncate text-muted">{o.customer_name || o.name}</span></span>
          <StatusBadge status={o.status} />
          <span className="num w-24 text-end font-semibold">{profile.currency} {formatNumber(o.total, 2)}</span>
        </button>
      ))}
    </div>
  )
}

function Bookings() {
  const call = useCall()
  const toast = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [adding, setAdding] = useState(false)
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.restaurant.bookings', { date }, `rest-bookings:${date}`, { revalidateOnFocus: true })
  useRestaurantUpdates(() => mutate())
  const rows = data?.message ?? []
  async function status(b, st) {
    try { await call.post('karya_erp.restaurant.set_booking_status', { booking: b.name, status: st }); mutate() } catch (e) { toast({ tone: 'error', title: 'Could not update the booking', description: errorText(e) }) }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input type="date" className="input h-9" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button className="ms-auto" variant="primary" icon={Plus} onClick={() => setAdding(true)}>{t('Book a table')}</Button>
      </div>
      {error ? <Err error={error} /> : isLoading ? <div className="card h-32 animate-pulse" /> : (
        <div className="card divide-y text-xs">
          {rows.length === 0 && <p className="p-10 text-center text-muted">{t('No bookings on this day')}</p>}
          {rows.map((b) => (
            <div key={b.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="num w-14 font-bold">{String(b.booking_time).slice(0, 5)}</span>
              <span className="min-w-0 flex-1"><span className="block font-medium">{b.customer_name} · {b.guests} {t('guests')}</span><span className="block text-muted">{b.table}{b.phone ? ` · ${b.phone}` : ''}{b.notes ? ` · ${b.notes}` : ''}</span></span>
              <StatusBadge status={b.status} />
              <span className="flex gap-1">
                {b.status === 'Booked' && <Button onClick={() => status(b, 'Confirmed')}>{t('Confirm')}</Button>}
                {['Booked', 'Confirmed'].includes(b.status) && <Button onClick={() => status(b, 'Seated')}>{t('Seat')}</Button>}
                {['Booked', 'Confirmed'].includes(b.status) && <Button onClick={() => status(b, 'No Show')}>{t('No show')}</Button>}
                {['Booked', 'Confirmed'].includes(b.status) && <Button onClick={() => status(b, 'Cancelled')}>{t('Cancel')}</Button>}
                {b.status === 'Seated' && <Button onClick={() => status(b, 'Completed')}>{t('Complete')}</Button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {adding && <BookingModal date={date} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); mutate() }} />}
    </div>
  )
}

function BookingModal({ date, onClose, onSaved }) {
  const call = useCall()
  const toast = useToast()
  const [f, setF] = useState({ table: '', booking_date: date, booking_time: '19:00', guests: 2, customer_name: '', phone: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function save() {
    setBusy(true)
    try { await call.post('karya_erp.restaurant.book_table', { ...f, booking_time: f.booking_time.length === 5 ? `${f.booking_time}:00` : f.booking_time }); onSaved() } catch (e) { toast({ tone: 'error', title: 'Could not book the table', description: errorText(e) }); setBusy(false) }
  }
  return (
    <Modal title="Book a table" icon={CalendarClock} tone="blue" size="md" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!f.table || !f.customer_name} onClick={save}>Book</Button></>}>
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1 block font-medium">{t('Table')}</span><LinkField doctype="Restaurant Table" value={f.table} onChange={(v) => setF((x) => ({ ...x, table: v || '' }))} filters={{ disabled: 0 }} placeholder={t('Choose a table')} /></label>
        <label><span className="mb-1 block font-medium">{t('Guest name')}</span><input className="input w-full" value={f.customer_name} onChange={set('customer_name')} /></label>
        <label><span className="mb-1 block font-medium">{t('Phone')}</span><input className="input w-full" value={f.phone} onChange={set('phone')} /></label>
        <label><span className="mb-1 block font-medium">{t('Date')}</span><input type="date" className="input w-full" value={f.booking_date} onChange={set('booking_date')} /></label>
        <label><span className="mb-1 block font-medium">{t('Time')}</span><input type="time" className="input w-full" value={f.booking_time} onChange={set('booking_time')} /></label>
        <label><span className="mb-1 block font-medium">{t('Guests')}</span><input type="number" min="1" className="input num w-full" value={f.guests} onChange={set('guests')} /></label>
        <label><span className="mb-1 block font-medium">{t('Notes')}</span><input className="input w-full" value={f.notes} onChange={set('notes')} /></label>
      </div>
    </Modal>
  )
}
