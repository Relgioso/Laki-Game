import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
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
      const { data: candidates, error } = await supabase
        .from('duck_race_prizes')
        .select('*')
        .eq('active', true)
        .or('inventory.is.null,inventory.gt.0')
      if (error) throw error
      if (!candidates || candidates.length === 0) {
        return NextResponse.json({ error: 'No prizes available to draw.' }, { status: 400 })
      }

      const chosen = weightedPick(candidates as any[])

      if (chosen.inventory == null) {
        return NextResponse.json({
          prize: { id: chosen.id, name: chosen.name, prizeType: chosen.prize_type, displayOrder: chosen.display_order },
        })
      }

      const { data: updated, error: updateError } = await supabase
        .from('duck_race_prizes')
        .update({ inventory: chosen.inventory - 1, updated_at: new Date().toISOString() })
        .eq('id', chosen.id)
        .eq('inventory', chosen.inventory)
        .select()
      if (updateError) throw updateError

      if (updated && updated.length > 0) {
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
