'use client'

import { useEffect, useRef, useState } from 'react'

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

export default function PlayColorGamePage() {
  const [tiles, setTiles] = useState<ComboSymbol[]>(['win', 'laki', 'clover'])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<PlayResult | null>(null)
  const [prize, setPrize] = useState<PlayResultPrize | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current)
    }
  }, [])

  async function handlePlay() {
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

      <button
        type="button"
        onClick={handlePlay}
        disabled={spinning}
        className="mt-8 rounded-md bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {spinning ? 'Drawing…' : 'Play'}
      </button>

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
