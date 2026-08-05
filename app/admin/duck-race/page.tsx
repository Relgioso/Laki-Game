'use client'

import { useEffect, useState } from 'react'

type DuckRacePrize = {
  id: string
  name: string
  prizeType: string
  probability: number | null
  inventory: number | null
  active: boolean
  displayOrder: number
}

type NewDuckRacePrize = Omit<DuckRacePrize, 'id'> & { id?: string }

const PRIZE_TYPES = [
  'merchandise',
  'bonus',
  'cash',
  'voucher',
  'consolation',
  'custom',
] as const

const MAX_PRIZES = 8

function blankPrize(displayOrder: number): NewDuckRacePrize {
  return {
    name: '',
    prizeType: 'merchandise',
    probability: null,
    inventory: null,
    active: true,
    displayOrder,
  }
}

export default function DuckRaceConfigPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [prizes, setPrizes] = useState<NewDuckRacePrize[]>([])
  const [originalPrizes, setOriginalPrizes] = useState<Map<string, DuckRacePrize>>(new Map())

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch('/api/duck-race/config')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load Duck Race config.')
        if (cancelled) return
        const loadedPrizes: DuckRacePrize[] = data.prizes || []
        setPrizes(loadedPrizes)
        setOriginalPrizes(new Map(loadedPrizes.map((p) => [p.id, p])))
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load Duck Race config.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function updatePrize(index: number, patch: Partial<NewDuckRacePrize>) {
    setPrizes((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function addPrize() {
    setPrizes((prev) => [...prev, blankPrize(prev.length)])
  }

  function removePrize(index: number) {
    setPrizes((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        prizes: prizes.map((p, i) => {
          const body: any = {
            name: p.name,
            prizeType: p.prizeType,
            probability: p.probability,
            active: p.active,
            displayOrder: i,
          }
          if (p.id) body.id = p.id
          if (!p.id || p.inventory !== originalPrizes.get(p.id)?.inventory) {
            body.inventory = p.inventory
          }
          return body
        }),
      }
      const res = await fetch('/api/duck-race/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save Duck Race config.')
      setMessage({ type: 'success', text: 'Duck Race config saved.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save Duck Race config.' })
    } finally {
      setSaving(false)
    }
  }

  const tooManyPrizes = prizes.length > MAX_PRIZES

  const activePrizesWithProbability = prizes.filter((p) => p.active && p.probability !== null)
  const activePrizesWithoutProbability = prizes.filter((p) => p.active && p.probability === null)
  const probabilityTotal = Number(
    activePrizesWithProbability.reduce((sum, p) => sum + (p.probability ?? 0), 0).toFixed(3)
  )

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading Duck Race config…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load Duck Race config: {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 mb-8">
          Admin: Duck Race
        </h1>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">Prizes (max {MAX_PRIZES})</h2>
            <button
              type="button"
              onClick={addPrize}
              disabled={prizes.length >= MAX_PRIZES}
              className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium text-black dark:text-zinc-50 hover:border-black/[.2] dark:hover:border-white/[.3] disabled:opacity-50"
            >
              Add prize
            </button>
          </div>

          <p
            className={`text-xs mb-3 ${
              probabilityTotal > 100
                ? 'text-red-600 dark:text-red-400 font-medium'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Probabilities total: {probabilityTotal}%
            {activePrizesWithoutProbability.length > 0
              ? ` (remaining ${Math.max(0, 100 - probabilityTotal)}% split across ${
                  activePrizesWithoutProbability.length
                } prize(s) with no probability set)`
              : ''}
          </p>

          {tooManyPrizes && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
              You have {prizes.length} prizes but Duck Race supports at most {MAX_PRIZES} — remove{' '}
              {prizes.length - MAX_PRIZES} prize(s) before saving.
            </p>
          )}

          {prizes.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 border border-dashed border-black/[.08] dark:border-white/[.145] rounded-lg p-6 text-center">
              No prizes yet. Click &quot;Add prize&quot; to create one.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {prizes.map((prize, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-900 p-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Name</span>
                      <input
                        type="text"
                        value={prize.name}
                        onChange={(e) => updatePrize(index, { name: e.target.value })}
                        maxLength={100}
                        className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                        placeholder="Prize name"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Type</span>
                      <select
                        value={prize.prizeType}
                        onChange={(e) => updatePrize(index, { prizeType: e.target.value })}
                        className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                      >
                        {PRIZE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        Probability
                      </span>
                      <input
                        type="number"
                        value={prize.probability ?? ''}
                        onChange={(e) =>
                          updatePrize(index, {
                            probability: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                        placeholder="e.g. 20"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        Inventory
                      </span>
                      <input
                        type="number"
                        value={prize.inventory ?? ''}
                        onChange={(e) =>
                          updatePrize(index, {
                            inventory: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                        placeholder="Unlimited"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
                      <input
                        type="checkbox"
                        checked={prize.active}
                        onChange={(e) => updatePrize(index, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => removePrize(index)}
                      className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {message && (
          <div
            className={`mb-4 rounded-lg border p-3 text-sm ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || tooManyPrizes}
          className="rounded-md bg-black dark:bg-white text-white dark:text-black px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
