import { useCallback, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { ToastContext } from './toast-context.js'
import { cn } from '../lib/utils.js'

let nextId = 1
const ICONS = { success: CheckCircle2, error: XCircle, info: Info }
const TONES = { success: 'text-success', error: 'text-danger', info: 'text-info' }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback((t) => {
    const id = nextId++
    setToasts((list) => [...list.slice(-3), { tone: 'info', ...t, id }])
    setTimeout(() => dismiss(id), t.tone === 'error' ? 8000 : 4000)
  }, [dismiss])

  return (
    <ToastContext value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[130] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] ?? Info
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-lg border bg-background p-3 text-xs">
              <Icon className={cn('mt-0.5 size-4.5 shrink-0', TONES[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{t.title}</p>
                {t.description && <p className="mt-0.5 whitespace-pre-line break-words text-muted">{t.description}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="pressable rounded text-muted hover:text-foreground" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext>
  )
}
