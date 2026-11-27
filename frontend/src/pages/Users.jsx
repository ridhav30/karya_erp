import Pager from '../components/Pager.jsx'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Search, UserPlus } from 'lucide-react'
import Button from '../components/Button.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { errorText } from '../lib/errors.js'
import { formatDate } from '../lib/format.js'
import { cn } from '../lib/utils.js'

/** Users & access: the people, their job roles and page access. Each person opens on a page of their own (System Managers). */
export default function Users() {
  const [q, setQ] = useState('')
  const [start, setStart] = useState(0)
  const { data, error, isLoading } = useFrappeGetCall('karya_erp.users.list_users', { q, start }, `users:${q}:${start}`, { revalidateOnFocus: false, keepPreviousData: true })
  const d = data?.message
  const navigate = useNavigate()
  const label = Object.fromEntries((d?.profiles ?? []).map((p) => [p.key, p.label]))
  const rows = d?.users ?? []

  return (
    <>
      <PageHeader title="Users & access" subtitle="Who can log in and what they can do">
        <Button variant="primary" icon={UserPlus} onClick={() => navigate('/users/new')} disabled={!d}>Add user</Button>
      </PageHeader>
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error)}</div> : isLoading || !d ? <div className="card h-64 animate-pulse" /> : (
        <section className="card overflow-hidden">
          <div className="dt-bar">
            <div className="relative w-64 max-w-full"><Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><input className="input ps-8" value={q} onChange={(e) => { setQ(e.target.value); setStart(0) }} placeholder="Search users" /></div>
            <span className="text-xs text-muted">{d.active} active · {d.total} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="rt w-full md:min-w-[720px] text-xs">
              <thead><tr className="border-b text-start text-muted"><th className="px-4 py-2 font-medium">User</th><th className="px-2 py-2 font-medium">Access</th><th className="px-2 py-2 font-medium">Employee</th><th className="px-2 py-2 font-medium">Last login</th><th className="px-4 py-2 font-medium">Status</th></tr></thead>
              <tbody className="divide-y">
                {rows.map((u) => (
                  <tr key={u.name} onClick={() => navigate(`/users/${encodeURIComponent(u.name)}`)} className="cursor-pointer hover:bg-surface-2/60">
                    <td data-main className="px-4 py-2"><span className="font-medium">{u.full_name}</span>{u.is_me && <span className="ms-1 text-[11px] text-muted">(you)</span>}<span className="block text-[11px] text-muted">{u.name}</span></td>
                    <td data-label="Access" className="px-2 py-2"><div className="flex max-w-[22rem] flex-wrap gap-1">{u.profiles.length ? u.profiles.map((p) => <span key={p} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{label[p]}</span>) : <span className="text-muted">No access</span>}{u.other_roles.length > 0 && <span className="rounded px-1.5 py-0.5 text-[11px] text-muted" title={u.other_roles.join(', ')}>+{u.other_roles.length} roles</span>}<Link to={`/users/${encodeURIComponent(u.name)}/access`} onClick={(e) => e.stopPropagation()} className={cn('rounded border px-1.5 py-0.5 text-[11px]', u.page_access?.mode === 'Custom' ? 'border-primary/40 text-primary' : 'border-dashed text-muted hover:text-foreground')} title={u.page_access?.mode === 'Custom' ? `Modules: ${u.page_access.modules.join(', ') || 'none'} · Pages: ${u.page_access.pages.length}` : 'Limit which modules and pages this person can open'}>{u.page_access?.mode === 'Custom' ? 'Limited pages' : 'All pages'}</Link></div></td>
                    <td data-label="Employee" className="px-2 py-2">{u.employee ? <Link to={`/employees/${encodeURIComponent(u.employee)}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{u.employee_name}</Link> : <span className="text-muted">—</span>}</td>
                    <td data-label="Last login" className="px-2 py-2 text-muted">{u.last_login ? formatDate(u.last_login.slice(0, 10)) : 'never'}</td>
                    <td data-label="Status" className="px-4 py-2"><span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', u.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-surface-2 text-muted')}>{u.enabled ? 'Active' : 'Disabled'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="p-8 text-center text-xs text-muted">No users found.</p>}
          </div>
          <Pager start={d.start} pageLength={d.page_length} total={d.total} onChange={setStart} />
        </section>
      )}
    </>
  )
}
