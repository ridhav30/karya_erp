import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { REPORTS, REPORT_GROUPS, VAT_RETURN_CARD } from '../../lib/reports.js'

export default function FinancialReports() {
  const cards = [...REPORTS.map((r) => ({ ...r, to: `/financial-reports/${r.key}` })), VAT_RETURN_CARD]
  return (
    <div className="space-y-6">
      {REPORT_GROUPS.map((group) => (
        <section key={group}>
          <h2 className="mb-3 text-xs font-semibold text-muted">{group}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.filter((c) => c.group === group).map((c) => {
              const Icon = c.icon
              return (
                <Link key={c.key} to={c.to} className="card group flex items-start gap-3 p-4 transition-colors hover:border-gray-300 dark:hover:border-zinc-600">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-surface text-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[13px] font-semibold group-hover:text-primary">
                      {c.title}
                      <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{c.description}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
