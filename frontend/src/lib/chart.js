import { formatNumber } from './format.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-11' → 'Nov' */
export const monthLabel = (key) => MONTHS[Number(String(key).slice(5, 7)) - 1] ?? key

/** Compact axis money: 12.5K, 1.2M */
export function short(v) {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
  return formatNumber(v)
}

/** Round an axis maximum up to 1 / 2 / 2.5 / 5 × 10ⁿ. */
export function niceMax(v) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)
}
