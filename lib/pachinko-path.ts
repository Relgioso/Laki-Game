// Pachinko ball path planning. The server decides the prize; this turns
// "land in slot N" into a natural-looking bounce path. Coordinates are
// normalized: x runs from 0 (left wall) to 1 (right wall). The ball starts at
// the center, hits one peg per row, and moves exactly one STEP left or right
// after each peg -- so pegs sit on a grid and the ball always hits one.

export const PACHINKO_ROWS = 10
export const PACHINKO_STEP = 0.05
// With 8 slots each slot is still wider than 2 steps, so an end point inside
// the target slot always exists. More slots would need a finer grid.
export const MAX_SLOTS = 8

const START_X = 0.5
// Keep the ball this far from the walls (about its radius).
const WALL_MARGIN = 0.04

const round = (x: number) => Math.round(x * 1e6) / 1e6
const xAt = (j: number) => round(START_X + j * PACHINKO_STEP)
const inBounds = (x: number) => x >= WALL_MARGIN - 1e-9 && x <= 1 - WALL_MARGIN + 1e-9

export function slotIndexForX(x: number, slotCount: number): number {
  return Math.min(slotCount - 1, Math.max(0, Math.floor(x * slotCount)))
}

// Pegs in row r sit wherever the ball can be after r moves:
// START_X + j * STEP with j having the same parity as r.
export function pegColumns(row: number): number[] {
  const xs: number[] = []
  for (let j = -PACHINKO_ROWS; j <= PACHINKO_ROWS; j++) {
    if (Math.abs(j % 2) !== row % 2) continue
    if (inBounds(xAt(j))) xs.push(xAt(j))
  }
  return xs
}

export function slotLabel(name: string, max = 14): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`
}

function walk(moves: number[]): number[] {
  const xs = [START_X]
  let j = 0
  for (const m of moves) {
    j += m
    xs.push(xAt(j))
  }
  return xs
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1))
    ;[items[i], items[k]] = [items[k], items[i]]
  }
  return items
}

export function planPachinkoPath(targetSlot: number, slotCount: number, random: () => number = Math.random): number[] {
  if (!Number.isInteger(slotCount) || slotCount < 1 || slotCount > MAX_SLOTS) {
    throw new RangeError(`slotCount must be 1..${MAX_SLOTS} (got ${slotCount})`)
  }
  if (!Number.isInteger(targetSlot) || targetSlot < 0 || targetSlot >= slotCount) {
    throw new RangeError(`targetSlot ${targetSlot} is outside 0..${slotCount - 1}`)
  }

  // Net offset k (in steps) must share PACHINKO_ROWS's parity, be reachable,
  // stay off the walls, and end inside the target slot. Of the valid choices
  // take the one closest to the slot center.
  const center = (targetSlot + 0.5) / slotCount
  const ideal = Math.round((center - START_X) / PACHINKO_STEP)
  const k = [ideal - 1, ideal, ideal + 1]
    .filter(c => Math.abs(c) <= PACHINKO_ROWS && (PACHINKO_ROWS + c) % 2 === 0)
    .filter(c => inBounds(xAt(c)) && slotIndexForX(xAt(c), slotCount) === targetSlot)
    .sort((a, b) => Math.abs(xAt(a) - center) - Math.abs(xAt(b) - center))[0]
  if (k === undefined) throw new Error(`No path to slot ${targetSlot} of ${slotCount}`)

  const rights = (PACHINKO_ROWS + k) / 2
  for (let attempt = 0; attempt < 100; attempt++) {
    const moves = shuffle([...Array(rights).fill(1), ...Array(PACHINKO_ROWS - rights).fill(-1)], random)
    const xs = walk(moves)
    if (xs.every(inBounds)) return xs
  }
  // Practically unreachable: head straight for the target, then zig-zag back
  // toward the center and out again -- stays in bounds because the target is.
  const dir = k >= 0 ? 1 : -1
  const moves: number[] = Array(Math.abs(k)).fill(dir)
  while (moves.length < PACHINKO_ROWS) moves.push(-dir, dir)
  return walk(moves)
}
