const money = {}

/** formatMoney(12500, 'AED') -> "AED 12,500.00" */
export function formatMoney(value, currency = 'AED') {
  if (value == null || value === '') return '—'
  money[currency] ??= new Intl.NumberFormat('en-AE', {
    style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2,
  })
  return money[currency].format(Number(value)).replace(/\u00a0/g, ' ')
}

export function formatNumber(value, digits = 0) {
  if (value == null || value === '') return '—'
  return Number(value).toLocaleString('en-AE', { maximumFractionDigits: digits })
}

/** formatDate('2026-11-09') -> "09 Nov 2026" */
export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?'
}
