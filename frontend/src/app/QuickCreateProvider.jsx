import { useCallback, useMemo, useState } from 'react'
import { QuickCreateContext } from './quick-create-context.js'
import QuickCreateModal from '../components/QuickCreateModal.jsx'

let nextId = 1

/** Hosts quick-create popups. A popup opened from another one (new Item -> new Tax Template) replaces it on screen until it is created or cancelled; the one underneath keeps what was typed. */
export function QuickCreateProvider({ children }) {
  const [stack, setStack] = useState([])

  const openQuickCreate = useCallback((opts) => {
    setStack((s) => [...s, { ...opts, id: nextId++ }])
  }, [])

  const close = useCallback((id) => setStack((s) => s.filter((m) => m.id !== id)), [])
  const value = useMemo(() => ({ openQuickCreate }), [openQuickCreate])

  return (
    <QuickCreateContext value={value}>
      {children}
      {stack.map((m) => (
        <QuickCreateModal key={m.id} doctype={m.doctype} initial={m.initial} onCreated={m.onCreated} onClose={() => close(m.id)} />
      ))}
    </QuickCreateContext>
  )
}
