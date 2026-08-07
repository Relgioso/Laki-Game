'use client'

import { useEffect, useState } from 'react'
import { adminStyles as s } from '../admin-styles'

type WheelPrize = {
  id: string
  name: string
  prizeType: string
  probability: number | null
  inventory: number | null
  active: boolean
  displayOrder: number
}

type NewWheelPrize = Omit<WheelPrize, 'id'> & { id?: string }

const PRIZE_TYPES = [
  'merchandise',
  'bonus',
  'cash',
  'voucher',
  'consolation',
  'custom',
] as const

const SLOT_COUNT_OPTIONS = [6, 8, 10, 12] as const

function blankPrize(displayOrder: number): NewWheelPrize {
  return {
    name: '',
    prizeType: 'merchandise',
    probability: null,
    inventory: null,
    active: true,
    displayOrder,
  }
}

export default function WheelConfigPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [slotCount, setSlotCount] = useState<number>(6)
  const [prizes, setPrizes] = useState<NewWheelPrize[]>([])
  // Snapshot of prizes as they were at load time, keyed by id. Used to detect
  // whether the admin actually touched a row's inventory before this save,
  // so we know whether to trust the client's stale inventory value or defer
  // to the live DB value on the server. See handleSave.
  const [originalPrizes, setOriginalPrizes] = useState<Map<string, WheelPrize>>(new Map())

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
        const loadedPrizes: WheelPrize[] = data.prizes || []
        setPrizes(loadedPrizes)
        setOriginalPrizes(new Map(loadedPrizes.map((p) => [p.id, p])))
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

  function updatePrize(index: number, patch: Partial<NewWheelPrize>) {
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
        slotCount,
        prizes: prizes.map((p, i) => {
          const body: any = {
            name: p.name,
            prizeType: p.prizeType,
            probability: p.probability,
            active: p.active,
            displayOrder: i,
          }
          if (p.id) body.id = p.id
          // Only send inventory if this is a new prize (no id) or the admin
          // actually edited it since load. Otherwise omit it entirely so the
          // server merges in whatever the live DB value is at save time --
          // prevents a stale inventory snapshot from resurrecting depleted
          // stock on unrelated edits.
          if (!p.id || p.inventory !== originalPrizes.get(p.id)?.inventory) {
            body.inventory = p.inventory
          }
          return body
        }),
      }
      const res = await fetch('/api/wheel/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save wheel config.')
      setMessage({ type: 'success', text: 'Wheel config saved.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save wheel config.' })
    } finally {
      setSaving(false)
    }
  }

  // The play screen renders exactly slotCount wedges -- any prize beyond
  // that count is drawable but has nowhere to display, so block saving
  // until the admin resolves it.
  const tooManyPrizes = prizes.length > slotCount

  // Running total of explicit probabilities among active prizes. Prizes
  // with probability === null split whatever's left over automatically, so
  // they're excluded from the sum but counted for the remainder note.
  const activePrizesWithProbability = prizes.filter((p) => p.active && p.probability !== null)
  const activePrizesWithoutProbability = prizes.filter((p) => p.active && p.probability === null)
  // Rounded to 3 decimal places to absorb floating-point sum artifacts
  // (e.g. 0.1 + 0.2 displaying as 0.30000000000000004) before display.
  const probabilityTotal = Number(
    activePrizesWithProbability.reduce((sum, p) => sum + (p.probability ?? 0), 0).toFixed(3)
  )

  if (loading) {
    return (
      <div className={s.page}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading wheel config…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={s.page}>
        <div className={s.loadErrorBox}>Failed to load wheel config: {loadError}</div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.container}>
        <h1 className={s.title}>
          <span className={s.titleAccent} />
          Admin: Spin the Wheel
        </h1>

        <section className="mb-8">
          <h2 className={s.sectionHeading}>Slot count</h2>
          <div className="flex gap-2">
            {SLOT_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setSlotCount(count)}
                className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors ${
                  slotCount === count
                    ? 'border-[#fad403] bg-[#fad403] text-black'
                    : 'border-black/10 dark:border-white/20 bg-white dark:bg-zinc-900 text-black dark:text-white hover:border-black/30 dark:hover:border-white/40'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Each option has its own matching wheel art (6/8/10/12 slices).
          </p>
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className={s.sectionHeading}>Prizes</h2>
            <button type="button" onClick={addPrize} className={s.secondaryButton}>
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
              You have {prizes.length} prizes but only {slotCount} wheel slots — remove{' '}
              {prizes.length - slotCount} prize(s) or increase the slot count before saving.
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
