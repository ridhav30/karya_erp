/**
 * In-app replacements for window.confirm / window.prompt.
 *
 *   if (!(await confirm({ title: 'Delete invoice?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }))) return
 *   const reason = await promptText({ title: 'Reject', label: 'Reason', required: true })   // null when cancelled
 *
 * confirm() also takes a plain string. <DialogHost /> (mounted once in App) shows them as the app's own modal.
 */
let queue = []
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())

const push = (req) => new Promise((resolve) => { queue.push({ ...req, resolve }); emit() })

export function confirm(opts) {
  const o = typeof opts === 'string' ? { message: opts } : opts
  return push({ kind: 'confirm', ...o })
}

export function promptText(opts) {
  const o = typeof opts === 'string' ? { label: opts } : opts
  return push({ kind: 'prompt', ...o })
}

/** DialogHost plumbing. */
export function currentDialog() { return queue[0] }
export function subscribeDialogs(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export function settleDialog(value) {
  const r = queue.shift()
  r?.resolve(r.kind === 'confirm' ? Boolean(value) : value ?? null)
  emit()
}
