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
