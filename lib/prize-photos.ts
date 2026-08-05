// Real product photos for prizes that have one. Matched by normalized name
// (lowercase, spaces stripped) against a prize's configured name in any
// game's admin screen -- a prize without a matching entry here just shows
// its name as text in the reveal, no photo. Shared across every game (Wheel,
// Duck Race, ...) since the underlying merch catalog is the same regardless
// of which game a prize was configured under.
const PRIZE_PHOTOS: Record<string, string> = {
  totebag: '/prizes/totebag-prize.png',
  coinpurse: '/prizes/coin-purse-prize.png',
  roundfan: '/prizes/round-fan-prize.png',
}

export function prizePhotoFor(name: string): string | null {
  const key = name.toLowerCase().replace(/\s+/g, '')
  return PRIZE_PHOTOS[key] ?? null
}
