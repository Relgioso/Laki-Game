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

async function drawAndDecrement(table: 'color_combo_prizes' | 'color_merch_prizes', filterActive: any[]) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidates = filterActive.filter(c => c.inventory == null || c.inventory > 0)
    if (candidates.length === 0) return null
    const chosen = weightedPick(candidates)
    if (chosen.inventory == null) return chosen
    const { data: updated, error } = await supabase
      .from(table)
      .update({ inventory: chosen.inventory - 1, updated_at: new Date().toISOString() })
      .eq('id', chosen.id)
      .eq('inventory', chosen.inventory)
      .select()
    if (error) throw error
    if (updated && updated.length > 0) return chosen
    // Lost the race — re-fetch fresh state for this table and retry.
    const { data: fresh, error: fetchError } = await supabase.from(table).select('*').eq('active', true)
    if (fetchError) throw fetchError
    filterActive = fresh || []
  }
  return null
}

export async function POST() {
  try {
    const { data: combos, error: comboError } = await supabase
      .from('color_combo_prizes')
      .select('*')
      .eq('active', true)
    if (comboError) throw comboError

    const activeCombos = (combos || []).filter((c: any) => c.inventory == null || c.inventory > 0)
    const comboProbabilityTotal = activeCombos.reduce((sum: number, c: any) => sum + (c.probability || 0), 0)
    const roll = Math.random() * 100

    if (roll < comboProbabilityTotal && activeCombos.length > 0) {
      const won = await drawAndDecrement('color_combo_prizes', activeCombos)
      if (won) {
        return NextResponse.json({ result: won.symbol, prize: { name: won.name, prizeType: won.prize_type } })
      }
      // Fell through (lost every retry) — fall back to merch below instead of erroring outright.
      console.warn('Color Game: combo draw exhausted retries, falling back to merchandise pool')
    }

    const { data: merch, error: merchError } = await supabase
      .from('color_merch_prizes')
      .select('*')
      .eq('active', true)
    if (merchError) throw merchError

    const won = await drawAndDecrement('color_merch_prizes', merch || [])
    if (!won) {
      return NextResponse.json({ error: 'No prizes available to draw.' }, { status: 400 })
    }
    return NextResponse.json({ result: 'merch', prize: { name: won.name, prizeType: won.prize_type } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
