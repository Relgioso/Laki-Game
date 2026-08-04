'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ComboSymbol = 'win' | 'laki' | 'clover'

type PlayResult = ComboSymbol | 'merch'

type PlayResultPrize = {
  name: string
  prizeType: string
}

const SYMBOLS: ComboSymbol[] = ['win', 'laki', 'clover']

const SYMBOL_DISPLAY: Record<ComboSymbol, { label: string; className: string }> = {
  win: { label: 'WIN', className: 'text-amber-500 dark:text-amber-400' },
  laki: { label: 'LAKI', className: 'text-emerald-600 dark:text-emerald-400' },
  clover: { label: '🍀', className: 'text-green-600 dark:text-green-400' },
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

// How far the handle must be pulled down (px) before releasing counts as a pull.
const PULL_THRESHOLD = 90
// Furthest the handle can be dragged, for a natural-feeling rope with some give.
const MAX_PULL = 130

export default function PlayColorGamePage() {
  const [tiles, setTiles] = useState<ComboSymbol[]>(['win', 'laki', 'clover'])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<PlayResult | null>(null)
  const [prize, setPrize] = useState<PlayResultPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  const intervalRef = useRef<number | null>(null)

  // Rope pull state. `pullY` is the handle's current vertical offset from rest (0..MAX_PULL).
  // `dragging` tracks an in-progress drag; `snapBack` toggles a CSS transition so the
  // handle animates back to rest after a release, but not while actively being dragged
  // (which would make it feel laggy/rubber-banded instead of following the finger).
  const [pullY, setPullY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current)
    }
  }, [])

  const handlePlay = useCallback(async () => {
    if (spinning) return
    setSpinning(true)
    setPlayError(null)
    setResult(null)
    setPrize(null)

    // Cycle all 3 tiles through random symbols while the request is in flight.
    intervalRef.current = window.setInterval(() => {
      setTiles([randomSymbol(), randomSymbol(), randomSymbol()])
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
    if (!dragging || dragStartY.current == null) return
    const delta = e.clientY - dragStartY.current
    setPullY(Math.max(0, Math.min(MAX_PULL, delta)))
  }

  const onPointerUp = () => {
    if (!dragging) return
    setDragging(false)
    const pulled = pullY >= PULL_THRESHOLD
    setPullY(0)
    dragStartY.current = null
    if (pulled) handlePlay()
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 mb-8">
        Color Game
      </h1>

      <div className="flex gap-4">
        {tiles.map((symbol, i) => {
          const display = SYMBOL_DISPLAY[symbol]
          return (
            <div
              key={i}
              className="flex items-center justify-center rounded-lg border-2 border-black dark:border-white bg-white dark:bg-zinc-900 shadow-md"
              style={{ width: 96, height: 96 }}
            >
              <span className={`text-2xl font-bold ${display.className} ${spinning ? 'opacity-70' : ''}`}>
                {display.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Rope pull lever, replacing a plain Play button — drag the handle down past the
          threshold and release to play, evoking the classic on-ground Color Game's
          pull-to-reveal mechanic. No design assets for this yet; simple placeholder
          shapes (rope + wooden-knob handle) built directly, swap for real art later. */}
      <div className="mt-12 flex flex-col items-center select-none" style={{ touchAction: 'none' }}>
        <div
          className="w-3 rounded-full bg-gradient-to-b from-amber-800 to-amber-700"
          style={{ height: 24 + pullY, transition: dragging ? 'none' : 'height 300ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />
        <button
          type="button"
          aria-label="Pull to play"
          disabled={spinning}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-amber-500 to-amber-700 border-4 border-amber-900 shadow-lg cursor-grab active:cursor-grabbing disabled:opacity-60 disabled:cursor-not-allowed touch-none"
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-950">
            {spinning ? '…' : 'Pull'}
          </span>
        </button>
      </div>

      {playError && (
        <div className="mt-6 w-full max-w-sm rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300 text-center">
          {playError}
        </div>
      )}

      {result && prize && (
        <div className="mt-6 w-full max-w-sm rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-4 text-center">
          <p className="text-xs text-green-700 dark:text-green-300 mb-1">
            {result === 'merch' ? 'You won' : `3 of a kind — you won`}
          </p>
          <p className="text-lg font-semibold text-green-800 dark:text-green-200">{prize.name}</p>
        </div>
      )}
    </div>
  )
}
