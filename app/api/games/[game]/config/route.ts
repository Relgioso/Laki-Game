import { gameInventoryById, replaceGamePrizes, selectGamePrizes } from '@/lib/db'
import { getSharedGame } from '@/lib/games'
import { toApiPrize, toReplacementRows, validatePrizeList, type SubmittedPrize } from '@/lib/prize-config'
import { NextRequest, NextResponse } from 'next/server'

type Ctx = { params: Promise<{ game: string }> }

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function GET(_req: NextRequest, ctx: Ctx) {
  const game = getSharedGame((await ctx.params).game)
  if (!game) return NextResponse.json({ error: 'Unknown game.' }, { status: 404 })
  try {
    const prizes = await selectGamePrizes(game.slug)
    return NextResponse.json({ prizes: prizes.map(toApiPrize) })
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const game = getSharedGame((await ctx.params).game)
  if (!game) return NextResponse.json({ error: 'Unknown game.' }, { status: 404 })

  let body: { prizes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  // Validate everything before any write, so a bad row can't wipe the list.
  const validationError = validatePrizeList(body.prizes, game.maxPrizes)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  try {
    const live = await gameInventoryById(game.slug)
    await replaceGamePrizes(game.slug, toReplacementRows(body.prizes as SubmittedPrize[], live))
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}
