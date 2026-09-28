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
