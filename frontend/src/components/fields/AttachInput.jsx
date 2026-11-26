import { useRef, useState } from 'react'
import { Loader2, Paperclip, Upload, X } from 'lucide-react'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { uploadFile } from '../../lib/activity.js'
import { cn } from '../../lib/utils.js'

const fileName = (url) => decodeURIComponent(String(url ?? '').split('/').pop() || '')

/** Attach / Attach Image field: upload a file and store its URL (Frappe links it to the document on save). */
export default function AttachInput({ value, onChange, invalid, className, accept }) {
  const input = useRef(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function pick(file) {
    if (!file) return
    setBusy(true)
    try {
      const res = await uploadFile(file)
      onChange(res?.file_url ?? null)
    } catch (e) {
      toast({ tone: 'error', title: `Could not upload ${file.name}`, description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('input flex items-center gap-2 pe-1', invalid && 'border-danger', className)}>
      <input ref={input} type="file" hidden accept={accept} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      {value ? (
        <>
          <Paperclip className="size-3.5 shrink-0 text-muted" />
          <a href={value} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline" title={fileName(value)}>{fileName(value)}</a>
          <button type="button" onClick={() => onChange(null)} title="Remove" aria-label="Remove file" className="pressable grid size-7 shrink-0 place-items-center rounded text-muted hover:bg-surface-2 hover:text-danger">
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex h-full flex-1 items-center gap-2 text-start text-muted hover:text-foreground">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {busy ? 'Uploading…' : 'Choose file'}
        </button>
      )}
    </div>
  )
}
