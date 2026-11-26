import { t } from '../lib/i18n.js'

export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 pb-1">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-[22px] md:leading-7">{t(title)}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[13px] text-muted">{t(subtitle)}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
