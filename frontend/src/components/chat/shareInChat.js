/** Send the document (card + PDF) into the chosen chat. */
export async function shareInChat(call, { doctype, name, form }) {
  const [kind, id] = form.target.split(':')
  await call.post('karya_erp.chat.share_document', { doctype, name, [kind === 'room' ? 'room' : 'user']: id, message: form.note || undefined, print_format: form.format, letterhead: form.letterhead ? 1 : 0, attach_pdf: form.attach ? 1 : 0 })
  window.dispatchEvent(new CustomEvent('master:chat-refresh'))
}
