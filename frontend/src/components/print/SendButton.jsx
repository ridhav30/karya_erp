import Select from '../fields/Select.jsx'
import { CHAT_ENABLED, ChatShareForm, shareInChat } from '../../lib/chatAddon.js'
import { useState } from 'react'
import { Link } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Copy, Mail, MessageCircle, MessagesSquare, Send } from 'lucide-react'
import Button from '../Button.jsx'
import Modal from '../Modal.jsx'
import { useToast } from '../../app/toast-context.js'
import { readPrintPrefs } from '../../lib/print.js'
import { useCall } from '../../lib/useCall.js'
import { errorText } from '../../lib/errors.js'
import { cn } from '../../lib/utils.js'

/** "Send" header button → email the PDF, or open WhatsApp with a message and a PDF link. */
export default function SendButton({ doctype, name, onSent }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Send} onClick={() => setOpen(true)} title={CHAT_ENABLED ? 'Chat / Email / WhatsApp' : 'Email / WhatsApp'}><span className="hidden sm:inline">Send</span></Button>
      {open && <SendDialog doctype={doctype} name={name} onClose={() => setOpen(false)} onSent={onSent} />}
    </>
  )
}

function SendDialog({ doctype, name, onClose, onSent }) {
  const call = useCall()
  const toast = useToast()
  const { data: d0 } = useFrappeGetCall('karya_erp.sharing.defaults', { doctype, name }, `send:${doctype}:${name}`, { revalidateOnFocus: false })
  const { data: p0 } = useFrappeGetCall('karya_erp.print_formats.options', { doctype }, `print:${doctype}`, { revalidateOnFocus: false })
  const d = d0?.message
  const opts = p0?.message
  const prefs = readPrintPrefs(doctype)
  const [tab, setTab] = useState(CHAT_ENABLED ? 'chat' : 'email')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  // Fill the form once the defaults arrive (adjusting state during render).
  if (d && opts && !form) {
    const format = prefs.format && opts.formats.includes(prefs.format) ? prefs.format : opts.default
    const letterhead = prefs.letterhead === undefined ? opts.default_letterhead : prefs.letterhead
    setForm({ to: d.email, cc: '', subject: d.subject, message: d.message, number: d.mobile, format, letterhead, attach: true, link: true, target: '', note: '' })
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function email() {
    setBusy(true)
    try {
      await call.post('karya_erp.sharing.send_email', { doctype, name, recipients: form.to, cc: form.cc, subject: form.subject, message: form.message, print_format: form.format, letterhead: form.letterhead, attach_pdf: form.attach ? 1 : 0 })
      toast({ tone: 'success', title: `Email queued to ${form.to}` })
      onSent?.()
      onClose()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not send', description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function chat() {
    setBusy(true)
    try {
      await shareInChat(call, { doctype, name, form })
      toast({ tone: 'success', title: 'Sent in chat', description: `${doctype} ${name}` })
      onSent?.()
      onClose()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not send in chat', description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function whatsapp() {
    const w = window.open('', '_blank') // open now so the popup isn't blocked after the await
    setBusy(true)
    try {
      const res = await call.post('karya_erp.sharing.whatsapp_link', { doctype, name, number: form.number, message: form.message, print_format: form.format, letterhead: form.letterhead, include_pdf: form.link ? 1 : 0 })
      if (w) w.location.href = res.message.url
      else window.location.href = res.message.url
      onSent?.()
      onClose()
    } catch (e) {
      w?.close()
      toast({ tone: 'error', title: 'Could not open WhatsApp', description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      const res = await call.post('karya_erp.sharing.share_link', { doctype, name, print_format: form.format, letterhead: form.letterhead })
      await navigator.clipboard.writeText(res.message.url)
      toast({ tone: 'success', title: 'PDF link copied', description: res.message.expires_in_days ? `Valid for ${res.message.expires_in_days} days` : undefined })
    } catch (e) {
      toast({ tone: 'error', title: 'Could not create the link', description: errorText(e) })
    }
  }

  return (
    <Modal size="md" icon={Send} tone="blue" onClose={onClose} title={`Send ${name}`} subtitle={doctype} bodyClassName="space-y-3"
      footer={<>
        {form && <button type="button" onClick={copyLink} className="me-auto flex items-center gap-1.5 text-xs text-primary"><Copy className="size-3.5" />Copy PDF link</button>}
        <Button onClick={onClose}>Cancel</Button>
        {tab === 'chat'
          ? <Button variant="primary" icon={MessagesSquare} onClick={chat} loading={busy} disabled={!form || !form.target}>Send in chat</Button>
          : tab === 'email'
          ? <Button variant="primary" icon={Mail} onClick={email} loading={busy} disabled={!form || !form.to || !d?.outgoing_account}>Send email</Button>
          : <Button variant="primary" icon={MessageCircle} onClick={whatsapp} loading={busy} disabled={!form || !form.number}>Open WhatsApp</Button>}
      </>}>
      <div className="inline-flex rounded-md border bg-surface-2 p-0.5 dark:bg-zinc-900">
        {[...(CHAT_ENABLED ? [['chat', 'Chat', MessagesSquare]] : []), ['email', 'Email', Mail], ['whatsapp', 'WhatsApp', MessageCircle]].map(([k, l, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('flex items-center gap-1.5 rounded px-3 py-1.5 text-xs', tab === k ? 'bg-background font-semibold dark:bg-zinc-800' : 'font-medium text-muted hover:text-foreground')}><Icon className="size-3.5" />{l}</button>
        ))}
      </div>
      {!form ? <div className="h-48 animate-pulse rounded bg-surface-2" /> : (
        <>
          {tab === 'chat' ? (
            <ChatShareForm form={form} set={set} />
          ) : tab === 'email' ? (
            <>
              {!d.outgoing_account && <p className="rounded-md bg-amber-50 p-2.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">No outgoing email account yet — set it up in <Link to="/settings?section=email" className="font-medium underline" onClick={onClose}>Settings → Email</Link>.</p>}
              <label className="block space-y-1"><span className="label">To</span><input className="input" value={form.to} onChange={set('to')} placeholder="name@example.com, …" /></label>
              <label className="block space-y-1"><span className="label">Cc</span><input className="input" value={form.cc} onChange={set('cc')} /></label>
              <label className="block space-y-1"><span className="label">Subject</span><input className="input" value={form.subject} onChange={set('subject')} /></label>
            </>
          ) : (
            <label className="block space-y-1"><span className="label">Mobile number</span><input className="input num" value={form.number} onChange={set('number')} placeholder="+971 50 123 4567" inputMode="tel" /><span className="block text-[11px] text-muted">Numbers starting with 0 are treated as UAE (+971).</span></label>
          )}
          {tab !== 'chat' && <label className="block space-y-1"><span className="label">Message</span><textarea className="input min-h-36 py-2" value={form.message} onChange={set('message')} /></label>}
          <div className="flex flex-wrap items-center gap-3">
            <Select className="input w-auto" value={form.format} onChange={set('format')} aria-label="Print format">{opts.formats.map((f) => <option key={f}>{f}</option>)}</Select>
            {tab === 'email' || tab === 'chat'
              ? <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.attach} onChange={set('attach')} />Attach PDF</label>
              : <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.link} onChange={set('link')} />Add PDF link</label>}
          </div>
          {tab === 'whatsapp' && <p className="text-[11px] text-muted">Opens WhatsApp with the message ready — you press send. The link opens only this document&apos;s PDF, without a login.</p>}
        </>
      )}
    </Modal>
  )
}
