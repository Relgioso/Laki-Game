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
