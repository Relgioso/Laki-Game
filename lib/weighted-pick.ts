// Picks a prize by its probability (percent). Prizes with no probability
// split whatever percentage the explicit ones leave, equally. Same algorithm
// the legacy game routes use, with `random` injectable for tests.
export function weightedPick<T extends { probability: number | null }>(items: T[], random: () => number = Math.random): T {
  const unweightedCount = items.filter(i => i.probability == null).length
  const totalExplicit = items.reduce((sum, i) => sum + (i.probability ?? 0), 0)
  const equalShare = unweightedCount > 0 ? Math.max(0, 100 - totalExplicit) / unweightedCount : 0
  const resolved = items.map(item => ({ item, weight: item.probability ?? equalShare }))

  const total = resolved.reduce((sum, r) => sum + r.weight, 0)
  if (total <= 0) return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
  let roll = random() * total
  for (const r of resolved) {
    roll -= r.weight
    if (roll < 0) return r.item
  }
  return resolved[resolved.length - 1].item
}
