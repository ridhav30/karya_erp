import { useState } from 'react'
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk'
import Button from '../components/Button.jsx'
import Select from '../components/fields/Select.jsx'
import { logout } from '../lib/api.js'

const abbr = (name) => (name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 5) || name.slice(0, 3)).toUpperCase()

/** First run: ERPNext has no company yet. Same steps as the Desk setup wizard, in one screen. */
export default function Setup({ boot, onDone }) {
  const [country, setCountry] = useState('')
  const { data } = useFrappeGetCall('karya_erp.company_setup.options', { country: country || undefined }, `setup:${country}`, { revalidateOnFocus: false, keepPreviousData: true })
  const { call, loading, error } = useFrappePostCall('karya_erp.company_setup.complete')
  const o = data?.message
  const [f, setF] = useState({ company_name: '', company_abbr: '', currency: '', timezone: '', fy_start_date: '', fy_end_date: '', chart_of_accounts: '' })
  const [touched, setTouched] = useState({})
  const set = (k) => (e) => { setTouched((t) => ({ ...t, [k]: true })); setF((s) => ({ ...s, [k]: e.target.value })) }
  // Suggestions from the chosen country; whatever the person typed or picked wins.
  const v = {
    ...f,
    company_abbr: touched.company_abbr ? f.company_abbr : abbr(f.company_name),
    currency: touched.currency ? f.currency : o?.currency || f.currency,
    timezone: touched.timezone ? f.timezone : o?.timezone || f.timezone,
    fy_start_date: touched.fy_start_date ? f.fy_start_date : o?.fy_start_date || '',
    fy_end_date: touched.fy_end_date ? f.fy_end_date : o?.fy_end_date || '',
    chart_of_accounts: touched.chart_of_accounts ? f.chart_of_accounts : (o?.charts?.includes('Standard with Numbers') ? 'Standard with Numbers' : o?.charts?.[0]) || f.chart_of_accounts,
  }
  const [err, setErr] = useState('')

  if (!boot.is_system_manager) {
    return (
      <div className="grid min-h-full place-items-center bg-canvas p-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold">Setup isn’t finished yet</h1>
          <p className="mt-2 text-sm text-muted">No company exists on this site. Ask an administrator to sign in and complete the setup.</p>
          <Button className="mt-4" onClick={logout}>Sign out</Button>
        </div>
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    try {
      await call({ ...v, country })
      onDone()
    } catch (x) {
      setErr(x?.message || x?._server_messages || 'Setup failed')
    }
  }

  const field = 'block space-y-1.5'
  return (
    <div className="grid min-h-full place-items-center overflow-y-auto bg-canvas p-4">
      <div className="w-full max-w-xl animate-page-in py-6">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-lg bg-brand-mark text-base font-bold text-brand-mark-foreground">{(boot.site || 'M').charAt(0).toUpperCase()}</div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Set up your company</h1>
          <p className="mt-1 text-xs text-muted">Welcome{boot.full_name ? `, ${boot.full_name}` : ''}. This creates your company, chart of accounts and fiscal year. You can change most of it later in Settings.</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <label className={field}>
            <span className="label">Company name</span>
            <input className="input" value={f.company_name} onChange={set('company_name')} autoFocus required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field}>
              <span className="label">Abbreviation</span>
              <input className="input" value={v.company_abbr} onChange={set('company_abbr')} maxLength={10} required />
            </label>
            <label className={field}>
              <span className="label">Country</span>
              <Select value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Select country">
                <option value="">Select country</option>
                {(o?.countries || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </label>
            <label className={field}>
              <span className="label">Currency</span>
              <Select value={v.currency} onChange={set('currency')} placeholder="Select currency">
                <option value="">Select currency</option>
                {(o?.currencies || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </label>
            <label className={field}>
              <span className="label">Time zone</span>
              <Select value={v.timezone} onChange={set('timezone')} placeholder="Select time zone">
                <option value="">Select time zone</option>
                {(o?.timezones || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </label>
            <label className={field}>
              <span className="label">Fiscal year starts</span>
              <input className="input" type="date" value={v.fy_start_date} onChange={set('fy_start_date')} required />
            </label>
            <label className={field}>
              <span className="label">Fiscal year ends</span>
              <input className="input" type="date" value={v.fy_end_date} onChange={set('fy_end_date')} required />
            </label>
          </div>
          <label className={field}>
            <span className="label">Chart of accounts</span>
            <Select value={v.chart_of_accounts} onChange={set('chart_of_accounts')} placeholder="Select a chart">
              {!country && <option value="">Choose a country first</option>}
              {(o?.charts || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </label>

          {(err || error) && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err || error.message}</p>}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" className="text-xs text-muted hover:text-foreground" onClick={logout}>Sign out</button>
            <Button type="submit" variant="primary" loading={loading} disabled={!country || !v.currency || !f.company_name.trim()}>
              {loading ? 'Setting up… about a minute' : 'Create company'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
