import { useEffect, useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import Button from '../Button.jsx'
import { Err } from './PosParts.jsx'
import { RESTAURANT } from '../../lib/posConfig.js'
import { useToast } from '../../app/toast-context.js'
import { useRestaurantUpdates, useSocketConnected, fallbackInterval } from '../../lib/realtime.js'
import { useCall } from '../../lib/useCall.js'
import { errorText } from '../../lib/errors.js'
import { t } from '../../lib/i18n.js'
import { cn } from '../../lib/utils.js'
import { serverMs } from '../../lib/serverTime.js'

const NEXT_LABEL = { New: 'Accept', 'In Kitchen': 'Start preparing', Preparing: 'Mark ready', Ready: 'Mark served' }
const COLUMNS = ['New', 'In Kitchen', 'Preparing', 'Ready']

/** Minutes since the order was placed. `created_at` is epoch ms from the server: `creation` is in the site's time zone, not the browser's. */
function minutesSince(order, now) {
  const at = order.created_at ?? serverMs(order.creation)
  return Math.max(0, Math.floor((now - at) / 60000))
}

/** Kitchen tickets by step. `kitchen` fixes the board to one kitchen; without it a filter lets the manager pick. `big` is the wall-screen look. */
export default function KitchenBoard({ kitchen, big = false }) {
  const call = useCall()
  const toast = useToast()
  const [which, setWhich] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(h) }, [])
  const active = kitchen || which
  const ks = useFrappeGetCall('karya_erp.restaurant.kitchens', {}, 'rest-kitchens', { revalidateOnFocus: false, isPaused: () => Boolean(kitchen) || !RESTAURANT.kitchenStations })
  const live = useSocketConnected()
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.restaurant.kitchen', { kitchen: active || undefined }, `rest-kitchen:${active}`, { revalidateOnFocus: true, refreshInterval: fallbackInterval(live) })
  useRestaurantUpdates(() => mutate())
  if (error) return <Err error={error} />
  if (isLoading || !data) return <div className="card h-48 animate-pulse" />
  const rows = data.message
  const kitchens = ks.data?.message ?? []
  async function advance(o) {
    try { await call.post('karya_erp.restaurant.advance', { order: o.name, kitchen: active || undefined }); mutate() } catch (e) { toast({ tone: 'error', title: 'Could not update', description: errorText(e) }) }
  }
  return (
    <div className="space-y-3">
      {!kitchen && kitchens.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {['', ...kitchens].map((k) => <button key={k} type="button" onClick={() => setWhich(k)} className={cn('pressable rounded-full border px-3 py-1', which === k ? 'border-strong bg-surface-2 font-medium' : 'text-muted')}>{k || t('All kitchens')}</button>)}
        </div>
      )}
      <div className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-4', big && 'gap-4')}>
        {COLUMNS.map((st) => {
          const col = rows.filter((r) => r.status === st)
          return (
            <div key={st} className="space-y-2">
              <p className={cn('flex items-center justify-between font-semibold', big ? 'text-base' : 'text-xs')}><span>{t(st === 'In Kitchen' ? 'Accepted' : st)}</span><span className="num text-muted">{col.length}</span></p>
              {col.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted">{t('Nothing here')}</p>}
              {col.map((o) => {
                const mins = minutesSince(o, now)
                return (
                  <div key={o.name} className={cn('card space-y-2 p-3', big ? 'text-base' : 'text-xs', mins >= 20 ? 'border-red-400' : mins >= 10 && 'border-amber-400')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('font-bold', big ? 'text-2xl' : 'text-base')}>#{o.token_no}</span>
                      <span className="text-muted">{o.order_type}{o.table ? ` · ${o.table}` : ''}</span>
                      <span className={cn('num rounded-full px-2 py-0.5 text-[11px] font-semibold', mins >= 20 ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : mins >= 10 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-surface-2 text-muted')}>{mins}m</span>
                    </div>
                    <ul className="space-y-0.5">{o.items.map((i, k) => <li key={k}><span className="num font-semibold">{i.qty}×</span> {i.item_name}{i.notes && <span className="block text-[11px] text-amber-700 dark:text-amber-300">↳ {i.notes}</span>}</li>)}</ul>
                    {o.remarks && <p className="text-muted">{o.remarks}</p>}
                    {o.waiter_name && <p className="text-[11px] text-muted">{t('Waiter')}: {o.waiter_name}</p>}
                    <Button className="w-full" onClick={() => advance(o)}>{t(NEXT_LABEL[st])}</Button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
