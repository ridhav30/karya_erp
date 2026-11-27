import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { useNavigate } from 'react-router'
import { ROUTE_OF } from '../../lib/doctypes.js'
import { ArrowLeft, Camera, CornerUpLeft, Check, CheckCheck, ImagePlus, Download, FileText, Loader2, MessageSquarePlus, Paperclip, Plus, Search, SendHorizontal, Users, X } from 'lucide-react'
import Button from '../Button.jsx'
import Modal from '../Modal.jsx'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { uploadFile } from '../../lib/activity.js'
import { errorText } from '../../lib/errors.js'
import { cn } from '../../lib/utils.js'

const toDate = (v) => new Date(String(v).replace(' ', 'T'))
const hhmm = (v) => toDate(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayOf = (v) => toDate(v).toDateString()
const dayLabel = (v) => {
  const d = toDate(v), t = new Date()
  const diff = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' })
}
const short = (v) => {
  if (!v) return ''
  const d = toDate(v), t = new Date()
  return d.toDateString() === t.toDateString() ? hhmm(v) : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/** WhatsApp-style ticks: one = sent, two grey = delivered to everyone, two blue = read by everyone. */
function Ticks({ m, d }) {
  const at = toDate(m.sent).getTime()
  const read = d?.seen_until && toDate(d.seen_until).getTime() >= at
  const got = d?.delivered_until && toDate(d.delivered_until).getTime() >= at
  if (read) return <CheckCheck className="size-3.5 text-primary-foreground" aria-label="Read" />
  if (got) return <CheckCheck className="size-3.5 opacity-60" aria-label="Delivered" />
  return <Check className="size-3.5 opacity-60" aria-label="Sent" />
}

const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip'

/** Paperclip button: choose what to send (photo, camera, document) before a file picker opens. */
function AttachMenu({ onPick }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const photo = useRef(null), camera = useRef(null), doc = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const choose = (ref) => { setOpen(false); ref.current?.click() }
  const got = (e) => { onPick(e.target.files?.[0]); e.target.value = '' }
  const items = [
    { label: 'Photo', hint: 'JPG, PNG, WebP', icon: ImagePlus, ref: photo },
    { label: 'Camera', hint: 'Take a picture', icon: Camera, ref: camera },
    { label: 'Document', hint: 'PDF, Word, Excel, CSV…', icon: FileText, ref: doc },
  ]
  return (
    <div ref={box} className="relative" onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) } }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Attach" title="Attach"
        className={cn('pressable grid size-9 place-items-center rounded-lg text-primary/70 hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] hover:text-foreground', open && 'bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] text-foreground')}>
        <Paperclip className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-11 start-0 z-10 w-56 animate-fade-in overflow-hidden rounded-xl border bg-background p-1 shadow-xl">
          {items.map(({ label, hint, icon: Icon, ref }) => (
            <button key={label} type="button" role="menuitem" onClick={() => choose(ref)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]">
              <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary"><Icon className="size-4" /></span>
              <span className="min-w-0"><span className="block text-[13px] font-medium">{label}</span><span className="block text-[11px] text-primary/70">{hint}</span></span>
            </button>
          ))}
        </div>
      )}
      <input ref={photo} type="file" hidden accept="image/*" onChange={got} />
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={got} />
      <input ref={doc} type="file" hidden accept={DOC_ACCEPT} onChange={got} />
    </div>
  )
}

function Avatar({ name, group, size = 'size-9' }) {
  const initials = (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return <span className={cn('grid shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary', size)}>{group ? <Users className="size-4" /> : initials}</span>
}

// Esc peels the chat back one layer at a time: search, then reply, then the conversation, and only then the panel.
// Each layer registers a handler that returns true when it used the key.
const escLayers = []
function useEscLayer(handler) {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => {
    const h = () => ref.current()
    escLayers.push(h)
    return () => { const i = escLayers.indexOf(h); if (i >= 0) escLayers.splice(i, 1) }
  }, [])
}

const POS_KEY = 'master:chat-pos'
const loadPos = () => { try { const p = JSON.parse(localStorage.getItem(POS_KEY)); if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return p } catch { /* none saved */ } return { x: 0, y: 0 } }
const savePos = (p) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch { /* private mode */ } }

/** Chat side panel: chats list, a conversation, and a new chat / group picker. Simple polling, no sockets needed. */
export default function ChatPanel({ onClose, onUnread, openRoom }) {
  const [view, setView] = useState(openRoom ? { type: 'room', room: openRoom } : { type: 'list' })
  // Desktop: the panel can be dragged by its header. The offset is applied straight to the element (no re-render per move),
  // may hang partly off the window (a strip of the header stays in view), remembered between visits, and a double click on the header puts it back.
  const box = useRef(null)
  const pos = useRef(loadPos())
  const drag = useRef(null)
  const place = () => {
    const el = box.current
    if (!el) return
    if (window.innerWidth < 640) { el.style.transform = ''; return }
    el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`
    const r = el.getBoundingClientRect()
    // May hang over the edges (a corner can park it out of the way), but a strip of the header stays reachable.
    const KEEP = 96, HEAD = 56
    const dx = r.right < KEEP ? KEEP - r.right : r.left > window.innerWidth - KEEP ? window.innerWidth - KEEP - r.left : 0
    const dy = r.top < 0 ? -r.top : r.top > window.innerHeight - HEAD ? window.innerHeight - HEAD - r.top : 0
    if (dx || dy) { pos.current = { x: pos.current.x + dx, y: pos.current.y + dy }; el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)` }
  }
  useEffect(() => {
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])
  const onDown = (e) => {
    if (e.button !== 0 || window.innerWidth < 640 || !e.target.closest('[data-chat-drag]') || e.target.closest('button, input, textarea, a, select')) return
    drag.current = { x: e.clientX, y: e.clientY, px: pos.current.x, py: pos.current.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    pos.current = { x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }
    place()
  }
  const onUp = () => { if (drag.current) { drag.current = null; savePos(pos.current) } }
  const onDouble = (e) => { if (e.target.closest('[data-chat-drag]') && !e.target.closest('button, input, a')) { pos.current = { x: 0, y: 0 }; place(); savePos(pos.current) } }
  useEffect(() => {
    const esc = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"], [data-combobox-dropdown]')) return
      for (let i = escLayers.length - 1; i >= 0; i--) if (escLayers[i]()) return
      onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  // Portal to <body>: the top bar's backdrop-blur would otherwise be the containing block of `fixed`.
  return createPortal(
    <section ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onDouble} role="region" aria-label="Chat" className="fixed inset-y-0 end-0 z-[70] flex w-full animate-fade-in flex-col overflow-hidden bg-background shadow-2xl sm:inset-y-3 sm:max-lg:bottom-[calc(var(--tabbar-height)+1rem)] sm:end-3 sm:w-[34rem] sm:rounded-3xl sm:border lg:w-[40rem]">
      {view.type === 'list' && <RoomList onClose={onClose} onOpen={(room, focus) => setView({ type: 'room', room, focus })} onNew={() => setView({ type: 'new' })} onGroup={() => setView({ type: 'group' })} />}
      {view.type === 'room' && <Conversation key={view.room.name} room={view.room} focus={view.focus} onBack={() => setView({ type: 'list' })} onClose={onClose} onUnread={onUnread} />}
      {view.type === 'new' && <NewChat onBack={() => setView({ type: 'list' })} onOpen={(room) => setView({ type: 'room', room })} />}
      {view.type === 'group' && <NewGroup onBack={() => setView({ type: 'list' })} onOpen={(room) => setView({ type: 'room', room })} />}
    </section>,
    document.body,
  )
}

function Header({ children, onClose, onBack }) {
  return (
    <div data-chat-drag title="Drag to move · double-click to reset" className="flex h-14 shrink-0 select-none items-center gap-2 border-b px-3 sm:cursor-grab sm:active:cursor-grabbing">
      {onBack && <button type="button" onClick={onBack} aria-label="Back" className="pressable grid size-8 place-items-center rounded-md text-primary/70 hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] hover:text-foreground"><ArrowLeft className="size-4" /></button>}
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && <button type="button" onClick={onClose} aria-label="Close chat" title="Close" className="pressable grid size-8 place-items-center rounded-md text-primary/70 hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] hover:text-foreground"><X className="size-4" /></button>}
    </div>
  )
}

function RoomList({ onClose, onOpen, onNew, onGroup }) {
  const { data, error, isLoading } = useFrappeGetCall('karya_erp.chat.rooms', undefined, 'chat-rooms', { refreshInterval: 10_000, revalidateOnFocus: true })
  const all = data?.message ?? []
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  useEscLayer(() => { if (!q) return false; setQ(''); return true })
  const rooms = term ? all.filter((r) => (r.title || '').toLowerCase().includes(term) || (r.last_message || '').toLowerCase().includes(term)) : all
  return (
    <>
      <Header onClose={onClose}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Chat</h2>
          <div className="flex gap-1.5">
            <Button size="sm" icon={Users} onClick={onGroup}>Group</Button>
            <Button size="sm" variant="primary" icon={MessageSquarePlus} onClick={onNew}>New chat</Button>
          </div>
        </div>
      </Header>
      {all.length > 0 && <SearchBox value={q} onChange={setQ} placeholder="Search chats and messages" autoFocus={false} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="p-4 text-xs text-danger">{errorText(error)}</p>}
        {isLoading && !data && <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]" />)}</div>}
        {data && all.length === 0 && (
          <div className="grid place-items-center gap-3 p-10 text-center text-xs text-primary/70">
            <MessageSquarePlus className="size-7 text-primary/60" />
            <p>No chats yet. Start one with a colleague.</p>
            <Button variant="primary" icon={Plus} onClick={onNew}>New chat</Button>
          </div>
        )}
        {rooms.map((r) => (
          <button key={r.name} type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-start transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]">
            <Avatar name={r.title} group={r.room_type === 'Group'} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn('truncate text-[13px]', r.unread ? 'font-semibold' : 'font-medium')}>{r.title || 'Chat'}</span>
                <span className="num shrink-0 text-[11px] text-primary/70">{short(r.last_message_at)}</span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className={cn('truncate text-xs', r.unread ? 'text-foreground' : 'text-primary/70')}>{r.last_message ? `${r.last_mine ? 'You: ' : r.room_type === 'Group' && r.last_sender_name ? `${r.last_sender_name}: ` : ''}${r.last_message}` : 'No messages yet'}</span>
                {r.unread > 0 && <span className="num grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">{r.unread}</span>}
              </span>
            </span>
          </button>
        ))}
        {term && rooms.length === 0 && <p className="px-4 pt-4 text-xs text-primary/70">No chats match “{q.trim()}”.</p>}
        {term.length >= 2 && (
          <>
            <p className="bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary/70">Messages</p>
            <SearchResults q={q} showRoom onPick={(h) => { const r = all.find((x) => x.name === h.room); onOpen(r ?? { name: h.room, title: h.room_title, room_type: 'Direct' }, h.name) }} />
          </>
        )}
      </div>
    </>
  )
}

function usePeople(q) {
  const { data, isLoading } = useFrappeGetCall('karya_erp.chat.people', { q: q || undefined }, `chat-people:${q}`, { revalidateOnFocus: false, keepPreviousData: true })
  return { people: data?.message ?? [], isLoading }
}

function NewChat({ onBack, onOpen }) {
  useEscLayer(() => { onBack(); return true })
  const call = useCall()
  const toast = useToast()
  const [q, setQ] = useState('')
  const { people, isLoading } = usePeople(q)
  const [busy, setBusy] = useState('')
  async function start(u) {
    setBusy(u.name)
    try {
      const res = await call.post('karya_erp.chat.open_direct', { user: u.name })
      onOpen({ name: res.message.name, title: u.full_name || u.name, room_type: 'Direct' })
    } catch (e) { toast({ tone: 'error', title: 'Could not start the chat', description: errorText(e) }); setBusy('') }
  }
  return (
    <>
      <Header onBack={onBack}><h2 className="text-sm font-semibold">New chat</h2></Header>
      <SearchBox value={q} onChange={setQ} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && !people.length && <p className="p-4 text-xs text-primary/70">Loading…</p>}
        {!isLoading && people.length === 0 && <p className="p-6 text-center text-xs text-primary/70">No one found.</p>}
        {people.map((u) => (
          <button key={u.name} type="button" disabled={busy === u.name} onClick={() => start(u)} className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-start hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] disabled:opacity-60">
            <Avatar name={u.full_name || u.name} />
            <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{u.full_name || u.name}</span><span className="block truncate text-[11px] text-primary/70">{u.name}</span></span>
            {busy === u.name && <Loader2 className="ms-auto size-4 animate-spin text-primary/70" />}
          </button>
        ))}
      </div>
    </>
  )
}

/** `text` with the searched words marked. */
function Marked({ text, q }) {
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return text
  return <>{text.slice(0, at)}<mark className="rounded-sm bg-[#ffe97a] px-0.5 text-inherit dark:bg-[#7a6a10]">{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>
}

/** Message search results from the server: across every chat, or inside one `room`. */
function SearchResults({ q, room, onPick, showRoom }) {
  const term = q.trim()
  const { data, isLoading, error } = useFrappeGetCall('karya_erp.chat.search', term.length >= 2 ? { q: term, room: room || undefined } : undefined, term.length >= 2 ? `chat-search:${room || ''}:${term}` : null, { revalidateOnFocus: false, keepPreviousData: true })
  const results = term.length >= 2 ? data?.message?.results ?? [] : []
  if (term.length < 2) return <p className="p-6 text-center text-xs text-primary/70">Type at least 2 letters to search messages{room ? ' in this chat' : ''}.</p>
  if (error) return <p className="p-4 text-xs text-danger">{errorText(error)}</p>
  if (isLoading && !data) return <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]" />)}</div>
  if (!results.length) return <p className="p-6 text-center text-xs text-primary/70">No messages found for “{term}”.</p>
  return (
    <>
      {results.map((h) => (
        <button key={h.name} type="button" onClick={() => onPick(h)} className="block w-full border-b px-4 py-2.5 text-start hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12px] font-semibold">{showRoom ? h.room_title : h.mine ? 'You' : h.sender_name}{showRoom && <span className="font-normal text-primary/70"> · {h.mine ? 'You' : h.sender_name || h.room_title}</span>}</span>
            <span className="num shrink-0 text-[11px] text-primary/70">{short(h.sent)}</span>
          </span>
          <span className="line-clamp-2 text-xs text-primary/70"><Marked text={h.text} q={term} /></span>
        </button>
      ))}
      {data?.message?.has_more && <p className="p-3 text-center text-[11px] text-primary/70">Showing the latest {results.length}. Search for more specific words to narrow it down.</p>}
    </>
  )
}

function SearchBox({ value, onChange, placeholder = 'Search people', autoFocus = true }) {
  return (
    <label className="relative block shrink-0 border-b p-3">
      <Search className="pointer-events-none absolute start-5.5 top-1/2 size-3.5 -translate-y-1/2 text-primary/70" />
      <input className="input h-9 ps-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
    </label>
  )
}

function NewGroup({ onBack, onOpen }) {
  useEscLayer(() => { onBack(); return true })
  const call = useCall()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState({})
  const { people } = usePeople(q)
  const [busy, setBusy] = useState(false)
  const chosen = Object.values(picked)
  async function create() {
    setBusy(true)
    try {
      const res = await call.post('karya_erp.chat.create_group', { title, users: JSON.stringify(chosen.map((u) => u.name)) })
      onOpen({ name: res.message.name, title: title.trim(), room_type: 'Group' })
    } catch (e) { toast({ tone: 'error', title: 'Could not create the group', description: errorText(e) }); setBusy(false) }
  }
  return (
    <>
      <Header onBack={onBack}><h2 className="text-sm font-semibold">New group</h2></Header>
      <div className="shrink-0 space-y-2 border-b p-3">
        <input className="input h-9" placeholder="Group name" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        {chosen.length > 0 && <div className="flex flex-wrap gap-1.5">{chosen.map((u) => (
          <button key={u.name} type="button" onClick={() => setPicked((p) => { const n = { ...p }; delete n[u.name]; return n })} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary">{u.full_name || u.name}<X className="size-3" /></button>
        ))}</div>}
      </div>
      <SearchBox value={q} onChange={setQ} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {people.map((u) => (
          <label key={u.name} className="flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]">
            <input type="checkbox" checked={Boolean(picked[u.name])} onChange={() => setPicked((p) => (p[u.name] ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== u.name)) : { ...p, [u.name]: u }))} className="size-3.5 accent-[var(--primary)]" />
            <Avatar name={u.full_name || u.name} size="size-8" />
            <span className="min-w-0 text-[13px] font-medium"><span className="block truncate">{u.full_name || u.name}</span></span>
          </label>
        ))}
      </div>
      <div className="shrink-0 border-t p-3"><Button variant="primary" className="w-full" loading={busy} disabled={!title.trim() || !chosen.length} onClick={create}>Create group ({chosen.length})</Button></div>
    </>
  )
}

function Conversation({ room, focus, onBack, onClose, onUnread }) {
  const call = useCall()
  const toast = useToast()
  const latest = useFrappeGetCall('karya_erp.chat.messages', { room: room.name, limit: 30 }, `chat-msgs:${room.name}`, { refreshInterval: 3000, revalidateOnFocus: true })
  const [older, setOlder] = useState([])
  const [hasMore, setHasMore] = useState(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null) // { url, name }
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const scroller = useRef(null)
  const input = useRef(null)
  const stick = useRef(true)
  const navigate = useNavigate()
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const jumped = useRef(false)
  const [replyTo, setReplyTo] = useState(null) // the message being answered
  const [flash, setFlash] = useState(null) // message briefly highlighted after jumping to a quote
  const [preview, setPreview] = useState(null) // object URL of a photo about to be sent
  const [viewer, setViewer] = useState(null) // { url, name } of a photo opened full size

  const d = latest.data?.message
  const msgs = useMemo(() => {
    const seen = new Set()
    return [...older, ...(d?.messages ?? [])].filter((m) => (seen.has(m.name) ? false : seen.add(m.name)))
  }, [older, d])
  const more = hasMore ?? d?.has_more ?? false
  const lastName = msgs[msgs.length - 1]?.name
  const lastMine = msgs[msgs.length - 1]?.mine

  // Tell the notifier which chat is on screen, so it does not announce messages you are already reading.
  useEffect(() => { window.__masterChatRoom = room.name; return () => { window.__masterChatRoom = null } }, [room.name])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  // The message box grows with what is typed (up to about six lines) and only then scrolls.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    const max = 144
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [text])
  // Stay at the bottom while new messages arrive, unless the reader scrolled up.
  useEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight }, [lastName])
  // Anything from the other side that is on screen counts as read.
  useEffect(() => {
    if (!lastName || lastMine) return
    call.post('karya_erp.chat.mark_read', { room: room.name }).then(() => { onUnread?.() }).catch(() => {})
  }, [lastName]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOlder() {
    if (loadingOlder || !msgs.length) return true
    setLoadingOlder(true)
    try {
      const first = msgs[0]
      const res = await call.get('karya_erp.chat.messages', { room: room.name, before: first.sent, limit: 30 })
      const el = scroller.current
      const prev = el?.scrollHeight ?? 0
      setOlder((o) => [...res.message.messages, ...o])
      setHasMore(res.message.has_more)
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prev })
      return res.message.has_more
    } catch (e) { toast({ tone: 'error', title: 'Could not load older messages', description: errorText(e) }); return false } finally { setLoadingOlder(false) }
  }

  async function pick(f) {
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { toast({ tone: 'error', title: `${f.name || 'File'} is too large`, description: 'Files can be up to 10 MB.' }); return }
    const isPhoto = f.type.startsWith('image/')
    setPreview(isPhoto ? URL.createObjectURL(f) : null)
    setUploading(true)
    try {
      const res = await uploadFile(f)
      setFile({ url: res.file_url, name: f.name || 'photo.png' })
    } catch (e) { setPreview(null); toast({ tone: 'error', title: `Could not upload ${f.name || 'the file'}`, description: errorText(e) }) } finally { setUploading(false) }
  }
  function openDoc(doc) {
    const base = ROUTE_OF[doc.doctype]
    if (!base) { toast({ tone: 'info', title: `${doc.doctype} ${doc.name}`, description: 'This document type has no page in the app.' }); return }
    navigate(`${base}/${encodeURIComponent(doc.name)}`)
    onClose()
  }
  useEscLayer(() => {
    if (searching) { setSearching(false); setQ(''); return true }
    if (replyTo) { setReplyTo(null); return true }
    onBack()
    return true
  })
  function startReply(m) { setReplyTo(m); input.current?.focus() }
  async function jumpTo(name) {
    const find = () => scroller.current?.querySelector(`[data-msg="${name}"]`)
    let el = find()
    // The original may be on an older page: keep loading until it turns up or there is no more.
    for (let i = 0, left = more; !el && left && i < 40; i++) { left = await loadOlder(); await new Promise((r) => setTimeout(r, 60)); el = find() }
    if (!el) { toast({ tone: 'info', title: 'That message is too far back to show' }); return }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlash(name); setTimeout(() => setFlash(null), 2200)
  }
  // Opened from a search hit: scroll to that message once the first page is in.
  useEffect(() => {
    if (focus && d && !jumped.current) { jumped.current = true; setTimeout(() => jumpTo(focus), 150) }
  })
  function clearFile() { setFile(null); setPreview(null) }

  async function send() {
    if (sending || uploading || (!text.trim() && !file)) return
    setSending(true)
    try {
      await call.post('karya_erp.chat.send', { room: room.name, message: text.trim() || undefined, file_url: file?.url, reply_to: replyTo?.name })
      setText(''); clearFile(); setReplyTo(null); stick.current = true
      await latest.mutate()
      input.current?.focus()
    } catch (e) { toast({ tone: 'error', title: 'Could not send', description: errorText(e) }) } finally { setSending(false) }
  }

  const members = d?.members ? Object.values(d.members) : []
  return (
    <>
      <Header onBack={onBack} onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <Avatar name={room.title} group={room.room_type === 'Group'} size="size-8" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{room.title || 'Chat'}</h2>
            {room.room_type === 'Group' && members.length > 0 && <p className="truncate text-[11px] text-primary/70">{members.join(', ')}</p>}
          </div>
          <button type="button" onClick={() => { setSearching((v) => !v); setQ('') }} aria-label="Search in this chat" title="Search in this chat" aria-pressed={searching}
            className={cn('pressable ms-auto grid size-8 place-items-center rounded-md text-primary/70 hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] hover:text-foreground', searching && 'bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] text-foreground')}><Search className="size-4" /></button>
        </div>
      </Header>
      {searching && <SearchBox value={q} onChange={setQ} placeholder="Search in this chat" />}
      {searching && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SearchResults q={q} room={room.name} onPick={(h) => { setSearching(false); setQ(''); setTimeout(() => jumpTo(h.name), 150) }} />
        </div>
      )}

      <div ref={scroller} hidden={searching} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (el.scrollTop < 40 && more && !loadingOlder) loadOlder() }} className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-background px-4 py-3">
        {more && <div className="pb-2 text-center"><Button size="sm" loading={loadingOlder} onClick={loadOlder}>Load previous messages</Button></div>}
        {latest.error && <p className="p-3 text-xs text-danger">{errorText(latest.error)}</p>}
        {latest.isLoading && !d && <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-primary/70" /></div>}
        {d && !more && msgs.length > 0 && <p className="pb-2 text-center text-[11px] text-primary/70">Start of the conversation</p>}
        {d && msgs.length === 0 && <p className="p-8 text-center text-xs text-primary/70">Say hello 👋</p>}
        {msgs.map((m, i) => {
          const newDay = i === 0 || dayOf(msgs[i - 1].sent) !== dayOf(m.sent)
          const showName = room.room_type === 'Group' && !m.mine && (newDay || msgs[i - 1].sender !== m.sender)
          return (
            <div key={m.name} data-msg={m.name} className={cn('group/msg -mx-4 px-4 py-0.5 transition-colors duration-500', flash === m.name && 'bg-primary/25')}>
              {newDay && <div className="my-3 text-center"><span className="rounded-lg bg-background/90 px-3 py-1 text-[11px] font-medium text-primary/70 shadow-sm">{dayLabel(m.sent)}</span></div>}
              <div className={cn('flex items-center gap-1', m.mine ? 'flex-row-reverse justify-start' : 'justify-start', i > 0 && !newDay && msgs[i - 1].sender === m.sender ? 'mt-0.5' : 'mt-2')}>
                <div className={cn('max-w-[80%] min-w-16 rounded-lg px-2.5 pb-1 pt-1.5 text-[14px] leading-snug shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]', m.mine ? 'rounded-tr-none bg-primary text-primary-foreground' : 'rounded-tl-none border border-primary/20 bg-background')}>
                  {m.reply && (
                    <button type="button" onClick={() => jumpTo(m.reply.name)} className={cn('mb-1 flex w-full items-stretch gap-0 overflow-hidden rounded-md text-start', m.mine ? 'bg-white/20' : 'bg-primary/10')}>
                      <span className={cn('w-1 shrink-0', m.reply.mine ? 'bg-success' : m.mine ? 'bg-white' : 'bg-primary')} />
                      <span className="min-w-0 flex-1 px-2 py-1">
                        <span className={cn('block truncate text-[12px] font-semibold', m.mine ? 'text-primary-foreground' : m.reply.mine ? 'text-success' : 'text-primary')}>{m.reply.mine ? 'You' : m.reply.sender_name}</span>
                        <span className={cn('block truncate text-[12px]', m.mine ? 'text-primary-foreground/80' : 'text-primary/70')}>{m.reply.text}</span>
                      </span>
                    </button>
                  )}
                  {showName && <div className="mb-0.5 text-[12px] font-semibold text-primary">{m.sender_name}</div>}
                  {m.document && (
                    <button type="button" onClick={() => openDoc(m.document)} className={cn('mb-1 flex w-full items-center gap-2.5 rounded-md p-2 text-start', m.mine ? 'bg-white/20 hover:bg-white/30' : 'bg-primary/10 hover:bg-primary/20')}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-primary"><FileText className="size-4.5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[11px] font-medium uppercase tracking-wide', m.mine ? 'text-primary-foreground/80' : 'text-primary/70')}>{m.document.doctype}</span>
                        <span className="block truncate text-[13px] font-semibold">{m.document.name}</span>
                        {m.document.label && <span className={cn('block truncate text-[12px]', m.mine ? 'text-primary-foreground/80' : 'text-primary/70')}>{m.document.label}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold">Open</span>
                    </button>
                  )}
                  {m.file_url && (m.is_image
                    ? <button type="button" onClick={() => setViewer({ url: m.file_url, name: m.file_name })} aria-label={`Open photo ${m.file_name}`} className="mb-1 block"><img src={m.file_url} alt={m.file_name} className="max-h-72 w-full rounded-md object-cover" loading="lazy" /></button>
                    : (
                      <a href={m.file_url} target="_blank" rel="noreferrer" className={cn('mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2', m.mine ? 'bg-white/20' : 'bg-primary/10')}>
                        <FileText className="size-5 shrink-0" /><span className="min-w-0 flex-1 truncate font-medium">{m.file_name}</span><Download className="size-4 shrink-0 opacity-70" />
                      </a>
                    ))}
                  {m.message && <p className="whitespace-pre-wrap break-words">{m.message}</p>}
                  <div className={cn('num mt-0.5 flex items-center justify-end gap-1 text-[11px]', m.mine ? 'text-primary-foreground/75' : 'text-primary/70')}>{hhmm(m.sent)}{m.mine && <Ticks m={m} d={d} />}</div>
                </div>
                <button type="button" onClick={() => startReply(m)} aria-label="Reply" title="Reply" className="pressable grid size-7 shrink-0 place-items-center rounded-full bg-background/80 text-primary/70 opacity-0 shadow-sm transition-opacity hover:bg-background focus-visible:opacity-100 group-hover/msg:opacity-100 dark:text-primary/70"><CornerUpLeft className="size-3.5" /></button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 space-y-2 border-t p-3 safe-b">
        {replyTo && (
          <div className="flex items-stretch overflow-hidden rounded-lg border bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] text-xs">
            <span className={cn('w-1 shrink-0', replyTo.mine ? 'bg-success' : 'bg-primary')} />
            <span className="min-w-0 flex-1 px-2.5 py-1.5">
              <span className="block truncate font-semibold text-primary">Replying to {replyTo.mine ? 'yourself' : replyTo.sender_name}</span>
              <span className="block truncate text-primary/70">{replyTo.message || `📎 ${replyTo.file_name}`}</span>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="px-2.5 text-primary/70 hover:text-danger"><X className="size-4" /></button>
          </div>
        )}
        {(file || uploading) && (
          <div className="flex items-center gap-2.5 rounded-lg border bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] p-2 text-xs">
            {preview ? <img src={preview} alt="" className="size-14 shrink-0 rounded-md object-cover" /> : uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            <span className="min-w-0 flex-1 truncate">{uploading ? 'Uploading…' : file.name}</span>
            {file && <button type="button" onClick={clearFile} aria-label="Remove attachment" className="text-primary/70 hover:text-danger"><X className="size-4" /></button>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <AttachMenu onPick={pick} />
          <textarea
            ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" maxLength={4000}
            onPaste={(e) => { const f = [...(e.clipboardData?.files ?? [])][0]; if (f) { e.preventDefault(); pick(f) } }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
            className="input min-h-9 flex-1 resize-none overflow-y-hidden py-2 leading-5"
          />
          <Button variant="primary" icon={SendHorizontal} aria-label="Send" onClick={send} loading={sending} disabled={uploading || (!text.trim() && !file)} className="size-9 px-0" />
        </div>
        <p className="text-[10.5px] text-primary/70">Enter to send · Shift+Enter for a new line · paste a photo to attach it</p>
      </div>
      {viewer && (
        <Modal title={viewer.name || 'Photo'} icon={ImagePlus} size="lg" onClose={() => setViewer(null)}
          footer={<a href={viewer.url} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><Download className="size-4" />Download</a>}>
          <img src={viewer.url} alt={viewer.name} className="mx-auto max-h-[70dvh] rounded-md object-contain" />
        </Modal>
      )}
    </>
  )
}
