import { useCallback, useMemo, useState } from 'react'

/**
 * Per-table column settings, saved in this browser (localStorage).
 *   key      unique per table, e.g. "list:sales-invoices" or "report:general-ledger"
 *   all      every column the user may pick from: [{ fieldname, label, ... }]
 *   initial  fieldnames shown by default (in order)
 *
 * Returns { columns (visible, ordered), prefs, setVisible, move, reset, isDefault }
 * prefs = { visible: [fieldname] }
 */
const PREFIX = 'karya_erp_cols:'

function read(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key) || 'null') } catch { return null }
}
function write(key, value) {
  try {
    if (value) localStorage.setItem(PREFIX + key, JSON.stringify(value))
    else localStorage.removeItem(PREFIX + key)
  } catch { /* storage unavailable: settings last for this visit only */ }
}

export function useColumnPrefs(key, all, initial) {
  const [saved, setSaved] = useState(() => read(key))
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) { setLastKey(key); setSaved(read(key)) }

  const byName = useMemo(() => Object.fromEntries(all.map((c) => [c.fieldname, c])), [all])
  const initialKey = (initial ?? []).join(',')
  const defaults = useMemo(
    () => (initialKey ? initialKey.split(',') : all.map((c) => c.fieldname)).filter((f) => byName[f]),
    [initialKey, all, byName],
  )
  // A saved choice belongs to the defaults it was made from. When the app's defaults change
  // (e.g. a new 8-column default), older saved choices are dropped so the new default shows.
  const base = initialKey || '*'
  const current = saved && saved.base === base ? saved : null

  const prefs = useMemo(() => {
    const visible = (current?.visible ?? defaults).filter((f) => byName[f])
    return { visible: visible.length ? visible : defaults }
  }, [current, defaults, byName])

  const save = useCallback((next) => {
    const value = next ? { ...next, base } : null
    setSaved(value)
    write(key, value)
  }, [key, base])

  const setVisible = (fieldname, on) => {
    const visible = on ? [...prefs.visible.filter((f) => f !== fieldname), fieldname] : prefs.visible.filter((f) => f !== fieldname)
    if (visible.length) save({ ...prefs, visible })
  }
  const move = (fieldname, dir) => {
    const v = [...prefs.visible]
    const i = v.indexOf(fieldname)
    const j = i + dir
    if (i < 0 || j < 0 || j >= v.length) return
    ;[v[i], v[j]] = [v[j], v[i]]
    save({ ...prefs, visible: v })
  }
  const reset = () => save(null)

  return {
    columns: prefs.visible.map((f) => byName[f]),
    prefs, setVisible, move, reset,
    isDefault: !current,
  }
}
