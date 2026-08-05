'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

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

  async function handleRace() {
    if (racing) return
    setRacing(true)
    setPlayError(null)
    setResult(null)

    try {
      const res = await fetch('/api/duck-race/play', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setPlayError(data.error || 'Something went wrong — please try again.')
        setRacing(false)
        return
      }
      // v1: show the result immediately, no animation yet (Task 7 adds that).
      setResult(data.prize)
      setRacing(false)
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
            {prizes.map((prize) => (
              <div
                key={prize.id}
                data-duck-lane={prize.displayOrder}
                className="relative h-16 rounded-lg bg-[#fad403] border-2 border-black overflow-hidden"
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: '2%', width: '15%' }}
                >
                  <Duck className="w-full h-auto" />
                </div>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-1 text-xs font-bold text-black border border-black">
                  {prize.name}
                </span>
              </div>
            ))}
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

        {result && (
          <p className="mt-4 text-center text-white">
            You won: <span className="font-bold text-[#fad403]">{result.name}</span>
          </p>
        )}
      </div>
    </div>
  )
}
