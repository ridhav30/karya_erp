import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { t } from '../lib/i18n.js'

const MODAL_TONES = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-400',
  blue: 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-400',
  amber: 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-400',
  red: 'border-red-200 bg-red-50 text-red-600 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-400',
  gray: 'border bg-surface-2 text-muted',
}
const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-4xl lg:max-w-5xl' }

/**
 * Standard popup, same look as the quick-create dialog: portal over the whole app, blurred backdrop,
 * header (tinted icon, title, subtitle, close), scrolling body, footer bar. Esc / backdrop click close it.
 */
export default function Modal({ title, subtitle, icon: Icon, tone = 'gray', size = 'md', onClose, footer, children, bodyClassName, as = 'div', onSubmit }) {
  // A dropdown still open behind the page (e.g. the till's customer list) must not float above the popup.
  useEffect(() => { window.dispatchEvent(new CustomEvent('close-all-comboboxes', { detail: 'modal' })) }, [])
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('[data-combobox-dropdown]')) onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const Box = as
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm dark:bg-black/80" onClick={onClose} aria-hidden="true" />
      <Box role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onSubmit={onSubmit}
        className={cn('relative z-10 flex max-h-[92dvh] w-full animate-dialog-in flex-col overflow-hidden rounded-xl border bg-background', SIZES[size] ?? size)}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-surface/60 px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && <div className={cn('grid size-8 shrink-0 place-items-center rounded-md border', MODAL_TONES[tone] ?? MODAL_TONES.gray)}><Icon className="size-4" /></div>}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{t(title)}</h2>
              {subtitle && <p className="truncate text-[11px] text-muted">{t(subtitle)}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4 text-xs sm:px-6', bodyClassName)}>{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-surface/80 px-5 py-3 sm:px-6 sm:py-3.5">{footer}</div>}
      </Box>
    </div>,
    document.body,
  )
}
