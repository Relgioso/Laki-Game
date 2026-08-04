'use client'

import { useEffect, useState } from 'react'

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
        setCombos(data.combos || [])
        setMerch(data.merch || [])
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

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        combos: combos.map((c) => ({
          symbol: c.symbol,
          name: c.name,
          prizeType: c.prizeType,
          probability: c.probability,
          inventory: c.inventory,
          active: c.active,
        })),
        merch: merch.map((m, i) => ({
          name: m.name,
          prizeType: m.prizeType,
          probability: m.probability,
          inventory: m.inventory,
          active: m.active,
          displayOrder: i,
        })),
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
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading color game config…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          Failed to load color game config: {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 mb-8">
          Admin: Color Game
        </h1>

        <section className="mb-8">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50 mb-2">
            Combo prizes (3 of a kind)
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            Fixed set of three combos. Symbol cannot be changed.
          </p>

          <div className="flex flex-col gap-3">
            {combos.map((combo, index) => (
              <div
                key={combo.symbol}
                className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-900 p-4"
              >
                <div className="mb-3">
                  <span className="inline-block rounded-md bg-black/[.06] dark:bg-white/[.1] px-2 py-1 text-xs font-medium text-black dark:text-zinc-50">
                    {COMBO_LABELS[combo.symbol]}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">Name</span>
                    <input
                      type="text"
                      value={combo.name}
                      onChange={(e) => updateCombo(index, { name: e.target.value })}
                      className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                      placeholder="Prize name"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">Type</span>
                    <select
                      value={combo.prizeType}
                      onChange={(e) => updateCombo(index, { prizeType: e.target.value })}
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
                      value={combo.probability ?? ''}
                      onChange={(e) =>
                        updateCombo(index, {
                          probability: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                      placeholder="e.g. 0.02"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      Inventory
                    </span>
                    <input
                      type="number"
                      value={combo.inventory ?? ''}
                      onChange={(e) =>
                        updateCombo(index, {
                          inventory: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                      placeholder="Unlimited"
                    />
                  </label>
                </div>

                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
                    <input
                      type="checkbox"
                      checked={combo.active}
                      onChange={(e) => updateCombo(index, { active: e.target.checked })}
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
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              Merchandise pool (non-3-of-a-kind results)
            </h2>
            <button
              type="button"
              onClick={addMerch}
              className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium text-black dark:text-zinc-50 hover:border-black/[.2] dark:hover:border-white/[.3]"
            >
              Add prize
            </button>
          </div>

          {merch.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 border border-dashed border-black/[.08] dark:border-white/[.145] rounded-lg p-6 text-center">
              No merchandise prizes yet. Click &quot;Add prize&quot; to create one.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {merch.map((prize, index) => (
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
                        onChange={(e) => updateMerch(index, { name: e.target.value })}
                        className="rounded-md border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1.5 text-sm text-black dark:text-zinc-50"
                        placeholder="Prize name"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">Type</span>
                      <select
                        value={prize.prizeType}
                        onChange={(e) => updateMerch(index, { prizeType: e.target.value })}
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
                          updateMerch(index, {
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
                          updateMerch(index, {
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
                        onChange={(e) => updateMerch(index, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => removeMerch(index)}
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
          disabled={saving}
          className="rounded-md bg-black dark:bg-white text-white dark:text-black px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
