'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Public play screens (kiosk/booth tablets) must not surface links into the
// admin config screens -- a player standing at the booth could otherwise tap
// straight into prize/inventory setup. Every other route keeps the full nav.
export default function SiteHeader() {
  const pathname = usePathname()
  const isPlayScreen = pathname?.startsWith('/play')

  if (isPlayScreen) {
    return (
      <header className="border-b border-black/[.08] dark:border-white/[.145] px-6 py-4 flex items-center">
        <span className="font-semibold text-lg">Laki-Game</span>
      </header>
    )
  }

  return (
    <header className="border-b border-black/[.08] dark:border-white/[.145] px-6 py-4 flex flex-wrap items-center gap-6">
      <span className="font-semibold text-lg">Laki-Game</span>
      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href="/admin/wheel" className="hover:underline">
          Admin: Wheel
        </Link>
        <Link href="/admin/color-game" className="hover:underline">
          Admin: Color Game
        </Link>
        <Link href="/play/wheel" className="hover:underline">
          Play: Wheel
        </Link>
        <Link href="/play/color-game" className="hover:underline">
          Play: Color Game
        </Link>
      </nav>
    </header>
  )
}
