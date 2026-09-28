import { notFound } from 'next/navigation'
import GameAdmin from '@/components/admin/game-admin'
import { getSharedGame, SHARED_GAMES } from '@/lib/games'

// /admin/wheel etc. are separate static routes and take precedence.
export const dynamicParams = false

export function generateStaticParams() {
  return SHARED_GAMES.map((g) => ({ game: g.slug }))
}

export default async function GameAdminPage({ params }: { params: Promise<{ game: string }> }) {
  const game = getSharedGame((await params).game)
  if (!game) notFound()
  return <GameAdmin slug={game.slug} title={game.title} mechanic={game.mechanic} maxPrizes={game.maxPrizes} />
}
