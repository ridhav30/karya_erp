import { useState } from 'react'
import { useSWRConfig } from 'frappe-react-sdk'
import { LogIn, LogOut, MapPin } from 'lucide-react'
import Button from '../Button.jsx'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { currentPosition } from '../../lib/hr.js'

const hhmm = (t) => String(t).slice(11, 16)

/** Check in / out with the phone's GPS location (creates an Employee Checkin). */
export default function CheckInCard({ checkins = [], onLeave, shift }) {
  const call = useCall()
  const toast = useToast()
  const { mutate } = useSWRConfig()
  const [busy, setBusy] = useState(false)
  const last = checkins[checkins.length - 1]
  const next = last?.log_type === 'IN' ? 'OUT' : 'IN'
  const isIn = next === 'OUT'

  async function punch() {
    setBusy(true)
    try {
      const pos = await currentPosition()
      const res = await call.post('karya_erp.attendance.checkin', {
        log_type: next, latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy,
      })
      toast({ tone: 'success', title: next === 'IN' ? 'Checked in' : 'Checked out', description: `at ${hhmm(res?.message?.time ?? '')}` })
      await mutate('my-hr')
      await mutate((k) => typeof k === 'string' && k.startsWith('my-month:'))
    } catch (e) {
      toast({ tone: 'error', title: next === 'IN' ? 'Could not check in' : 'Could not check out', description: e?.geo ? e.message : errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">Today{shift && <> · {shift.name} <span className="num">{shift.start}–{shift.end}</span></>}</p>
        <p className="mt-0.5 text-sm font-semibold">
          {onLeave ? 'On leave' : isIn ? `Checked in at ${hhmm(last.time)}` : checkins.length ? `Checked out at ${hhmm(last.time)}` : 'Not checked in yet'}
        </p>
        {checkins.length > 0 && (
          <p className="num mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
            {checkins.map((c) => <span key={c.name}>{c.log_type === 'OUT' ? 'Out' : 'In'} {hhmm(c.time)}</span>)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1 text-[11px] text-muted sm:flex"><MapPin className="size-3" />Location is recorded</span>
        <Button
          variant={isIn ? 'secondary' : 'primary'} icon={isIn ? LogOut : LogIn} loading={busy} onClick={punch}
          className="flex-1 sm:flex-none"
        >
          {isIn ? 'Check out' : 'Check in'}
        </Button>
      </div>
    </section>
  )
}
