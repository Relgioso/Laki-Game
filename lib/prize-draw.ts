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
