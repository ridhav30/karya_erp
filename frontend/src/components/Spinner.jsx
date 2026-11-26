import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils.js'

export function Spinner({ className }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted', className)} />
}

export function FullPageSpinner() {
  return (
    <div className="grid h-full place-items-center">
      <Spinner className="size-7" />
    </div>
  )
}
