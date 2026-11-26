import { statusTone } from '../lib/status.js'
import { cn } from '../lib/utils.js'
import { t } from '../lib/i18n.js'

const TONE_CLASS = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-900',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-900',
  slate: 'bg-slate-200 text-slate-700 ring-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600',
}

const DOT_CLASS = {
  gray: 'bg-slate-400', amber: 'bg-amber-500', blue: 'bg-sky-500', purple: 'bg-violet-500',
  green: 'bg-emerald-500', red: 'bg-red-500', slate: 'bg-slate-500',
}

export default function StatusBadge({ status, className }) {
  if (!status) return null
  const tone = statusTone(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[tone], className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT_CLASS[tone])} />
      {t(status)}
    </span>
  )
}
