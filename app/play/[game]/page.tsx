import { notFound } from 'next/navigation'
import GameShell from '@/components/play/game-shell'
import { getSharedGame, SHARED_GAMES } from '@/lib/games'

// Prerenders every registered shared game; unknown slugs hit notFound() below.
// Deliberately NOT `dynamicParams = false`: on OpenNext that turns any
// prerender-cache miss into a 404 instead of an on-demand render.
// /play/wheel etc. are separate static routes and take precedence.

export function generateStaticParams() {
  return SHARED_GAMES.map((g) => ({ game: g.slug }))
}

export default async function PlayGamePage({ params }: { params: Promise<{ game: string }> }) {
  const game = getSharedGame((await params).game)
  if (!game) notFound()
  return <GameShell slug={game.slug} title={game.title} mechanic={game.mechanic} />
}
