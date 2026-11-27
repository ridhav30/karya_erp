import { Link } from 'react-router'
import { useBoot } from '../app/boot-context.js'
import { canOpen } from '../lib/nav.js'

/**
 * A link that is left out when the person cannot open its page (roles or page access), so nobody clicks into “no access”.
 * fallback="text" keeps what the link wraps (a document name, a card) as plain content instead of removing it.
 */
export default function AccessLink({ to, children, fallback = 'hide', ...rest }) {
  const boot = useBoot()
  const path = typeof to === 'string' ? to : to?.pathname ?? ''
  if (boot && !canOpen(boot, path)) return fallback === 'text' ? <>{children}</> : null
  return <Link to={to} {...rest}>{children}</Link>
}
