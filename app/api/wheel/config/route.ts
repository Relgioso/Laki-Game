import { currentInventoryBy, getDb, replacePrizes, selectPrizes } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_PRIZE_TYPES = ['merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom']

export async function GET() {
  try {
    const settings = await getDb()
      .prepare('SELECT slot_count FROM wheel_settings WHERE id = 1')
      .first<{ slot_count: number }>()
    if (!settings) throw new Error('Wheel settings row is missing.')

    const prizes = await selectPrizes('wheel_prizes', '', 'display_order ASC')

    return NextResponse.json({
      slotCount: settings.slot_count,
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
    const { slotCount, prizes } = await request.json()
    if (![6, 8, 10, 12].includes(slotCount)) {
      return NextResponse.json({ error: 'slotCount must be 6, 8, 10, or 12.' }, { status: 400 })
    }

    if (prizes) {
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
    }

    await getDb().prepare('UPDATE wheel_settings SET slot_count = ? WHERE id = 1').bind(slotCount).run()

    if (prizes) {
      // Fetch current inventory before the replace below, so we can merge live
      // DB values back in for any prize row the admin didn't explicitly edit
      // (i.e. the client omitted `inventory` from that row's payload). Without
      // this, resubmitting a stale page-load snapshot would silently overwrite
      // any inventory changes caused by plays that happened after page load.
      const currentInventoryById = await currentInventoryBy('wheel_prizes', 'id')

      // Full replace: delete every existing prize, then insert the submitted set.
      // Simplest correct approach for a single admin editing a small list (max 12
      // rows) with no concurrent-editor concern in this no-login app.
      await replacePrizes('wheel_prizes', prizes.map((p: any, i: number) => {
        let inventory: number | null
        if (p.id && !('inventory' in p)) {
          // Admin didn't touch this row's inventory -- use the live DB value
          // captured just above, falling back to whatever was submitted if
          // the row was deleted out from under this request (rare race).
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
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
