'use client'

import { useEffect, useState } from 'react'
import { adminStyles as s } from '../admin-styles'

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
      <div className={s.page}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading Duck Race config…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={s.page}>
        <div className={s.loadErrorBox}>Failed to load Duck Race config: {loadError}</div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.container}>
        <h1 className={s.title}>
          <span className={s.titleAccent} />
          Admin: Duck Race
        </h1>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className={s.sectionHeading}>Prizes (max {MAX_PRIZES})</h2>
            <button type="button" onClick={addPrize} disabled={prizes.length >= MAX_PRIZES} className={`${s.secondaryButton} disabled:opacity-50`}>
              Add prize
            </button>
          </div>

          <p
            className={`text-xs mb-3 ${
              probabilityTotal > 100
                ? 'text-red-600 dark:text-red-400 font-semibold'
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
            <p className={s.messageError}>
              You have {prizes.length} prizes but Duck Race supports at most {MAX_PRIZES} — remove{' '}
              {prizes.length - MAX_PRIZES} prize(s) before saving.
            </p>
          )}

          {prizes.length === 0 ? (
            <p className={s.emptyState}>No prizes yet. Click &quot;Add prize&quot; to create one.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {prizes.map((prize, index) => (
                <div key={index} className={s.card}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className={s.fieldLabel}>Name</span>
                      <input
                        type="text"
                        value={prize.name}
                        onChange={(e) => updatePrize(index, { name: e.target.value })}
                        maxLength={100}
                        className={s.input}
                        placeholder="Prize name"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className={s.fieldLabel}>Type</span>
                      <select
                        value={prize.prizeType}
                        onChange={(e) => updatePrize(index, { prizeType: e.target.value })}
                        className={s.input}
                      >
                        {PRIZE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className={s.fieldLabel}>Probability</span>
                      <input
                        type="number"
                        value={prize.probability ?? ''}
                        onChange={(e) =>
                          updatePrize(index, {
                            probability: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className={s.input}
                        placeholder="e.g. 20"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className={s.fieldLabel}>Inventory</span>
                      <input
                        type="number"
                        value={prize.inventory ?? ''}
                        onChange={(e) =>
                          updatePrize(index, {
                            inventory: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className={s.input}
                        placeholder="Unlimited"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className={s.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={prize.active}
                        onChange={(e) => updatePrize(index, { active: e.target.checked })}
                        className="h-4 w-4 accent-[#fad403]"
                      />
                      Active
                    </label>
                    <button type="button" onClick={() => removePrize(index)} className={s.dangerLink}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {message && <div className={message.type === 'success' ? s.messageSuccess : s.messageError}>{message.text}</div>}

        <button type="button" onClick={handleSave} disabled={saving || tooManyPrizes} className={s.primaryButton}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
