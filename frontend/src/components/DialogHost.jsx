import { useState, useSyncExternalStore } from 'react'
import { CircleHelp, TriangleAlert } from 'lucide-react'
import Button from './Button.jsx'
import Modal from './Modal.jsx'
import { currentDialog, settleDialog, subscribeDialogs } from '../lib/dialogs.js'

/** Shows confirm() / promptText() requests as the app's modal. Mount once. */
export default function DialogHost() {
  // An external store: the compiler must not cache the output, the queue lives outside React.
  const req = useSyncExternalStore(subscribeDialogs, currentDialog)
  // key: a second request while one is open starts with fresh input
  return req ? <Dialog key={req} req={req} /> : null
}

function Dialog({ req }) {
  const [text, setText] = useState(req.defaultValue ?? '')
  const danger = req.tone === 'danger'
  const prompt = req.kind === 'prompt'
  const blocked = prompt && req.required && !text.trim()
  const done = (ok) => settleDialog(prompt ? (ok ? text.trim() : null) : ok)
  const title = req.title ?? (prompt ? 'Enter a value' : danger ? 'Are you sure?' : 'Please confirm')
  return (
    <Modal
      as="form" onSubmit={(e) => { e.preventDefault(); if (!blocked) done(true) }}
      title={title} icon={danger ? TriangleAlert : CircleHelp} tone={danger ? 'red' : 'amber'} size="sm" onClose={() => done(false)}
      footer={(
        <>
          <Button data-autofocus={danger ? '' : undefined} onClick={() => done(false)}>{req.cancelLabel ?? 'Cancel'}</Button>
          <button
            type="submit" disabled={blocked} data-autofocus={danger ? undefined : ''}
            className={`pressable inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium disabled:opacity-60 ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-strong text-strong-foreground hover:opacity-90'}`}
          >
            {req.confirmLabel ?? (prompt ? 'OK' : danger ? 'Delete' : 'Confirm')}
          </button>
        </>
      )}
    >
      {req.message && <p className="whitespace-pre-line text-[13px] leading-relaxed">{req.message}</p>}
      {prompt && (
        <label className={`block space-y-1.5 ${req.message ? 'mt-3' : ''}`}>
          {req.label && <span className="label">{req.label}{req.required && <span className="text-danger"> *</span>}</span>}
          <textarea
            data-autofocus="" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={req.placeholder}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !blocked) { e.preventDefault(); done(true) } }}
            className="input h-auto py-2"
          />
        </label>
      )}
    </Modal>
  )
}
