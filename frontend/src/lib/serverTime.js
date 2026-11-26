/**
 * Frappe stores timestamps ("2026-11-23 09:12:25") in the site's time zone, which is often not the browser's.
 * Parsing them with new Date() reads them as browser time, so "5 minutes ago" comes out hours off.
 * boot.time_zone is set once at load (BootProvider); serverMs() turns a stored timestamp into epoch ms.
 */
let zone = ''

export function setServerTimeZone(tz) {
  zone = tz || ''
}

export function serverMs(iso) {
  const s = String(iso ?? '')
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(s)
  if (!m) return new Date(s).getTime()
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  if (!zone) return new Date(s.replace(' ', 'T')).getTime()
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(wall)).map((x) => [x.type, x.value]),
    )
    const inZone = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
    return wall - (inZone - wall)
  } catch {
    return new Date(s.replace(' ', 'T')).getTime()
  }
}
