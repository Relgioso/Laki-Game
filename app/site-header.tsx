'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The landing page and both public play screens (kiosk/booth tablets) each
// have their own fully custom, branded design with no shared chrome -- a
// player standing at the booth must not see a nav bar that could lead
// straight into prize/inventory setup. Only the admin config screens use
// this shared header, for convenience navigating between the two of them.
export default function SiteHeader() {
  const pathname = usePathname()
  const isAdminScreen = pathname?.startsWith('/admin')

  if (!isAdminScreen) {
    return null
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
