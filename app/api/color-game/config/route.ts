import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_PRIZE_TYPES = ['merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom']

function validatePrizeShape(p: any): string | null {
  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (name.length === 0 || name.length > 100) {
    return `Prize name must be between 1 and 100 characters (got "${p.name ?? ''}").`
  }
  if (!ALLOWED_PRIZE_TYPES.includes(p.prizeType)) {
    return `Invalid prize type: ${p.prizeType}`
  }
  return null
}

export async function GET() {
  try {
    const { data: combos, error: comboError } = await supabase
      .from('color_combo_prizes')
      .select('*')
      .order('symbol', { ascending: true })
    if (comboError) throw comboError

    const { data: merch, error: merchError } = await supabase
      .from('color_merch_prizes')
      .select('*')
      .order('display_order', { ascending: true })
    if (merchError) throw merchError

    return NextResponse.json({
      combos: (combos || []).map((c: any) => ({
        id: c.id, symbol: c.symbol, name: c.name, prizeType: c.prize_type,
        probability: c.probability, inventory: c.inventory, active: c.active,
      })),
      merch: (merch || []).map((m: any) => ({
        id: m.id, name: m.name, prizeType: m.prize_type, probability: m.probability,
        inventory: m.inventory, active: m.active, displayOrder: m.display_order,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { combos, merch } = await request.json()

    // Validate everything up front, before any writes, so a bad row never
    // gets the chance to trigger a partial update or wipe the merch table.
    if (combos) {
      for (const c of combos) {
        if (!['win', 'laki', 'clover'].includes(c.symbol)) {
          return NextResponse.json({ error: `Invalid combo symbol: ${c.symbol}` }, { status: 400 })
        }
        const shapeError = validatePrizeShape(c)
        if (shapeError) return NextResponse.json({ error: shapeError }, { status: 400 })
      }
    }
    if (merch) {
      for (const m of merch) {
        const shapeError = validatePrizeShape(m)
        if (shapeError) return NextResponse.json({ error: shapeError }, { status: 400 })
      }
    }

    if (combos) {
      // Fetch current inventory before updating, so we can merge live DB
      // values back in for any combo row the admin didn't explicitly edit
      // (i.e. the client omitted `inventory` from that row's payload).
      const { data: currentCombos, error: currentCombosError } = await supabase
        .from('color_combo_prizes')
        .select('symbol, inventory')
      if (currentCombosError) throw currentCombosError
      const currentInventoryBySymbol = new Map<string, number | null>(
        (currentCombos || []).map((c: any) => [c.symbol, c.inventory])
      )

      for (const c of combos) {
        const inventory = !('inventory' in c)
          ? (currentInventoryBySymbol.has(c.symbol)
              ? currentInventoryBySymbol.get(c.symbol)
              : (c.inventory ?? null))
          : (c.inventory ?? null)
        const { error } = await supabase
          .from('color_combo_prizes')
          .update({
            name: c.name,
            prize_type: c.prizeType,
            probability: c.probability ?? 0,
            inventory,
            active: c.active ?? true,
            updated_at: new Date().toISOString(),
          })
          .eq('symbol', c.symbol)
        if (error) throw error
      }
    }

    if (merch) {
      // Same live-DB merge, keyed by id, before the delete+insert replace.
      const { data: currentMerch, error: currentMerchError } = await supabase
        .from('color_merch_prizes')
        .select('id, inventory')
      if (currentMerchError) throw currentMerchError
      const currentInventoryById = new Map<string, number | null>(
        (currentMerch || []).map((m: any) => [m.id, m.inventory])
      )

      const { error: deleteError } = await supabase.from('color_merch_prizes').delete().not('id', 'is', null)
      if (deleteError) throw deleteError
      if (merch.length > 0) {
        const rows = merch.map((m: any, i: number) => {
          let inventory: number | null
          if (m.id && !('inventory' in m)) {
            inventory = currentInventoryById.has(m.id)
              ? (currentInventoryById.get(m.id) as number | null)
              : (m.inventory ?? null)
          } else {
            inventory = m.inventory ?? null
          }
          return {
            name: m.name,
            prize_type: m.prizeType,
            probability: m.probability ?? null,
            inventory,
            active: m.active ?? true,
            display_order: m.displayOrder ?? i,
          }
        })
        const { error: insertError } = await supabase.from('color_merch_prizes').insert(rows)
        if (insertError) throw insertError
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
