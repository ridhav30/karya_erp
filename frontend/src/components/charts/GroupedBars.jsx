import { useState } from 'react'
import { formatMoney } from '../../lib/format.js'
import { monthLabel, niceMax, short } from '../../lib/chart.js'
import { cn } from '../../lib/utils.js'

/**
 * Grouped monthly bars on one y-axis with a legend and hover tooltip.
 * series: [{ key, label, color: 'bg-series-1' }]; months: [{ key: 'YYYY-MM', [series.key]: number }]
 * net: optional (m) => number shown as the tooltip footer.
 */
export default function GroupedBars({ months, series, currency, net, netLabel = 'Net', height = 180 }) {
  const [hover, setHover] = useState(null)
  const max = niceMax(Math.max(...months.flatMap((m) => series.map((s) => Number(m[s.key]) || 0)), 0))
  const ticks = [0, 0.5, 1].map((t) => t * max)
  const H = height
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-4 text-xs text-muted">
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className={cn('size-2.5 rounded-sm', s.color)} /> {s.label}</span>)}
      </div>
      <div className="relative flex gap-2">
        <div className="num flex w-10 shrink-0 flex-col-reverse justify-between text-end text-[10px] text-muted" style={{ height: H }}>
          {ticks.map((t) => <span key={t} className="-translate-y-1/2 first:translate-y-0">{short(t)}</span>)}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-border-subtle" style={{ bottom: `${(t / max) * H}px` }} />
          ))}
          <div className="relative flex items-end justify-around gap-2" style={{ height: H }}>
            {months.map((m, i) => (
              <div
                key={m.key}
                className={cn('relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-sm transition-colors', hover === i && 'bg-surface-2/60')}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              >
                {series.map((s) => {
                  const v = Number(m[s.key]) || 0
                  return (
                    <div key={s.key} className={cn('w-full max-w-5 origin-bottom animate-[grow_.5s_var(--ease-out-soft)_both] rounded-t-[4px]', s.color)}
                      style={{ height: `${Math.max(v > 0 ? 2 : 0, (Math.max(v, 0) / max) * H)}px`, animationDelay: `${i * 40}ms` }} />
                  )
                })}
                {hover === i && (
                  <div className={cn('pointer-events-none absolute bottom-full z-10 mb-2 w-48 animate-pop-in rounded-md border bg-background p-2 text-[11px]', i >= months.length - 2 ? 'end-0' : i <= 1 ? 'start-0' : '')}>
                    <p className="mb-1 font-semibold">{monthLabel(m.key)} {String(m.key).slice(0, 4)}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex justify-between gap-2"><span className="flex items-center gap-1.5 text-muted"><span className={cn('size-2 rounded-sm', s.color)} />{s.label}</span><span className="num">{formatMoney(m[s.key] ?? 0, currency)}</span></p>
                    ))}
                    {net && <p className="mt-1 flex justify-between gap-2 border-t pt-1 font-semibold"><span>{netLabel}</span><span className="num">{formatMoney(net(m), currency)}</span></p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-around text-[11px] text-muted">
            {months.map((m) => <span key={m.key} className="flex-1 text-center">{monthLabel(m.key)}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}
