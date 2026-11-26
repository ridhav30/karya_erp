import { Construction, ExternalLink } from 'lucide-react'
import { deskUrl } from '../lib/utils.js'

export default function Placeholder({ title, doctype }) {
  return (
    <>
      <div className="grid place-items-center rounded-lg border border-dashed bg-background px-6 py-16 text-center">
        <Construction className="size-8 text-muted" />
        <p className="mt-3 text-[13px] font-medium">{title} is coming in a later phase.</p>
        {doctype && (
          <a href={deskUrl(doctype)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            Open {title} in Desk <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </>
  )
}
