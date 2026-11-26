import { useFrappeGetCall } from 'frappe-react-sdk'
import Select from '../fields/Select.jsx'

/** The "Chat" tab of the Send dialog: who to send a document to, and an optional note. `form.target` is "room:<name>" or "user:<id>". */
export default function ChatShareForm({ form, set }) {
  const { data: r0 } = useFrappeGetCall('karya_erp.chat.rooms', undefined, 'chat-rooms', { revalidateOnFocus: false })
  const { data: u0 } = useFrappeGetCall('karya_erp.chat.people', undefined, 'chat-people:', { revalidateOnFocus: false })
  const rooms = r0?.message ?? []
  const people = (u0?.message ?? []).filter((u) => !rooms.some((r) => r.room_type === 'Direct' && r.other === u.name))
  return (
    <>
      <label className="block space-y-1">
        <span className="label">Send to</span>
        <Select className="input" value={form.target} onChange={set('target')} aria-label="Send to">
          <option value="">Choose a chat or a person…</option>
          {rooms.length > 0 && <optgroup label="Chats">{rooms.map((r) => <option key={r.name} value={`room:${r.name}`}>{r.room_type === 'Group' ? `👥 ${r.title}` : r.title}</option>)}</optgroup>}
          {people.length > 0 && <optgroup label="People">{people.map((u) => <option key={u.name} value={`user:${u.name}`}>{u.full_name || u.name}</option>)}</optgroup>}
        </Select>
      </label>
      <label className="block space-y-1"><span className="label">Note (optional)</span><textarea className="input min-h-20 py-2" value={form.note} onChange={set('note')} placeholder="Add a short message…" /></label>
    </>
  )
}
