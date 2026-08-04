import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

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

    if (combos) {
      for (const c of combos) {
        if (!['win', 'laki', 'clover'].includes(c.symbol)) {
          return NextResponse.json({ error: `Invalid combo symbol: ${c.symbol}` }, { status: 400 })
        }
        const { error } = await supabase
          .from('color_combo_prizes')
          .update({
            name: c.name,
            prize_type: c.prizeType,
            probability: c.probability ?? 0,
            inventory: c.inventory ?? null,
            active: c.active ?? true,
            updated_at: new Date().toISOString(),
          })
          .eq('symbol', c.symbol)
        if (error) throw error
      }
    }

    if (merch) {
      const { error: deleteError } = await supabase.from('color_merch_prizes').delete().not('id', 'is', null)
      if (deleteError) throw deleteError
      if (merch.length > 0) {
        const rows = merch.map((m: any, i: number) => ({
          name: m.name,
          prize_type: m.prizeType,
          probability: m.probability ?? null,
          inventory: m.inventory ?? null,
          active: m.active ?? true,
          display_order: m.displayOrder ?? i,
        }))
        const { error: insertError } = await supabase.from('color_merch_prizes').insert(rows)
        if (insertError) throw insertError
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
