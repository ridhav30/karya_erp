import { NAV, roleAllows } from './nav.js'

// Home and the self-service pages are open to everyone, so they are not listed.
const SKIP = new Set(['/', '/approvals', '/my-hr', '/my-team'])
const pageOf = (i) => ({ to: i.to, label: i.label, doctype: i.doctype, item: i })

/** The modules installed in this app (its menu groups) and its single links, with every page. */
export const MODULES = NAV.filter((g) => g.items?.length).map((g) => ({ label: g.label, group: g, pages: g.items.filter((i) => i.to && !SKIP.has(i.to)).map(pageOf) })).filter((m) => m.pages.length)
export const OTHER = NAV.filter((g) => !g.items && g.to && !SKIP.has(g.to)).map(pageOf)

/** The routes a person's roles let them open ({ can_read, roles } from the server): the only features page access can choose from. */
export function allowedRoutes(access) {
  const ok = (p) => roleAllows(p.item, access)
  // A menu group can carry its own role rule (HR, Payroll …): the whole module is out when the roles do not fit it.
  return new Set([...MODULES.flatMap((m) => (roleAllows(m.group, access) ? m.pages.filter(ok) : [])), ...OTHER.filter(ok)].map((p) => p.to))
}

/** The saved access ({mode, modules, pages}) as the set of ticked routes: a ticked module ticks every page of it that the roles allow. */
export function accessToChecked(pa, allowed) {
  const set = new Set((pa?.pages ?? []).filter((r) => !allowed || allowed.has(r)))
  for (const m of MODULES) if ((pa?.modules ?? []).includes(m.label)) m.pages.filter((p) => !allowed || allowed.has(p.to)).forEach((p) => set.add(p.to))
  return set
}

/**
 * Ticked routes back to what is saved. A module with every page the roles allow ticked is kept as the module (so pages added
 * to it later are included, still limited by the roles); anything less is kept as individual pages.
 */
export function checkedToAccess(mode, checked, allowed) {
  if (mode !== 'Custom') return { mode: 'All', modules: [], pages: [] }
  const modules = []
  const pages = []
  for (const m of MODULES) {
    const offered = m.pages.filter((p) => !allowed || allowed.has(p.to))
    const on = offered.filter((p) => checked.has(p.to))
    if (offered.length && on.length === offered.length) modules.push(m.label)
    else pages.push(...on.map((p) => p.to))
  }
  pages.push(...OTHER.filter((p) => (!allowed || allowed.has(p.to)) && checked.has(p.to)).map((p) => p.to))
  return { mode: 'Custom', modules, pages }
}

// Child features: ticking an entry also ticks the set-up pages it needs (Point of Sale brings its counters and shift closings).
const NEEDS = Object.fromEntries([...MODULES.flatMap((m) => m.pages), ...OTHER].map((p) => [p.to, p.item.requires ?? []]))

/** The ticked set plus the child features of everything ticked (only those the roles allow). */
export function withChildren(checked, allowed) {
  const out = new Set(checked)
  const stack = [...out]
  while (stack.length) {
    for (const c of NEEDS[stack.pop()] ?? []) {
      if (c in NEEDS && (!allowed || allowed.has(c)) && !out.has(c)) { out.add(c); stack.push(c) }
    }
  }
  return out
}

export const hasAnyAccess = (checked) => checked.size > 0
