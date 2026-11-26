import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { ChevronDown, ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { useBoot } from '../app/boot-context.js'
import { t } from '../lib/i18n.js'
import { useDashboard } from '../lib/useDashboard.js'
import { visibleNav } from '../lib/nav.js'
import { cn } from '../lib/utils.js'

function NavItem({ item, collapsed, nested, count }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? t(item.label) : undefined}
      className={({ isActive }) => cn(
        'pressable group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] md:h-8.5',
        nested && !collapsed && 'h-9 text-[13px] md:h-8',
        collapsed && 'h-10 justify-center px-0',
        isActive
          ? 'bg-sidebar-active font-medium text-sidebar-strong before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-brand-mark [&_svg]:text-brand-mark'
          : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-strong active:bg-sidebar-active [&_svg]:text-sidebar-muted hover:[&_svg]:text-sidebar-text',
      )}
    >
      {(!nested || collapsed) && <Icon className="size-4 shrink-0" />}
      {!collapsed && <span className="truncate">{t(item.label)}</span>}
      {!collapsed && count > 0 && (
        <span className="num ms-auto rounded-full bg-sidebar-strong px-1.5 text-[10px] font-semibold leading-4 text-sidebar">
          {count > 99 ? '99+' : count}
        </span>
      )}
      {collapsed && count > 0 && <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-danger" />}
    </NavLink>
  )
}

function NavGroup({ group, collapsed }) {
  const { pathname } = useLocation()
  const hasActive = group.items.some((i) => pathname === i.to || pathname.startsWith(i.to + '/'))
  // Closed by default; the group holding the current page opens. A manual toggle
  // holds until the user moves to a page in / out of this group.
  const [manual, setManual] = useState(null)
  const [wasActive, setWasActive] = useState(hasActive)
  if (wasActive !== hasActive) {
    setWasActive(hasActive)
    setManual(null)
  }
  const isOpen = manual ?? hasActive
  const Icon = group.icon

  if (collapsed) {
    return (
      <div className="space-y-0.5 border-t border-sidebar-line pt-2 first:border-t-0">
        {group.items.map((i) => <NavItem key={i.to} item={i} collapsed />)}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setManual(!isOpen)}
        aria-expanded={isOpen}
        className={cn(
          'pressable mt-1.5 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium hover:bg-sidebar-hover md:h-8.5',
          hasActive ? 'text-sidebar-strong' : 'text-sidebar-text',
        )}
      >
        <Icon className={cn('size-4 shrink-0', hasActive ? 'text-brand-mark' : 'text-sidebar-muted')} />
        <span className="truncate">{t(group.label)}</span>
        <ChevronDown className={cn('ms-auto size-3.5 shrink-0 text-sidebar-muted transition-transform duration-200', !isOpen && '-rotate-90')} />
      </button>
      <div className="collapse-grid" data-open={isOpen} inert={!isOpen}>
        <div>
          <div className="mb-1 ms-[17px] mt-0.5 space-y-0.5 border-s border-sidebar-line ps-2">
            {group.items.map((i) => <NavItem key={i.to} item={i} nested />)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ collapsed, onToggleCollapse, onClose }) {
  const boot = useBoot()
  const { data: counts } = useDashboard()
  const nav = visibleNav(boot)

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn('flex h-(--topbar-height) items-center gap-3 border-b border-sidebar-line px-4', collapsed && 'justify-center px-0')}>
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-mark text-sm font-bold text-brand-mark-foreground">
          {(boot.company || 'M').trim().charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="flex min-w-0 animate-fade-in flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-sidebar-strong">{boot.company || 'Karya Erp'}</span>
            <span className="truncate text-[11.5px] text-sidebar-muted">{boot.company ? 'Karya Erp' : 'No company set'}</span>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="pressable ms-auto grid size-9 place-items-center rounded-lg text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-strong" aria-label="Close menu">
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Menu */}
      <nav className={cn('scroll-thin sidebar-scroll flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden overscroll-contain py-3', collapsed ? 'px-2' : 'px-2.5')}>
        {nav.map((g) => g.items
          ? <NavGroup key={g.label} group={g} collapsed={collapsed} />
          : <NavItem key={g.to} item={g} collapsed={collapsed} count={g.badge ? counts?.[g.badge] : 0} />)}
      </nav>

      {/* Footer */}
      <div className={cn('space-y-0.5 border-t border-sidebar-line bg-sidebar-footer p-2 safe-b', !collapsed && 'px-2.5')}>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? t('Expand') : t('Collapse')}
            className={cn(
              'pressable flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-strong',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <ChevronsRight className="size-4 rtl:rotate-180" /> : <ChevronsLeft className="size-4 rtl:rotate-180" />}
            {!collapsed && t('Collapse')}
          </button>
        )}
      </div>
    </div>
  )
}
