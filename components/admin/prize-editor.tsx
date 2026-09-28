'use client'

import { adminStyles as s } from '@/app/admin/admin-styles'
import { ALLOWED_PRIZE_TYPES, type ApiPrize } from '@/lib/prize-config'

export type EditablePrize = Omit<ApiPrize, 'id'> & { id?: string }

type Props = {
  prizes: EditablePrize[]
  maxPrizes: number
  onChange: (next: EditablePrize[]) => void
}

// Prize list editor shared by every shared-platform game's admin screen.
export default function PrizeEditor({ prizes, maxPrizes, onChange }: Props) {
  const update = (index: number, patch: Partial<EditablePrize>) =>
    onChange(prizes.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  const add = () =>
    onChange([...prizes, { name: '', prizeType: 'merchandise', probability: null, inventory: null, active: true, displayOrder: prizes.length }])
  const remove = (index: number) => onChange(prizes.filter((_, i) => i !== index))
  const numberOrNull = (value: string) => (value === '' ? null : Number(value))

  const withProbability = prizes.filter((p) => p.active && p.probability !== null)
  const withoutProbability = prizes.filter((p) => p.active && p.probability === null)
  const probabilityTotal = Number(withProbability.reduce((sum, p) => sum + (p.probability ?? 0), 0).toFixed(3))

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className={s.sectionHeading}>Prizes (max {maxPrizes})</h2>
        <button type="button" onClick={add} disabled={prizes.length >= maxPrizes} className={`${s.secondaryButton} disabled:opacity-50`}>
          Add prize
        </button>
      </div>

      <p className={`mb-3 text-xs ${probabilityTotal > 100 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
        Probabilities total: {probabilityTotal}%
        {withoutProbability.length > 0
          ? ` (remaining ${Math.max(0, 100 - probabilityTotal)}% split across ${withoutProbability.length} prize(s) with no probability set)`
          : ''}
      </p>

      {prizes.length > maxPrizes && (
        <p className={s.messageError}>
          You have {prizes.length} prizes but this game supports at most {maxPrizes} — remove {prizes.length - maxPrizes} prize(s) before saving.
        </p>
      )}

      {prizes.length === 0 ? (
        <p className={s.emptyState}>No prizes yet. Click &quot;Add prize&quot; to create one.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {prizes.map((prize, index) => (
            <div key={index} className={s.card}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={s.fieldLabel}>Name</span>
                  <input type="text" value={prize.name} maxLength={100} placeholder="Prize name" className={s.input}
                    onChange={(e) => update(index, { name: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Type</span>
                  <select value={prize.prizeType} className={s.input} onChange={(e) => update(index, { prizeType: e.target.value })}>
                    {ALLOWED_PRIZE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Probability (%)</span>
                  <input type="number" min={0} max={100} step="any" value={prize.probability ?? ''} placeholder="Auto" className={s.input}
                    onFocus={(e) => e.target.select()} onChange={(e) => update(index, { probability: numberOrNull(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Inventory</span>
                  <input type="number" min={0} step={1} value={prize.inventory ?? ''} placeholder="Unlimited" className={s.input}
                    onFocus={(e) => e.target.select()} onChange={(e) => update(index, { inventory: numberOrNull(e.target.value) })} />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className={s.checkboxLabel}>
                  <input type="checkbox" checked={prize.active} className="h-4 w-4 accent-[#fad403]"
                    onChange={(e) => update(index, { active: e.target.checked })} />
                  Active
                </label>
                <button type="button" onClick={() => remove(index)} className={s.dangerLink}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
