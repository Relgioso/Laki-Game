import { getSharedGame } from '@/lib/games'
import { drawGamePrize } from '@/lib/prize-draw'
import { NextRequest, NextResponse } from 'next/server'

type Ctx = { params: Promise<{ game: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const game = getSharedGame((await ctx.params).game)
  if (!game) return NextResponse.json({ error: 'Unknown game.' }, { status: 404 })
  try {
    const result = await drawGamePrize(game.slug)
    if (result.status === 'empty') return NextResponse.json({ error: 'No prizes available to draw.' }, { status: 400 })
    if (result.status === 'busy') {
      return NextResponse.json({ error: 'Could not complete draw after retries — please try again.' }, { status: 409 })
    }
    const p = result.prize
    return NextResponse.json({ prize: { id: p.id, name: p.name, prizeType: p.prize_type, displayOrder: p.display_order } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
