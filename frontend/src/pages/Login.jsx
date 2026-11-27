import { useState } from 'react'
import { Eye, EyeOff, Loader2, Moon, Sun, UserRound } from 'lucide-react'
import { login } from '../lib/api.js'
import { useTheme } from '../app/theme-context.js'
import { leaveEmployeePortal } from '../lib/portal.js'

// Employees have a sign-in address of their own: <app>/employee. It signs in and opens My HR (attendance, leave, payslips, expenses).
const HERE = window.location.pathname.replace(/\/+$/, '')
const EMPLOYEE_LOGIN = /\/employee$/.test(HERE)
const BASE = import.meta.env.DEV ? '' : `/${HERE.split('/')[1] ?? ''}` // the app's own address prefix (the router's basename)

export default function Login() {
  const { theme, toggleTheme } = useTheme()
  const [usr, setUsr] = useState('')
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (!EMPLOYEE_LOGIN) leaveEmployeePortal() // the staff sign-in is the full menu
      await login(usr.trim(), pwd)
    } catch (err) {
      setError(err.message || 'Login failed')
      setBusy(false)
    }
  }


  return (
    <div className="relative grid min-h-full place-items-center bg-canvas p-4">
      <button
        type="button"
        onClick={toggleTheme}
        className="pressable absolute end-4 top-4 grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
        aria-label="Toggle theme"
      >
        {theme === 'dark'
          ? <Sun key="sun" className="size-4.5 animate-icon-swap text-amber-400" />
          : <Moon key="moon" className="size-4.5 animate-icon-swap" />}
      </button>

      <div className="w-full max-w-sm animate-page-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid size-10 place-items-center rounded-lg bg-brand-mark text-base font-bold text-brand-mark-foreground">{EMPLOYEE_LOGIN ? <UserRound className="size-5" /> : 'M'}</div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">{EMPLOYEE_LOGIN ? 'Employee sign-in' : 'Sign in to Karya Erp'}</h1>
          <p className="mt-1 text-xs text-muted">{EMPLOYEE_LOGIN ? 'Your attendance, leave, payslips and expenses' : 'Use your ERPNext account'}</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <label className="block space-y-1.5">
            <span className="label">{EMPLOYEE_LOGIN ? 'Your login email' : 'Email or username'}</span>
            <input className="input" value={usr} onChange={(e) => setUsr(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Password</span>
            <div className="relative">
              <input
                className="input pe-10"
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 end-0 grid w-9 place-items-center text-muted"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-danger dark:border-rose-900/60 dark:bg-rose-950/40">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-strong text-xs font-medium text-strong-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Forgot password? <a href="/login#forgot" className="text-primary hover:underline">Reset it</a>
        </p>
        <p className="mt-2 text-center text-xs text-muted">
          {EMPLOYEE_LOGIN
            ? <>Not an employee? <a href={`${BASE}/`} className="text-primary hover:underline">Staff sign-in</a></>
            : <>Employee? <a href={`${BASE}/employee`} className="text-primary hover:underline">Employee sign-in</a></>}
        </p>
      </div>
    </div>
  )
}
