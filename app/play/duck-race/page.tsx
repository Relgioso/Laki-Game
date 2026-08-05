'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { playConfettiPop, playWinChime } from '@/lib/sound'
import { launchConfetti } from '@/lib/confetti'
import { prizePhotoFor } from '@/lib/prize-photos'

type DuckRacePrize = {
  id: string
  name: string
  prizeType: string
  probability: number | null
  inventory: number | null
  active: boolean
  displayOrder: number
}

type PlayResultPrize = {
  id: string
  name: string
  prizeType: string
  displayOrder: number
}

// Claude-designed placeholder duck (no source art for this game) -- black
// outline, white body only, per brand instruction. Faces right, matching the
// left-to-right race direction.
function Duck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 80" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="45" cy="52" rx="32" ry="22" fill="white" stroke="black" strokeWidth="4" />
      <path d="M28 46 Q40 40 52 48 Q40 56 26 54 Z" fill="black" fillOpacity="0.08" stroke="black" strokeWidth="2" />
      <circle cx="72" cy="28" r="16" fill="white" stroke="black" strokeWidth="4" />
      <path d="M86 28 L100 24 L100 34 Z" fill="black" />
      <circle cx="76" cy="23" r="2.5" fill="black" />
    </svg>
  )
}

export default function DuckRacePage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [prizes, setPrizes] = useState<DuckRacePrize[]>([])

  const [racing, setRacing] = useState(false)
  const [result, setResult] = useState<PlayResultPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)
  const [laneDurations, setLaneDurations] = useState<Map<number, number>>(new Map())

  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/duck-race/config')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load Duck Race config.')
    return data as { prizes: DuckRacePrize[] }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    loadConfig()
      .then((data) => {
        if (cancelled) return
        setPrizes((data.prizes || []).filter((p) => p.active))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load Duck Race config.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadConfig])

  // Fires the confetti burst once the reveal overlay (and its canvas) is
  // actually mounted -- same pattern as the Wheel page.
  useEffect(() => {
    if (!result) return
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    const cancel = launchConfetti(canvas)
    return cancel
  }, [result])

  async function handleRace() {
    if (racing) return
    setRacing(true)
    setPlayError(null)
    setResult(null)
    setLaneDurations(new Map())

    try {
      const res = await fetch('/api/duck-race/play', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setPlayError(data.error || 'Something went wrong — please try again.')
        setRacing(false)
        return
      }

      const prize: PlayResultPrize = data.prize
      // Winner's lane always finishes in exactly 3.2s. Every other lane gets an
      // independently randomized duration between 3.6s and 4.6s, so the winner
      // always crosses first (0.4s of guaranteed daylight over the fastest
      // possible non-winner) but the field doesn't look mechanically identical.
      const durations = new Map<number, number>()
      for (const p of prizes) {
        durations.set(p.displayOrder, p.displayOrder === prize.displayOrder ? 3.2 : 3.6 + Math.random())
      }
      setLaneDurations(durations)

      // Reveal at the winner's own finish (always exactly 3.2s, see the
      // duration-assignment above), not when the whole field settles --
      // non-winning lanes run 3.6-4.6s, so waiting for the slowest duck
      // would hide the "winner crosses first" moment that's the entire
      // visual point of the race.
      window.setTimeout(() => {
        setResult(prize)
        setRacing(false)
        playWinChime()
        playConfettiPop()
        loadConfig()
          .then((data) => setPrizes((data.prizes || []).filter((p) => p.active)))
          .catch(() => {
            // A failed background refresh shouldn't interrupt the result the player just saw.
          })
      }, 3.2 * 1000 + 200)
    } catch (err: any) {
      setPlayError(err.message || 'Something went wrong — please try again.')
      setRacing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <p className="text-sm text-white/70">Loading Duck Race…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <div className="w-full max-w-md rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-300">
          Failed to load Duck Race: {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col items-center bg-black">
      <div className="relative w-full max-w-md px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/"
            aria-label="Back"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fad403] shadow-[0_3px_0_#cc9700] active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M5 12l6-6M5 12l6 6" />
            </svg>
          </Link>
          <Link
            href="/admin/duck-race"
            aria-label="Manage prizes"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fad403] shadow-[0_3px_0_#cc9700] active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </Link>
        </div>

        {prizes.length === 0 ? (
          <p className="text-sm text-white/70 text-center py-16">No prizes configured yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {prizes.map((prize, i) => {
              const duration = laneDurations.get(prize.displayOrder)
              return (
                <div
                  key={prize.id}
                  data-duck-lane={prize.displayOrder}
                  className="relative h-16 rounded-lg bg-[#fad403] border-2 border-black overflow-hidden"
                >
                  <div
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      // Gated on `duration !== undefined`, NOT on `racing` -- `racing` flips
                      // true synchronously at the top of handleRace, before the fetch
                      // resolves and real per-lane durations exist. Gating on `racing`
                      // would move `left` to 84% immediately with transitionDuration still
                      // at its default (0s, since `duration` is undefined that render),
                      // snapping every duck to the finish line instantly before the "real"
                      // race even starts. `laneDurations` starts empty and is only
                      // populated after the fetch resolves, so checking a specific lane's
                      // entry is the correct signal that it's safe to move.
                      left: duration !== undefined ? '84%' : '2%',
                      width: '15%',
                      transitionProperty: 'left',
                      transitionDuration: `${duration ?? 0}s`,
                      transitionTimingFunction: 'linear',
                    }}
                  >
                    <div
                      style={{
                        animation: 'duck-bob 0.5s ease-in-out infinite alternate',
                        animationDelay: `${i * 0.13}s`,
                      }}
                    >
                      <Duck className="w-full h-auto" />
                    </div>
                  </div>
                  {/* Checkered finish line. */}
                  <div
                    className="absolute right-0 top-0 h-full w-3"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, black 25%, transparent 25%, transparent 75%, black 75%), linear-gradient(45deg, black 25%, transparent 25%, transparent 75%, black 75%)',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 4px 4px',
                      backgroundColor: 'white',
                    }}
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-1 text-xs font-bold text-black border border-black">
                    {prize.name}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleRace}
          disabled={racing || prizes.length === 0}
          className="mt-6 w-full rounded-full bg-[#fad403] py-4 text-center font-extrabold uppercase tracking-wide text-black shadow-[0_4px_0_#cc9700] active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] transition-transform disabled:opacity-70"
        >
          {racing ? 'Racing…' : 'Race'}
        </button>

        {playError && (
          <div className="mt-4 w-full rounded-lg border border-red-900 bg-red-950/90 p-3 text-sm text-red-200 text-center">
            {playError}
          </div>
        )}
      </div>

      {result && (
        <button
          type="button"
          onClick={() => setResult(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 px-8 animate-[wheel-reveal-in_300ms_ease-out]"
        >
          {prizePhotoFor(result.name) ? (
            <Image
              src={prizePhotoFor(result.name)!}
              alt={result.name}
              width={600}
              height={600}
              className="w-56 h-56 object-contain mb-6"
            />
          ) : null}
          <p className="text-sm text-white/70 mb-1">You won</p>
          <p className="text-3xl font-extrabold text-[#fad403] text-center">{result.name}</p>
          <p className="mt-8 text-xs text-white/50">Tap anywhere to continue</p>
          <canvas ref={confettiCanvasRef} className="pointer-events-none absolute inset-0" />
        </button>
      )}
    </div>
  )
}
