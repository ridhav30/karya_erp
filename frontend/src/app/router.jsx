/* eslint-disable react-refresh/only-export-components -- the router builds lazy page components and exports only the router itself */
import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import AppShell from '../layout/AppShell.jsx'
import Dashboard from '../pages/Dashboard.jsx'
import ListPage from '../pages/ListPage.jsx'
import DocPage from '../pages/DocPage.jsx'
import Placeholder from '../pages/Placeholder.jsx'
import NotFound from '../pages/NotFound.jsx'
// Hand-built pages load when first opened, so the first screen does not download the whole app.
const MyHR = lazy(() => import('../pages/hr/MyHR.jsx'))
const HRDashboard = lazy(() => import('../pages/hr/HRDashboard.jsx'))
const FinalSettlement = lazy(() => import('../pages/hr/FinalSettlement.jsx'))
const Settings = lazy(() => import('../pages/Settings.jsx'))
const Import = lazy(() => import('../pages/Import.jsx'))
const AuditLog = lazy(() => import('../pages/AuditLog.jsx'))
const Users = lazy(() => import('../pages/Users.jsx'))
const UserPage = lazy(() => import('../pages/UserPage.jsx'))
const AccountsDashboard = lazy(() => import('../pages/accounts/AccountsDashboard.jsx'))
const ChartOfAccounts = lazy(() => import('../pages/accounts/ChartOfAccounts.jsx'))
const FinancialReports = lazy(() => import('../pages/accounts/FinancialReports.jsx'))
const ReportPage = lazy(() => import('../pages/accounts/ReportPage.jsx'))
const VatReturn = lazy(() => import('../pages/accounts/VatReturn.jsx'))
const PointOfSale = lazy(() => import('../pages/sales/PointOfSale.jsx'))
const PartyBalances = lazy(() => import('../pages/accounts/PartyBalances.jsx'))
const PartyPayment = lazy(() => import('../pages/accounts/PartyPayment.jsx'))
const PartyHistory = lazy(() => import('../pages/accounts/PartyHistory.jsx'))
const PosSessions = lazy(() => import('../pages/sales/PosSessions.jsx'))
const PosSession = lazy(() => import('../pages/sales/PosSession.jsx'))
import { NAV } from '../lib/nav.js'
import { DOCTYPES } from '../lib/doctypes.js'

// Generic list + document pages for every configured doctype.
const doctypeRoutes = Object.entries(DOCTYPES).flatMap(([slug, config]) => {
  // config.listView: a custom page instead of the generic ListPage.
  const list = config.listView === 'chart-of-accounts'
    ? <ChartOfAccounts key={slug} />
    : <ListPage key={slug} slug={slug} config={config} />
  return [
    { path: slug, element: list },
    ...(config.noDocPage ? [] : [{ path: `${slug}/:name`, element: <DocPage key={slug} slug={slug} config={config} /> }]),
  ]
})

// Hand-built pages.
const customRoutes = [
  { path: 'my-hr', element: <MyHR /> },
  { path: 'employee', element: <MyHR /> }, // the address employees sign in at (see the login page); once signed in it is their My HR
  { path: 'hr-dashboard', element: <HRDashboard /> },
  { path: 'final-settlement', element: <FinalSettlement /> },
  { path: 'holidays', element: <Settings only="holidays" /> },
  { path: 'import', element: <Import /> },
  { path: 'audit-log', element: <AuditLog /> },
  { path: 'users', element: <Users /> },
  { path: 'users/new', element: <UserPage /> },
  { path: 'users/:email', element: <UserPage /> },
  { path: 'pos', element: <PosSessions /> },
  { path: 'pos/screen', element: <PointOfSale /> },
  { path: 'pos/session/:name', element: <PosSession /> },
  { path: 'accounts', element: <AccountsDashboard /> },
  { path: 'financial-reports', element: <FinancialReports /> },
  { path: 'general-ledger', element: <ReportPage key="general-ledger" reportKey="general-ledger" /> },
  { path: 'financial-reports/:report', element: <ReportPage /> },
  { path: 'receivable', element: <PartyBalances side="receive" /> },
  { path: 'receive', element: <PartyPayment side="receive" /> },
  { path: 'receive/:party', element: <PartyPayment side="receive" /> },
  { path: 'receivable-history', element: <PartyHistory side="receive" /> },
  { path: 'payable', element: <PartyBalances side="pay" /> },
  { path: 'pay', element: <PartyPayment side="pay" /> },
  { path: 'pay/:party', element: <PartyPayment side="pay" /> },
  { path: 'payable-history', element: <PartyHistory side="pay" /> },
  { path: 'vat-return', element: <VatReturn /> },
]
const CUSTOM = new Set(customRoutes.map((r) => r.path.split('/')[0]))

// Menu entries not built yet get a placeholder.
const placeholderRoutes = NAV.flatMap((g) => g.items ?? [g])
  .filter((i) => i.to && i.to !== '/' && !DOCTYPES[i.to.slice(1)] && !CUSTOM.has(i.to.slice(1).split('/')[0]))
  .map((i) => ({ path: `${i.to.slice(1)}/*`, element: <Placeholder title={i.label} doctype={i.doctype} /> }))

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <Dashboard /> },
        ...doctypeRoutes,
        ...customRoutes,
        ...placeholderRoutes,
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.DEV ? '/' : '/karya_erp' },
)
