'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GAMES: Record<string, string> = {
  wheel: 'Wheel',
  'color-game': 'Color Game',
  'duck-race': 'Duck Race',
}

// The landing page and both public play screens (kiosk/booth tablets) each
// have their own fully custom, branded design with no shared chrome -- a
// player standing at the booth must not see a nav bar that could lead
// straight into prize/inventory setup. Only the admin config screens use
// this shared header, for convenience navigating back to the game being
// configured.
export default function SiteHeader() {
  const pathname = usePathname()
  const isAdminScreen = pathname?.startsWith('/admin')

  if (!isAdminScreen) {
    return null
  }

  // Which game's admin screen this is, if any (e.g. "/admin/color-game" ->
  // "color-game") -- drives the "back to that game" link below instead of a
  // flat list of every game's admin/play links, which read as a cluttered
  // "module dashboard" rather than a way back to what you were just doing.
  const slug = pathname?.split('/')[2]
  const game = slug ? GAMES[slug] : undefined

  return (
    <header className="border-b border-black/[.08] dark:border-white/[.145] px-6 py-4 flex items-center gap-4">
      <Link href="/" className="font-semibold text-lg hover:underline">
        Laki-Game
      </Link>
      {game && (
        <Link href={`/play/${slug}`} className="ml-auto text-sm font-medium hover:underline">
          ← Back to {game}
        </Link>
      )}
    </header>
  )
}
