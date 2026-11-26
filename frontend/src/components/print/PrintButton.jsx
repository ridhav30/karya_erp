import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Download, Loader2, Printer, X } from 'lucide-react'
import Button from '../Button.jsx'
import Combobox from '../fields/Combobox.jsx'
import { printUrls, readPrintPrefs, savePrintPrefs } from '../../lib/print.js'

/** "Print" header button → preview dialog with print format + letter head pickers, Print and PDF. */
export default function PrintButton({ doctype, name }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Printer} onClick={() => setOpen(true)} title="Print / PDF"><span className="hidden sm:inline">Print</span></Button>
      {open && <PrintDialog doctype={doctype} name={name} onClose={() => setOpen(false)} />}
    </>
  )
}

function PrintDialog({ doctype, name, onClose }) {
  const { data, isLoading } = useFrappeGetCall('karya_erp.print_formats.options', { doctype }, `print:${doctype}`, { revalidateOnFocus: false })
  const opts = data?.message
  const [pick, setPick] = useState(() => readPrintPrefs(doctype))
  const [loaded, setLoaded] = useState(false)
  const frame = useRef(null)

  const format = (pick.format && opts?.formats.includes(pick.format)) ? pick.format : (opts?.default || 'Standard')
  const letterhead = pick.letterhead === undefined ? (opts?.default_letterhead ?? '') : pick.letterhead
  const urls = printUrls({ doctype, name, format, letterhead })

  const choose = (patch) => {
    const next = { ...pick, ...patch }
    setPick(next)
    setLoaded(false)
    savePrintPrefs(doctype, next)
  }

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('[data-combobox-dropdown]')) onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const print = () => {
    const w = frame.current?.contentWindow
    if (w) { w.focus(); w.print() }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm dark:bg-black/80" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={`Print ${name}`} className="relative z-10 flex h-full max-h-[92vh] w-full max-w-5xl animate-dialog-in flex-col overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="grid size-8 place-items-center rounded-md border bg-surface text-muted"><Printer className="size-4" /></span>
          <div className="me-auto min-w-0">
            <h3 className="truncate text-sm font-semibold">Print {name}</h3>
            <p className="text-[11px] text-muted">{doctype}</p>
          </div>
          <div className="w-48">
            <Combobox
              options={(opts?.formats ?? []).map((f) => ({ value: f, label: f }))} value={format} loading={isLoading}
              onChange={(v) => v && choose({ format: v })} placeholder="Print format"
            />
          </div>
          <div className="w-44">
            <Combobox
              options={[{ value: '__none', label: 'No letter head' }, ...(opts?.letterheads ?? []).map((l) => ({ value: l, label: l }))]}
              value={letterhead || '__none'} loading={isLoading}
              onChange={(v) => choose({ letterhead: !v || v === '__none' ? '' : v })} placeholder="Letter head"
            />
          </div>
          <Button icon={Printer} onClick={print} disabled={!loaded}>Print</Button>
          <a href={urls.pdf} target="_blank" rel="noreferrer" className="pressable inline-flex h-8 items-center gap-1.5 rounded-md bg-strong px-3 text-xs font-medium text-strong-foreground hover:opacity-90">
            <Download className="size-3.5" />PDF
          </a>
          <button type="button" onClick={onClose} aria-label="Close" className="pressable grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="relative flex-1 bg-surface-2 dark:bg-zinc-900">
          {(!loaded || isLoading) && (
            <div className="absolute inset-0 grid place-items-center text-xs text-muted"><Loader2 className="size-5 animate-spin" /></div>
          )}
          {!isLoading && (
            <iframe
              key={urls.preview} ref={frame} src={urls.preview} title="Print preview" onLoad={() => setLoaded(true)}
              className="size-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
