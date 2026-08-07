'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { playConfettiPop, playSpinTick, playWinChime } from '@/lib/sound'
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

// Tile row placement as percentages of the shelf's own box — measured
// against the reference mockup: three tiles centered in the shelf's open
// "cup" between its two raised arms, sitting above the flat shadow bar.
const TILE_ROW_TOP_PCT = 14
const TILE_ROW_WIDTH_PCT = 66

// Ring width as a percentage of the board's width; the rope's height follows
// from ROPE_ASPECT so the coil/ring proportions stay true to the art.
const RING_WIDTH_PCT = 21

export default function PlayColorGamePage() {
  const [tiles, setTiles] = useState<ComboSymbol[]>(['laki', 'clover', 'win'])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<PlayResult | null>(null)
  const [prize, setPrize] = useState<PlayResultPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  const intervalRef = useRef<number | null>(null)
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
  // Mirrors `pullY` synchronously (state updates are batched/async, so a
  // pointerup that fires in the same tick as the preceding pointermove could
  // otherwise read a stale `pullY` from the previous render's closure).
  const pullYRef = useRef(0)

  useEffect(() => {
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current)
    }
  }, [])

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

    // Roll the three tiles through random symbols while the request is in
    // flight, like a slot machine — the "dice roll" the pull sets off.
    intervalRef.current = window.setInterval(() => {
      setTiles([randomSymbol(), randomSymbol(), randomSymbol()])
      playSpinTick()
    }, 90)

    const minAnimation = new Promise((resolve) => window.setTimeout(resolve, 1200))

    try {
      const [res] = await Promise.all([fetch('/api/color-game/play', { method: 'POST' }), minAnimation])
      const data = await res.json()

      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      if (!res.ok) {
        setPlayError(data.error || 'Something went wrong — please try again.')
        setSpinning(false)
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
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setPlayError(err.message || 'Something went wrong — please try again.')
      setSpinning(false)
    }
  }, [spinning])

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
      <div className="relative w-full max-w-md">
        {/* Shelf (holds the three tiles) directly above the chute board —
            each block sized by its own art's aspect ratio, stacked with no
            gap so they read as one continuous machine. */}
        <div className="relative w-full">
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-[3%]">
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

          <div className="relative w-full" style={{ aspectRatio: `${SHELF_ASPECT}`, containerType: 'inline-size' }}>
            <Image src="/color-game/shelf.svg" alt="" fill priority />

            <div
              className="absolute left-1/2 flex -translate-x-1/2 gap-[5%]"
              style={{ top: `${TILE_ROW_TOP_PCT}%`, width: `${TILE_ROW_WIDTH_PCT}%` }}
            >
              {tiles.map((symbol, i) => (
                <div key={i} className="relative aspect-square flex-1 overflow-hidden rounded-[14%] shadow-md">
                  <Image
                    src={SYMBOL_ART[symbol]}
                    alt=""
                    fill
                    style={
                      spinning
                        ? { animation: 'color-game-roll 550ms cubic-bezier(0.34, 1.56, 0.64, 1) infinite', animationDelay: `${i * 90}ms` }
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
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
          onClick={() => setResult(null)}
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
