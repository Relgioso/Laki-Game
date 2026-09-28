import type { PrizeRow, ReplacementPrize } from './db'

// Prize list rules shared by every game on the shared platform. Pure (no DB
// access) so it can be unit-tested; the API routes call it.
export const ALLOWED_PRIZE_TYPES: readonly string[] = ['merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom']

// Prize as the JSON API returns it.
export type ApiPrize = {
  id: string
  name: string
  prizeType: string
  probability: number | null
  inventory: number | null
  active: boolean
  displayOrder: number
}

// Prize as the admin screen PUTs it. `inventory` is optional on purpose: a
// row the admin didn't touch omits it, so the server keeps the live stock
// (plays may have used some up since the admin page loaded).
export type SubmittedPrize = {
  id?: string
  name: string
  prizeType: string
  probability: number | null
  inventory?: number | null
  active?: boolean
  displayOrder?: number
}

export function toApiPrize(p: PrizeRow): ApiPrize {
  return {
    id: p.id,
    name: p.name,
    prizeType: p.prize_type,
    probability: p.probability,
    inventory: p.inventory,
    active: p.active,
    displayOrder: p.display_order ?? 0,
  }
}

export function validatePrizeList(prizes: unknown, maxPrizes: number): string | null {
  if (!Array.isArray(prizes)) return 'prizes must be an array.'
  if (prizes.length > maxPrizes) return `This game supports at most ${maxPrizes} prizes (got ${prizes.length}).`
  for (const p of prizes) {
    if (typeof p !== 'object' || p === null) return 'Each prize must be an object.'
    const name = typeof p.name === 'string' ? p.name.trim() : ''
    if (name.length === 0 || name.length > 100) {
      return `Prize name must be between 1 and 100 characters (got "${p.name ?? ''}").`
    }
    if (!ALLOWED_PRIZE_TYPES.includes(p.prizeType)) return `Invalid prize type: ${p.prizeType}`
    if (p.probability != null) {
      const valid = typeof p.probability === 'number' && Number.isFinite(p.probability) && p.probability >= 0 && p.probability <= 100
      if (!valid) return `Probability for "${name}" must be between 0 and 100.`
    }
    if (p.inventory != null && !(Number.isInteger(p.inventory) && p.inventory >= 0)) {
      return `Inventory for "${name}" must be a whole number of 0 or more.`
    }
  }
  return null
}

export function toReplacementRows(prizes: SubmittedPrize[], liveInventoryById: Map<string, number | null>): ReplacementPrize[] {
  return prizes.map((p, i) => {
    let inventory: number | null
    if (p.id && !('inventory' in p)) {
      // Untouched row: live DB value, or null if the row was deleted out
      // from under this request.
      inventory = liveInventoryById.has(p.id) ? (liveInventoryById.get(p.id) as number | null) : null
    } else {
      inventory = p.inventory ?? null
    }
    return {
      name: p.name.trim(),
      prize_type: p.prizeType,
      probability: p.probability ?? null,
      inventory,
      active: p.active ?? true,
      display_order: p.displayOrder ?? i,
    }
  })
}
