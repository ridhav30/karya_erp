import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import Button from '../Button.jsx'
import Combobox from '../fields/Combobox.jsx'
import { weeklyOffDates } from '../../lib/hr.js'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Holiday List: "Add weekly offs" — adds every chosen weekday between From and To as a weekly-off row
 * (same result as Desk's "Get Weekly Off Dates"), skipping dates already in the list.
 */
export default function WeeklyOffToolbar({ doc, editing, onChange, rows, toast }) {
  const [day, setDay] = useState(doc.weekly_off || 'Saturday')
  if (!editing) return null
  const ready = doc.from_date && doc.to_date

  function add() {
    const have = new Set((rows ?? []).map((r) => r.holiday_date))
    const added = weeklyOffDates(doc.from_date, doc.to_date, DAYS.indexOf(day))
      .filter((d) => !have.has(d))
      .map((d) => ({ holiday_date: d, description: day, weekly_off: 1 }))
    if (!added.length) {
      toast({ tone: 'info', title: `No new ${day}s to add` })
      return
    }
    onChange([...(rows ?? []), ...added].sort((a, b) => String(a.holiday_date).localeCompare(String(b.holiday_date))))
    toast({ tone: 'success', title: `Added ${added.length} ${day}s` })
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-36"><Combobox options={DAYS} value={day} onChange={(v) => v && setDay(v)} /></div>
      <Button size="sm" icon={CalendarPlus} onClick={add} disabled={!ready} title={ready ? undefined : 'Set From and To dates first'}>Add weekly offs</Button>
    </div>
  )
}
