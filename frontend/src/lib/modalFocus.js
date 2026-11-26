/**
 * Keyboard containment for every modal (anything marked role="dialog" aria-modal="true": popups, the quick-create
 * form, the search palette, the mobile menu drawer, ...):
 *  - while one is open everything else on the page is inert: Tab, clicks and screen readers cannot reach it
 *  - focus moves into the modal when it opens and Tab / Shift+Tab cycle inside it
 *  - when the last modal closes, focus returns to what opened it
 * A modal opened from inside another stacks on top: only the top one is live.
 * Dropdown lists (data-combobox-dropdown) are portals of their own and keep working from inside a modal.
 */
const DIALOG = '[role="dialog"][aria-modal="true"]'
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

const visible = (el) => el.getClientRects().length > 0
const dialogs = () => [...document.querySelectorAll(DIALOG)].filter(visible)
const inCombobox = (el) => Boolean(el?.closest?.('[data-combobox-dropdown]'))
const focusables = (d) => [...d.querySelectorAll(FOCUSABLE)].filter((el) => visible(el) && !el.closest('[inert]'))

let opener = null
let open = false
let parked = new Set() // elements this module made inert

/** Make everything except the path down to `top` inert (siblings at every level up to <body>). */
function isolate(top) {
  const keep = new Set()
  for (let n = top; n && n !== document.documentElement; n = n.parentElement) keep.add(n)
  const next = new Set()
  for (let n = top; n && n !== document.body; n = n.parentElement) {
    for (const sib of n.parentElement?.children ?? []) {
      if (keep.has(sib) || sib.matches('[data-combobox-dropdown], script, style, link')) continue
      next.add(sib)
    }
  }
  for (const el of parked) if (!next.has(el)) { el.removeAttribute('inert'); parked.delete(el) }
  for (const el of next) if (!parked.has(el)) { if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); parked.add(el) } }
}

function release() {
  for (const el of parked) el.removeAttribute('inert')
  parked = new Set()
}

function sync() {
  const all = dialogs()
  const top = all[all.length - 1]
  if (top) {
    if (!open) { open = true; opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null }
    isolate(top)
    const active = document.activeElement
    if (!top.contains(active) && !inCombobox(active)) {
      const list = focusables(top)
      const first = top.querySelector('[autofocus], [data-autofocus]') ?? list.find((el) => !el.matches('[aria-label="Close"]')) ?? list[0]
      if (first) first.focus({ preventScroll: true })
      else { top.setAttribute('tabindex', '-1'); top.focus({ preventScroll: true }) }
    }
  } else if (open) {
    open = false
    release()
    const back = opener
    opener = null
    if (back?.isConnected) requestAnimationFrame(() => back.focus({ preventScroll: true }))
  }
}

function onKeyDown(e) {
  if (e.key !== 'Tab' || e.defaultPrevented) return
  const all = dialogs()
  const top = all[all.length - 1]
  if (!top || inCombobox(e.target)) return
  const list = focusables(top)
  if (!list.length) { e.preventDefault(); return }
  const first = list[0], last = list[list.length - 1]
  const active = document.activeElement
  if (!top.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
  if (e.shiftKey && (active === first || active === top)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
}

/** Call once at startup. */
export function installModalFocus() {
  if (typeof document === 'undefined' || document.documentElement.dataset.modalFocus) return
  document.documentElement.dataset.modalFocus = '1'
  let queued = false
  // At most one check per frame, however busy the page is.
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync() }) }
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden', 'class'] })
  window.addEventListener('resize', later, { passive: true })
  document.addEventListener('keydown', onKeyDown, true)
  // Focus that escapes (script, browser UI) is pulled back into the modal.
  document.addEventListener('focusin', (e) => {
    const all = dialogs()
    const top = all[all.length - 1]
    if (top && !top.contains(e.target) && !inCombobox(e.target)) focusables(top)[0]?.focus({ preventScroll: true })
  })
}
