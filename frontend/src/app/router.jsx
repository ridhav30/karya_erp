import { createBrowserRouter } from 'react-router'
import AppShell from '../layout/AppShell.jsx'
import Dashboard from '../pages/Dashboard.jsx'
import ListPage from '../pages/ListPage.jsx'
import DocPage from '../pages/DocPage.jsx'
import Placeholder from '../pages/Placeholder.jsx'
import NotFound from '../pages/NotFound.jsx'
import Import from '../pages/Import.jsx'
import AuditLog from '../pages/AuditLog.jsx'
import Users from '../pages/Users.jsx'
import AccountsDashboard from '../pages/accounts/AccountsDashboard.jsx'
import ChartOfAccounts from '../pages/accounts/ChartOfAccounts.jsx'
import FinancialReports from '../pages/accounts/FinancialReports.jsx'
import ReportPage from '../pages/accounts/ReportPage.jsx'
import VatReturn from '../pages/accounts/VatReturn.jsx'
import PointOfSale from '../pages/sales/PointOfSale.jsx'
import PartyBalances from '../pages/accounts/PartyBalances.jsx'
import PartyPayment from '../pages/accounts/PartyPayment.jsx'
import PartyHistory from '../pages/accounts/PartyHistory.jsx'
import PosSessions from '../pages/sales/PosSessions.jsx'
import PosSession from '../pages/sales/PosSession.jsx'
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
  { path: 'import', element: <Import /> },
  { path: 'audit-log', element: <AuditLog /> },
  { path: 'users', element: <Users /> },
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
