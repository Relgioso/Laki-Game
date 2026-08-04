'use client'

import { useEffect, useMemo, useState } from 'react'

type WheelPrize = {
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

const SEGMENT_COLORS = [
  '#f43f5e',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#ef4444',
  '#eab308',
  '#14b8a6',
]

// Number of full rotations to add on top of the landing angle, purely for animation flair.
const EXTRA_SPINS = 5

export default function PlayWheelPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [slotCount, setSlotCount] = useState<number>(6)
  const [prizes, setPrizes] = useState<WheelPrize[]>([])

  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<PlayResultPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch('/api/wheel/config')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load wheel config.')
        if (cancelled) return
        setSlotCount(data.slotCount)
        setPrizes(data.prizes || [])
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load wheel config.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Fixed visual slots: displayOrder 0..slotCount-1, each rendered as an equal wedge,
  // regardless of how many prizes are actually configured (unused slots render blank).
  const segments = useMemo(() => {
    const bySlot = new Map<number, WheelPrize>()
    for (const p of prizes) {
      if (p.displayOrder >= 0 && p.displayOrder < slotCount && !bySlot.has(p.displayOrder)) {
        bySlot.set(p.displayOrder, p)
      }
    }
    return Array.from({ length: slotCount }, (_, i) => bySlot.get(i) ?? null)
  }, [prizes, slotCount])

  const segmentAngle = 360 / slotCount

  // Conic-gradient starts at the top (12 o'clock) and sweeps clockwise by default,
  // which matches how `rotation`/`displayOrder` angles are computed below.
  const wheelBackground = useMemo(() => {
    const stops = segments.map((prize, i) => {
      const color = prize ? SEGMENT_COLORS[i % SEGMENT_COLORS.length] : '#d4d4d8'
      const from = i * segmentAngle
      const to = (i + 1) * segmentAngle
      return `${color} ${from}deg ${to}deg`
    })
    return `conic-gradient(from 0deg, ${stops.join(', ')})`
  }, [segments, segmentAngle])

  async function handleSpin() {
    if (spinning) return
    setSpinning(true)
    setPlayError(null)
    setResult(null)

    try {
      const res = await fetch('/api/wheel/play', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setPlayError(data.error || 'Something went wrong — please try again.')
        setSpinning(false)
        return
      }

      const prize: PlayResultPrize = data.prize
      // The pointer is fixed at the top (12 o'clock). Segment `displayOrder` is drawn
      // starting at angle `displayOrder * segmentAngle` (clockwise from the top, in the
      // wheel's own un-rotated frame), so its center sits at
      // `displayOrder * segmentAngle + segmentAngle / 2`. After rotating the wheel by
      // `rotation` degrees, that center appears on screen at `(targetCenter + rotation) mod 360`.
      // We need that to land on 0 (the pointer), so `rotation mod 360` must equal
      // `(360 - targetCenter) mod 360` — call that the desired mod. We then pick the
      // smallest forward delta from the wheel's current mod to the desired mod and add a
      // few extra full spins on top, purely for animation flair.
      const targetCenter = prize.displayOrder * segmentAngle + segmentAngle / 2
      const desiredMod = ((360 - targetCenter) % 360 + 360) % 360
      setRotation((prev) => {
        const prevMod = ((prev % 360) + 360) % 360
        const delta = ((desiredMod - prevMod) % 360 + 360) % 360
        return prev + EXTRA_SPINS * 360 + delta
      })

      // Reveal the result once the CSS transition (4s, see wheel div) finishes.
      window.setTimeout(() => {
        setResult(prize)
        setSpinning(false)
      }, 4200)
    } catch (err: any) {
      setPlayError(err.message || 'Something went wrong — please try again.')
      setSpinning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading wheel…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load wheel: {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 mb-8">
        Spin the Wheel
      </h1>

      <div className="relative" style={{ width: 320, height: 320 }}>
        {/* Pointer, fixed at the top, pointing down into the wheel. */}
        <div
          className="absolute left-1/2 z-10"
          style={{
            top: -14,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: '22px solid black',
          }}
        />

        <div
          className="relative rounded-full border-4 border-black dark:border-white overflow-hidden shadow-lg"
          style={{
            width: 320,
            height: 320,
            background: wheelBackground,
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 4s cubic-bezier(0.17, 0.67, 0.2, 1)',
          }}
        >
          {segments.map((prize, i) => {
            const centerAngle = i * segmentAngle + segmentAngle / 2
            return (
              <div
                key={`label-${i}`}
                className="absolute left-1/2 top-1/2"
                style={{ width: 0, height: 0, transform: `rotate(${centerAngle}deg)` }}
              >
                <span
                  className="absolute text-[11px] font-medium text-white px-1 text-center leading-tight"
                  style={{
                    top: -130,
                    left: 0,
                    transform: 'translateX(-50%)',
                    display: 'inline-block',
                    width: 90,
                    textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                  }}
                >
                  {prize ? prize.name : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSpin}
        disabled={spinning}
        className="mt-8 rounded-md bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {spinning ? 'Spinning…' : 'Spin'}
      </button>

      {playError && (
        <div className="mt-6 w-full max-w-sm rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300 text-center">
          {playError}
        </div>
      )}

      {result && (
        <div className="mt-6 w-full max-w-sm rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-4 text-center">
          <p className="text-xs text-green-700 dark:text-green-300 mb-1">You won</p>
          <p className="text-lg font-semibold text-green-800 dark:text-green-200">{result.name}</p>
        </div>
      )}
    </div>
  )
}
