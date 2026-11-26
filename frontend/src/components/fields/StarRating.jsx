import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '../../lib/utils.js'

/** Frappe "Rating" field: value 0–1 shown as 1–5 stars. Read-only when onChange is missing. */
export default function StarRating({ value, onChange, size = 'md', label }) {
  const [hover, setHover] = useState(0)
  const stars = Math.round((Number(value) || 0) * 5)
  const shown = hover || stars
  const cls = size === 'sm' ? 'size-3.5' : 'size-5'
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${label ?? 'Rating'}: ${stars} of 5`} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        onChange ? (
          <button
            key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)} onClick={() => onChange(stars === n ? 0 : n / 5)}
            className="pressable rounded p-0.5"
          >
            <Star className={cn(cls, n <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-zinc-600')} />
          </button>
        ) : (
          <Star key={n} className={cn(cls, n <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-zinc-600')} />
        )
      ))}
    </span>
  )
}
