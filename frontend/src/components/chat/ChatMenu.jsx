import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { MessageCircle, X } from 'lucide-react'
import ChatPanel from './ChatPanel.jsx'
import { useToast } from '../../app/toast-context.js'
import { cn } from '../../lib/utils.js'

/** A short two-note chime made with the browser's own audio, so there is no sound file to ship. */
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[[880, 0], [1175, 0.12]].forEach(([freq, at]) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.22)
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.25)
    })
    setTimeout(() => ctx.close(), 600)
  } catch { /* sound is optional */ }
}

/**
 * Top-bar chat button. It polls the chat list every 10 s (which also tells senders their messages were delivered),
 * shows the unread badge, and announces a new message with an in-app toast, a chime and, when the tab is in the
 * background and the person allowed it, a system notification.
 */
export default function ChatMenu() {
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState(null) // the newest message, shown under the icon until read, opened or dismissed
  const [openRoom, setOpenRoom] = useState(null)
  const toast = useToast()
  const { data, mutate } = useFrappeGetCall('karya_erp.chat.rooms', undefined, 'chat-rooms', { refreshInterval: 10_000, revalidateOnFocus: true })
  const rooms = data?.message
  const unread = (rooms ?? []).reduce((n, r) => n + Number(r.unread || 0), 0)
  const seen = useRef(null) // room name -> unread count at the last look; null until the first load

  useEffect(() => {
    if (!rooms) return
    const now = Object.fromEntries(rooms.map((r) => [r.name, Number(r.unread || 0)]))
    const before = seen.current
    seen.current = now
    if (!before) return // the first load is not news
    const fresh = rooms.filter((r) => now[r.name] > (before[r.name] ?? 0) && !r.last_mine && window.__masterChatRoom !== r.name)
    if (!fresh.length) return
    const r = fresh[0]
    const who = r.room_type === 'Group' ? `${r.last_sender_name || 'Someone'} · ${r.title}` : r.title
    chime()
    if (!open) setPop({ room: r, who: r.room_type === 'Group' ? (r.last_sender_name || 'Someone') : r.title, group: r.room_type === 'Group' ? r.title : '', text: r.last_message || 'New message', more: fresh.length - 1 })
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try { const n = new Notification(who, { body: r.last_message || 'New message', tag: `chat-${r.name}` }); n.onclick = () => { window.focus(); setOpen(true); n.close() } } catch { /* some browsers only allow it from a service worker */ }
    }
    toast({ tone: 'info', title: who, description: fresh.length > 1 ? `${r.last_message} (+${fresh.length - 1} more chats)` : r.last_message })
  }, [rooms]) // eslint-disable-line react-hooks/exhaustive-deps

  // The card goes away by itself after a while, and when the chat is opened or that room has been read.
  useEffect(() => {
    if (!pop) return
    const t = setTimeout(() => setPop(null), 12_000)
    return () => clearTimeout(t)
  }, [pop])
  const popUnread = pop ? Number((rooms ?? []).find((r) => r.name === pop.room.name)?.unread || 0) : 0
  const showPop = pop && !open && popUnread > 0

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('master:chat', show)
    window.addEventListener('master:chat-refresh', mutate) // a document was just shared in chat
    return () => { window.removeEventListener('master:chat', show); window.removeEventListener('master:chat-refresh', mutate) }
  }, [mutate])

  function toggle() {
    // Ask once, from a click, whether messages may pop up while the tab is in the background.
    if (!open && 'Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission() } catch { /* ignore */ } }
    setOpenRoom(null)
    setPop(null)
    setOpen((o) => !o)
  }
  function openPop() {
    setOpenRoom(pop.room)
    setPop(null)
    setOpen(true)
  }
  return (
    <>
      <button
        type="button" onClick={toggle} title="Chat" aria-label={unread ? `Chat, ${unread} unread` : 'Chat'} aria-expanded={open}
        className={cn('pressable relative grid size-9 max-lg:hidden place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground', open && 'bg-surface-2 text-foreground')}
      >
        <MessageCircle className="size-[18px]" />
        {unread > 0 && <span className="num absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {showPop && createPortal(
        <div role="status" className="fixed end-3 top-14 z-50 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-primary/30 bg-background shadow-lg">
          <button type="button" onClick={openPop} className="flex w-full items-start gap-2.5 p-3 pe-8 text-start hover:bg-primary/5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{(pop.who || '?').slice(0, 2).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold">{pop.who}</span>
                <span className="num grid min-w-4 shrink-0 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{popUnread}</span>
              </span>
              {pop.group && <span className="block truncate text-[11px] text-primary/70">in {pop.group}</span>}
              <span className="mt-0.5 block truncate text-xs">{pop.text}</span>
              {pop.more > 0 && <span className="mt-0.5 block text-[11px] text-primary/70">+{pop.more} more {pop.more === 1 ? 'chat' : 'chats'}</span>}
            </span>
          </button>
          <button type="button" onClick={() => setPop(null)} aria-label="Dismiss" className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded text-primary/70 hover:bg-primary/10"><X className="size-3.5" /></button>
        </div>,
        document.body,
      )}
      {open && <ChatPanel onClose={() => setOpen(false)} onUnread={mutate} openRoom={openRoom} />}
    </>
  )
}
