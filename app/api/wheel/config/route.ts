import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from('wheel_settings')
      .select('slot_count')
      .eq('id', 1)
      .single()
    if (settingsError) throw settingsError

    const { data: prizes, error: prizesError } = await supabase
      .from('wheel_prizes')
      .select('*')
      .order('display_order', { ascending: true })
    if (prizesError) throw prizesError

    return NextResponse.json({
      slotCount: settings.slot_count,
      prizes: (prizes || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        prizeType: p.prize_type,
        probability: p.probability,
        inventory: p.inventory,
        active: p.active,
        displayOrder: p.display_order,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { slotCount, prizes } = await request.json()
    if (![6, 8, 10, 12].includes(slotCount)) {
      return NextResponse.json({ error: 'slotCount must be 6, 8, 10, or 12.' }, { status: 400 })
    }

    const { error: settingsError } = await supabase
      .from('wheel_settings')
      .update({ slot_count: slotCount })
      .eq('id', 1)
    if (settingsError) throw settingsError

    // Full replace: delete every existing prize, then insert the submitted set.
    // Simplest correct approach for a single admin editing a small list (max 12
    // rows) with no concurrent-editor concern in this no-login app.
    const { error: deleteError } = await supabase.from('wheel_prizes').delete().not('id', 'is', null)
    if (deleteError) throw deleteError

    if (prizes && prizes.length > 0) {
      const rows = prizes.map((p: any, i: number) => ({
        name: p.name,
        prize_type: p.prizeType,
        probability: p.probability ?? null,
        inventory: p.inventory ?? null,
        active: p.active ?? true,
        display_order: p.displayOrder ?? i,
      }))
      const { error: insertError } = await supabase.from('wheel_prizes').insert(rows)
      if (insertError) throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
