import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { cn } from '../../lib/utils.js'
import { useLayer } from '../../lib/useLayer.js'

const PHONE = '(max-width: 639px)'

/**
 * Combobox — same behaviour as the e-invoicing app's CustomSelect.
 *
 * - Trigger is a button: Tab focuses it without opening; Enter / Space / ↑ / ↓ (or typing) opens it.
 * - Open list: ↑ ↓ move, Enter picks and keeps focus, Tab picks the highlighted option and moves to the
 *   next field (Shift+Tab: previous), Esc closes and refocuses the trigger.
 * - Picking the already-selected option clears it.
 * - Opening one combobox closes any other; list is portalled (never clipped), flips upward when there
 *   is no room below, stays anchored on scroll, and scrolls the highlighted row into view.
 * - Optional "Create …" footer (onQuickCreate) reachable with the keyboard as the last row.
 *
 * Local options: pass `options` and it filters as you type.
 * Remote options (LinkField): pass `options` + `loading`, set `filterLocally={false}` and listen to `onSearch`.
 *
 * option: string | { value, label?, sublabel?, badge?, description? }
 */
export default function Combobox({
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder,
  disabled = false,
  searchable,
  filterLocally = true,
  onSearch,
  onOpenChange,
  onPrefetch,
  loading = false,
  hasMore = false,
  onLoadMore = null,
  invalid = false,
  clearable = false,
  variant = 'default',
  onQuickCreate = null,
  quickCreateLabel = 'Create new',
  minDropdownWidth = null,
  emptyText = 'No matching results.',
  displayValue,
  autoFocus,
  className,
  id,
}) {
  const genId = useId()
  const selectId = id || genId
  const listId = `${selectId}-list`
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlighted, setHighlighted] = useState(-1)
  const [pos, setPos] = useState(null)
  const [sheet, setSheet] = useState(false) // phones: a bottom sheet instead of a dropdown under the field

  const buttonRef = useRef(null)
  const searchRef = useRef(null)
  const dropdownRef = useRef(null)
  const listboxRef = useRef(null)
  const createRef = useRef(null)
  const keyboardNav = useRef(false)
  const mousePos = useRef({ x: -1, y: -1 })

  const normalized = useMemo(
    () => options.map((o) => (typeof o === 'object' && o !== null ? { ...o, label: o.label ?? String(o.value ?? '') } : { value: o, label: String(o) })),
    [options],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!filterLocally || !q) return normalized
    return normalized.filter((o) => [o.label, o.sublabel, o.badge, o.description, o.value].some((x) => x != null && String(x).toLowerCase().includes(q)))
  }, [normalized, search, filterLocally])

  const hasValue = value !== undefined && value !== null && value !== ''
  const selected = hasValue ? normalized.find((o) => o.value === value) : null
  const showSearch = searchable ?? (!filterLocally || normalized.length > 6)
  const createIndex = onQuickCreate ? filtered.length : -1
  const maxIndex = onQuickCreate ? filtered.length : Math.max(0, filtered.length - 1)
  const createActive = onQuickCreate && highlighted === createIndex

  // ---- open / close
  const computePosition = () => {
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return null
    const cell = variant === 'cell'
    const width = Math.max(r.width, minDropdownWidth ?? (cell ? 240 : 260))
    let left = r.left
    if (left + width > window.innerWidth - 16) left = Math.max(16, window.innerWidth - width - 16)
    const below = window.innerHeight - r.bottom
    const above = r.top
    const up = (below < 220 && above > below) || (below < 160 && above > 160)
    const avail = up ? Math.min(300, above - 12) : Math.min(300, below - 12)
    return { top: up ? (cell ? r.top : r.top - 4) : (cell ? r.bottom : r.bottom + 4), left, width, up, maxHeight: Math.max(140, avail) }
  }

  const open = (seed = '') => {
    if (disabled || isOpen) return
    window.dispatchEvent(new CustomEvent('close-all-comboboxes', { detail: selectId }))
    const phone = typeof window !== 'undefined' && window.matchMedia?.(PHONE).matches
    setSheet(Boolean(phone))
    setPos(phone ? {} : computePosition())
    setSearch(seed)
    if (seed) onSearch?.(seed)
    keyboardNav.current = false
    const idx = hasValue ? normalized.findIndex((o) => o.value === value) : -1
    setHighlighted(idx >= 0 && !seed ? idx : normalized.length || onQuickCreate ? 0 : -1)
    setIsOpen(true)
    onOpenChange?.(true)
  }
  const close = (refocus = false) => {
    if (!isOpen) return
    setIsOpen(false)
    setSearch('')
    onSearch?.('')
    setHighlighted(-1)
    onOpenChange?.(false)
    if (refocus) buttonRef.current?.focus()
  }
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })

  // Another combobox opened -> close this one.
  useEffect(() => {
    const other = (e) => { if (e.detail !== selectId) closeRef.current(false) }
    window.addEventListener('close-all-comboboxes', other)
    return () => window.removeEventListener('close-all-comboboxes', other)
  }, [selectId])

  // Stay anchored on page scroll / resize (but not when the list itself scrolls).
  useEffect(() => {
    if (!isOpen || sheet) return
    const reposition = (e) => {
      if (e?.target instanceof Node && dropdownRef.current?.contains(e.target)) return
      const p = computePosition()
      if (p) setPos(p)
    }
    window.addEventListener('resize', reposition, { passive: true })
    window.addEventListener('scroll', reposition, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, { capture: true })
    }
  }, [isOpen, sheet]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click / touch outside closes.
  useEffect(() => {
    if (!isOpen || sheet) return
    const outside = (e) => {
      const path = e.composedPath?.() ?? []
      const inButton = buttonRef.current && (buttonRef.current.contains(e.target) || path.includes(buttonRef.current))
      const inList = dropdownRef.current && (dropdownRef.current.contains(e.target) || path.includes(dropdownRef.current))
      if (!inButton && !inList) closeRef.current(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('touchstart', outside)
    }
  }, [isOpen, sheet])

  // Focus the search box on open; bring the selected row into view.
  useEffect(() => {
    if (!isOpen) return
    if (showSearch && !sheet) searchRef.current?.focus({ preventScroll: true })
    const el = listboxRef.current?.querySelector('[aria-selected="true"]')
    if (el && listboxRef.current) listboxRef.current.scrollTop = el.offsetTop - listboxRef.current.clientHeight / 2 + el.clientHeight / 2
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Remote results arrived / search changed: keep a valid highlight.
  const [lastLen, setLastLen] = useState(filtered.length)
  if (isOpen && lastLen !== filtered.length) {
    setLastLen(filtered.length)
    if (highlighted > maxIndex || highlighted < 0) setHighlighted(filtered.length || onQuickCreate ? 0 : -1)
  }

  // Keyboard navigation keeps the highlighted row visible.
  useEffect(() => {
    if (!isOpen || highlighted < 0 || !keyboardNav.current) return
    if (createActive) { createRef.current?.scrollIntoView?.({ block: 'nearest' }); return }
    const box = listboxRef.current
    const item = box?.querySelectorAll('[role="option"]')[highlighted]
    if (!item || !box) return
    const ir = item.getBoundingClientRect()
    const br = box.getBoundingClientRect()
    if (ir.top < br.top) box.scrollTop -= br.top - ir.top
    else if (ir.bottom > br.bottom) box.scrollTop += ir.bottom - br.bottom
  }, [highlighted, isOpen, createActive])

  // Esc, the phone's Back button and a locked page behind, for the sheet.
  useLayer(isOpen && sheet, () => close(true))

  // ---- actions
  const choose = (val, refocus = true) => {
    const next = hasValue && value === val ? '' : val
    onChange?.(next, normalized.find((o) => o.value === val))
    close(refocus)
  }
  const create = () => {
    const term = search.trim()
    close(false)
    onQuickCreate?.(term)
  }
  const focusNext = (reverse) => {
    const sel = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const all = [...document.querySelectorAll(sel)].filter((el) => !dropdownRef.current?.contains(el) && el.offsetParent !== null && el.tabIndex !== -1)
    const i = all.indexOf(buttonRef.current)
    if (i >= 0) all[reverse ? i - 1 : i + 1]?.focus()
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (!isOpen) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation(); open()
      } else if (e.key === 'Backspace' && clearable && hasValue) {
        e.preventDefault(); onChange?.('', null)
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && showSearch) {
        e.preventDefault(); open(e.key) // type-to-search, like a normal input
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); e.stopPropagation(); keyboardNav.current = true
        setHighlighted((h) => (filtered.length === 0 && onQuickCreate ? 0 : Math.min(h + 1, maxIndex)))
        break
      case 'ArrowUp':
        e.preventDefault(); e.stopPropagation(); keyboardNav.current = true
        setHighlighted((h) => (filtered.length === 0 && onQuickCreate ? 0 : Math.max(h - 1, 0)))
        break
      case 'Enter':
        e.preventDefault(); e.stopPropagation()
        if (createActive) create()
        else if (filtered[highlighted]) choose(filtered[highlighted].value, true)
        break
      case 'Tab':
        e.preventDefault(); e.stopPropagation()
        if (createActive) create()
        else {
          if (filtered[highlighted] && filtered[highlighted].value !== value) onChange?.(filtered[highlighted].value, filtered[highlighted])
          close(false)
        }
        focusNext(e.shiftKey)
        break
      case 'Escape':
        e.preventDefault(); e.stopPropagation(); close(true)
        break
      default:
    }
  }

  // Only a real mouse move takes the highlight (not the list scrolling under a still pointer).
  const onRowMove = (e) => {
    if (e.clientX === mousePos.current.x && e.clientY === mousePos.current.y) return
    mousePos.current = { x: e.clientX, y: e.clientY }
    keyboardNav.current = false
    setHighlighted(Number(e.currentTarget.dataset.index))
  }

  // ---- render
  const cell = variant === 'cell'
  const shown = displayValue ?? selected
  const listMax = sheet ? undefined : Math.max(100, (pos?.maxHeight ?? 280) - (showSearch ? 52 : 12) - (onQuickCreate ? 40 : 0))

  const panel = !(isOpen && pos) ? null : (
    <div
      ref={dropdownRef}
      data-combobox-dropdown=""
      onKeyDown={onKeyDown}
      style={sheet ? undefined : {
        position: 'fixed', left: pos.left, width: pos.width, zIndex: 99999, maxHeight: pos.maxHeight,
        top: pos.up ? 'auto' : pos.top, bottom: pos.up ? window.innerHeight - pos.top : 'auto',
      }}
      className={cn('flex flex-col overflow-hidden bg-background text-xs text-foreground dark:bg-[#18181b]', sheet ? 'relative max-h-[75dvh] w-full rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]' : 'rounded-md border py-1')}
    >
      {sheet && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
          <span className="truncate text-[13px] font-semibold">{placeholder}</span>
          <button type="button" onClick={() => close(true)} aria-label="Close" className="grid size-8 place-items-center rounded-md text-muted active:bg-surface-2"><X className="size-4" /></button>
        </div>
      )}
      {showSearch && (
        <div className="shrink-0 border-b border-border-subtle bg-gray-50/70 p-2 dark:bg-zinc-900/50">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); onSearch?.(e.target.value); setHighlighted(0); keyboardNav.current = false }}
              placeholder={searchPlaceholder ?? 'Search…'}
              role="searchbox"
              aria-controls={listId}
              className="w-full rounded-md border bg-background py-1.5 ps-7 pe-7 text-base text-foreground outline-none sm:text-xs placeholder:text-muted/70 focus:border-primary dark:bg-zinc-900"
            />
            {loading && <Loader2 className="absolute end-2.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted" />}
          </div>
        </div>
      )}

      <div ref={listboxRef} id={listId} role="listbox" tabIndex={-1} style={{ maxHeight: listMax }} className="relative flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-1"
        onScroll={hasMore && onLoadMore ? (e) => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) onLoadMore() } : undefined}>
        {filtered.length === 0 ? (
          <div className="space-y-1 px-3 py-4 text-center text-xs text-muted">
            <p>{loading ? 'Searching…' : emptyText}</p>
            {onQuickCreate && !loading && <p className="text-[11px] text-muted/80">Use the button below to create one.</p>}
          </div>
        ) : filtered.map((o, i) => {
          const isSel = hasValue && o.value === value
          const isHi = i === highlighted
          return (
            <div
              key={String(o.value)}
              role="option"
              aria-selected={isSel}
              data-index={i}
              onMouseMove={onRowMove}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o.value, true)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 transition-colors', sheet ? 'min-h-11 py-2' : 'py-1.5',
                isSel ? 'bg-primary-soft font-semibold text-primary' : isHi ? 'bg-surface-2 text-foreground' : 'text-gray-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {o.badge && <span className="num shrink-0 rounded border bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-zinc-300">{o.badge}</span>}
                <span className="min-w-0">
                  <span className={cn('block truncate text-xs font-medium', isSel ? 'text-primary' : 'text-foreground')}>{o.label || '—'}</span>
                  {o.description && <span className="block truncate text-[11px] font-normal text-muted">{o.description}</span>}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {o.sublabel && <span className="text-xs font-medium text-muted">{o.sublabel}</span>}
                {isSel && <Check className="size-3.5 text-primary" />}
              </div>
            </div>
          )
        })}
        {hasMore && onLoadMore && filtered.length > 0 && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onLoadMore}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium text-primary hover:bg-surface-2">
            {loading ? <Loader2 className="size-3 animate-spin" /> : null}{loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>

      {onQuickCreate && (
        <div className="shrink-0 border-t border-border-subtle bg-gray-50/70 p-1.5 dark:bg-zinc-900/60">
          <button
            ref={createRef}
            type="button"
            tabIndex={-1}
            data-index={createIndex}
            onMouseMove={onRowMove}
            onMouseDown={(e) => e.preventDefault()}
            onClick={create}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-start text-xs font-semibold text-primary transition-colors',
              createActive ? 'bg-primary-soft ring-1 ring-primary/40' : 'hover:bg-primary-soft',
            )}
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">{search.trim() ? `Create "${search.trim()}"` : quickCreateLabel}</span>
          </button>
        </div>
      )}
    </div>
  )
  const dropdown = isOpen && pos && createPortal(
    sheet ? (
      <div className="fixed inset-0 z-[99999] flex flex-col justify-end" data-combobox-sheet="">
        <div className="absolute inset-0 animate-fade-in bg-black/50" onPointerDown={() => close(true)} aria-hidden="true" />
        {panel}
      </div>
    ) : panel,
    document.body,
  )

  return (
    <>
      <div className={cn('relative w-full select-none text-xs', className)} data-select-open={isOpen ? 'true' : 'false'}>
        <button
          ref={buttonRef}
          id={selectId}
          type="button"
          disabled={disabled}
          autoFocus={autoFocus}
          onClick={() => (isOpen ? close(true) : open())}
          onKeyDown={onKeyDown}
          onPointerEnter={onPrefetch}
          onFocus={onPrefetch}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex w-full items-center justify-between gap-2 text-start outline-none transition-colors',
            cell
              ? cn('h-10 px-3', disabled ? 'cursor-not-allowed opacity-40' : isOpen ? 'bg-background' : 'bg-transparent hover:bg-gray-50/70 dark:hover:bg-zinc-800/40')
              : cn(
                'h-9 rounded-md border px-3 text-[13px] focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30',
                disabled ? 'cursor-not-allowed bg-surface text-muted opacity-70'
                  : isOpen ? 'border-primary bg-background ring-1 ring-primary/20'
                    : 'bg-background hover:border-gray-300 dark:hover:border-zinc-600',
                invalid && !isOpen && 'border-danger',
              ),
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {hasValue ? (
              <>
                {shown?.badge && <span className="num shrink-0 rounded border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-zinc-300">{shown.badge}</span>}
                <span className="truncate font-medium text-foreground">{shown?.label ?? String(value)}</span>
                {!cell && shown?.sublabel && <span className="hidden shrink-0 text-[11px] text-muted sm:inline">• {shown.sublabel}</span>}
              </>
            ) : (
              <span className="truncate text-muted/80">{placeholder}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-muted">
            {loading && !isOpen && <Loader2 className="size-3 animate-spin" />}
            {clearable && hasValue && !disabled && (
              <span
                role="button" tabIndex={-1} aria-label="Clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); onChange?.('', null); close(false) }}
                className="rounded p-0.5 hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180 text-primary')} />
          </span>
        </button>
      </div>
      {dropdown}
    </>
  )
}
