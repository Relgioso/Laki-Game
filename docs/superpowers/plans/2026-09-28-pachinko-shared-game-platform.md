# Pachinko + Shared Game Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pachinko as the first game on a shared game platform (one prize system, one play shell, one admin screen, a game registry), without touching Wheel / Color Game / Duck Race.

**Architecture:** A code registry (`lib/games.ts`) lists every game. "Shared" games store prizes in one D1 table `game_prizes` scoped by game slug, and run on generic routes `/play/[game]`, `/admin/[game]`, `/api/games/[game]/{config,play}`. Each shared game only contributes a mechanic component (`components/games/<mechanic>.tsx`) that animates to a server-chosen prize. Pure logic (odds, validation, pachinko path) lives in dependency-free `lib/` files covered by Vitest.

**Tech Stack:** Next.js 16.3.6 (App Router) on Cloudflare Workers via `@opennextjs/cloudflare`, Cloudflare D1, React 19, Tailwind 4, Vitest (new, dev-only).

**Spec:** `docs/superpowers/specs/2026-09-28-pachinko-shared-game-platform-design.md`

## Global Constraints

- Do not modify `app/play/{wheel,color-game,duck-race}`, `app/admin/{wheel,color-game,duck-race}`, `app/api/{wheel,color-game,duck-race}` or the legacy prize tables.
- Brand colors: yellow `#fad403`, shadow `#cc9700`, black; admin screens use `app/admin/admin-styles.ts`.
- Pachinko: max **8** prizes, one slot per active prize, ball must land in the server-chosen prize's slot.
- Admin layout: live game preview **left**, prize editor **right**, stacked on phones.
- Prize types allowed: `merchandise, bonus, cash, voucher, consolation, custom`; names 1–100 chars.
- Next 16 route params are Promises: `ctx.params` / `params` must be awaited.
- DB access only through `lib/db.ts` (`getCloudflareContext().env.DB`); booleans stored 0/1.
- Deploy is manual: `npm run db:migrate` then `npm run deploy` (Cloudflare account claire@racphil.com).
- Never enable `enableCacheInterception` in `open-next.config.ts` (breaks Next 16 prefetch).

## Review Focus

1. Admin changes Pachinko's prizes while a player screen is open → a drawn prize may not be on that player's board; the reveal must still appear (no stuck "Dropping…") and the board refreshes. Pinned in Task 5 (`slot === -1` → finish immediately) and checked in Task 7 Step 4.
2. Admin types a bad number (stock `-1` or `1.5`, probability `150`) → save is rejected with a clear message and nothing changes. Pinned by `validatePrizeList` tests in Task 1 and the rejected-save smoke test in Task 4.
3. Player double-taps DROP → exactly one draw request. Pinned by the synchronous `busyRef` guard in Task 5, checked in Task 7 Step 3.
4. Last unit in stock, two players at once → only one wins it, the other gets "No prizes available to draw." Pinned by the parallel-POST smoke test in Task 4.
5. Long prize names with 8 slots → slot labels stay inside their slot (truncated with "…"). Pinned by `slotLabel` tests in Task 2 and the 8-long-names screenshot in Task 7.

---

### Task 1: Vitest + pure prize logic

**Files:**
- Create: `vitest.config.ts`, `lib/weighted-pick.ts`, `lib/prize-config.ts`
- Modify: `package.json` (devDependency + `test` script), `lib/db.ts` (export `ReplacementPrize`), `tsconfig.json` (exclude build output)
- Test: `tests/weighted-pick.test.ts`, `tests/prize-config.test.ts`

**Interfaces:**
- Produces:
  - `weightedPick<T extends { probability: number | null }>(items: T[], random?: () => number): T`
  - `ALLOWED_PRIZE_TYPES: readonly string[]`
  - `type ApiPrize = { id: string; name: string; prizeType: string; probability: number | null; inventory: number | null; active: boolean; displayOrder: number }`
  - `type SubmittedPrize = { id?: string; name: string; prizeType: string; probability: number | null; inventory?: number | null; active?: boolean; displayOrder?: number }`
  - `toApiPrize(row: PrizeRow): ApiPrize`
  - `validatePrizeList(prizes: unknown, maxPrizes: number): string | null`
  - `toReplacementRows(prizes: SubmittedPrize[], liveInventoryById: Map<string, number | null>): ReplacementPrize[]`
  - `lib/db.ts` exports `type ReplacementPrize = { name: string; prize_type: string; probability: number | null; inventory: number | null; active: boolean; display_order: number }`

- [ ] **Step 1: Install Vitest and add config + script**

```bash
npm install -D vitest
node -e 'const p=require("./package.json");p.scripts.test="vitest run";require("fs").writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
```

In `tsconfig.json` change `"exclude": ["node_modules"]` to `"exclude": ["node_modules", ".open-next", ".wrangler"]` (the Cloudflare build output contains generated .ts files that `tsc` would otherwise check).

`vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 2: Write the failing tests**

`tests/weighted-pick.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { weightedPick } from '@/lib/weighted-pick'

const items = [
  { name: 'A', probability: 50 },
  { name: 'B', probability: null },
  { name: 'C', probability: null },
]

describe('weightedPick', () => {
  it('splits the remaining percentage equally across prizes with no probability', () => {
    // A = 50, B = 25, C = 25 out of 100
    expect(weightedPick(items, () => 0.1).name).toBe('A')
    expect(weightedPick(items, () => 0.6).name).toBe('B')
    expect(weightedPick(items, () => 0.9).name).toBe('C')
  })

  it('always picks a 100% prize', () => {
    const list = [{ name: 'X', probability: 100 }, { name: 'Y', probability: 0 }]
    for (const r of [0, 0.5, 0.999]) expect(weightedPick(list, () => r).name).toBe('X')
  })

  it('falls back to a uniform pick when every weight is zero', () => {
    const list = [{ name: 'X', probability: 0 }, { name: 'Y', probability: 0 }]
    expect(weightedPick(list, () => 0.99).name).toBe('Y')
    expect(weightedPick(list, () => 0).name).toBe('X')
  })
})
```

`tests/prize-config.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { toReplacementRows, validatePrizeList, type SubmittedPrize } from '@/lib/prize-config'

const ok = (patch: Partial<SubmittedPrize> = {}): SubmittedPrize => ({
  name: 'Totebag', prizeType: 'merchandise', probability: null, inventory: null, active: true, ...patch,
})

describe('validatePrizeList', () => {
  it('accepts a valid list', () => {
    expect(validatePrizeList([ok(), ok({ probability: 20, inventory: 5 })], 8)).toBeNull()
  })
  it('rejects non-arrays and too many prizes', () => {
    expect(validatePrizeList('nope', 8)).toMatch(/array/)
    expect(validatePrizeList(Array.from({ length: 9 }, () => ok()), 8)).toMatch(/at most 8/)
  })
  it('rejects bad names and types', () => {
    expect(validatePrizeList([ok({ name: '   ' })], 8)).toMatch(/name/)
    expect(validatePrizeList([ok({ name: 'x'.repeat(101) })], 8)).toMatch(/name/)
    expect(validatePrizeList([ok({ prizeType: 'car' })], 8)).toMatch(/Invalid prize type/)
  })
  it('rejects probabilities outside 0-100', () => {
    expect(validatePrizeList([ok({ probability: -1 })], 8)).toMatch(/Probability/)
    expect(validatePrizeList([ok({ probability: 150 })], 8)).toMatch(/Probability/)
    expect(validatePrizeList([{ ...ok(), probability: 'abc' }], 8)).toMatch(/Probability/)
  })
  it('rejects negative or fractional stock', () => {
    expect(validatePrizeList([ok({ inventory: -1 })], 8)).toMatch(/Inventory/)
    expect(validatePrizeList([ok({ inventory: 1.5 })], 8)).toMatch(/Inventory/)
  })
})

describe('toReplacementRows', () => {
  it('keeps live stock for rows the admin did not touch (no inventory key)', () => {
    const live = new Map<string, number | null>([['p1', 3]])
    const { inventory, ...rest } = ok({ id: 'p1' })
    void inventory
    expect(toReplacementRows([rest], live)[0].inventory).toBe(3)
  })
  it('uses submitted stock when present, or when the row vanished from the DB', () => {
    const live = new Map<string, number | null>([['p1', 3]])
    expect(toReplacementRows([ok({ id: 'p1', inventory: 7 })], live)[0].inventory).toBe(7)
    const { inventory, ...gone } = ok({ id: 'missing' })
    void inventory
    expect(toReplacementRows([gone], live)[0].inventory).toBeNull()
  })
  it('trims names, defaults active and display order to the list position', () => {
    const rows = toReplacementRows([ok({ name: '  Fan  ', active: undefined }), ok()], new Map())
    expect(rows[0]).toMatchObject({ name: 'Fan', active: true, display_order: 0 })
    expect(rows[1].display_order).toBe(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/weighted-pick` / `@/lib/prize-config`.

- [ ] **Step 4: Implement**

In `lib/db.ts`, change `type ReplacementPrize = {` to `export type ReplacementPrize = {`.

`lib/weighted-pick.ts`:
```ts
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
```

`lib/prize-config.ts`:
```ts
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
      // Untouched row: live DB value, or the submitted one (null) if the row
      // was deleted out from under this request.
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test` → Expected: all tests PASS. Then `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tsconfig.json package.json package-lock.json lib/weighted-pick.ts lib/prize-config.ts lib/db.ts tests/
git commit -m "Add Vitest and shared prize logic (odds, validation, stock merge)"
```

---

### Task 2: Pachinko path planner

**Files:**
- Create: `lib/pachinko-path.ts`
- Test: `tests/pachinko-path.test.ts`

**Interfaces:**
- Produces:
  - `PACHINKO_ROWS = 10`, `PACHINKO_STEP = 0.05`, `MAX_SLOTS = 8`
  - `planPachinkoPath(targetSlot: number, slotCount: number, random?: () => number): number[]` — normalized x (0..1) at start + after each peg row; length `PACHINKO_ROWS + 1`; `xs[r]` for `r < PACHINKO_ROWS` is the peg hit in row r; `xs[PACHINKO_ROWS]` is where it leaves the last row
  - `pegColumns(row: number): number[]` — normalized x of every peg in a row
  - `slotIndexForX(x: number, slotCount: number): number`
  - `slotLabel(name: string, max?: number): string` — truncates to `max` (default 14) chars with "…"

- [ ] **Step 1: Write the failing test**

`tests/pachinko-path.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_SLOTS, PACHINKO_ROWS, PACHINKO_STEP, pegColumns, planPachinkoPath, slotIndexForX, slotLabel,
} from '@/lib/pachinko-path'

// Small seeded RNG so failures are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('planPachinkoPath', () => {
  it('lands in the target slot for every slot count, hitting one peg per row, off the walls', () => {
    for (let n = 1; n <= MAX_SLOTS; n++) {
      for (let target = 0; target < n; target++) {
        for (let seed = 1; seed <= 100; seed++) {
          const xs = planPachinkoPath(target, n, mulberry32(seed * 7919 + n * 31 + target))
          expect(xs).toHaveLength(PACHINKO_ROWS + 1)
          expect(xs[0]).toBe(0.5)
          for (let r = 1; r < xs.length; r++) expect(Math.abs(xs[r] - xs[r - 1])).toBeCloseTo(PACHINKO_STEP, 6)
          for (const x of xs) {
            expect(x).toBeGreaterThanOrEqual(0.04)
            expect(x).toBeLessThanOrEqual(0.96)
          }
          for (let r = 0; r < PACHINKO_ROWS; r++) expect(pegColumns(r)).toContain(xs[r])
          expect(slotIndexForX(xs[PACHINKO_ROWS], n)).toBe(target)
        }
      }
    }
  })

  it('varies the path between drops', () => {
    const paths = new Set(Array.from({ length: 20 }, (_, s) => planPachinkoPath(3, 8, mulberry32(s + 1)).join()))
    expect(paths.size).toBeGreaterThan(5)
  })

  it('works with the default Math.random', () => {
    const xs = planPachinkoPath(0, 4)
    expect(slotIndexForX(xs[PACHINKO_ROWS], 4)).toBe(0)
  })

  it('rejects impossible targets', () => {
    expect(() => planPachinkoPath(3, 3)).toThrow(RangeError)
    expect(() => planPachinkoPath(-1, 3)).toThrow(RangeError)
    expect(() => planPachinkoPath(0, 0)).toThrow(RangeError)
    expect(() => planPachinkoPath(0, MAX_SLOTS + 1)).toThrow(RangeError)
  })
})

describe('slotIndexForX', () => {
  it('clamps the edges', () => {
    expect(slotIndexForX(0, 5)).toBe(0)
    expect(slotIndexForX(1, 5)).toBe(4)
  })
})

describe('slotLabel', () => {
  it('keeps short names and truncates long ones', () => {
    expect(slotLabel('Totebag')).toBe('Totebag')
    expect(slotLabel('Limited Edition LakiWin Jacket')).toBe('Limited Editi…')
    expect(slotLabel('Limited Edition LakiWin Jacket')).toHaveLength(14)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pachinko-path.test.ts` → Expected: FAIL, cannot resolve `@/lib/pachinko-path`.

- [ ] **Step 3: Implement**

`lib/pachinko-path.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: all PASS (Task 1 + Task 2 files).

- [ ] **Step 5: Commit**

```bash
git add lib/pachinko-path.ts tests/pachinko-path.test.ts
git commit -m "Add Pachinko path planner that lands the ball in the drawn prize's slot"
```

---

### Task 3: Game registry, home page, admin header

**Files:**
- Create: `lib/games.ts`
- Modify: `app/page.tsx`, `app/site-header.tsx`
- Test: `tests/games.test.ts`

**Interfaces:**
- Produces:
  - `type Mechanic = 'pachinko'`
  - `type Game = LegacyGame | SharedGame`; base fields `{ slug, title, navTitle, playHref, adminHref, prizesConfigUrl: string | null }`; `SharedGame` adds `{ platform: 'shared'; mechanic: Mechanic; maxPrizes: number }`
  - `GAMES: Game[]`, `SHARED_GAMES: SharedGame[]`, `getSharedGame(slug: string): SharedGame | null`

- [ ] **Step 1: Write the failing test**

`tests/games.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { GAMES, getSharedGame } from '@/lib/games'

describe('game registry', () => {
  it('finds shared games only', () => {
    expect(getSharedGame('pachinko')).toMatchObject({ mechanic: 'pachinko', maxPrizes: 8, playHref: '/play/pachinko' })
    expect(getSharedGame('wheel')).toBeNull()
    expect(getSharedGame('nope')).toBeNull()
  })
  it('has unique slugs and keeps the legacy games first, in their original order', () => {
    const slugs = GAMES.map(g => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.slice(0, 3)).toEqual(['wheel', 'color-game', 'duck-race'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/games.test.ts` → Expected: FAIL, cannot resolve `@/lib/games`.

- [ ] **Step 3: Implement the registry**

`lib/games.ts`:
```ts
// Every game on the home page. Legacy games (Wheel, Color Game, Duck Race)
// have their own hand-built pages and APIs. Shared games run on the generic
// /play/[game], /admin/[game] and /api/games/[game] routes: adding one means
// writing its mechanic component (components/games/) and adding it here.
export type Mechanic = 'pachinko'

type BaseGame = {
  slug: string
  title: string
  // Shorter name for the admin header's "← Back to …" button.
  navTitle: string
  playHref: string
  adminHref: string
  // Config endpoint whose GET returns `{ prizes: [...] }`, used by "Copy
  // prizes from…". null when the game's config has another shape.
  prizesConfigUrl: string | null
}
export type LegacyGame = BaseGame & { platform: 'legacy' }
export type SharedGame = BaseGame & { platform: 'shared'; mechanic: Mechanic; maxPrizes: number }
export type Game = LegacyGame | SharedGame

function shared(slug: string, title: string, mechanic: Mechanic, maxPrizes: number): SharedGame {
  return {
    slug, title, navTitle: title, platform: 'shared', mechanic, maxPrizes,
    playHref: `/play/${slug}`, adminHref: `/admin/${slug}`, prizesConfigUrl: `/api/games/${slug}/config`,
  }
}

export const GAMES: Game[] = [
  { slug: 'wheel', title: 'Spin the Wheel', navTitle: 'Wheel', platform: 'legacy', playHref: '/play/wheel', adminHref: '/admin/wheel', prizesConfigUrl: '/api/wheel/config' },
  { slug: 'color-game', title: 'Color Game', navTitle: 'Color Game', platform: 'legacy', playHref: '/play/color-game', adminHref: '/admin/color-game', prizesConfigUrl: null },
  { slug: 'duck-race', title: 'Duck Race', navTitle: 'Duck Race', platform: 'legacy', playHref: '/play/duck-race', adminHref: '/admin/duck-race', prizesConfigUrl: '/api/duck-race/config' },
  shared('pachinko', 'Pachinko', 'pachinko', 8),
]

export const SHARED_GAMES = GAMES.filter((g): g is SharedGame => g.platform === 'shared')

export function getSharedGame(slug: string): SharedGame | null {
  return SHARED_GAMES.find(g => g.slug === slug) ?? null
}
```

- [ ] **Step 4: Home page reads the registry**

Replace `app/page.tsx` with:
```tsx
import Image from "next/image";
import Link from "next/link";
import lakiwinLogo from "@/public/brand/lakiwin-horizontal.png";
import { GAMES } from "@/lib/games";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white px-8 py-16">
      <div className="w-full max-w-xs flex flex-col items-center">
        <Image
          src={lakiwinLogo}
          alt="LAKI WIN"
          className="w-full h-auto mb-16"
          priority
        />
        <div className="w-full flex flex-col gap-4">
          {GAMES.map((game) => (
            <Link
              key={game.slug}
              href={game.playHref}
              className="w-full rounded-full bg-[#fad403] py-4 text-center font-extrabold uppercase tracking-wide text-black shadow-[0_4px_0_#cc9700] active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] transition-transform"
            >
              {game.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Admin header reads the registry**

In `app/site-header.tsx`: delete the local `GAMES` record, add `import { GAMES } from '@/lib/games'`, and replace
```tsx
  const slug = pathname?.split('/')[2]
  const game = slug ? GAMES[slug] : undefined
```
with
```tsx
  const slug = pathname?.split('/')[2]
  const game = GAMES.find((g) => g.slug === slug)
```
and the link with
```tsx
      {game && (
        <Link
          href={game.playHref}
          className="ml-auto rounded-full bg-[#fad403] px-4 py-1.5 text-sm font-bold text-black shadow-[0_3px_0_#cc9700] transition-transform active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]"
        >
          ← Back to {game.navTitle}
        </Link>
      )}
```

- [ ] **Step 6: Verify**

Run: `npm test` → all PASS. `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/games.ts tests/games.test.ts app/page.tsx app/site-header.tsx
git commit -m "Add game registry; home page and admin header read it"
```

---

### Task 4: Shared prize table, draw logic, generic API

**Files:**
- Create: `migrations/0003_game_prizes.sql`, `lib/prize-draw.ts`, `app/api/games/[game]/config/route.ts`, `app/api/games/[game]/play/route.ts`
- Modify: `lib/db.ts`

**Interfaces:**
- Consumes: `getSharedGame` (Task 3); `validatePrizeList`, `toReplacementRows`, `toApiPrize`, `SubmittedPrize` (Task 1); `weightedPick` (Task 1)
- Produces:
  - `selectGamePrizes(game: string, opts?: { availableOnly?: boolean }): Promise<PrizeRow[]>`
  - `gameInventoryById(game: string): Promise<Map<string, number | null>>`
  - `replaceGamePrizes(game: string, rows: ReplacementPrize[]): Promise<void>`
  - `drawGamePrize(game: string): Promise<DrawResult>`; `type DrawResult = { status: 'won'; prize: PrizeRow } | { status: 'empty' } | { status: 'busy' }`
  - `GET /api/games/:game/config` → `{ prizes: ApiPrize[] }`; `PUT` body `{ prizes: SubmittedPrize[] }` → `{ success: true }`
  - `POST /api/games/:game/play` → `{ prize: { id, name, prizeType, displayOrder } }`; 400 `No prizes available to draw.`; 409 on contention; 404 `Unknown game.`

- [ ] **Step 1: Migration**

`migrations/0003_game_prizes.sql`:
```sql
-- Shared prize table for games on the generic platform (lib/games.ts,
-- platform 'shared'), one row per prize scoped by game slug. The legacy
-- per-game tables are untouched.
CREATE TABLE game_prizes (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  prize_type TEXT NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability REAL CHECK (probability IS NULL OR probability BETWEEN 0 AND 100),
  inventory INTEGER CHECK (inventory IS NULL OR inventory >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX game_prizes_by_game ON game_prizes (game, display_order);

-- Pachinko starts with the Wheel's merch so it's playable right away.
INSERT INTO game_prizes (id, game, name, prize_type, display_order) VALUES
  ('6f0c3d52-8a41-4c7e-9b2d-1e5a7c9f0a11', 'pachinko', 'Totebag', 'merchandise', 0),
  ('a83e1b27-4d6f-4f19-8c05-3b7d2e6a4c22', 'pachinko', 'Coin Purse', 'merchandise', 1),
  ('c2d94f86-1b3a-4e58-a7f0-5c8e9d1b2e33', 'pachinko', 'Round Fan', 'merchandise', 2);
```

Reset the local D1 copy (it holds throwaway test data from the migration) and apply all migrations:
```bash
rm -rf .wrangler/state && npx wrangler d1 migrations apply laki-game --local
```
Expected: 0001, 0002, 0003 all ✅.

- [ ] **Step 2: DB helpers**

In `lib/db.ts`:
- change `export type PrizeTable = 'wheel_prizes' | 'color_combo_prizes' | 'color_merch_prizes' | 'duck_race_prizes'` to add `| 'game_prizes'`;
- change `replacePrizes`'s parameter type to `Exclude<PrizeTable, 'color_combo_prizes' | 'game_prizes'>` (its unscoped DELETE must never hit the shared table);
- append:
```ts
// --- Shared-platform games: every query is scoped by game slug. ---

export async function selectGamePrizes(game: string, { availableOnly = false } = {}): Promise<PrizeRow[]> {
  const filter = availableOnly ? ' AND active = 1 AND (inventory IS NULL OR inventory > 0)' : ''
  const { results } = await getDb()
    .prepare(`SELECT * FROM game_prizes WHERE game = ?${filter} ORDER BY display_order ASC`)
    .bind(game)
    .all()
  return results.map(toPrizeRow)
}

export async function gameInventoryById(game: string): Promise<Map<string, number | null>> {
  const { results } = await getDb()
    .prepare('SELECT id, inventory FROM game_prizes WHERE game = ?')
    .bind(game)
    .all<{ id: string; inventory: number | null }>()
  return new Map(results.map(r => [r.id, r.inventory]))
}

// Full replace of one game's prizes, atomic like replacePrizes.
export async function replaceGamePrizes(game: string, rows: ReplacementPrize[]) {
  const db = getDb()
  const insert = db.prepare(
    'INSERT INTO game_prizes (id, game, name, prize_type, probability, inventory, active, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  await db.batch([
    db.prepare('DELETE FROM game_prizes WHERE game = ?').bind(game),
    ...rows.map(r =>
      insert.bind(crypto.randomUUID(), game, r.name, r.prize_type, r.probability, r.inventory, r.active ? 1 : 0, r.display_order)
    ),
  ])
}
```

- [ ] **Step 3: Draw logic**

`lib/prize-draw.ts`:
```ts
import { decrementInventory, selectGamePrizes, type PrizeRow } from './db'
import { weightedPick } from './weighted-pick'

export type DrawResult = { status: 'won'; prize: PrizeRow } | { status: 'empty' } | { status: 'busy' }

// Draws one prize for a shared-platform game. Limited-stock prizes are taken
// with an optimistic-lock decrement; if another player took the last unit
// between our read and write, the whole draw is retried.
export async function drawGamePrize(game: string): Promise<DrawResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidates = await selectGamePrizes(game, { availableOnly: true })
    if (candidates.length === 0) return { status: 'empty' }
    const chosen = weightedPick(candidates)
    if (chosen.inventory == null) return { status: 'won', prize: chosen }
    if (await decrementInventory('game_prizes', chosen.id, chosen.inventory)) return { status: 'won', prize: chosen }
  }
  return { status: 'busy' }
}
```

- [ ] **Step 4: Config route**

`app/api/games/[game]/config/route.ts`:
```ts
import { gameInventoryById, replaceGamePrizes, selectGamePrizes } from '@/lib/db'
import { getSharedGame } from '@/lib/games'
import { toApiPrize, toReplacementRows, validatePrizeList, type SubmittedPrize } from '@/lib/prize-config'
import { NextRequest, NextResponse } from 'next/server'

type Ctx = { params: Promise<{ game: string }> }

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function GET(_req: NextRequest, ctx: Ctx) {
  const game = getSharedGame((await ctx.params).game)
  if (!game) return NextResponse.json({ error: 'Unknown game.' }, { status: 404 })
  try {
    const prizes = await selectGamePrizes(game.slug)
    return NextResponse.json({ prizes: prizes.map(toApiPrize) })
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const game = getSharedGame((await ctx.params).game)
  if (!game) return NextResponse.json({ error: 'Unknown game.' }, { status: 404 })

  let body: { prizes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  // Validate everything before any write, so a bad row can't wipe the list.
  const validationError = validatePrizeList(body.prizes, game.maxPrizes)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  try {
    const live = await gameInventoryById(game.slug)
    await replaceGamePrizes(game.slug, toReplacementRows(body.prizes as SubmittedPrize[], live))
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}
```

- [ ] **Step 5: Play route**

`app/api/games/[game]/play/route.ts`:
```ts
import { getSharedGame } from '@/lib/games'
import { drawGamePrize } from '@/lib/prize-draw'
import { NextRequest, NextResponse } from 'next/server'

type Ctx = { params: Promise<{ game: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const game = getSharedGame((await ctx.params).game)
  if (!game) return NextResponse.json({ error: 'Unknown game.' }, { status: 404 })
  try {
    const result = await drawGamePrize(game.slug)
    if (result.status === 'empty') return NextResponse.json({ error: 'No prizes available to draw.' }, { status: 400 })
    if (result.status === 'busy') {
      return NextResponse.json({ error: 'Could not complete draw after retries — please try again.' }, { status: 409 })
    }
    const p = result.prize
    return NextResponse.json({ prize: { id: p.id, name: p.name, prizeType: p.prize_type, displayOrder: p.display_order } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 6: Smoke-test the API against local D1**

Start the dev server (uses the local D1 via `initOpenNextCloudflareForDev`) in the background: `npm run dev` (port 3000). Then:
```bash
B=http://localhost:3000; J='-H Content-Type:application/json'
curl -s $B/api/games/pachinko/config                       # 3 seeded prizes, active true
curl -s -o /dev/null -w '%{http_code}\n' $B/api/games/nope/config   # 404
curl -s -o /dev/null -w '%{http_code}\n' $B/api/games/wheel/config  # 404 (legacy has its own API)
curl -s -X POST $B/api/games/pachinko/play                 # a prize
# Last-unit race: one prize, stock 1, two players at once -> exactly one wins
curl -s -X PUT $J $B/api/games/pachinko/config -d '{"prizes":[{"name":"Cap","prizeType":"merchandise","probability":null,"inventory":1}]}'
(curl -s -X POST $B/api/games/pachinko/play & curl -s -X POST $B/api/games/pachinko/play & wait); echo
# Expected: one {"prize":...} and one {"error":"No prizes available to draw."}
# Rejected save leaves data intact
curl -s -X PUT $J $B/api/games/pachinko/config -d '{"prizes":[{"name":"Cap","prizeType":"merchandise","probability":null,"inventory":-1}]}'   # 400 Inventory…
curl -s $B/api/games/pachinko/config                       # still Cap, inventory 0
curl -s $B/api/wheel/config | head -c 80                   # legacy API unchanged
```
Then restore the seed: `rm -rf .wrangler/state && npx wrangler d1 migrations apply laki-game --local`. Stop the dev server (kill leftover node/workerd processes whose CommandLine contains `Laki-Game`).

- [ ] **Step 7: Verify + commit**

`npm test` and `npx tsc --noEmit` pass.
```bash
git add migrations/0003_game_prizes.sql lib/db.ts lib/prize-draw.ts 'app/api/games'
git commit -m "Add shared game_prizes table, draw logic and generic game API"
```

---

### Task 5: Play shell + Pachinko board

**Files:**
- Create: `components/games/types.ts`, `components/games/pachinko.tsx`, `components/games/mechanics.ts`, `components/play/game-shell.tsx`, `app/play/[game]/page.tsx`

**Interfaces:**
- Consumes: `ApiPrize` (Task 1); `planPachinkoPath`, `pegColumns`, `PACHINKO_ROWS`, `slotLabel` (Task 2); `getSharedGame`, `SHARED_GAMES`, `Mechanic` (Task 3); play/config API (Task 4)
- Produces:
  - `type DropTarget = { prizeId: string; runId: number }`
  - `type MechanicProps = { prizes: ApiPrize[]; target: DropTarget | null; onFinished: () => void }`
  - `MECHANICS: Record<Mechanic, { component: ComponentType<MechanicProps>; actionLabel: string; busyLabel: string }>`
  - `<GameShell slug title mechanic />`
  - Pachinko's `<svg>` carries `data-landed-slot` (index) after each drop — used by Task 7's E2E check

- [ ] **Step 1: Mechanic contract**

`components/games/types.ts`:
```ts
import type { ApiPrize } from '@/lib/prize-config'

// A drop/spin/race the server has already decided. runId changes every play
// so the same prize twice in a row still starts a new animation.
export type DropTarget = { prizeId: string; runId: number }

// Every shared-platform game's board implements this. With target null it
// renders still (that's also the admin preview); with a target it animates
// to that prize and then calls onFinished exactly once.
export type MechanicProps = {
  prizes: ApiPrize[]
  target: DropTarget | null
  onFinished: () => void
}
```

- [ ] **Step 2: Pachinko board**

`components/games/pachinko.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { PACHINKO_ROWS, pegColumns, planPachinkoPath, slotLabel } from '@/lib/pachinko-path'
import { playSpinTick } from '@/lib/sound'
import type { MechanicProps } from './types'

// Board geometry in SVG units (viewBox 0 0 100 150). The path planner's
// normalized x (0..1) is scaled by 100.
const PEG_TOP = 16
const ROW_GAP = 8.5
const PEG_R = 1.2
const BALL_R = 2.4
const SLOT_TOP = PEG_TOP + PACHINKO_ROWS * ROW_GAP + 4
const SLOT_BOTTOM = 146
const START = { x: 50, y: 5 }

const pegY = (row: number) => PEG_TOP + row * ROW_GAP
// Ball resting on top of a peg in this row.
const restY = (row: number) => pegY(row) - PEG_R - BALL_R

type Segment = { x0: number; y0: number; x1: number; y1: number; hop: number; ms: number; tick: boolean }

function buildSegments(xs: number[], slotCount: number, slot: number): Segment[] {
  const segments: Segment[] = [{ x0: START.x, y0: START.y, x1: xs[0] * 100, y1: restY(0), hop: 0, ms: 450, tick: true }]
  for (let r = 0; r < PACHINKO_ROWS - 1; r++) {
    segments.push({ x0: xs[r] * 100, y0: restY(r), x1: xs[r + 1] * 100, y1: restY(r + 1), hop: 3, ms: 360, tick: true })
  }
  const last = PACHINKO_ROWS - 1
  const exitX = xs[PACHINKO_ROWS] * 100
  segments.push({ x0: xs[last] * 100, y0: restY(last), x1: exitX, y1: SLOT_TOP, hop: 3, ms: 360, tick: false })
  const slotCenter = ((slot + 0.5) / slotCount) * 100
  segments.push({ x0: exitX, y0: SLOT_TOP, x1: slotCenter, y1: SLOT_BOTTOM - BALL_R - 1, hop: 0, ms: 450, tick: false })
  return segments
}

export default function Pachinko({ prizes, target, onFinished }: MechanicProps) {
  const [ball, setBall] = useState(START)
  const [landedSlot, setLandedSlot] = useState<number | null>(null)
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  })

  const runId = target?.runId
  useEffect(() => {
    if (!target) return
    const slot = prizes.findIndex((p) => p.id === target.prizeId)
    if (slot === -1) {
      // The prize list changed since this screen loaded (admin edit). Skip
      // the animation but still let the shell reveal the prize.
      onFinishedRef.current()
      return
    }
    const segments = buildSegments(planPachinkoPath(slot, prizes.length), prizes.length, slot)
    let i = 0
    let segmentStart: number | null = null
    let raf = 0
    const frame = (now: number) => {
      if (segmentStart === null) {
        segmentStart = now
        setLandedSlot(null)
      }
      let seg = segments[i]
      let t = (now - segmentStart) / seg.ms
      while (t >= 1) {
        if (seg.tick) playSpinTick()
        i++
        if (i >= segments.length) {
          setBall({ x: seg.x1, y: seg.y1 })
          setLandedSlot(slot)
          onFinishedRef.current()
          return
        }
        segmentStart += seg.ms
        seg = segments[i]
        t = (now - segmentStart) / seg.ms
      }
      // x moves evenly; y accelerates like gravity, with a small hop after each peg.
      setBall({ x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t * t - seg.hop * 4 * t * (1 - t) })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // Only a new drop (runId) restarts the animation -- not the prize list
    // refreshing after a win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const slotWidth = 100 / Math.max(prizes.length, 1)

  return (
    <div className="w-full rounded-2xl border-4 border-black bg-black p-2 shadow-[0_6px_0_#cc9700]">
      <svg viewBox="0 0 100 150" className="block h-auto w-full" data-landed-slot={landedSlot ?? undefined}>
        <defs>
          <linearGradient id="pachinko-board" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe45c" />
            <stop offset="100%" stopColor="#fad403" />
          </linearGradient>
          <radialGradient id="pachinko-ball" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#d4d4d8" />
            <stop offset="100%" stopColor="#71717a" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="150" rx="4" fill="url(#pachinko-board)" />
        {Array.from({ length: PACHINKO_ROWS }, (_, row) =>
          pegColumns(row).map((x) => <circle key={`${row}-${x}`} cx={x * 100} cy={pegY(row)} r={PEG_R} fill="#1a1a1a" />)
        )}
        {prizes.map((prize, i) => {
          const x = i * slotWidth
          const landed = landedSlot === i
          const labelX = x + slotWidth / 2
          const labelY = SLOT_BOTTOM - 3
          return (
            <g key={prize.id}>
              <rect x={x} y={SLOT_TOP} width={slotWidth} height={SLOT_BOTTOM - SLOT_TOP} fill={landed ? '#000' : i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.16)'} />
              {i > 0 && <line x1={x} y1={SLOT_TOP - 3} x2={x} y2={SLOT_BOTTOM} stroke="#000" strokeWidth={0.8} />}
              <text
                x={labelX}
                y={labelY}
                transform={`rotate(-90 ${labelX} ${labelY})`}
                dominantBaseline="middle"
                fontSize={4.2}
                fontWeight={800}
                fill={landed ? '#fad403' : '#000'}
              >
                {slotLabel(prize.name)}
              </text>
            </g>
          )
        })}
        <circle cx={ball.x} cy={ball.y} r={BALL_R} fill="url(#pachinko-ball)" stroke="#3f3f46" strokeWidth={0.4} />
      </svg>
    </div>
  )
}
```

- [ ] **Step 3: Mechanic registry**

`components/games/mechanics.ts`:
```ts
import type { ComponentType } from 'react'
import type { Mechanic } from '@/lib/games'
import Pachinko from './pachinko'
import type { MechanicProps } from './types'

// Board component + button wording for each shared-platform mechanic.
export const MECHANICS: Record<Mechanic, { component: ComponentType<MechanicProps>; actionLabel: string; busyLabel: string }> = {
  pachinko: { component: Pachinko, actionLabel: 'Drop', busyLabel: 'Dropping…' },
}
```

- [ ] **Step 4: Shared play shell**

`components/play/game-shell.tsx`:
```tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MECHANICS } from '@/components/games/mechanics'
import type { DropTarget } from '@/components/games/types'
import { launchConfetti } from '@/lib/confetti'
import type { Mechanic } from '@/lib/games'
import type { ApiPrize } from '@/lib/prize-config'
import { prizePhotoFor } from '@/lib/prize-photos'
import { playConfettiPop, playWinChime } from '@/lib/sound'

type PlayedPrize = { id: string; name: string; prizeType: string; displayOrder: number }

const navButton =
  'flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fad403] shadow-[0_3px_0_#cc9700] active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]'

// Everything around a shared-platform game's board: nav buttons, loading and
// error states, the play button, the draw request, and the prize reveal.
export default function GameShell({ slug, title, mechanic }: { slug: string; title: string; mechanic: Mechanic }) {
  const { component: Board, actionLabel, busyLabel } = MECHANICS[mechanic]
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [prizes, setPrizes] = useState<ApiPrize[]>([])
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<DropTarget | null>(null)
  const [result, setResult] = useState<PlayedPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const pendingRef = useRef<PlayedPrize | null>(null)
  // Synchronous double-tap guard: state updates aren't visible until the
  // next render, a ref is.
  const busyRef = useRef(false)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)

  const loadPrizes = useCallback(async () => {
    const res = await fetch(`/api/games/${slug}/config`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Failed to load ${title}.`)
    return (data.prizes as ApiPrize[]).filter((p) => p.active)
  }, [slug, title])

  useEffect(() => {
    let cancelled = false
    loadPrizes()
      .then((list) => {
        if (!cancelled) setPrizes(list)
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadPrizes])

  // Confetti once the reveal overlay (and its canvas) is mounted.
  useEffect(() => {
    if (!result) return
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    return launchConfetti(canvas)
  }, [result])

  async function handlePlay() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setPlayError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/games/${slug}/play`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong — please try again.')
      pendingRef.current = data.prize
      setTarget({ prizeId: data.prize.id, runId: Date.now() })
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleFinished = useCallback(() => {
    setResult(pendingRef.current)
    busyRef.current = false
    setBusy(false)
    playWinChime()
    playConfettiPop()
    loadPrizes()
      .then(setPrizes)
      .catch(() => {
        // A failed background refresh shouldn't interrupt the result.
      })
  }, [loadPrizes])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <p className="text-sm text-white/70">Loading {title}…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <div className="w-full max-w-md rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-300">
          Failed to load {title}: {loadError}
        </div>
      </div>
    )
  }

  const photo = result ? prizePhotoFor(result.name) : null

  return (
    <div className="relative flex flex-1 flex-col items-center bg-black">
      <div className="relative w-full max-w-md px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" aria-label="Back" className={navButton}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M5 12l6-6M5 12l6 6" />
            </svg>
          </Link>
          <Link href={`/admin/${slug}`} aria-label="Manage prizes" className={navButton}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </Link>
        </div>

        {prizes.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/70">No prizes configured yet.</p>
        ) : (
          <Board prizes={prizes} target={target} onFinished={handleFinished} />
        )}

        <button
          type="button"
          onClick={handlePlay}
          disabled={busy || prizes.length === 0}
          className="mt-6 w-full rounded-full bg-[#fad403] py-4 text-center font-extrabold uppercase tracking-wide text-black shadow-[0_4px_0_#cc9700] transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] disabled:opacity-70"
        >
          {busy ? busyLabel : actionLabel}
        </button>

        {playError && (
          <div className="mt-4 w-full rounded-lg border border-red-900 bg-red-950/90 p-3 text-center text-sm text-red-200">{playError}</div>
        )}
      </div>

      {result && (
        <button
          type="button"
          onClick={() => setResult(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 px-8 animate-[wheel-reveal-in_300ms_ease-out]"
        >
          {photo && <Image src={photo} alt={result.name} width={600} height={600} className="mb-6 h-56 w-56 object-contain" />}
          <p className="mb-1 text-sm text-white/70">You won</p>
          <p className="text-center text-3xl font-extrabold text-[#fad403]">{result.name}</p>
          <p className="mt-8 text-xs text-white/50">Tap anywhere to continue</p>
          <canvas ref={confettiCanvasRef} className="pointer-events-none absolute inset-0" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Play route page**

`app/play/[game]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import GameShell from '@/components/play/game-shell'
import { getSharedGame, SHARED_GAMES } from '@/lib/games'

// Only registered shared games get a page; /play/wheel etc. are separate
// static routes and take precedence over this dynamic one.
export const dynamicParams = false

export function generateStaticParams() {
  return SHARED_GAMES.map((g) => ({ game: g.slug }))
}

export default async function PlayGamePage({ params }: { params: Promise<{ game: string }> }) {
  const game = getSharedGame((await params).game)
  if (!game) notFound()
  return <GameShell slug={game.slug} title={game.title} mechanic={game.mechanic} />
}
```

- [ ] **Step 6: Verify in the browser**

`npx tsc --noEmit` clean; `npm test` passes. Start `npm run dev`, open `http://localhost:3000/play/pachinko` at 390×844 (temp Playwright from the scratchpad, see memory `reference_laki_game_verification`): board shows 3 labeled slots; tap DROP → ball bounces peg by peg for ~5 s, lands in a slot, reveal shows the prize whose slot is highlighted; `/play/wheel` still loads the old Wheel; `/play/nope` → 404. Screenshot into the scratchpad and look at it.

- [ ] **Step 7: Commit**

```bash
git add components 'app/play/[game]'
git commit -m "Add shared play shell and Pachinko board"
```

---

### Task 6: Shared admin screen (preview left, editor right, copy prizes)

**Files:**
- Create: `components/admin/prize-editor.tsx`, `components/admin/game-admin.tsx`, `app/admin/[game]/page.tsx`

**Interfaces:**
- Consumes: `ApiPrize`, `SubmittedPrize`, `ALLOWED_PRIZE_TYPES` (Task 1); `GAMES`, `getSharedGame`, `SHARED_GAMES`, `Mechanic` (Task 3); config API (Task 4); `MECHANICS` (Task 5)
- Produces:
  - `type EditablePrize = Omit<ApiPrize, 'id'> & { id?: string }`
  - `<PrizeEditor prizes maxPrizes onChange />`, `<GameAdmin slug title mechanic maxPrizes />`

- [ ] **Step 1: Prize editor**

`components/admin/prize-editor.tsx`:
```tsx
'use client'

import { adminStyles as s } from '@/app/admin/admin-styles'
import { ALLOWED_PRIZE_TYPES, type ApiPrize } from '@/lib/prize-config'

export type EditablePrize = Omit<ApiPrize, 'id'> & { id?: string }

type Props = {
  prizes: EditablePrize[]
  maxPrizes: number
  onChange: (next: EditablePrize[]) => void
}

// Prize list editor shared by every shared-platform game's admin screen.
export default function PrizeEditor({ prizes, maxPrizes, onChange }: Props) {
  const update = (index: number, patch: Partial<EditablePrize>) =>
    onChange(prizes.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  const add = () =>
    onChange([...prizes, { name: '', prizeType: 'merchandise', probability: null, inventory: null, active: true, displayOrder: prizes.length }])
  const remove = (index: number) => onChange(prizes.filter((_, i) => i !== index))
  const numberOrNull = (value: string) => (value === '' ? null : Number(value))

  const withProbability = prizes.filter((p) => p.active && p.probability !== null)
  const withoutProbability = prizes.filter((p) => p.active && p.probability === null)
  const probabilityTotal = Number(withProbability.reduce((sum, p) => sum + (p.probability ?? 0), 0).toFixed(3))

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className={s.sectionHeading}>Prizes (max {maxPrizes})</h2>
        <button type="button" onClick={add} disabled={prizes.length >= maxPrizes} className={`${s.secondaryButton} disabled:opacity-50`}>
          Add prize
        </button>
      </div>

      <p className={`mb-3 text-xs ${probabilityTotal > 100 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
        Probabilities total: {probabilityTotal}%
        {withoutProbability.length > 0
          ? ` (remaining ${Math.max(0, 100 - probabilityTotal)}% split across ${withoutProbability.length} prize(s) with no probability set)`
          : ''}
      </p>

      {prizes.length > maxPrizes && (
        <p className={s.messageError}>
          You have {prizes.length} prizes but this game supports at most {maxPrizes} — remove {prizes.length - maxPrizes} prize(s) before saving.
        </p>
      )}

      {prizes.length === 0 ? (
        <p className={s.emptyState}>No prizes yet. Click &quot;Add prize&quot; to create one.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {prizes.map((prize, index) => (
            <div key={index} className={s.card}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={s.fieldLabel}>Name</span>
                  <input type="text" value={prize.name} maxLength={100} placeholder="Prize name" className={s.input}
                    onChange={(e) => update(index, { name: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Type</span>
                  <select value={prize.prizeType} className={s.input} onChange={(e) => update(index, { prizeType: e.target.value })}>
                    {ALLOWED_PRIZE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Probability (%)</span>
                  <input type="number" min={0} max={100} step="any" value={prize.probability ?? ''} placeholder="Auto" className={s.input}
                    onFocus={(e) => e.target.select()} onChange={(e) => update(index, { probability: numberOrNull(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Inventory</span>
                  <input type="number" min={0} step={1} value={prize.inventory ?? ''} placeholder="Unlimited" className={s.input}
                    onFocus={(e) => e.target.select()} onChange={(e) => update(index, { inventory: numberOrNull(e.target.value) })} />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className={s.checkboxLabel}>
                  <input type="checkbox" checked={prize.active} className="h-4 w-4 accent-[#fad403]"
                    onChange={(e) => update(index, { active: e.target.checked })} />
                  Active
                </label>
                <button type="button" onClick={() => remove(index)} className={s.dangerLink}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Admin screen**

`components/admin/game-admin.tsx`:
```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminStyles as s } from '@/app/admin/admin-styles'
import PrizeEditor, { type EditablePrize } from '@/components/admin/prize-editor'
import { MECHANICS } from '@/components/games/mechanics'
import { GAMES, type Mechanic } from '@/lib/games'
import type { ApiPrize, SubmittedPrize } from '@/lib/prize-config'

type Props = { slug: string; title: string; mechanic: Mechanic; maxPrizes: number }

const noop = () => {}

async function fetchPrizes(url: string, what: string): Promise<ApiPrize[]> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Failed to load ${what}.`)
  return data.prizes as ApiPrize[]
}

// Admin screen for any shared-platform game: live preview of the board on the
// left, prize editor on the right (stacked on phones).
export default function GameAdmin({ slug, title, mechanic, maxPrizes }: Props) {
  const Board = MECHANICS[mechanic].component
  const configUrl = `/api/games/${slug}/config`
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [prizes, setPrizes] = useState<EditablePrize[]>([])
  const [original, setOriginal] = useState<Map<string, ApiPrize>>(new Map())
  const [copySource, setCopySource] = useState('')

  const copySources = GAMES.filter((g) => g.slug !== slug && g.prizesConfigUrl)

  function applyLoaded(list: ApiPrize[]) {
    setPrizes(list)
    setOriginal(new Map(list.map((p) => [p.id, p])))
  }

  useEffect(() => {
    let cancelled = false
    fetchPrizes(configUrl, `${title} prizes`)
      .then((list) => {
        if (!cancelled) applyLoaded(list)
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [configUrl, title])

  // What players would see if saved now: active, named prizes in order.
  const previewPrizes = useMemo<ApiPrize[]>(
    () =>
      prizes
        .map((p, i) => ({ ...p, id: p.id ?? `new-${i}`, displayOrder: i }))
        .filter((p) => p.active && p.name.trim() !== ''),
    [prizes]
  )

  // Replaces the editor's rows with another game's prizes as new, unsaved
  // rows. Nothing changes for players until Save.
  async function handleCopy() {
    const source = copySources.find((g) => g.slug === copySource)
    if (!source?.prizesConfigUrl) return
    setMessage(null)
    try {
      const list = await fetchPrizes(source.prizesConfigUrl, `${source.title} prizes`)
      const copied: EditablePrize[] = list.slice(0, maxPrizes).map((p, i) => ({
        name: p.name, prizeType: p.prizeType, probability: p.probability, inventory: p.inventory, active: p.active, displayOrder: i,
      }))
      setPrizes(copied)
      const leftOut = list.length - copied.length
      setMessage({
        type: 'success',
        text: `Copied ${copied.length} prize(s) from ${source.title}${leftOut > 0 ? ` (${leftOut} left out — max ${maxPrizes})` : ''}. Press Save to keep them.`,
      })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Copy failed.' })
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const payload: { prizes: SubmittedPrize[] } = {
        prizes: prizes.map((p, i) => {
          const body: SubmittedPrize = { name: p.name, prizeType: p.prizeType, probability: p.probability, active: p.active, displayOrder: i }
          if (p.id) body.id = p.id
          // Only send stock the admin actually changed, so plays since the
          // page loaded aren't overwritten.
          if (!p.id || p.inventory !== original.get(p.id)?.inventory) body.inventory = p.inventory
          return body
        }),
      }
      const res = await fetch(configUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to save ${title} prizes.`)
      // Saving replaces rows with new ids -- reload so the next save's
      // untouched-stock check compares against the real rows.
      applyLoaded(await fetchPrizes(configUrl, `${title} prizes`))
      setMessage({ type: 'success', text: `${title} prizes saved.` })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : `Failed to save ${title} prizes.` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={s.page}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading {title} prizes…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={s.page}>
        <div className={s.loadErrorBox}>Failed to load {title} prizes: {loadError}</div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className="w-full max-w-6xl">
        <h1 className={s.title}>
          <span className={s.titleAccent} />
          Admin: {title}
        </h1>

        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="md:sticky md:top-6">
            <h2 className={s.sectionHeading}>Preview</h2>
            <p className={s.sectionSubtext}>Shows your changes as you type. Players see them after you press Save.</p>
            <div className="mx-auto max-w-sm">
              <Board prizes={previewPrizes} target={null} onFinished={noop} />
            </div>
          </section>

          <section>
            {copySources.length > 0 && (
              <div className="mb-6 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Copy prizes from another game</span>
                  <select value={copySource} onChange={(e) => setCopySource(e.target.value)} className={s.input}>
                    <option value="">Choose a game…</option>
                    {copySources.map((g) => (
                      <option key={g.slug} value={g.slug}>{g.title}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleCopy} disabled={!copySource} className={`${s.secondaryButton} disabled:opacity-50`}>
                  Copy
                </button>
              </div>
            )}

            <PrizeEditor prizes={prizes} maxPrizes={maxPrizes} onChange={setPrizes} />

            {message && <div className={message.type === 'success' ? s.messageSuccess : s.messageError}>{message.text}</div>}

            <button type="button" onClick={handleSave} disabled={saving || prizes.length > maxPrizes} className={s.primaryButton}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Admin route page**

`app/admin/[game]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import GameAdmin from '@/components/admin/game-admin'
import { getSharedGame, SHARED_GAMES } from '@/lib/games'

// /admin/wheel etc. are separate static routes and take precedence.
export const dynamicParams = false

export function generateStaticParams() {
  return SHARED_GAMES.map((g) => ({ game: g.slug }))
}

export default async function GameAdminPage({ params }: { params: Promise<{ game: string }> }) {
  const game = getSharedGame((await params).game)
  if (!game) notFound()
  return <GameAdmin slug={game.slug} title={game.title} mechanic={game.mechanic} maxPrizes={game.maxPrizes} />
}
```

- [ ] **Step 4: Verify in the browser**

`npx tsc --noEmit` clean. With `npm run dev`, via Playwright at 1280×900 and 390×844:
- `/admin/pachinko`: preview left + editor right on desktop, stacked on phone; header shows "← Back to Pachinko".
- Rename a prize → preview slot label updates before saving; untick Active → slot disappears from preview.
- Copy from "Spin the Wheel" → 6 rows, success message; Save → reload shows 6 prizes; `/play/pachinko` shows 6 slots.
- Stock `1.5` → Save shows "Inventory … whole number" error, nothing saved.
- `/admin/wheel` still the old Wheel admin.
Reset local D1 afterwards (`rm -rf .wrangler/state && npx wrangler d1 migrations apply laki-game --local`).

- [ ] **Step 5: Commit**

```bash
git add components/admin 'app/admin/[game]'
git commit -m "Add shared admin screen: live preview, prize editor, copy prizes"
```

---

### Task 7: End-to-end verification, docs, deploy

**Files:**
- Modify: `README.md` (add "Adding a new game" section)
- Scratchpad only (not committed): Playwright E2E script

- [ ] **Step 1: README section**

Append to `README.md` before the Deploy section:
```markdown
## Adding a new game

Games are listed in `lib/games.ts`. A new *type* of game (like Pachinko) on the shared platform needs only:

1. A board component in `components/games/<mechanic>.tsx` implementing `MechanicProps` (`components/games/types.ts`): render the prizes, animate to `target` when it's set, call `onFinished()` once when done.
2. Register it in `components/games/mechanics.ts` (component + button labels) and add the mechanic name to `Mechanic` in `lib/games.ts`.
3. Add `shared('<slug>', '<Title>', '<mechanic>', <maxPrizes>)` to `GAMES`.

Prizes, odds, stock, the play screen, the prize reveal, `/admin/<slug>` and the home-page button come for free. Deploy with `npm run deploy` — no migration needed (all shared games use the `game_prizes` table).
```

- [ ] **Step 2: Production build in the Workers runtime**

```bash
npm test && npx tsc --noEmit && npx opennextjs-cloudflare build
npx wrangler dev --port 8787   # background
```
Check: `/`, `/play/pachinko`, `/admin/pachinko`, `/play/wheel`, `/play/color-game`, `/play/duck-race`, all admin pages → 200; `/play/nope` → 404; home shows 4 buttons; prefetch count on `/` stays small (the `count.cjs` check from the migration: finished requests, none left open).

- [ ] **Step 3: E2E drop test (20 drops) + double tap**

Scratchpad Playwright script against `http://localhost:8787/play/pachinko` at 390×844:
- fetch `/api/games/pachinko/config`, keep active prizes in order;
- repeat 20×: register a listener for the `/play` response, click **Drop**, wait for text "You won", read `svg[data-landed-slot]`, assert `prizes[slot].name === response.prize.name` and the reveal shows that name; click the overlay to dismiss;
- double tap: `dblclick` on Drop → exactly one `/play` request recorded.
Expected: 20/20 matches, 1 request for the double tap.

- [ ] **Step 4: Stale board check + long names screenshot**

- Open `/play/pachinko` in page A; in page B save a different prize list via the admin API (`PUT` 2 new prizes); click Drop in page A → reveal still appears (no stuck "Dropping…"), board then shows the new 2 slots.
- `PUT` 8 prizes with ~30-char names; screenshot `/play/pachinko` and `/admin/pachinko` at 390×844; confirm labels stay inside their slots.
- Reset local D1.

- [ ] **Step 5: Deploy**

Stop the local `wrangler dev` (kill leftover node/workerd/esbuild processes by CommandLine match). Then:
```bash
npx wrangler whoami            # claire@racphil.com
npm run db:migrate             # applies 0003 to the live D1
npm run deploy
```
Live checks on `https://laki-game.claire-835.workers.dev`: all pages 200; `/api/games/pachinko/config` returns the 3 seeded prizes; 5 live drops land in the matching slot (seeded prizes are unlimited, so live plays change nothing); legacy game APIs still return their prizes; phone screenshots of home, `/play/pachinko`, `/admin/pachinko`.

- [ ] **Step 6: Commit + push**

```bash
git add README.md
git commit -m "Document how to add a new game"
git push origin main
```
