import { useFrappeGetCall } from 'frappe-react-sdk'
import { MessageCircle } from 'lucide-react'
import { cn } from '../../lib/utils.js'

/** Phone tab-bar button for chat: opens the chat panel and shows the unread count (same list the top-bar button polls). */
export default function ChatTab({ className }) {
  const { data } = useFrappeGetCall('karya_erp.chat.rooms', undefined, 'chat-rooms', { refreshInterval: 10_000, revalidateOnFocus: true })
  const unread = (data?.message ?? []).reduce((n, r) => n + Number(r.unread || 0), 0)
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event('master:chat'))} className={cn(className, 'text-muted')} aria-label={unread ? `Chat, ${unread} unread` : 'Chat'}>
      <span className="relative">
        <MessageCircle className="size-5" />
        {unread > 0 && <span className="num absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
      </span>
      Chat
    </button>
  )
}
