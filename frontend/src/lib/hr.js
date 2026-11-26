/** Small HR helpers shared by HR screens. */

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Every date (YYYY-MM-DD) between from and to (inclusive) that falls on weekday (0 = Sunday). */
export function weeklyOffDates(from, to, weekday) {
  const out = []
  const end = new Date(`${to}T00:00:00`)
  const d = new Date(`${from}T00:00:00`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime()) || weekday < 0) return out
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7))
  while (d <= end) {
    out.push(iso(d))
    d.setDate(d.getDate() + 7)
  }
  return out
}

export const HR_ROLES = ['HR User', 'HR Manager', 'System Manager']

/** Phone GPS position → { latitude, longitude, accuracy }. Rejects with a readable Error (err.geo = true). */
export function currentPosition({ timeout = 15000 } = {}) {
  const fail = (message) => Object.assign(new Error(message), { geo: true })
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(fail('This browser cannot share location.'))
    if (!window.isSecureContext) return reject(fail('Location needs a secure (https) connection. Open the app over https.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(fail(
        e.code === 1 ? 'Location permission is blocked. Allow location for this site in your browser settings.'
          : e.code === 3 ? 'Getting your location took too long. Try again outdoors or with GPS on.'
            : 'Your location is unavailable. Turn on location / GPS and try again.',
      )),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    )
  })
}

/** Status → calendar / register colour classes. */
export const ATTENDANCE_TONE = {
  Present: 'bg-emerald-500', 'Work From Home': 'bg-teal-500', 'Half Day': 'bg-amber-500',
  'On Leave': 'bg-sky-500', Absent: 'bg-red-500', Holiday: 'bg-violet-400', 'Weekly Off': 'bg-gray-300 dark:bg-zinc-600',
  'Checked In': 'bg-emerald-300', 'Not Marked': 'bg-transparent ring-1 ring-inset ring-gray-300 dark:ring-zinc-600',
}
