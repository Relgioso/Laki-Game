'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playWinChime, scheduleSpinTicks } from '@/lib/sound'

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

  // Direct-DOM pointer flick (no React remount) — see handleSpin/scheduleSpinTicks.
  const pointerInnerRef = useRef<HTMLDivElement>(null)

  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/wheel/config')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load wheel config.')
    return data as { slotCount: number; prizes: WheelPrize[] }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    loadConfig()
      .then((data) => {
        if (cancelled) return
        setSlotCount(data.slotCount)
        setPrizes(data.prizes || [])
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load wheel config.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadConfig])

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

  // Flicks the pointer via direct style manipulation (snap to an angle, then a CSS
  // transition eases it back to rest) rather than restarting a React-keyed CSS
  // animation, which was causing a visible "blink" (the pointer image briefly
  // unmounting/remounting on every tick) instead of a smooth motion.
  function flickPointer() {
    const el = pointerInnerRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.transform = 'rotate(-16deg)'
    // Force a reflow so the transition set below actually applies from this
    // snapped state, instead of being batched together with it.
    void el.offsetHeight
    el.style.transition = 'transform 150ms ease-out'
    el.style.transform = 'rotate(0deg)'
  }

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

      // Ticking sound decelerating over the same 4.2s window as the CSS spin
      // animation below, so it audibly "slows down" alongside the wheel — the
      // same schedule also flicks the pointer, so the sound and the visual
      // never drift apart.
      scheduleSpinTicks(4200, flickPointer)

      // Reveal the result once the CSS transition (4s, see wheel div) finishes, then
      // re-fetch the config so labels/inventory reflect any admin edit made mid-event.
      window.setTimeout(() => {
        setResult(prize)
        setSpinning(false)
        playWinChime()
        loadConfig()
          .then((data) => {
            setSlotCount(data.slotCount)
            setPrizes(data.prizes || [])
          })
          .catch(() => {
            // A failed background refresh shouldn't interrupt the result the player just saw.
          })
      }, 4200)
    } catch (err: any) {
      setPlayError(err.message || 'Something went wrong — please try again.')
      setSpinning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <p className="text-sm text-white/70">Loading wheel…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black px-6 py-16">
        <div className="w-full max-w-md rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-300">
          Failed to load wheel: {loadError}
        </div>
      </div>
    )
  }

  const wheelSize = 320
  // The provided wheel_6slice.svg asset is a fixed 6-slice design — strictly
  // following it (rather than a generic N-slice approximation) means using it
  // as-is. Locked to 6 for now, per instruction; 8/10/12 will get their own
  // matching art from Claire before being wired back in, so a slotCount other
  // than 6 (shouldn't happen — the admin picker is now locked to 6 too) falls
  // back to a plain solid wheel rather than misusing the 6-slice art.
  const usingSixSliceArt = slotCount === 6

  return (
    <div
      className="relative flex flex-1 flex-col items-center overflow-hidden px-6 pt-8 pb-16"
      style={{
        backgroundImage: 'url(/wheel/wheelbg_01.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundColor: '#1a0f00',
      }}
    >
      {/* Top fade band so the corner buttons stay legible against the bright background. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />

      <div className="relative z-10 w-full flex items-center justify-between">
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
          href="/admin/wheel"
          aria-label="Manage prizes"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fad403] shadow-[0_3px_0_#cc9700] active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </Link>
      </div>

      {/* justify-start (not center) deliberately -- the wheel's vertical position
          must stay fixed regardless of whether the error/result banners below are
          showing. Centering the whole group would shift the wheel up/down every
          time a banner appears or disappears, which read as the wheel "jumping." */}
      <div className="relative z-10 mt-10 flex flex-1 flex-col items-center">
        <div className="relative" style={{ width: wheelSize, height: wheelSize }}>
          {/* Pointer, fixed at the top, pointing down into the wheel. Doesn't rotate
              with the wheel, but flicks back on each tick (see flickPointer) to feel
              like a real physical pointer being pushed by each divider as it passes
              underneath. */}
          <div className="absolute left-1/2 z-20" style={{ top: -34, width: 46, transform: 'translateX(-50%)' }}>
            <div ref={pointerInnerRef} style={{ transformOrigin: '50% 15%' }}>
              <Image src="/wheel/pointer.svg" alt="" width={386} height={566} className="w-full h-auto" />
            </div>
          </div>

          {/* Rotating wheel. */}
          {usingSixSliceArt ? (
            <div
              className="relative rounded-full"
              style={{
                width: wheelSize,
                height: wheelSize,
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 4s cubic-bezier(0.17, 0.67, 0.2, 1)',
              }}
            >
              <Image src="/wheel/wheel_6slice.svg" alt="" width={2011} height={2011} className="w-full h-full" priority />

              {/* Prize labels, one per wedge, oriented radially outward from center. */}
              {segments.map((prize, i) => {
                const centerAngle = i * segmentAngle + segmentAngle / 2
                return (
                  <div
                    key={`label-${i}`}
                    className="absolute left-1/2 top-1/2"
                    style={{ width: 0, height: 0, transform: `rotate(${centerAngle}deg)` }}
                  >
                    <span
                      className="absolute text-[11px] font-bold text-black px-1 text-center leading-tight"
                      style={{
                        top: -(wheelSize / 2 - 40),
                        left: 0,
                        transform: 'translateX(-50%)',
                        display: 'inline-block',
                        width: 84,
                      }}
                    >
                      {prize ? prize.name : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              className="relative rounded-full"
              style={{
                width: wheelSize,
                height: wheelSize,
                background: '#fad403',
                border: '8px solid #1a1a1a',
                boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 4s cubic-bezier(0.17, 0.67, 0.2, 1)',
              }}
            >
              {segments.map((_, i) => (
                <div
                  key={`divider-${i}`}
                  className="absolute left-1/2 top-1/2 origin-top"
                  style={{
                    width: 3,
                    height: wheelSize / 2 - 8,
                    background: '#1a1a1a',
                    transform: `translate(-50%, 0) rotate(${i * segmentAngle}deg)`,
                  }}
                />
              ))}
              {segments.map((prize, i) => {
                const centerAngle = i * segmentAngle + segmentAngle / 2
                return (
                  <div
                    key={`label-${i}`}
                    className="absolute left-1/2 top-1/2"
                    style={{ width: 0, height: 0, transform: `rotate(${centerAngle}deg)` }}
                  >
                    <span
                      className="absolute text-[11px] font-bold text-black px-1 text-center leading-tight"
                      style={{
                        top: -(wheelSize / 2 - 40),
                        left: 0,
                        transform: 'translateX(-50%)',
                        display: 'inline-block',
                        width: 84,
                      }}
                    >
                      {prize ? prize.name : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Center hub — fixed, never rotates, never resizes. The won prize's name
              is announced only in the banner below, not here (kept in one place). */}
          <div className="absolute left-1/2 top-1/2 z-10" style={{ width: 96, transform: 'translate(-50%, -50%)' }}>
            <Image src="/wheel/logo_cover.svg" alt="LAKI WIN" width={754} height={754} className="w-full h-auto" />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSpin}
          disabled={spinning}
          className="relative mt-10 w-56 disabled:opacity-70"
        >
          <Image src="/wheel/spin_button.svg" alt={spinning ? 'Spinning…' : 'Spin'} width={1238} height={403} className="w-full h-auto" priority />
        </button>

        {playError && (
          <div className="relative z-10 mt-6 w-full max-w-sm rounded-lg border border-red-900 bg-red-950/90 p-3 text-sm text-red-200 text-center">
            {playError}
          </div>
        )}

        {result && (
          <div className="relative z-10 mt-6 w-full max-w-sm rounded-lg border border-black/20 bg-white/95 p-4 text-center shadow-lg">
            <p className="text-xs text-black/60 mb-1">You won</p>
            <p className="text-lg font-extrabold text-black">{result.name}</p>
          </div>
        )}
      </div>
    </div>
  )
}
