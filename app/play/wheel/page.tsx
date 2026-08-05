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

// Real product photos for prizes that have one. Matched by normalized name
// (lowercase, spaces stripped) against the prize's configured name in the
// admin screen — a prize without a matching entry here just shows its name
// as text in the reveal, no photo.
const PRIZE_PHOTOS: Record<string, string> = {
  totebag: '/prizes/totebag-prize.png',
  coinpurse: '/prizes/coin-purse-prize.png',
  roundfan: '/prizes/round-fan-prize.png',
}

function prizePhotoFor(name: string): string | null {
  const key = name.toLowerCase().replace(/\s+/g, '')
  return PRIZE_PHOTOS[key] ?? null
}

// wheelbg_01.png is 1080x1920. Its black circle was measured directly from the
// asset (pixel-scanned, not eyeballed): center at (539, 824), radius 505 --
// i.e. 49.91% / 42.92% of the image's width/height, radius 46.76% of its width.
// The background is rendered at its own true aspect ratio (never CSS
// background-size:cover, which crops unpredictably per device and was the
// actual cause of the wheel not lining up with the art's circle) inside an
// aspect-ratio-locked container, and the wheel/pointer are positioned as
// percentages of that SAME container -- so they stay pixel-aligned with the
// art at any viewport width, not just the one this happened to be eyeballed on.
const BG_ASPECT_RATIO = 1080 / 1920
const CIRCLE_CENTER_X_PCT = 49.91
const CIRCLE_CENTER_Y_PCT = 42.92
const CIRCLE_RADIUS_PCT = 46.76

// SPIN button lives inside the same aspect-locked container as the wheel (not in a
// separate section below it), sitting in the art's own dark fade zone beneath the
// wheel. Position/size as percentages of the container, same reasoning as CIRCLE_*
// above -- this also removes the extra section that was pushing total page height
// past the viewport (the original "have to scroll to reach it" bug).
const SPIN_BUTTON_TOP_PCT = 79
const SPIN_BUTTON_WIDTH_PCT = 46

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
      // The pointer is fixed at the top (12 o'clock). Segment `displayOrder`'s wedge is
      // centered at angle `displayOrder * segmentAngle` in the wheel's own un-rotated
      // frame (dividers fall at the odd half-angles between them, `+ segmentAngle / 2`
      // — verified against the actual wheel_6slice.svg art via pixel sampling, not
      // assumed). After rotating the wheel by `rotation` degrees, that center appears
      // on screen at `(targetCenter + rotation) mod 360`. We need that to land on 0
      // (the pointer), so `rotation mod 360` must equal `(360 - targetCenter) mod 360`
      // — call that the desired mod. We then pick the smallest forward delta from the
      // wheel's current mod to the desired mod and add a few extra full spins on top,
      // purely for animation flair.
      const targetCenter = prize.displayOrder * segmentAngle
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

  // The provided wheel_6slice.svg asset is a fixed 6-slice design — strictly
  // following it (rather than a generic N-slice approximation) means using it
  // as-is. Locked to 6 for now, per instruction; 8/10/12 will get their own
  // matching art from Claire before being wired back in, so a slotCount other
  // than 6 (shouldn't happen — the admin picker is now locked to 6 too) falls
  // back to a plain solid wheel rather than misusing the 6-slice art.
  const usingSixSliceArt = slotCount === 6

  return (
    <div className="relative flex flex-1 flex-col items-center bg-[#1a0f00]">
      {/* Capped to a phone-sized column so this doesn't balloon to full browser
          width (and therefore full browser HEIGHT, via the aspect-ratio lock
          below) on desktop -- that was making the whole page enormous there. */}
      <div className="relative w-full max-w-md">
      {/* Aspect-ratio-locked block containing the background art and everything
          that must stay pixel-aligned with it (header buttons, wheel, pointer,
          and now the SPIN button too). See the BG_ASPECT_RATIO, CIRCLE_,
          and SPIN_BUTTON_ constants above -- this is what makes them land
          exactly on the art at any viewport width. */}
      <div className="relative w-full" style={{ aspectRatio: `${BG_ASPECT_RATIO}` }}>
        <Image src="/wheel/wheelbg_01.png" alt="" fill className="object-contain object-top" priority />

        {/* Top fade band so the corner buttons stay legible against the bright background. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[14%] bg-gradient-to-b from-black/45 to-transparent" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-[4%]">
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

        {/* Wheel + pointer + hub, sized/positioned as percentages of this same
            aspect-locked container so they always land exactly on the
            background art's circle (measured center/radius above). */}
        <div
          className="absolute z-10"
          style={{
            left: `${CIRCLE_CENTER_X_PCT}%`,
            top: `${CIRCLE_CENTER_Y_PCT}%`,
            width: `${CIRCLE_RADIUS_PCT * 2}%`,
            aspectRatio: '1',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Pointer, fixed at the top, pointing down into the wheel. Doesn't rotate
              with the wheel, but flicks back on each tick (see flickPointer) to feel
              like a real physical pointer being pushed by each divider as it passes
              underneath. Sized/positioned relative to the wheel's own box (%), not
              fixed pixels, so it scales together with the wheel on any device. */}
          <div className="absolute left-1/2 z-20" style={{ top: '-11%', width: '15%', transform: 'translateX(-50%)' }}>
            <div ref={pointerInnerRef} style={{ transformOrigin: '50% 15%' }}>
              <Image src="/wheel/pointer.svg" alt="" width={386} height={566} className="w-full h-auto" />
            </div>
          </div>

          {/* Rotating wheel. */}
          {usingSixSliceArt ? (
            <div
              className="relative w-full h-full rounded-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 4s cubic-bezier(0.17, 0.67, 0.2, 1)',
              }}
            >
              <Image src="/wheel/wheel_6slice.svg" alt="" width={2011} height={2011} className="w-full h-full" priority />

              {/* Prize labels, one per wedge, oriented radially outward from center.
                  Wedge centers sit at `i * segmentAngle` (no half-offset) — verified
                  via pixel sampling against wheel_6slice.svg; dividers, not wedge
                  centers, are the ones at the +half-angle positions. */}
              {segments.map((prize, i) => {
                const centerAngle = i * segmentAngle
                return (
                  <div
                    key={`label-${i}`}
                    className="absolute left-1/2 top-1/2"
                    style={{ width: 0, height: 0, transform: `rotate(${centerAngle}deg)` }}
                  >
                    <span
                      className="absolute text-[2.6vw] sm:text-[9px] font-bold text-black px-1 text-center leading-tight whitespace-nowrap"
                      style={{
                        // The immediate parent here is a 0x0 rotation-anchor div
                        // (width/height:0, by design, to rotate around a point) --
                        // a percentage top/width would resolve against that zero
                        // size and collapse to 0, not the wheel's actual size. Use
                        // vw instead: the aspect-locked container above is 100vw
                        // wide, and the wheel's own radius is CIRCLE_RADIUS_PCT of
                        // that, so vw scales together with the wheel on any device.
                        top: '-27vw',
                        left: 0,
                        transform: 'translateX(-50%)',
                        display: 'inline-block',
                        width: '24vw',
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
              className="relative w-full h-full rounded-full"
              style={{
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
                    height: '50%',
                    background: '#1a1a1a',
                    transform: `translate(-50%, 0) rotate(${i * segmentAngle + segmentAngle / 2}deg)`,
                  }}
                />
              ))}
              {segments.map((prize, i) => {
                const centerAngle = i * segmentAngle
                return (
                  <div
                    key={`label-${i}`}
                    className="absolute left-1/2 top-1/2"
                    style={{ width: 0, height: 0, transform: `rotate(${centerAngle}deg)` }}
                  >
                    <span
                      className="absolute text-[2.6vw] sm:text-[9px] font-bold text-black px-1 text-center leading-tight whitespace-nowrap"
                      style={{
                        // The immediate parent here is a 0x0 rotation-anchor div
                        // (width/height:0, by design, to rotate around a point) --
                        // a percentage top/width would resolve against that zero
                        // size and collapse to 0, not the wheel's actual size. Use
                        // vw instead: the aspect-locked container above is 100vw
                        // wide, and the wheel's own radius is CIRCLE_RADIUS_PCT of
                        // that, so vw scales together with the wheel on any device.
                        top: '-27vw',
                        left: 0,
                        transform: 'translateX(-50%)',
                        display: 'inline-block',
                        width: '24vw',
                      }}
                    >
                      {prize ? prize.name : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Center hub — fixed, never rotates, never resizes. The win reveal is a
              separate full-screen overlay (below), not shown here anymore. */}
          <div className="absolute left-1/2 top-1/2 z-10" style={{ width: '30%', transform: 'translate(-50%, -50%)' }}>
            <Image src="/wheel/logo_cover.svg" alt="LAKI WIN" width={754} height={754} className="w-full h-auto" />
          </div>
        </div>

        {/* SPIN button, positioned inside the art's own dark fade zone below the
            wheel (SPIN_BUTTON_* percentages above) instead of a separate section
            after this container -- that extra section was what pushed the page
            past one screen's height. */}
        <div
          className="absolute z-10"
          style={{
            left: '50%',
            top: `${SPIN_BUTTON_TOP_PCT}%`,
            width: `${SPIN_BUTTON_WIDTH_PCT}%`,
            transform: 'translate(-50%, 0)',
          }}
        >
          <button type="button" onClick={handleSpin} disabled={spinning} className="relative w-full disabled:opacity-70">
            <Image src="/wheel/spin_button.svg" alt={spinning ? 'Spinning…' : 'Spin'} width={1238} height={403} className="w-full h-auto" priority />
          </button>

          {playError && (
            <div className="absolute left-1/2 top-full mt-3 w-64 -translate-x-1/2 rounded-lg border border-red-900 bg-red-950/90 p-3 text-xs text-red-200 text-center">
              {playError}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Full-screen win reveal -- covers the wheel entirely (not a small overlay
          sitting on top of it) so only the prize is visible, not the wheel/pointer/
          background behind it. Tap anywhere to dismiss and return to the wheel. */}
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
        </button>
      )}
    </div>
  )
}
