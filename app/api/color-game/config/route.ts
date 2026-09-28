import { currentInventoryBy, getDb, replacePrizes, selectPrizes } from '@/lib/db'
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
    const combos = await selectPrizes('color_combo_prizes', '', 'symbol ASC')
    const merch = await selectPrizes('color_merch_prizes', '', 'display_order ASC')

    return NextResponse.json({
      combos: combos.map(c => ({
        id: c.id, symbol: c.symbol, name: c.name, prizeType: c.prize_type,
        probability: c.probability, inventory: c.inventory, active: c.active,
      })),
      merch: merch.map(m => ({
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

    if (combos && combos.length > 0) {
      // Fetch current inventory before updating, so we can merge live DB
      // values back in for any combo row the admin didn't explicitly edit
      // (i.e. the client omitted `inventory` from that row's payload).
      const currentInventoryBySymbol = await currentInventoryBy('color_combo_prizes', 'symbol')

      const db = getDb()
      const update = db.prepare(
        'UPDATE color_combo_prizes SET name = ?, prize_type = ?, probability = ?, inventory = ?, active = ?, updated_at = ? WHERE symbol = ?'
      )
      const now = new Date().toISOString()
      await db.batch(combos.map((c: any) => {
        const inventory = !('inventory' in c)
          ? (currentInventoryBySymbol.has(c.symbol)
              ? currentInventoryBySymbol.get(c.symbol)
              : (c.inventory ?? null))
          : (c.inventory ?? null)
        return update.bind(c.name, c.prizeType, c.probability ?? 0, inventory, (c.active ?? true) ? 1 : 0, now, c.symbol)
      }))
    }

    if (merch) {
      // Same live-DB merge, keyed by id, before the delete+insert replace.
      const currentInventoryById = await currentInventoryBy('color_merch_prizes', 'id')

      await replacePrizes('color_merch_prizes', merch.map((m: any, i: number) => {
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
      }))
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
