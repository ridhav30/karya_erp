import { NavLink } from 'react-router'
import { Home, Menu, Plus, Search } from 'lucide-react'
import { t } from '../lib/i18n.js'
import { cn } from '../lib/utils.js'

const fire = (name) => window.dispatchEvent(new Event(name))

/** Phone navigation: the four things you reach for most, in thumb range. Hidden from lg up, where the sidebar takes over. */
export default function MobileTabBar({ onMenu }) {
  const tab = 'pressable flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium'
  return (
    <nav aria-label="Main" className="safe-b z-20 shrink-0 border-t bg-background/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex h-(--tabbar-height) max-w-lg items-stretch px-2">
        <NavLink to="/" end className={({ isActive }) => cn(tab, isActive ? 'text-primary' : 'text-muted')}>
          <Home className="size-5" />{t('Home')}
        </NavLink>
        <button type="button" onClick={() => fire('master:search')} className={cn(tab, 'text-muted')}>
          <Search className="size-5" />{t('Search')}
        </button>
        <button type="button" onClick={() => fire('master:create')} className={cn(tab, 'text-foreground')} aria-label={t('Create new')}>
          <span className="grid size-10 place-items-center rounded-2xl bg-strong text-strong-foreground"><Plus className="size-5" /></span>
        </button>
        <button type="button" onClick={onMenu} className={cn(tab, 'text-muted')}>
          <Menu className="size-5" />{t('Menu')}
        </button>
      </div>
    </nav>
  )
}
