import { useEffect, useRef } from 'react'
import { cn } from '../lib/utils.js'

/** A row of tabs that scrolls sideways and snaps to each tab. Picking a tab slides it to the centre, which
 *  reveals the neighbours on both sides, so you can keep going either way. The tab marked data-active is the one centred. */
export default function TabScroller({ children, className }) {
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [children])

  return (
    <div ref={ref}
      className={cn('flex snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:snap-center', className)}>
      {children}
    </div>
  )
}
