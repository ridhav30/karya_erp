import { useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { ATTENDANCE_TONE } from '../../lib/hr.js'
import { formatNumber } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LEGEND = ['Present', 'Work From Home', 'Half Day', 'On Leave', 'Absent', 'Holiday', 'Weekly Off', 'Not Marked']

/** One employee's month: attendance status per day, check-in/out times, holidays and totals. */
export default function AttendanceCalendar({ employee }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const { data, isLoading } = useFrappeGetCall(
    'karya_erp.attendance.my_month', { year: ym.y, month: ym.m, ...(employee ? { employee } : {}) },
    `my-month:${employee ?? 'me'}:${ym.y}-${ym.m}`, { revalidateOnFocus: false },
  )
  const d = data?.message
  const days = d?.days ?? []
  const lead = days.length ? (new Date(`${days[0].date}T00:00:00`).getDay() + 6) % 7 : 0
  const todayIso = new Date().toLocaleDateString('en-CA')
  const shift = (n) => setYm(({ y, m }) => {
    const t = new Date(y, m - 1 + n, 1)
    return { y: t.getFullYear(), m: t.getMonth() + 1 }
  })
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth() + 1
  const t = d?.totals

  return (
    <section className="card overflow-hidden">
      <div className="dt-bar">
        <h3 className="dt-title flex items-center gap-2"><CalendarDays className="size-3.5 text-muted" />My attendance</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="pressable grid size-7 place-items-center rounded-md hover:bg-surface-2"><ChevronLeft className="size-4" /></button>
          <span className="w-28 text-center text-xs font-medium">{new Date(ym.y, ym.m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => shift(1)} disabled={isCurrent} aria-label="Next month" className="pressable grid size-7 place-items-center rounded-md hover:bg-surface-2 disabled:opacity-30"><ChevronRight className="size-4" /></button>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
          {WEEK.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
          {isLoading && !days.length && Array.from({ length: 30 }).map((_, i) => <span key={i} className="h-14 animate-pulse rounded-md bg-surface-2" />)}
          {days.map((x) => (
            <div
              key={x.date}
              title={[x.status, x.holiday, x.leave_type, x.in && `In ${x.in}`, x.out && `Out ${x.out}`].filter(Boolean).join(' · ')}
              className={cn('flex h-14 flex-col rounded-md border p-1 text-start', x.date === todayIso && 'border-primary ring-1 ring-primary/30', !x.status && 'opacity-40')}
            >
              <div className="flex items-center justify-between">
                <span className="num text-[11px] font-semibold">{Number(x.date.slice(8))}</span>
                {x.status && <span className={cn('size-2 rounded-full', ATTENDANCE_TONE[x.status])} />}
              </div>
              <span className="mt-auto truncate text-[9.5px] leading-tight text-muted">
                {x.in ? `${x.in}${x.out ? `–${x.out}` : ''}` : x.holiday || (x.status === 'On Leave' ? 'Leave' : x.status === 'Weekly Off' ? 'Off' : x.status === 'Absent' ? 'Absent' : '')}
              </span>
            </div>
          ))}
        </div>

        {t && (
          <div className="num mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
            {[['Present', t.present], ['Absent', t.absent], ['Leave', t.leave], ['Holidays', t.holiday + t.weekly_off]].map(([l, v]) => (
              <div key={l} className="rounded-md bg-surface-2 py-1.5 dark:bg-zinc-900"><p className="text-sm font-semibold">{formatNumber(v, v % 1 ? 1 : 0)}</p><p className="text-muted">{l}</p></div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
          {LEGEND.map((l) => <span key={l} className="flex items-center gap-1"><span className={cn('size-2 rounded-full', ATTENDANCE_TONE[l])} />{l}</span>)}
        </div>
      </div>
    </section>
  )
}
