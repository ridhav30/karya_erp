import Pager from '../components/Pager.jsx'
import { useState } from 'react'
import { Link } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { KeyRound, Search, UserCog, UserPlus } from 'lucide-react'
import Button from '../components/Button.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader from '../components/PageHeader.jsx'
import LinkField from '../components/fields/LinkField.jsx'
import { useToast } from '../app/toast-context.js'
import { useCall } from '../lib/useCall.js'
import { errorText } from '../lib/errors.js'
import { formatDate } from '../lib/format.js'
import { cn } from '../lib/utils.js'

function UserDialog({ user, profiles, canEmail, onClose, onSaved }) {
  const call = useCall()
  const toast = useToast()
  const isNew = !user
  const [f, setF] = useState(() => ({
    email: user?.name ?? '', full_name: user?.full_name ?? '', mobile_no: user?.mobile_no ?? '', enabled: user ? Boolean(user.enabled) : true,
    profiles: new Set(user?.profiles ?? ['employee']), send_welcome: canEmail, password: '', employee: user?.employee ?? '',
  }))
  const [busy, setBusy] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggle = (key) => setF((x) => { const p = new Set(x.profiles); if (p.has(key)) p.delete(key); else p.add(key); return { ...x, profiles: p } })

  async function save() {
    setBusy('save')
    try {
      await call.post('karya_erp.users.save', {
        email: f.email, full_name: f.full_name, mobile_no: f.mobile_no, enabled: f.enabled ? 1 : 0, profiles: JSON.stringify([...f.profiles]),
        send_welcome: isNew && f.send_welcome && !f.password ? 1 : 0, password: f.password || undefined, employee: f.employee || undefined,
      })
      toast({ tone: 'success', title: isNew ? `${f.full_name} added${f.send_welcome && !f.password ? ' — welcome email sent' : ''}` : 'Access updated' })
      onSaved()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', description: errorText(e) })
    } finally {
      setBusy('')
    }
  }
  async function reset() {
    setBusy('reset')
    try {
      await call.post('karya_erp.users.reset_password', { email: user.name })
      toast({ tone: 'success', title: `Password reset link sent to ${user.name}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Could not send', description: errorText(e) })
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal size="lg" icon={isNew ? UserPlus : UserCog} tone={isNew ? 'emerald' : 'blue'} onClose={onClose}
      title={isNew ? 'Add user' : user.full_name} subtitle={isNew ? 'Login and access for a new person' : user.name}
      bodyClassName="space-y-4"
      footer={<>
          {!isNew && canEmail && <Button icon={KeyRound} onClick={reset} loading={busy === 'reset'} className="me-auto">Send password reset</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy === 'save'} disabled={!f.email || !f.full_name || (isNew && !f.password && !f.send_welcome)}>{isNew ? 'Add user' : 'Save'}</Button>
      </>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5"><span className="label">Full name</span><input className="input" value={f.full_name} onChange={set('full_name')} /></label>
            <label className="space-y-1.5"><span className="label">Email (login)</span><input type="email" className="input" value={f.email} onChange={set('email')} disabled={!isNew} /></label>
            <label className="space-y-1.5"><span className="label">Mobile</span><input className="input" value={f.mobile_no} onChange={set('mobile_no')} /></label>
            <label className="space-y-1.5"><span className="label">Employee record</span><LinkField doctype="Employee" filters={{ status: 'Active' }} value={f.employee} onChange={(v) => setF((x) => ({ ...x, employee: v ?? '' }))} disabled={Boolean(user?.employee)} placeholder="Link to an employee (optional)" /></label>
          </div>

          <div className="space-y-2">
            <span className="label">Access</span>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => (
                <label key={p.key} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-2.5', f.profiles.has(p.key) ? 'border-primary bg-primary-soft/40' : 'hover:bg-surface-2', !p.roles.length && 'opacity-40')}>
                  <input type="checkbox" className="mt-0.5" checked={f.profiles.has(p.key)} onChange={() => toggle(p.key)} disabled={!p.roles.length || (user?.is_me && p.key === 'admin')} />
                  <span><span className="font-medium">{p.label}</span><span className="block text-[11px] text-muted">{p.hint}</span></span>
                </label>
              ))}
            </div>
            {user?.other_roles?.length > 0 && <p className="text-[11px] text-muted">Also has (set in Desk, kept as is): {user.other_roles.join(', ')}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="label">{isNew ? 'Password' : 'New password'}</span><input type="password" autoComplete="new-password" className="input" value={f.password} onChange={set('password')} placeholder={isNew && f.send_welcome ? 'Leave empty to send a welcome email' : 'Leave empty to keep'} /></label>
            <div className="space-y-2 self-end pb-1">
              {isNew && <label className={cn('flex items-center gap-2', !canEmail && 'opacity-50')}><input type="checkbox" checked={f.send_welcome} disabled={!canEmail} onChange={set('send_welcome')} />Email a link to set their own password</label>}
              {!isNew && <label className="flex items-center gap-2"><input type="checkbox" checked={f.enabled} onChange={set('enabled')} disabled={user.is_me} />Login enabled</label>}
            </div>
          </div>
          {!canEmail && isNew && <p className="text-[11px] text-muted">No outgoing email yet (<Link to="/settings?section=email" className="text-primary hover:underline">Settings → Email</Link>) — set a password and give it to the person.</p>}
    </Modal>
  )
}

/** Users & access: invite people and give them job-level access profiles (System Managers). */
export default function Users() {
  const [q, setQ] = useState('')
  const [start, setStart] = useState(0)
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.users.list_users', { q, start }, `users:${q}:${start}`, { revalidateOnFocus: false, keepPreviousData: true })
  const d = data?.message
  const [dlg, setDlg] = useState(null) // { user } | { user: null }
  const label = Object.fromEntries((d?.profiles ?? []).map((p) => [p.key, p.label]))
  const rows = d?.users ?? []

  return (
    <>
      <PageHeader title="Users & access" subtitle="Who can log in and what they can do">
        <Button variant="primary" icon={UserPlus} onClick={() => setDlg({ user: null })} disabled={!d}>Add user</Button>
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
                  <tr key={u.name} onClick={() => setDlg({ user: u })} className="cursor-pointer hover:bg-surface-2/60">
                    <td data-main className="px-4 py-2"><span className="font-medium">{u.full_name}</span>{u.is_me && <span className="ms-1 text-[11px] text-muted">(you)</span>}<span className="block text-[11px] text-muted">{u.name}</span></td>
                    <td data-label="Access" className="px-2 py-2"><div className="flex max-w-[22rem] flex-wrap gap-1">{u.profiles.length ? u.profiles.map((p) => <span key={p} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{label[p]}</span>) : <span className="text-muted">No access</span>}{u.other_roles.length > 0 && <span className="rounded px-1.5 py-0.5 text-[11px] text-muted" title={u.other_roles.join(', ')}>+{u.other_roles.length} roles</span>}</div></td>
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
      {dlg && <UserDialog user={dlg.user} profiles={d.profiles} canEmail={d.can_email} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); mutate() }} />}
    </>
  )
}
