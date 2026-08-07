'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { playConfettiPop, scheduleSpinTicks, playWinChime } from '@/lib/sound'
import { launchConfetti } from '@/lib/confetti'
import { prizePhotoFor } from '@/lib/prize-photos'

type ComboSymbol = 'win' | 'laki' | 'clover'

type PlayResult = ComboSymbol | 'merch'

type PlayResultPrize = {
  name: string
  prizeType: string
}

const SYMBOLS: ComboSymbol[] = ['win', 'laki', 'clover']

// Real tile art, one file per symbol (matches the physical Color Game's three
// dice faces: a white "LAKI" tile, a black four-leaf-clover tile, and a gold
// "WIN" tile).
const SYMBOL_ART: Record<ComboSymbol, string> = {
  win: '/color-game/win.svg',
  laki: '/color-game/laki.svg',
  clover: '/color-game/clover.svg',
}

function randomSymbol(): ComboSymbol {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
}

// Builds a settled arrangement for a 'merch' result: two tiles share one symbol,
// the third tile gets a different symbol, so the reveal visibly doesn't match —
// which specific pair/position is picked doesn't matter, it's purely cosmetic.
function nonMatchingArrangement(): [ComboSymbol, ComboSymbol, ComboSymbol] {
  const shuffled = [...SYMBOLS].sort(() => Math.random() - 0.5)
  const majority = shuffled[0]
  const minority = shuffled[1]
  const arrangement: ComboSymbol[] = [majority, majority, minority]
  arrangement.sort(() => Math.random() - 0.5)
  return arrangement as [ComboSymbol, ComboSymbol, ComboSymbol]
}

// How far the ring must be pulled down (px) before releasing counts as a pull.
const PULL_THRESHOLD = 90
// Furthest the rope can be dragged, for a natural-feeling pull with some give.
const MAX_PULL = 130

// Real art, hand-drawn separately: the shelf that cradles the three tiles
// (own aspect ratio) stacked directly above the chute board (own aspect
// ratio) — each rendered at its native proportions rather than stretched to
// match the other, same approach as the Wheel page's background art.
const SHELF_ASPECT = 1779.53 / 770.14
const BOARD_ASPECT = 2317.99 / 4013.29
const ROPE_ASPECT = 415.57 / 2571.5

// Shelf occupies this fraction of the combined shelf+board stack's height —
// derived from both arts' own aspect ratios (SHELF_ASPECT / BOARD_ASPECT
// above), resolution-independent since both are rendered at the same width.
const SHELF_HEIGHT_PCT_OF_STACK = 20

// Dice rest in the shelf window at idle, then on a pull they fall the length
// of the chute to a landing zone near the bottom and tumble there — both
// expressed as % of the combined shelf+board stack (see the dice-layer
// wrapper below, which spans that whole stack). The start position matches
// where the tiles used to sit inside the shelf's own box (14% of the
// shelf's height) converted to the combined stack's percentage.
const DICE_START_TOP_PCT = 14 * (SHELF_HEIGHT_PCT_OF_STACK / 100)
const DICE_LANDING_TOP_PCT = 78
const TILE_ROW_WIDTH_PCT = 66

// Ring width as a percentage of the board's width; the rope's height follows
// from ROPE_ASPECT so the coil/ring proportions stay true to the art.
const RING_WIDTH_PCT = 21

// Combined height/width ratio of the shelf+board stack — used to cap the
// whole game's on-screen size the same way the Wheel page's own background
// aspect ratio naturally does, so Color Game fits one screen without
// scrolling instead of rendering taller just because its art is taller.
const STACK_HEIGHT_RATIO = 1 / SHELF_ASPECT + 1 / BOARD_ASPECT

// Fixed height of the nav row above the art (h-11 buttons + py-3), in rem —
// subtracted from the viewport-height budget below since it doesn't scale
// with width the way the art does.
const NAV_ROW_HEIGHT_REM = 4.25

// A realistic fall reads as: accelerating drop (ease-in, not instant),
// overshooting slightly past the landing line like real gravity, then two
// decreasing bounces before coming to rest — not a single quick snap.
type DicePhase = 'shelf' | 'falling' | 'bounce-up' | 'bounce-down' | 'settled'

const DICE_PHASE_TOP_PCT: Record<DicePhase, number> = {
  shelf: DICE_START_TOP_PCT,
  falling: DICE_LANDING_TOP_PCT + 5,
  'bounce-up': DICE_LANDING_TOP_PCT - 3,
  'bounce-down': DICE_LANDING_TOP_PCT + 1.2,
  settled: DICE_LANDING_TOP_PCT,
}

const DICE_PHASE_TRANSITION: Record<DicePhase, string> = {
  shelf: 'top 500ms ease-out',
  falling: 'top 950ms cubic-bezier(0.55, 0.06, 0.68, 0.19)',
  'bounce-up': 'top 220ms ease-out',
  'bounce-down': 'top 170ms ease-in-out',
  settled: 'top 170ms ease-in-out',
}

// Timing of the falling -> bounce-up -> bounce-down -> settled sequence,
// driven by setTimeout below (matches the durations above).
const DICE_SETTLE_AT_MS = 950 + 220 + 170

// Each tile settles at a slightly different height/angle rather than lining
// up perfectly — real dropped dice don't land in a neat row. `rotate` is the
// FINAL resting angle; TILE_SPIN_TURNS extra full turns are added on top
// while rolling so each tile does one smooth, continuously decelerating
// spin from 0deg to its resting angle — not an oscillating side-to-side
// wobble, which read as a nervous flicker rather than a tumble.
const TILE_SETTLE_OFFSETS = [
  { dy: -4, rotate: -6 },
  { dy: 3, rotate: 5 },
  { dy: -1.5, rotate: -3 },
] as const
const TILE_SPIN_TURNS = 2

export default function PlayColorGamePage() {
  const [tiles, setTiles] = useState<ComboSymbol[]>(['laki', 'clover', 'win'])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<PlayResult | null>(null)
  const [prize, setPrize] = useState<PlayResultPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  // Cancel function for the in-flight decelerating symbol-swap schedule (see
  // scheduleSpinTicks below) -- not a setInterval id, since the swap rate
  // isn't constant.
  const stopSwapsRef = useRef<(() => void) | null>(null)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)

  // Rope pull state. `pullY` is the rope+ring's current vertical offset from
  // rest (0..MAX_PULL), applied as a rigid translateY (the art is a single
  // fixed-length illustration, not a stretchable texture, so dragging moves
  // the whole rope down rather than stretching it). `dragging` also gates the
  // CSS transition so it animates back to rest after a release, but not
  // while actively being dragged (which would make it feel laggy/rubber-
  // banded instead of following the finger).
  const [pullY, setPullY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef<number | null>(null)
  // Drives the fall: 'shelf' at idle/reset, then 'falling' -> 'bounce-up' ->
  // 'bounce-down' -> 'settled' on a pull (see DICE_PHASE_TOP_PCT/TRANSITION
  // above). Stays 'settled' through the result reveal so the dice remain at
  // the bottom, per the reference video, until dismissed.
  const [dicePhase, setDicePhase] = useState<DicePhase>('shelf')
  const dropTimeoutsRef = useRef<number[]>([])
  // Mirrors `pullY` synchronously (state updates are batched/async, so a
  // pointerup that fires in the same tick as the preceding pointermove could
  // otherwise read a stale `pullY` from the previous render's closure).
  const pullYRef = useRef(0)

  const clearDropTimeouts = useCallback(() => {
    for (const id of dropTimeoutsRef.current) window.clearTimeout(id)
    dropTimeoutsRef.current = []
  }, [])

  useEffect(() => {
    return () => {
      stopSwapsRef.current?.()
      clearDropTimeouts()
    }
  }, [clearDropTimeouts])

  // Fires confetti once the reveal overlay (and its canvas) is actually
  // mounted, and only for a true three-of-a-kind — the merch consolation
  // prize still gets a reveal card, just not the celebration.
  useEffect(() => {
    if (!result || result === 'merch') return
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    const cancel = launchConfetti(canvas)
    return cancel
  }, [result])

  const handlePlay = useCallback(async () => {
    if (spinning) return
    setSpinning(true)
    setPlayError(null)
    setResult(null)
    setPrize(null)

    // Drive the fall -> bounce -> bounce -> settle sequence (see DICE_PHASE_*
    // above) on its own timer, independent of the API round-trip.
    clearDropTimeouts()
    setDicePhase('falling')
    dropTimeoutsRef.current.push(
      window.setTimeout(() => setDicePhase('bounce-up'), 950),
      window.setTimeout(() => setDicePhase('bounce-down'), 950 + 220),
      window.setTimeout(() => setDicePhase('settled'), DICE_SETTLE_AT_MS)
    )

    // Roll the three tiles through random symbols while the request is in
    // flight, like a slot machine — the "dice roll" the pull sets off. Uses
    // the same decelerating tick schedule as the Wheel page (fast at first,
    // slowing down) timed to finish right as the fall settles, instead of a
    // constant-rate interval that just cuts off abruptly.
    stopSwapsRef.current = scheduleSpinTicks(DICE_SETTLE_AT_MS, () => {
      setTiles([randomSymbol(), randomSymbol(), randomSymbol()])
    })

    // Long enough for the dice to finish settling (DICE_SETTLE_AT_MS) with
    // some room left over, so there's a stretch of "tumbling at the bottom"
    // per the reference video before the tiles freeze on the real result.
    const minAnimation = new Promise((resolve) => window.setTimeout(resolve, DICE_SETTLE_AT_MS + 400))

    try {
      const [res] = await Promise.all([fetch('/api/color-game/play', { method: 'POST' }), minAnimation])
      const data = await res.json()

      stopSwapsRef.current?.()
      stopSwapsRef.current = null

      if (!res.ok) {
        setPlayError(data.error || 'Something went wrong — please try again.')
        setSpinning(false)
        clearDropTimeouts()
        setDicePhase('shelf')
        return
      }

      const won: PlayResult = data.result
      const wonPrize: PlayResultPrize = data.prize

      if (won === 'win' || won === 'laki' || won === 'clover') {
        setTiles([won, won, won])
        playWinChime()
        playConfettiPop()
      } else {
        setTiles(nonMatchingArrangement())
      }

      setResult(won)
      setPrize(wonPrize)
      setSpinning(false)
    } catch (err: any) {
      stopSwapsRef.current?.()
      stopSwapsRef.current = null
      setPlayError(err.message || 'Something went wrong — please try again.')
      setSpinning(false)
      clearDropTimeouts()
      setDicePhase('shelf')
    }
  }, [spinning, clearDropTimeouts])

  // Tap-to-continue on the reveal resets the dice back up to the shelf,
  // ready for the next pull.
  const dismissReveal = useCallback(() => {
    setResult(null)
    clearDropTimeouts()
    setDicePhase('shelf')
    setTiles(['laki', 'clover', 'win'])
  }, [clearDropTimeouts])

  const onPointerDown = (e: React.PointerEvent) => {
    if (spinning) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartY.current = e.clientY
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current == null) return
    const delta = e.clientY - dragStartY.current
    const clamped = Math.max(0, Math.min(MAX_PULL, delta))
    pullYRef.current = clamped
    setPullY(clamped)
  }

  const onPointerUp = () => {
    if (dragStartY.current == null) return
    setDragging(false)
    const pulled = pullYRef.current >= PULL_THRESHOLD
    pullYRef.current = 0
    setPullY(0)
    dragStartY.current = null
    if (pulled) handlePlay()
  }

  return (
    <div className="relative flex flex-1 flex-col items-center bg-[#1a0f00]">
      {/* Capped by both viewport width AND height (via STACK_HEIGHT_RATIO,
          with NAV_ROW_HEIGHT_REM subtracted for the nav row below) —
          Color Game's art is taller than the Wheel's, so capping by width
          alone (like the Wheel page does) let it render taller than one
          screen and forced a scroll. This keeps it to one screen the same
          way the Wheel's own background aspect ratio does for that page. */}
      <div className="relative flex flex-col" style={{ width: `min(100%, 28rem, calc((94dvh - ${NAV_ROW_HEIGHT_REM}rem) / ${STACK_HEIGHT_RATIO}))` }}>
        {/* Back/manage nav sits in its own row above the art (not overlaid
            on top of the shelf) so it has real breathing room from the tile
            row, matching the Wheel page's spacing instead of crowding the
            tiles the way an overlay on this shorter art would. */}
        <div className="flex items-center justify-between py-3">
          <Link
            href="/"
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fad403] shadow-[0_3px_0_#cc9700] active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M5 12l6-6M5 12l6 6" />
            </svg>
          </Link>
          <Link
            href="/admin/color-game"
            aria-label="Manage prizes"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fad403] shadow-[0_3px_0_#cc9700] active:translate-y-[1px] active:shadow-[0_2px_0_#cc9700]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="black" strokeWidth={2.5} strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </Link>
        </div>

        {/* Shelf (holds the three tiles) directly above the chute board —
            each block sized by its own art's aspect ratio, stacked with no
            gap so they read as one continuous machine. */}
        <div className="relative w-full">
          <div className="relative w-full" style={{ aspectRatio: `${SHELF_ASPECT}`, containerType: 'inline-size' }}>
            <Image src="/color-game/shelf.svg" alt="" fill priority />
          </div>

          <div className="relative w-full" style={{ aspectRatio: `${BOARD_ASPECT}` }}>
            <Image src="/color-game/board.svg" alt="" fill priority />

            {/* Rope + ring pull handle. Dragged as a rigid unit (see pullY
                comment above) rather than stretched. */}
            <div
              className="absolute left-1/2 top-0 select-none touch-none"
              style={{
                width: `${RING_WIDTH_PCT}%`,
                transform: `translate(-50%, ${pullY}px)`,
                transition: dragging ? 'none' : 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <Image
                src="/color-game/rope.svg"
                alt="Pull to play"
                width={416}
                height={2572}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="h-auto w-full cursor-grab active:cursor-grabbing"
                style={{ aspectRatio: `${ROPE_ASPECT}` }}
                priority
              />
            </div>
          </div>

          {/* Dice layer, spanning the full shelf+board stack (an absolutely
              positioned sibling sized against that same combined height) so
              the tile row can travel from the shelf down to a landing zone
              near the bottom of the chute, rather than being boxed inside
              the shelf's own (much shorter) art. */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute left-1/2 flex -translate-x-1/2 gap-[5%]"
              style={{
                top: `${DICE_PHASE_TOP_PCT[dicePhase]}%`,
                width: `${TILE_ROW_WIDTH_PCT}%`,
                transition: DICE_PHASE_TRANSITION[dicePhase],
              }}
            >
              {tiles.map((symbol, i) => {
                // While rolling, each tile spins smoothly toward its own
                // resting angle (TILE_SPIN_TURNS extra full turns on top, so
                // it reads as one continuous decelerating tumble) rather
                // than an oscillating wobble unrelated to the fall. Both the
                // spin and the scatter offset ease in together over the
                // whole fall+bounce sequence, ending exactly at rest.
                const offset = TILE_SETTLE_OFFSETS[i]
                const rolling = dicePhase !== 'shelf'
                const rotateDeg = rolling ? TILE_SPIN_TURNS * 360 + offset.rotate : 0
                const dy = rolling ? offset.dy : 0
                return (
                  <div
                    key={i}
                    className="relative aspect-square flex-1 overflow-hidden rounded-[14%] shadow-md"
                    style={{
                      transform: `translateY(${dy}%) rotate(${rotateDeg}deg)`,
                      transition: rolling
                        ? `transform ${DICE_SETTLE_AT_MS}ms cubic-bezier(0.15, 0.8, 0.35, 1)`
                        : 'transform 300ms ease-out',
                    }}
                  >
                    <Image src={SYMBOL_ART[symbol]} alt="" fill />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {playError && (
        <div className="mt-4 w-full max-w-sm rounded-lg border border-red-900 bg-red-950/90 p-3 text-sm text-red-200 text-center">
          {playError}
        </div>
      )}

      {/* Full-screen win reveal, matching the Wheel/Duck Race pattern. Every
          play surfaces some prize (a three-of-a-kind combo or a merch
          consolation), so the card always shows — only the confetti/chime
          are gated to true matches (see the `result` effect above). */}
      {result && prize && (
        <button
          type="button"
          onClick={dismissReveal}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 px-8 animate-[wheel-reveal-in_300ms_ease-out]"
        >
          {prizePhotoFor(prize.name) ? (
            <Image
              src={prizePhotoFor(prize.name)!}
              alt={prize.name}
              width={600}
              height={600}
              className="w-56 h-56 object-contain mb-6"
            />
          ) : null}
          <p className="text-sm text-white/70 mb-1">
            {result === 'merch' ? 'You won' : '3 of a kind — you won'}
          </p>
          <p className="text-3xl font-extrabold text-[#fad403] text-center">{prize.name}</p>
          <p className="mt-8 text-xs text-white/50">Tap anywhere to continue</p>

          <canvas ref={confettiCanvasRef} className="pointer-events-none absolute inset-0" />
        </button>
      )}
    </div>
  )
}
