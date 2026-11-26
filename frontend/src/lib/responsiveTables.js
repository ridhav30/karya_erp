/**
 * Phones: every table with a header renders as a stack of cards (CSS in index.css, keyed on [data-rt]).
 * This labels each cell from its column header, so no page needs per-table markup.
 * Opt out with data-no-cards (wide matrices such as the attendance register) — editable grids (.dt-grid) are skipped too.
 */
const SKIP = 'table.rt, table.dt-grid, table[data-no-cards]'

function enhance(table) {
  if (table.matches(SKIP)) return
  const headRows = table.tHead?.rows
  if (!headRows?.length) return
  const labels = []
  for (const th of headRows[headRows.length - 1].cells) {
    const label = th.textContent.replace(/\s+/g, ' ').trim()
    for (let i = 0; i < th.colSpan; i++) labels.push(i === 0 ? label : '')
  }
  if (!labels.some(Boolean)) return
  const mainIdx = labels.findIndex(Boolean)

  for (const body of table.tBodies) {
    for (const tr of body.rows) {
      if (tr.dataset.rtDone === labels.join('|') && tr.cells.length === Number(tr.dataset.rtCells)) continue
      const cells = [...tr.cells]
      if (cells.some((c) => c.colSpan > 1)) continue // empty / loading / expansion rows stay as they are
      cells.forEach((td, i) => {
        if (i === mainIdx) { td.setAttribute('data-main', ''); td.removeAttribute('data-label') }
        else if (labels[i]) { td.setAttribute('data-label', labels[i]); td.removeAttribute('data-main') }
      })
      tr.dataset.rtDone = labels.join('|')
      tr.dataset.rtCells = String(cells.length)
    }
  }
  table.setAttribute('data-rt', '')
}

export function watchTables() {
  let queued = false
  const run = () => {
    queued = false
    document.querySelectorAll('table').forEach(enhance)
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(run)
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  schedule()
}
