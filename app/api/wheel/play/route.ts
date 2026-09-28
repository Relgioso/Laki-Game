import { decrementInventory, selectPrizes } from '@/lib/db'
import { NextResponse } from 'next/server'

function weightedPick<T extends { probability: number | null }>(items: T[]): T {
  const withWeights = items.map(i => ({ item: i, weight: i.probability ?? 0 }))
  const unweightedCount = withWeights.filter(w => w.item.probability == null).length
  const totalExplicit = withWeights.reduce((sum, w) => sum + (w.item.probability != null ? w.weight : 0), 0)
  const remaining = Math.max(0, 100 - totalExplicit)
  const equalShare = unweightedCount > 0 ? remaining / unweightedCount : 0
  const resolved = withWeights.map(w => ({ item: w.item, weight: w.item.probability != null ? w.weight : equalShare }))

  const total = resolved.reduce((sum, r) => sum + r.weight, 0)
  if (total <= 0) return items[Math.floor(Math.random() * items.length)]
  let roll = Math.random() * total
  for (const r of resolved) {
    roll -= r.weight
    if (roll <= 0) return r.item
  }
  return resolved[resolved.length - 1].item
}

export async function POST() {
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidates = await selectPrizes('wheel_prizes', 'active = 1 AND (inventory IS NULL OR inventory > 0)')
      if (candidates.length === 0) {
        return NextResponse.json({ error: 'No prizes available to draw.' }, { status: 400 })
      }

      const chosen = weightedPick(candidates)

      if (chosen.inventory == null) {
        // Unlimited stock — no decrement needed, no race to guard against.
        return NextResponse.json({
          prize: { id: chosen.id, name: chosen.name, prizeType: chosen.prize_type, displayOrder: chosen.display_order },
        })
      }

      // Optimistic-lock decrement: only succeeds if inventory still matches what we just read.
      if (await decrementInventory('wheel_prizes', chosen.id, chosen.inventory)) {
        return NextResponse.json({
          prize: { id: chosen.id, name: chosen.name, prizeType: chosen.prize_type, displayOrder: chosen.display_order },
        })
      }
      // Someone else drew the last unit between our read and our write — retry the whole draw.
    }
    return NextResponse.json({ error: 'Could not complete draw after retries — please try again.' }, { status: 409 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
