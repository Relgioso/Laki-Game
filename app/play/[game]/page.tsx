import { notFound } from 'next/navigation'
import GameShell from '@/components/play/game-shell'
import { getSharedGame, SHARED_GAMES } from '@/lib/games'

// Only registered shared games get a page; /play/wheel etc. are separate
// static routes and take precedence over this dynamic one.
export const dynamicParams = false

export function generateStaticParams() {
  return SHARED_GAMES.map((g) => ({ game: g.slug }))
}

export default async function PlayGamePage({ params }: { params: Promise<{ game: string }> }) {
  const game = getSharedGame((await params).game)
  if (!game) notFound()
  return <GameShell slug={game.slug} title={game.title} mechanic={game.mechanic} />
}
