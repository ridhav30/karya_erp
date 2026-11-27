import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router'
import { Spinner } from '../components/Spinner.jsx'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import MobileTabBar from './MobileTabBar.jsx'
import { QuickCreateProvider } from '../app/QuickCreateProvider.jsx'
import { cn } from '../lib/utils.js'

const KEY = 'karya_erp_sidebar_collapsed'

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const matches = useMatches()
  // Animate when the page (route) changes, not when /sales-orders/new becomes /sales-orders/SO-0001.
  const routeKey = matches[matches.length - 1]?.id ?? pathname
  const mainRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])

  // Close the mobile drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setMobileOpen(false)
  }

  // <main> is the scroll container, so a new page must start at the top.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  // Lock page scroll while the drawer is open; Escape closes it.
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc) }
  }, [mobileOpen])

  return (
    <QuickCreateProvider>
    <div className="flex h-dvh overflow-hidden bg-canvas selection:bg-primary selection:text-white">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 select-none border-e border-sidebar-line bg-sidebar transition-[width] duration-200 ease-(--ease-out-soft) lg:block',
          collapsed ? 'w-(--sidebar-collapsed)' : 'w-(--sidebar-width)',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      {/* Mobile drawer: always mounted so it can slide in and out */}
      <div role="dialog" aria-modal={mobileOpen ? 'true' : 'false'} aria-label="Menu" className={cn('fixed inset-0 z-[100] lg:hidden', !mobileOpen && 'pointer-events-none')} inert={!mobileOpen}>
        <div
          className={cn(
            'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 dark:bg-black/75',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 start-0 w-[min(19rem,86vw)] select-none border-e border-sidebar-line bg-sidebar transition-transform duration-200 ease-(--ease-out-soft)',
            mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
          )}
        >
          <Sidebar collapsed={false} onClose={() => setMobileOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main ref={mainRef} className="scroll-area relative flex-1 overflow-x-hidden">
          {/* Keyed by route: each page fades up on navigation */}
          <div key={routeKey} className="w-full animate-page-in space-y-4 p-3 sm:p-6">
            <Suspense fallback={<div className="flex justify-center py-20"><Spinner className="size-5 text-primary" /></div>}><Outlet /></Suspense>
          </div>
        </main>
        <MobileTabBar onMenu={() => setMobileOpen(true)} />
      </div>
    </div>
    </QuickCreateProvider>
  )
}
