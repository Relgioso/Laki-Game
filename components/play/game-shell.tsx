'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MECHANICS } from '@/components/games/mechanics'
import type { DropTarget } from '@/components/games/types'
import { launchConfetti } from '@/lib/confetti'
import type { Mechanic } from '@/lib/games'
import type { ApiPrize } from '@/lib/prize-config'
import { prizePhotoFor } from '@/lib/prize-photos'
import { playConfettiPop, playWinChime } from '@/lib/sound'

type PlayedPrize = { id: string; name: string; prizeType: string; displayOrder: number }

const navButton =
  'flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fad403] shadow-[0_3px_0_#cc9700] active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]'

// Everything around a shared-platform game's board: nav buttons, loading and
// error states, the play button, the draw request, and the prize reveal.
export default function GameShell({ slug, title, mechanic }: { slug: string; title: string; mechanic: Mechanic }) {
  const { component: Board, actionLabel, busyLabel } = MECHANICS[mechanic]
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [prizes, setPrizes] = useState<ApiPrize[]>([])
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<DropTarget | null>(null)
  const [result, setResult] = useState<PlayedPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const pendingRef = useRef<PlayedPrize | null>(null)
  // Synchronous double-tap guard: state updates aren't visible until the
  // next render, a ref is.
  const busyRef = useRef(false)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)

  const loadPrizes = useCallback(async () => {
    const res = await fetch(`/api/games/${slug}/config`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Failed to load ${title}.`)
    return (data.prizes as ApiPrize[]).filter((p) => p.active)
  }, [slug, title])

  useEffect(() => {
    let cancelled = false
    loadPrizes()
      .then((list) => {
        if (!cancelled) setPrizes(list)
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadPrizes])

  // Confetti once the reveal overlay (and its canvas) is mounted.
  useEffect(() => {
    if (!result) return
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    return launchConfetti(canvas)
  }, [result])

  async function handlePlay() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setPlayError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/games/${slug}/play`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong — please try again.')
      pendingRef.current = data.prize
      setTarget({ prizeId: data.prize.id, runId: Date.now() })
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleFinished = useCallback(() => {
    setResult(pendingRef.current)
    busyRef.current = false
    setBusy(false)
    playWinChime()
    playConfettiPop()
    loadPrizes()
      .then(setPrizes)
      .catch(() => {
        // A failed background refresh shouldn't interrupt the result.
      })
  }, [loadPrizes])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <p className="text-sm text-white/70">Loading {title}…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <div className="w-full max-w-md rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-300">
          Failed to load {title}: {loadError}
        </div>
      </div>
    )
  }

  const photo = result ? prizePhotoFor(result.name) : null

  return (
    <div className="relative flex flex-1 flex-col items-center bg-black">
      <div className="relative w-full max-w-md px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" aria-label="Back" className={navButton}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M5 12l6-6M5 12l6 6" />
            </svg>
          </Link>
          <Link href={`/admin/${slug}`} aria-label="Manage prizes" className={navButton}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </Link>
        </div>

        {prizes.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/70">No prizes configured yet.</p>
        ) : (
          <Board prizes={prizes} target={target} onFinished={handleFinished} />
        )}

        <button
          type="button"
          onClick={handlePlay}
          disabled={busy || prizes.length === 0}
          className="mt-6 w-full rounded-full bg-[#fad403] py-4 text-center font-extrabold uppercase tracking-wide text-black shadow-[0_4px_0_#cc9700] transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] disabled:opacity-70"
        >
          {busy ? busyLabel : actionLabel}
        </button>

        {playError && (
          <div className="mt-4 w-full rounded-lg border border-red-900 bg-red-950/90 p-3 text-center text-sm text-red-200">{playError}</div>
        )}
      </div>

      {result && (
        <button
          type="button"
          onClick={() => setResult(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 px-8 animate-[wheel-reveal-in_300ms_ease-out]"
        >
          {photo && <Image src={photo} alt={result.name} width={600} height={600} className="mb-6 h-56 w-56 object-contain" />}
          <p className="mb-1 text-sm text-white/70">You won</p>
          <p className="text-center text-3xl font-extrabold text-[#fad403]">{result.name}</p>
          <p className="mt-8 text-xs text-white/50">Tap anywhere to continue</p>
          <canvas ref={confettiCanvasRef} className="pointer-events-none absolute inset-0" />
        </button>
      )}
    </div>
  )
}
