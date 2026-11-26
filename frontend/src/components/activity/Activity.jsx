import { useRef, useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { FileText, GitCommitHorizontal, Image as ImageIcon, Lock, MessageSquare, Paperclip, Plus, Send, Trash2, Upload } from 'lucide-react'
import Button from '../Button.jsx'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { initials } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'
import { ago, fileSize, plainText, uploadFile } from '../../lib/activity.js'
import { confirm } from '../../lib/dialogs.js'

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i

/**
 * Desk-style form footer for a saved document: attachments (drag & drop), a comment box,
 * and the timeline (comments, workflow / info entries and tracked field changes).
 */
export default function Activity({ doctype, name, onChange }) {
  const call = useCall()
  const toast = useToast()
  const { data, mutate, isLoading } = useFrappeGetCall('karya_erp.activity.get', { doctype, name }, `activity:${doctype}:${name}`, { revalidateOnFocus: false })
  const info = data?.message
  const files = info?.attachments ?? []
  const timeline = info?.timeline ?? []

  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const input = useRef(null)

  const full = Boolean(info?.max_attachments) && files.length >= info.max_attachments

  async function post() {
    if (!text.trim()) return
    setPosting(true)
    try {
      await call.post('karya_erp.activity.comment', { doctype, name, content: text })
      setText('')
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not add comment', description: errorText(e) })
    } finally {
      setPosting(false)
    }
  }

  async function removeComment(c) {
    if (!(await confirm({ title: 'Delete comment?', message: 'This comment will be removed.', confirmLabel: 'Delete', tone: 'danger' }))) return
    try {
      await call.post('karya_erp.activity.delete_comment', { name: c.name })
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not delete comment', description: errorText(e) })
    }
  }

  async function upload(list) {
    const picked = Array.from(list ?? [])
    if (!picked.length || !info?.can_attach) return
    setUploading(picked.length)
    let ok = 0
    for (const f of picked) {
      try {
        await uploadFile(f, doctype, name)
        ok += 1
      } catch (e) {
        toast({ tone: 'error', title: `Could not attach ${f.name}`, description: errorText(e) })
      }
      setUploading((n) => n - 1)
    }
    if (ok) toast({ tone: 'success', title: ok === 1 ? 'File attached' : `${ok} files attached` })
    await mutate()
    onChange?.()
  }

  async function removeFile(f) {
    if (!(await confirm({ title: 'Remove attachment?', message: `Remove ${f.file_name}? The file will be deleted.`, confirmLabel: 'Remove', tone: 'danger' }))) return
    try {
      await call.post('karya_erp.activity.remove_attachment', { doctype, name, file: f.name })
      await mutate()
      onChange?.()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not remove file', description: errorText(e) })
    }
  }

  const shown = showAll ? timeline : timeline.slice(0, 12)

  return (
    <div className="grid gap-4">
      {/* Attachments */}
      <section
        className={cn('rounded-lg border bg-background transition-colors', dragOver && 'border-primary bg-primary-soft/30')}
        onDragOver={(e) => { if (info?.can_attach && !full) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!full) upload(e.dataTransfer.files) }}
      >
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold"><Paperclip className="size-3.5 text-muted" />Attachments <span className="num font-normal text-muted">{files.length}</span></h3>
          {info?.can_attach && (
            <>
              <input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
              <Button size="sm" icon={Plus} loading={uploading > 0} disabled={full} onClick={() => input.current?.click()} title={full ? `Limit of ${info.max_attachments} reached` : undefined}>Attach</Button>
            </>
          )}
        </header>
        {files.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-xs text-muted">
            <Upload className="size-3.5" />{info?.can_attach ? 'Drop files here or use Attach.' : 'No files attached.'}
          </p>
        ) : (
          <ul className="divide-y">
            {files.map((f) => {
              const Icon = IMAGE.test(f.file_name ?? '') ? ImageIcon : FileText
              return (
                <li key={f.name} className="group flex items-center gap-2.5 px-4 py-2 text-xs">
                  <Icon className="size-4 shrink-0 text-muted" />
                  <a href={f.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline" title={f.file_name}>{f.file_name}</a>
                  {Boolean(f.is_private) && <Lock className="size-3 shrink-0 text-muted" aria-label="Private" />}
                  <span className="num shrink-0 text-muted">{fileSize(f.file_size)}</span>
                  {info?.can_remove && (
                    <button type="button" onClick={() => removeFile(f)} title="Remove" aria-label={`Remove ${f.file_name}`} className="pressable grid size-6 shrink-0 place-items-center rounded text-muted opacity-60 hover:bg-surface-2 hover:text-danger group-hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Comments + timeline */}
      <section className="rounded-lg border bg-background">
        <header className="border-b px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold"><MessageSquare className="size-3.5 text-muted" />Activity</h3>
        </header>
        <div className="p-4">
          <div className="flex items-start gap-2">
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Add a comment…"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post() } }}
              className="min-h-16 flex-1 resize-y rounded-md border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <Button variant="primary" icon={Send} onClick={post} loading={posting} disabled={!text.trim()} title="Comment (Ctrl+Enter)">Comment</Button>
          </div>

          <ol className="relative mt-4 space-y-3 before:absolute before:top-1 before:bottom-1 before:start-[11px] before:w-px before:bg-border">
            {isLoading && <li className="ms-8 h-4 w-1/2 animate-pulse rounded bg-surface-2" />}
            {shown.map((e) => <Entry key={`${e.kind}:${e.name}`} entry={e} onDelete={removeComment} />)}
          </ol>
          {timeline.length > shown.length && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-3 ms-8 text-xs font-medium text-primary hover:underline">
              Show {timeline.length - shown.length} older
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function Who({ entry }) {
  return <span className="font-semibold text-foreground">{entry.by_name || entry.by}</span>
}

function When({ at }) {
  return <time className="text-[11px] text-muted" title={String(at).slice(0, 16)}>{ago(at)}</time>
}

function Entry({ entry: e, onDelete }) {
  if (e.kind === 'comment') {
    return (
      <li className="group relative flex gap-2.5">
        <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">{initials(e.by_name || e.by)}</span>
        <div className="min-w-0 flex-1 rounded-md border bg-surface px-3 py-2 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span><Who entry={e} /> <When at={e.at} /></span>
            {e.mine && (
              <button type="button" onClick={() => onDelete(e)} title="Delete comment" aria-label="Delete comment" className="pressable grid size-5 place-items-center rounded text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100">
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
          <p className="mt-1 text-xs break-words whitespace-pre-line">{plainText(e.content)}</p>
        </div>
      </li>
    )
  }
  const dot = <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-background"><GitCommitHorizontal className="size-3 text-muted" /></span>
  let body
  if (e.kind === 'created') body = <><Who entry={e} /> created this</>
  else if (e.kind === 'info') body = <><Who entry={e} /> {e.type === 'Workflow' ? <>moved it to <span className="font-medium text-foreground">{plainText(e.content)}</span></> : plainText(e.content)}</>
  else {
    const parts = [
      ...e.changes.map((c, i) => (
        <span key={`c${i}`}><span className="font-medium text-foreground">{c.label}</span>{c.from ? <> from <s className="opacity-70">{c.from}</s></> : ''} to <span className="text-foreground">{c.to || '(empty)'}</span></span>
      )),
      ...e.rows.map((r, i) => <span key={`r${i}`}>{r.verb} a row in <span className="font-medium text-foreground">{r.table}</span></span>),
    ]
    if (e.row_changes) parts.push(<span key="rc">edited {e.row_changes} row value{e.row_changes > 1 ? 's' : ''}</span>)
    if (e.more) parts.push(<span key="more">+{e.more} more</span>)
    body = <><Who entry={e} /> changed {parts.map((p, i) => <span key={i}>{i ? ' · ' : ''}{p}</span>)}</>
  }
  return (
    <li className="flex gap-2.5 text-xs text-muted">
      {dot}
      <p className="min-w-0 flex-1 pt-1 break-words">{body} <When at={e.at} /></p>
    </li>
  )
}
