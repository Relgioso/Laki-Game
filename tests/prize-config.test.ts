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
