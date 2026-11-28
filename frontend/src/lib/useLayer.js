import { useEffect, useRef } from 'react'

/**
 * Behaviour every popup / sheet needs while it is open:
 *  - Esc closes it, wherever the focus is (not only inside its input);
 *  - the phone's Back button (or swipe) closes it instead of leaving the page;
 *  - the page behind does not scroll.
 * `onClose` may change on every render; the latest one is used.
 */
export function useLayer(open, onClose) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })

  useEffect(() => {
    if (!open) return undefined
    let closedByBack = false
    const key = `layer-${Math.random().toString(36).slice(2)}`
    try { window.history.pushState({ ...(window.history.state ?? {}), __layer: key }, '') } catch { /* no history */ }
    const onPop = () => { closedByBack = true; close.current?.() }
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      close.current?.()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      // closed some other way (Esc, tap outside, a pick): drop the history entry we added
      if (!closedByBack && window.history.state?.__layer === key) window.history.back()
    }
  }, [open])
}
