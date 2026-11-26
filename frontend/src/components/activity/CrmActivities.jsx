import { useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { CalendarClock, CheckCircle2, Circle, Mail, MailOpen, MousePointerClick, NotebookPen, Phone, PhoneCall, Send, Users } from 'lucide-react'
import Button from '../Button.jsx'
import Select from '../fields/Select.jsx'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { ago } from '../../lib/activity.js'
import { formatDate } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

const KINDS = [
  { id: 'call', label: 'Log a call', icon: Phone },
  { id: 'note', label: 'Note', icon: NotebookPen },
  { id: 'task', label: 'Task', icon: CheckCircle2 },
  { id: 'meeting', label: 'Meeting', icon: Users },
  { id: 'email', label: 'Email', icon: Mail },
]
const ICON = { call: Phone, note: NotebookPen, task: CheckCircle2, meeting: Users, email: Mail, click: MousePointerClick }
const TONE = { call: 'bg-sky-50 text-sky-600', note: 'bg-amber-50 text-amber-600', task: 'bg-violet-50 text-violet-600', meeting: 'bg-emerald-50 text-emerald-600', email: 'bg-rose-50 text-rose-600', click: 'bg-rose-50 text-rose-600' }
const blank = { title: '', text: '', when: '', ends: '', due: '', direction: 'Sent', to: '', subject: '' }

/** Calls, notes, tasks, meetings and tracked emails on one timeline for a Lead / Opportunity. */
export default function CrmActivities({ doctype, name, email, phone }) {
  const call = useCall()
  const toast = useToast()
  const { data, mutate } = useFrappeGetCall('karya_erp.crm_pipeline.activities', { doctype, name }, `crm-act:${doctype}:${name}`, { revalidateOnFocus: false })
  const d = data?.message
  const tel = useFrappeGetCall('karya_erp.crm_telephony.get_settings', {}, 'crm-telephony-on', { revalidateOnFocus: false }).data?.message
  const [dialing, setDialing] = useState(false)
  const [kind, setKind] = useState(null)
  const [f, setF] = useState({ ...blank, to: email || '' })
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function save() {
    setBusy(true)
    try {
      if (kind === 'email') {
        const html = `<p>${f.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`
        await call.post('karya_erp.crm_pipeline.send_tracked_email', { doctype, name, recipients: f.to, subject: f.subject, message: html })
        toast({ tone: 'success', title: 'Email queued', description: 'Opens and link clicks will show here.' })
      } else {
        await call.post('karya_erp.crm_pipeline.add_activity', { doctype, name, kind, title: f.title, text: f.text, when: f.when || undefined, ends: f.ends || undefined, due: f.due || undefined, direction: f.direction })
      }
      setKind(null); setF({ ...blank, to: email || '' })
      await mutate()
    } catch (e) { toast({ tone: 'error', title: 'Could not save', description: errorText(e) }) } finally { setBusy(false) }
  }
  async function dial() {
    setDialing(true)
    try {
      const r = (await call.post('karya_erp.crm_telephony.call', { doctype, name })).message
      toast({ tone: 'success', title: 'Ringing your phone', description: `Answer it and you’ll be connected to ${r.customer}.` })
      await mutate()
    } catch (e) { toast({ tone: 'error', title: 'Could not start the call', description: errorText(e) }) } finally { setDialing(false) }
  }
  async function toggle(it) {
    try { await call.post('karya_erp.crm_pipeline.complete_task', { todo: it.id, done: it.done ? 0 : 1 }); await mutate() } catch (e) { toast({ tone: 'error', title: 'Could not update task', description: errorText(e) }) }
  }

  const items = (d?.items ?? []).filter((i) => !filter || i.kind === filter)
  const can = d?.can_write

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-xs font-semibold">Activities <span className="num font-normal text-muted">{d?.items?.length ?? 0}</span></h3>
        <div className="flex flex-wrap gap-1">
          {['', 'call', 'email', 'note', 'task', 'meeting'].map((k) => (
            <button key={k || 'all'} type="button" onClick={() => setFilter(k)} className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium capitalize', filter === k ? 'bg-primary text-white' : 'bg-surface-2 text-muted hover:text-foreground')}>{k || 'All'}{k && d?.counts?.[k] ? ` ${d.counts[k]}` : ''}</button>
          ))}
        </div>
      </header>
      {can && (
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {tel?.enabled && phone && <Button size="sm" variant="accent" icon={PhoneCall} loading={dialing} disabled={dialing} onClick={dial}>Call now</Button>}
            {KINDS.map((k) => <Button key={k.id} size="sm" icon={k.icon} variant={kind === k.id ? 'primary' : undefined} onClick={() => setKind(kind === k.id ? null : k.id)}>{k.label}</Button>)}
          </div>
          {kind && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {kind === 'email' && <><input className="input" placeholder="To (comma separated)" value={f.to} onChange={set('to')} /><input className="input" placeholder="Subject" value={f.subject} onChange={set('subject')} /></>}
              {(kind === 'call' || kind === 'task' || kind === 'meeting') && <input className="input sm:col-span-2" placeholder={kind === 'call' ? 'What was the call about?' : kind === 'task' ? 'What needs doing?' : 'Meeting title'} value={f.title} onChange={set('title')} />}
              {kind === 'call' && <Select value={f.direction} onChange={set('direction')}><option value="Sent">We called them</option><option value="Received">They called us</option></Select>}
              {kind === 'task' && <input type="date" className="input" value={f.due} onChange={set('due')} aria-label="Due date" />}
              {kind === 'meeting' && <><input type="datetime-local" className="input" value={f.when} onChange={set('when')} aria-label="Starts" /><input type="datetime-local" className="input" value={f.ends} onChange={set('ends')} aria-label="Ends" /></>}
              {kind !== 'task' && <textarea className="input min-h-20 sm:col-span-2" placeholder={kind === 'email' ? 'Message — links are tracked automatically' : 'Details'} value={f.text} onChange={set('text')} />}
              <div className="flex gap-2 sm:col-span-2"><Button variant="primary" icon={kind === 'email' ? Send : undefined} loading={busy} disabled={busy} onClick={save}>{kind === 'email' ? 'Send' : 'Save'}</Button><Button onClick={() => setKind(null)}>Cancel</Button></div>
            </div>
          )}
        </div>
      )}
      <ul className="divide-y">
        {items.map((i) => {
          const Icon = ICON[i.kind] ?? Circle
          return (
            <li key={`${i.kind}${i.id}`} className="flex gap-3 px-4 py-2.5 text-xs">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', TONE[i.kind])}><Icon className="size-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className={cn('font-semibold', i.done && 'line-through opacity-60')}>{i.title || (i.kind === 'note' ? 'Note' : i.kind === 'click' ? 'Clicked a link in your email' : i.kind)}</span>
                  {i.kind === 'email' && i.direction === 'Sent' && <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium', i.opened ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-2 text-muted')}>{i.opened ? <MailOpen className="size-3" /> : <Mail className="size-3" />}{i.opened ? 'Opened' : 'Not opened'}</span>}
                  {i.kind === 'task' && i.due && <span className="inline-flex items-center gap-1 text-muted"><CalendarClock className="size-3" />{formatDate(i.due)}</span>}
                </p>
                {i.text && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted">{i.text}</p>}
                <p className="mt-0.5 text-[11px] text-muted">{i.who} · {ago(i.when)}</p>
              </div>
              {i.kind === 'task' && can && <button type="button" aria-label={i.done ? 'Reopen task' : 'Complete task'} onClick={() => toggle(i)} className="pressable self-start text-muted hover:text-primary">{i.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4" />}</button>}
            </li>
          )
        })}
        {!items.length && <li className="px-4 py-6 text-center text-xs text-muted">{d ? 'Nothing logged yet.' : 'Loading…'}</li>}
      </ul>
    </section>
  )
}
