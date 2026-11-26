import { useEffect, useState } from 'react'

export function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h) }, [value, ms])
  return v
}
