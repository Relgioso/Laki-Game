// Every game on the home page. Legacy games (Wheel, Color Game, Duck Race)
// have their own hand-built pages and APIs. Shared games run on the generic
// /play/[game], /admin/[game] and /api/games/[game] routes: adding one means
// writing its mechanic component (components/games/) and adding it here.
export type Mechanic = 'pachinko'

type BaseGame = {
  slug: string
  title: string
  // Shorter name for the admin header's "← Back to …" button.
  navTitle: string
  playHref: string
  adminHref: string
  // Config endpoint whose GET returns `{ prizes: [...] }`, used by "Copy
  // prizes from…". null when the game's config has another shape.
  prizesConfigUrl: string | null
}
export type LegacyGame = BaseGame & { platform: 'legacy' }
export type SharedGame = BaseGame & { platform: 'shared'; mechanic: Mechanic; maxPrizes: number }
export type Game = LegacyGame | SharedGame

function shared(slug: string, title: string, mechanic: Mechanic, maxPrizes: number): SharedGame {
  return {
    slug, title, navTitle: title, platform: 'shared', mechanic, maxPrizes,
    playHref: `/play/${slug}`, adminHref: `/admin/${slug}`, prizesConfigUrl: `/api/games/${slug}/config`,
  }
}

export const GAMES: Game[] = [
  { slug: 'wheel', title: 'Spin the Wheel', navTitle: 'Wheel', platform: 'legacy', playHref: '/play/wheel', adminHref: '/admin/wheel', prizesConfigUrl: '/api/wheel/config' },
  { slug: 'color-game', title: 'Color Game', navTitle: 'Color Game', platform: 'legacy', playHref: '/play/color-game', adminHref: '/admin/color-game', prizesConfigUrl: null },
  { slug: 'duck-race', title: 'Duck Race', navTitle: 'Duck Race', platform: 'legacy', playHref: '/play/duck-race', adminHref: '/admin/duck-race', prizesConfigUrl: '/api/duck-race/config' },
  shared('pachinko', 'Pachinko', 'pachinko', 8),
]

export const SHARED_GAMES = GAMES.filter((g): g is SharedGame => g.platform === 'shared')

export function getSharedGame(slug: string): SharedGame | null {
  return SHARED_GAMES.find(g => g.slug === slug) ?? null
}
