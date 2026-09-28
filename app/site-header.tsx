'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GAMES } from '@/lib/games'

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
  const game = GAMES.find((g) => g.slug === slug)

  return (
    <header className="bg-black px-6 py-3.5 flex items-center gap-4">
      <Link href="/" className="font-extrabold text-lg tracking-tight text-white">
        LAKI<span className="text-[#fad403]">·</span>GAME
      </Link>
      {game && (
        <Link
          href={game.playHref}
          className="ml-auto rounded-full bg-[#fad403] px-4 py-1.5 text-sm font-bold text-black shadow-[0_3px_0_#cc9700] transition-transform active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]"
        >
          ← Back to {game.navTitle}
        </Link>
      )}
    </header>
  )
}
