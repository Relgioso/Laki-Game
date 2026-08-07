'use client'

import { useEffect, useState } from 'react'
import { adminStyles as s } from '../admin-styles'

type ComboSymbol = 'win' | 'laki' | 'clover'

type ComboPrize = {
  id: string
  symbol: ComboSymbol
  name: string
  prizeType: string
  probability: number | null
  inventory: number | null
  active: boolean
}

type MerchPrize = {
  id: string
  name: string
  prizeType: string
  probability: number | null
  inventory: number | null
  active: boolean
  displayOrder: number
}

type NewMerchPrize = Omit<MerchPrize, 'id'> & { id?: string }

const PRIZE_TYPES = [
  'merchandise',
  'bonus',
  'cash',
  'voucher',
  'consolation',
  'custom',
] as const

const COMBO_LABELS: Record<ComboSymbol, string> = {
  win: 'WIN',
  laki: 'LAKI',
  clover: 'Clover',
}

function blankMerchPrize(displayOrder: number): NewMerchPrize {
  return {
    name: '',
    prizeType: 'merchandise',
    probability: null,
    inventory: null,
    active: true,
    displayOrder,
  }
}

export default function ColorGameConfigPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [combos, setCombos] = useState<ComboPrize[]>([])
  const [merch, setMerch] = useState<NewMerchPrize[]>([])
  // Snapshots of combos/merch as loaded, used to detect whether the admin
  // actually touched a row's inventory before this save. See handleSave.
  const [originalCombos, setOriginalCombos] = useState<Map<ComboSymbol, ComboPrize>>(new Map())
  const [originalMerch, setOriginalMerch] = useState<Map<string, MerchPrize>>(new Map())

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch('/api/color-game/config')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load color game config.')
        if (cancelled) return
        const loadedCombos: ComboPrize[] = data.combos || []
        const loadedMerch: MerchPrize[] = data.merch || []
        setCombos(loadedCombos)
        setMerch(loadedMerch)
        setOriginalCombos(new Map(loadedCombos.map((c) => [c.symbol, c])))
        setOriginalMerch(new Map(loadedMerch.map((m) => [m.id, m])))
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load color game config.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function updateCombo(index: number, patch: Partial<ComboPrize>) {
    setCombos((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  function updateMerch(index: number, patch: Partial<NewMerchPrize>) {
    setMerch((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function addMerch() {
    setMerch((prev) => [...prev, blankMerchPrize(prev.length)])
  }

  function removeMerch(index: number) {
    setMerch((prev) => prev.filter((_, i) => i !== index))
  }

  // Combined explicit probability across the fixed combo set. This doesn't
  // need to sum to 100 -- whatever's left implicitly goes to the merch pool
  // -- but it's still useful for the admin to see at a glance.
  const combosWithProbability = combos.filter((c) => c.active && c.probability !== null)
  // Rounded to 4 decimal places (matching color_combo_prizes.probability's NUMERIC(7,4)
  // precision) to absorb floating-point sum artifacts before display.
  const comboProbabilityTotal = Number(
    combosWithProbability.reduce((sum, c) => sum + (c.probability ?? 0), 0).toFixed(4)
  )

  // Running total of explicit probabilities among active merch prizes.
  // Prizes with probability === null split whatever's left over
  // automatically, so they're excluded from the sum but counted for the
  // remainder note.
  const activeMerchWithProbability = merch.filter((m) => m.active && m.probability !== null)
  const activeMerchWithoutProbability = merch.filter((m) => m.active && m.probability === null)
  const merchProbabilityTotal = Number(
    activeMerchWithProbability.reduce((sum, m) => sum + (m.probability ?? 0), 0).toFixed(3)
  )

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        combos: combos.map((c) => {
          const body: any = {
            symbol: c.symbol,
            name: c.name,
            prizeType: c.prizeType,
            probability: c.probability,
            active: c.active,
          }
          // Combos always exist server-side (fixed set of 3, matched by
          // symbol) -- only send inventory if the admin actually edited it
          // since load, so the server can merge in the live DB value
          // otherwise instead of resurrecting a stale snapshot.
          if (c.inventory !== originalCombos.get(c.symbol)?.inventory) {
            body.inventory = c.inventory
          }
          return body
        }),
        merch: merch.map((m, i) => {
          const body: any = {
            name: m.name,
            prizeType: m.prizeType,
            probability: m.probability,
            active: m.active,
            displayOrder: i,
          }
          if (m.id) body.id = m.id
          if (!m.id || m.inventory !== originalMerch.get(m.id)?.inventory) {
            body.inventory = m.inventory
          }
          return body
        }),
      }
      const res = await fetch('/api/color-game/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save color game config.')
      setMessage({ type: 'success', text: 'Color game config saved.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save color game config.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={s.page}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading color game config…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={s.page}>
        <div className={s.loadErrorBox}>Failed to load color game config: {loadError}</div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.container}>
        <h1 className={s.title}>
          <span className={s.titleAccent} />
          Admin: Color Game
        </h1>

        <section className="mb-8">
          <h2 className={s.sectionHeading}>Combo prizes (3 of a kind)</h2>
          <p className={s.sectionSubtext}>Fixed set of three combos. Symbol cannot be changed.</p>

          <p
            className={`text-xs mb-3 ${
              comboProbabilityTotal > 100
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Combined combo probability: {comboProbabilityTotal}% — the remaining{' '}
            {Math.max(0, 100 - comboProbabilityTotal)}% goes to the Merchandise pool
          </p>

          <div className="flex flex-col gap-3">
            {combos.map((combo, index) => (
              <div key={combo.symbol} className={s.card}>
                <div className="mb-3">
                  <span className={s.badge}>{COMBO_LABELS[combo.symbol]}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className={s.fieldLabel}>Name</span>
                    <input
                      type="text"
                      value={combo.name}
                      onChange={(e) => updateCombo(index, { name: e.target.value })}
                      maxLength={100}
                      className={s.input}
                      placeholder="Prize name"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className={s.fieldLabel}>Type</span>
                    <select
                      value={combo.prizeType}
                      onChange={(e) => updateCombo(index, { prizeType: e.target.value })}
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
                      value={combo.probability ?? ''}
                      onChange={(e) =>
                        updateCombo(index, {
                          probability: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className={s.input}
                      placeholder="e.g. 0.02"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className={s.fieldLabel}>Inventory</span>
                    <input
                      type="number"
                      value={combo.inventory ?? ''}
                      onChange={(e) =>
                        updateCombo(index, {
                          inventory: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className={s.input}
                      placeholder="Unlimited"
                    />
                  </label>
                </div>

                <div className="mt-3">
                  <label className={s.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={combo.active}
                      onChange={(e) => updateCombo(index, { active: e.target.checked })}
                      className="h-4 w-4 accent-[#fad403]"
                    />
                    Active
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className={s.sectionHeading}>Merchandise pool (non-3-of-a-kind results)</h2>
            <button type="button" onClick={addMerch} className={s.secondaryButton}>
              Add prize
            </button>
          </div>

          <p
            className={`text-xs mb-3 ${
              merchProbabilityTotal > 100
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Probabilities total: {merchProbabilityTotal}%
            {activeMerchWithoutProbability.length > 0
              ? ` (remaining ${Math.max(0, 100 - merchProbabilityTotal)}% split across ${
                  activeMerchWithoutProbability.length
                } prize(s) with no probability set)`
              : ''}
          </p>

          {merch.length === 0 ? (
            <p className={s.emptyState}>No merchandise prizes yet. Click &quot;Add prize&quot; to create one.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {merch.map((prize, index) => (
                <div key={index} className={s.card}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className={s.fieldLabel}>Name</span>
                      <input
                        type="text"
                        value={prize.name}
                        onChange={(e) => updateMerch(index, { name: e.target.value })}
                        maxLength={100}
                        className={s.input}
                        placeholder="Prize name"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className={s.fieldLabel}>Type</span>
                      <select
                        value={prize.prizeType}
                        onChange={(e) => updateMerch(index, { prizeType: e.target.value })}
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
                          updateMerch(index, {
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
                          updateMerch(index, {
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
                        onChange={(e) => updateMerch(index, { active: e.target.checked })}
                        className="h-4 w-4 accent-[#fad403]"
                      />
                      Active
                    </label>
                    <button type="button" onClick={() => removeMerch(index)} className={s.dangerLink}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {message && <div className={message.type === 'success' ? s.messageSuccess : s.messageError}>{message.text}</div>}

        <button type="button" onClick={handleSave} disabled={saving} className={s.primaryButton}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
