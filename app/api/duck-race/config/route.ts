import { currentInventoryBy, replacePrizes, selectPrizes } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_PRIZE_TYPES = ['merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom']
const MAX_PRIZES = 8

export async function GET() {
  try {
    const prizes = await selectPrizes('duck_race_prizes', '', 'display_order ASC')

    return NextResponse.json({
      prizes: prizes.map(p => ({
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
    const { prizes } = await request.json()

    if (!Array.isArray(prizes)) {
      return NextResponse.json({ error: 'prizes must be an array.' }, { status: 400 })
    }

    if (prizes.length > MAX_PRIZES) {
      return NextResponse.json(
        { error: `Duck Race supports at most ${MAX_PRIZES} prizes (got ${prizes.length}).` },
        { status: 400 }
      )
    }

    for (const p of prizes) {
      const name = typeof p.name === 'string' ? p.name.trim() : ''
      if (name.length === 0 || name.length > 100) {
        return NextResponse.json(
          { error: `Prize name must be between 1 and 100 characters (got "${p.name ?? ''}").` },
          { status: 400 }
        )
      }
      if (!ALLOWED_PRIZE_TYPES.includes(p.prizeType)) {
        return NextResponse.json(
          { error: `Invalid prize type: ${p.prizeType}` },
          { status: 400 }
        )
      }
    }

    // Same read-before-replace inventory merge as the Wheel's config route:
    // a row the admin didn't touch (no `inventory` key in its payload) keeps
    // whatever the live DB value is at save time, not a stale page-load snapshot.
    const currentInventoryById = await currentInventoryBy('duck_race_prizes', 'id')

    await replacePrizes('duck_race_prizes', prizes.map((p: any, i: number) => {
      let inventory: number | null
      if (p.id && !('inventory' in p)) {
        inventory = currentInventoryById.has(p.id)
          ? (currentInventoryById.get(p.id) as number | null)
          : (p.inventory ?? null)
      } else {
        inventory = p.inventory ?? null
      }
      return {
        name: p.name,
        prize_type: p.prizeType,
        probability: p.probability ?? null,
        inventory,
        active: p.active ?? true,
        display_order: p.displayOrder ?? i,
      }
    }))

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
