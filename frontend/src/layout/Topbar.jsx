import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Building2, ChevronRight, Download, FilePlus2, LogOut, MapPin, Moon, Plus, Search, Settings, Share, Smartphone, SquarePlus, Sun, Zap } from 'lucide-react'
import { useQuickCreate } from '../app/quick-create-context.js'
import { QUICK_CREATE } from '../lib/quickCreate.js'
import { DOCTYPES } from '../lib/doctypes.js'
import { useBoot } from '../app/boot-context.js'
import { useTheme } from '../app/theme-context.js'
import { findNav } from '../lib/nav.js'
import { reportByKey } from '../lib/reports.js'
import { initials } from '../lib/format.js'
import { logout } from '../lib/api.js'
import { LANGS, getLang, setLang, t } from '../lib/i18n.js'
import { useCall } from '../lib/useCall.js'
import { promptInstall, useInstallMode } from '../lib/pwa.js'
import Modal from '../components/Modal.jsx'
import Combobox from '../components/fields/Combobox.jsx'
import Button from '../components/Button.jsx'
import CommandPalette from '../components/CommandPalette.jsx'
import NotificationsMenu from '../components/NotificationsMenu.jsx'
import { ChatMenu } from '../lib/chatAddon.js'

function IconButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`pressable relative grid size-9 place-items-center rounded-lg border border-transparent text-muted hover:bg-surface-2 hover:text-foreground ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** "SELLING  Sales Orders / SAL-ORD-0001" — module small caps, page title bold. */
function Breadcrumbs() {
  const { pathname } = useLocation()
  const match = findNav(pathname)
  const module = t(match?.group?.label)
  const page = t(match?.item?.label ?? 'Not found')
  let rest = match?.item && pathname.length > match.item.to.length ? decodeURIComponent(pathname.slice(match.item.to.length + 1)) : null
  if (rest && match.item.to === '/financial-reports') rest = reportByKey(rest)?.title ?? rest
  if (rest && match.item.to === '/users') rest = rest === 'new' ? 'Add user' : rest.replace(/\/access$/, '')

  return (
    <nav className="flex min-w-0 items-baseline gap-2" aria-label="Breadcrumb">
      {module && <span className="hidden truncate text-[13px] text-muted sm:inline">{module}</span>}
      {module && <ChevronRight className="hidden size-3 shrink-0 self-center text-gray-300 sm:block dark:text-zinc-600 rtl:rotate-180" />}
      {rest ? (
        <>
          <Link to={match.item.to} className="hidden truncate text-sm text-muted hover:text-foreground sm:inline">{page}</Link>
          <ChevronRight className="hidden size-3 shrink-0 self-center text-muted sm:block rtl:rotate-180" />
          <span className={`truncate text-sm font-semibold ${rest === 'new' ? '' : 'num'}`}>{rest === 'new' ? (getLang() === 'ar' ? `${page} — ${t('New')}` : `New ${page.replace(/s$/, '')}`) : rest}</span>
        </>
      ) : (
        <span className="truncate text-[15px] font-semibold tracking-tight">{page}</span>
      )}
    </nav>
  )
}

const NEW_DOCS = ['quotations', 'sales-orders', 'sales-invoices', 'material-requests', 'purchase-orders', 'purchase-invoices', 'stock-entries', 'payments', 'journal-entries']

/** "+" menu: popups for masters, full forms for transactions. */
function CreateMenu() {
  const boot = useBoot()
  const quick = useQuickCreate()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('master:create', show)
    return () => window.removeEventListener('master:create', show)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const canCreate = boot.can_create ?? boot.can_read ?? {}
  const masters = Object.keys(QUICK_CREATE).filter((dt) => canCreate[dt])
  const docs = NEW_DOCS.filter((slug) => DOCTYPES[slug] && canCreate[DOCTYPES[slug].doctype])
  const item = 'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-start transition-colors hover:bg-surface-2'
  if (!masters.length && !docs.length) return null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Create new"
        aria-haspopup="menu" aria-expanded={open}
        className="hidden"
      >
        <Plus className={`size-4 transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-30 mt-2 w-60 origin-top-right rtl:origin-top-left animate-pop-in rounded-lg border bg-background p-1 text-xs">
          {masters.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted">{t('Quick create')}</div>
              {masters.map((dt) => (
                <button key={dt} type="button" className={item} onClick={() => { setOpen(false); quick.openQuickCreate({ doctype: dt }) }}>
                  <Zap className="size-3.5 text-amber-500" /> {dt}
                </button>
              ))}
            </>
          )}
          {docs.length > 0 && (
            <>
              <div className="mt-1 border-t px-2.5 pb-1 pt-2 text-xs font-semibold text-muted">{t('New document')}</div>
              {docs.map((slug) => (
                <button key={slug} type="button" className={item} onClick={() => { setOpen(false); navigate(`/${slug}/new`) }}>
                  <FilePlus2 className="size-3.5 text-primary" /> {DOCTYPES[slug].single}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const boot = useBoot()
  const call = useCall()
  const lang = getLang()
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [switching, setSwitching] = useState(false)
  const install = useInstallMode()
  const ref = useRef(null)

  // Save the working company / branch, then reload so every screen, total and default follows it.
  const switchScope = async (scope) => {
    setSwitching(true)
    try {
      await call.post('karya_erp.api.set_scope', scope)
      window.location.reload()
    } catch {
      setSwitching(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-combobox-dropdown]')) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pressable flex items-center gap-2 rounded-md p-1 hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {boot.user_image
          ? <img src={boot.user_image} alt="" className="size-7 rounded-full object-cover" />
          : <span className="grid size-7 place-items-center rounded-md border border-gray-700 bg-gray-900 text-[10px] font-bold text-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{initials(boot.full_name)}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-30 mt-2 w-60 origin-top-right rtl:origin-top-left animate-pop-in rounded-lg border bg-background p-1 text-xs">
          <div className="border-b px-3 py-2">
            <div className="truncate font-semibold">{boot.full_name}</div>
            <div className="num truncate text-[10px] text-muted">{boot.user}</div>
          </div>
          {((boot.companies?.length ?? 0) > 1 || (boot.branches?.length ?? 0) > 0) && (
            <div className="space-y-1.5 border-t px-3 py-2">
              {(boot.companies?.length ?? 0) > 1 && (
                <div className="flex items-center gap-2">
                  <Building2 className="size-3.5 shrink-0 text-muted" />
                  <Combobox className="min-w-0 flex-1" options={boot.companies} value={boot.company || ''} disabled={switching} placeholder={t('Company')}
                    onChange={(v) => v && v !== boot.company && switchScope({ company: v })} />
                </div>
              )}
              {(boot.branches?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 shrink-0 text-muted" />
                  <Combobox className="min-w-0 flex-1" options={boot.branches} value={boot.branch || ''} disabled={switching} clearable placeholder={t('All branches')}
                    onChange={(v) => (v || '') !== (boot.branch || '') && switchScope({ branch: v || '' })} />
                </div>
              )}
            </div>
          )}
          <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-surface-2">
            <Settings className="size-3.5 text-muted" /> {t('My settings')}
          </Link>
          {install !== 'none' && (
            <button type="button" onClick={() => { setOpen(false); install === 'prompt' ? promptInstall() : setHelp(true) }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 hover:bg-surface-2">
              <Download className="size-3.5 text-muted" /> {t('Install app')}
            </button>
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-muted">{t('Language')}</span>
            <div className="inline-flex rounded-md border bg-surface-2 p-0.5 dark:bg-zinc-900">
              {LANGS.map((l) => (
                <button key={l.code} type="button" onClick={() => l.code !== lang && setLang(l.code, call)}
                  className={`rounded px-2 py-0.5 text-[11px] ${l.code === lang ? 'bg-background font-semibold dark:bg-zinc-800' : 'text-muted hover:text-foreground'}`}>{l.label}</button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-danger hover:bg-surface-2"
          >
            <LogOut className="size-3.5" /> {t('Log out')}
          </button>
        </div>
      )}
      {help && (
        <Modal size="sm" icon={Smartphone} tone="blue" title="Install Karya Erp" subtitle="Add it to your iPhone or iPad home screen" onClose={() => setHelp(false)}
          footer={<Button variant="primary" onClick={() => setHelp(false)}>Got it</Button>}>
          <ol className="space-y-3 text-xs">
            <li className="flex items-start gap-2.5"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">1</span><span>{t('Open this page in Safari.')}</span></li>
            <li className="flex items-start gap-2.5"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">2</span><span className="flex flex-wrap items-center gap-1">{t('Tap the Share button')} <Share className="size-4 text-primary" /></span></li>
            <li className="flex items-start gap-2.5"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">3</span><span className="flex flex-wrap items-center gap-1">{t('Choose “Add to Home Screen”')} <SquarePlus className="size-4 text-primary" /></span></li>
            <li className="flex items-start gap-2.5"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">4</span><span>{t('Tap Add. Karya Erp now opens full-screen from its own icon.')}</span></li>
          </ol>
        </Modal>
      )}
    </div>
  )
}

export default function Topbar() {
  const { theme, toggleTheme } = useTheme()
  const [searching, setSearching] = useState(false)

  // Ctrl+K / ⌘K opens global search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching((s) => !s) }
    }
    const open = () => setSearching(true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('master:search', open)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('master:search', open) }
  }, [])

  return (
    <header className="z-10 flex h-13 shrink-0 select-none items-center gap-2 border-b bg-topbar px-3 backdrop-blur-md md:h-(--topbar-height) md:px-6">
      <Breadcrumbs />

      <div className="ms-auto me-2 hidden w-72 md:flex">
        <button
          type="button" onClick={() => setSearching(true)} title="Search (Ctrl K)"
          className="relative flex h-9 w-full items-center gap-2 rounded-lg border bg-background ps-2.5 pe-2 text-xs text-muted transition-colors hover:border-gray-300 hover:text-foreground dark:bg-zinc-900/60 dark:hover:border-zinc-600"
        >
          <Search className="size-3.5" />
          <span>Search…</span>
          <kbd className="num ms-auto rounded border bg-surface-2 px-1 py-0.5 text-[9px]">Ctrl K</kbd>
        </button>
      </div>
      <CommandPalette open={searching} onClose={() => setSearching(false)} />

      <div className="ms-auto flex shrink-0 items-center gap-1 md:ms-0 md:gap-1.5">
        <CreateMenu />
        <IconButton onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark'
            ? <Sun key="sun" className="size-4 animate-icon-swap text-amber-400" />
            : <Moon key="moon" className="size-4 animate-icon-swap text-gray-600" />}
        </IconButton>

        <ChatMenu />
        <NotificationsMenu />

        <UserMenu />
      </div>
    </header>
  )
}
