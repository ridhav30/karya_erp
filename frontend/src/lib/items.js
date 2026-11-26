/** Sum of qty x rate for item rows (client-side estimate before ERPNext recalculates). */
export function itemsTotal(rows) {
  return rows.reduce((s, r) => s + (Number(r.amount) || (Number(r.qty) || 0) * (Number(r.rate) || 0)), 0)
}
