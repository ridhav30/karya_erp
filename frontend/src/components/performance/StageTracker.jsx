import { Check } from 'lucide-react'
import { cn } from '../../lib/utils.js'

const STAGES = ['Self Appraisal', 'Manager Review', 'HR Review', 'To Acknowledge', 'Acknowledged']
const LABEL = { 'Self Appraisal': 'Self', 'Manager Review': 'Manager', 'HR Review': 'HR', 'To Acknowledge': 'Acknowledge', Acknowledged: 'Done' }

/** Appraisal progress: self → manager → HR → employee acknowledges. */
export default function StageTracker({ stage }) {
  const at = STAGES.indexOf(stage)
  return (
    <ol className="flex items-center gap-1" aria-label={`Stage: ${stage}`}>
      {STAGES.map((s, i) => {
        const done = at > i || stage === 'Acknowledged'
        const current = at === i && stage !== 'Acknowledged'
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-1">
            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold',
              done ? 'border-emerald-500 bg-emerald-500 text-white' : current ? 'border-primary bg-primary-soft text-primary' : 'text-muted')}>
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn('truncate text-[11px]', current ? 'font-semibold text-foreground' : 'text-muted')}>{LABEL[s]}</span>
            {i < STAGES.length - 1 && <span className={cn('h-px min-w-2 flex-1', done ? 'bg-emerald-500' : 'bg-border')} />}
          </li>
        )
      })}
    </ol>
  )
}
