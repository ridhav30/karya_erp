import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <p className="text-5xl font-bold text-muted">404</p>
      <p className="mt-2 font-medium">Page not found</p>
      <Link to="/" className="mt-4 text-primary hover:underline">Back to dashboard</Link>
    </div>
  )
}
