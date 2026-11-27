import { Link } from 'react-router'
import { Lock } from 'lucide-react'

/** Shown instead of a page the person's page access does not include (Users & access). */
export default function AccessDenied() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-24 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted"><Lock className="size-5" /></span>
      <h1 className="text-sm font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-xs text-muted">An administrator limits which modules and pages each person can open. Ask them to add this one if you need it.</p>
      <Link to="/" className="mt-2 text-xs font-medium text-primary hover:underline">Back to the dashboard</Link>
    </div>
  )
}
