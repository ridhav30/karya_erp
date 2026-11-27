import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { ArrowLeft, KeyRound, Save } from 'lucide-react'
import Button from '../components/Button.jsx'
import PageHeader from '../components/PageHeader.jsx'
import PageAccessSection from '../components/PageAccessSection.jsx'
import LinkField from '../components/fields/LinkField.jsx'
import { useToast } from '../app/toast-context.js'
import { useCall } from '../lib/useCall.js'
import { errorText } from '../lib/errors.js'
import { accessToChecked, allowedRoutes, checkedToAccess, hasAnyAccess } from '../lib/pageAccess.js'
import { cn } from '../lib/utils.js'

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))

/** One person on a page of their own (not a dialog): details, job roles, sign-in, then which modules and features they can open. */
export default function UserPage() {
  const { email: param } = useParams()
  const isNew = !param || param === 'new' // the /users/new route has no email parameter
  const navigate = useNavigate()
  const call = useCall()
  const toast = useToast()
  const { data, error, isLoading, mutate } = useFrappeGetCall('karya_erp.users.user_access', isNew ? {} : { email: param }, `user-page:${param}`, { revalidateOnFocus: false })
  const d = data?.message
  const user = d?.user
  const [f, setF] = useState(null)
  const [mode, setMode] = useState('All')
  const [checked, setChecked] = useState(new Set())
  const [busy, setBusy] = useState('')
  // What the chosen job roles allow follows the boxes below as they change (nothing is saved until Save).
  const picked = f ? [...f.profiles].sort() : null
  const { data: live } = useFrappeGetCall('karya_erp.users.role_access', picked ? { profiles: JSON.stringify(picked), other_roles: JSON.stringify(user?.other_roles ?? []) } : undefined, picked ? `role-access:${picked.join(',')}:${param}` : null, { revalidateOnFocus: false, keepPreviousData: true })
  // Fill the form once the person (or the empty form) arrives: adjusting state during render, not in an effect.
  if (d && f === null) {
    setF({
      email: user?.name ?? '', full_name: user?.full_name ?? '', mobile_no: user?.mobile_no ?? '', enabled: user ? Boolean(user.enabled) : true,
      profiles: new Set(user?.profiles ?? ['employee']), send_welcome: d.can_email, password: '', employee: user?.employee ?? '',
    })
    setMode(user?.page_access?.mode === 'Custom' ? 'Custom' : 'All')
    setChecked(accessToChecked(user?.page_access, allowedRoutes(d.access)))
  }

  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{errorText(error)}</div>
  if (isLoading || !d || !f) return <div className="card h-64 animate-pulse" />

  const allowed = allowedRoutes(live?.message ?? d.access)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggleProfile = (key) => setF((x) => { const p = new Set(x.profiles); if (p.has(key)) p.delete(key); else p.add(key); return { ...x, profiles: p } })
  const savedAllowed = allowedRoutes(d.access)
  const savedAccess = JSON.stringify(checkedToAccess(user?.page_access?.mode ?? 'All', accessToChecked(user?.page_access, savedAllowed), savedAllowed))
  const u = user ?? {} // a new person has no saved values to compare with
  const dirty = isNew || savedAccess !== JSON.stringify(checkedToAccess(mode, checked, allowed)) || f.password !== ''
    || f.full_name !== (u.full_name ?? '') || (f.mobile_no ?? '') !== (u.mobile_no ?? '') || f.enabled !== Boolean(u.enabled)
    || (f.employee ?? '') !== (u.employee ?? '') || !sameSet(f.profiles, new Set(u.profiles ?? []))
  const ticked = new Set([...checked].filter((r) => allowed.has(r)))
  const accessOk = mode === 'All' || hasAnyAccess(ticked)
  // Choosing "only chosen features" starts from everything their job roles allow, so the admin unticks what to take away.
  const changeMode = (m) => { setMode(m); if (m === 'Custom' && ticked.size === 0) setChecked(new Set(allowed)) }
  const canSave = dirty && accessOk && f.email && f.full_name && !(isNew && !f.password && !f.send_welcome)

  async function save() {
    setBusy('save')
    try {
      await call.post('karya_erp.users.save', {
        email: f.email, full_name: f.full_name, mobile_no: f.mobile_no, enabled: f.enabled ? 1 : 0, profiles: JSON.stringify([...f.profiles]),
        send_welcome: isNew && f.send_welcome && !f.password ? 1 : 0, password: f.password || undefined, employee: f.employee || undefined,
        page_access: JSON.stringify(checkedToAccess(mode, checked, allowed)),
      })
      toast({ tone: 'success', title: isNew ? `${f.full_name} added${f.send_welcome && !f.password ? ' — welcome email sent' : ''}` : 'Access updated' })
      navigate('/users')
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', description: errorText(e) })
    } finally {
      setBusy('')
    }
  }
  // An administrator made before the profile brought the working roles (accounts, stock, HR …): apply them with one click.
  async function applyAdminRoles() {
    setBusy('roles')
    try {
      await call.post('karya_erp.users.save', { email: u.name, profiles: JSON.stringify(u.profiles) })
      toast({ tone: 'success', title: 'Manager roles applied' })
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not apply the roles', description: errorText(e) })
    } finally {
      setBusy('')
    }
  }
  async function reset() {
    setBusy('reset')
    try {
      await call.post('karya_erp.users.reset_password', { email: u.name })
      toast({ tone: 'success', title: `Password reset link sent to ${u.name}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Could not send', description: errorText(e) })
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHeader title={isNew ? 'Add user' : u.full_name} subtitle={isNew ? 'Login and access for a new person' : u.name}>
        <Link to="/users"><Button icon={ArrowLeft}>Users & access</Button></Link>
        {!isNew && d.can_email && <Button icon={KeyRound} onClick={reset} loading={busy === 'reset'}>Send password reset</Button>}
        <Button variant="primary" icon={Save} loading={busy === 'save'} disabled={!canSave} onClick={save}>{isNew ? 'Add user' : 'Save'}</Button>
      </PageHeader>

      {u.admin_roles_missing?.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span>This administrator can&apos;t open every module yet: they lack {u.admin_roles_missing.join(', ')}. The Administrator profile now includes them.</span>
          <Button size="sm" onClick={applyAdminRoles} loading={busy === 'roles'}>Apply manager roles</Button>
        </div>
      )}

      <section className="card space-y-3 p-4">
        <p className="text-[13px] font-semibold">Details</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5"><span className="label">Full name</span><input className="input" value={f.full_name} onChange={set('full_name')} /></label>
          <label className="space-y-1.5"><span className="label">Email (login)</span><input type="email" className="input" value={f.email} onChange={set('email')} disabled={!isNew} /></label>
          <label className="space-y-1.5"><span className="label">Mobile</span><input className="input" value={f.mobile_no} onChange={set('mobile_no')} /></label>
          <label className="space-y-1.5"><span className="label">Employee record</span><LinkField doctype="Employee" filters={{ status: 'Active' }} value={f.employee} onChange={(v) => setF((x) => ({ ...x, employee: v ?? '' }))} /></label>
        </div>
      </section>

      <section className="card space-y-2 p-4">
        <p className="text-[13px] font-semibold">Job roles</p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {d.profiles.map((p) => (
            <label key={p.key} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-xs', f.profiles.has(p.key) ? 'border-primary bg-primary-soft/40' : 'hover:bg-surface-2', !p.roles.length && 'opacity-50')}>
              <input type="checkbox" className="mt-0.5" checked={f.profiles.has(p.key)} onChange={() => toggleProfile(p.key)} disabled={!p.roles.length || (user?.is_me && p.key === 'admin')} />
              <span><span className="font-medium">{p.label}</span><span className="block text-[11px] text-muted">{p.hint}</span></span>
            </label>
          ))}
        </div>
        {user?.other_roles?.length > 0 && <p className="text-[11px] text-muted">Also has (set in Desk, kept as is): {user.other_roles.join(', ')}</p>}
      </section>

      <section className="card space-y-3 p-4">
        <p className="text-[13px] font-semibold">Sign-in</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="label">{isNew ? 'Password' : 'New password'}</span><input type="password" autoComplete="new-password" className="input" value={f.password} onChange={set('password')} placeholder={isNew ? '' : 'Leave empty to keep'} /></label>
          <div className="space-y-2 self-end pb-1">
            {isNew && <label className={cn('flex items-center gap-2 text-xs', !d.can_email && 'opacity-50')}><input type="checkbox" checked={f.send_welcome} disabled={!d.can_email} onChange={set('send_welcome')} />Email a link to set their own password</label>}
            {!isNew && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.enabled} onChange={set('enabled')} disabled={Boolean(u.is_me)} />Login enabled</label>}
          </div>
        </div>
        {!d.can_email && isNew && <p className="text-[11px] text-muted">No outgoing email yet (<Link to="/settings?section=email" className="text-primary hover:underline">Settings → Email</Link>): set a password for them.</p>}
      </section>

      <PageAccessSection mode={mode} checked={ticked} onMode={changeMode} onChecked={setChecked} allowed={allowed} />
    </>
  )
}
