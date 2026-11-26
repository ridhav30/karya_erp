import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { t } from '../lib/i18n.js'

const VARIANTS = {
  primary: 'bg-strong text-strong-foreground hover:opacity-90',
  accent: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border bg-background text-foreground hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-foreground',
  danger: 'border border-rose-200 bg-background text-danger hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-950/40',
}

export default function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'pressable inline-flex shrink-0 items-center whitespace-nowrap justify-center gap-1.5 rounded-md text-xs font-medium disabled:opacity-60',
        size === 'sm' ? 'h-7 px-2' : 'h-8 px-3',
        !children && (size === 'sm' ? 'w-7 px-0' : 'w-8 px-0'),
        VARIANTS[variant], className,
      )}
      {...props}
      title={t(props.title)}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : Icon && <Icon className="size-3.5" />}
      {t(children)}
    </button>
  )
}
