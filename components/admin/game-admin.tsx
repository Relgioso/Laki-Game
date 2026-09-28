'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminStyles as s } from '@/app/admin/admin-styles'
import PrizeEditor, { type EditablePrize } from '@/components/admin/prize-editor'
import { MECHANICS } from '@/components/games/mechanics'
import { GAMES, type Mechanic } from '@/lib/games'
import type { ApiPrize, SubmittedPrize } from '@/lib/prize-config'

type Props = { slug: string; title: string; mechanic: Mechanic; maxPrizes: number }

const noop = () => {}

async function fetchPrizes(url: string, what: string): Promise<ApiPrize[]> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Failed to load ${what}.`)
  return data.prizes as ApiPrize[]
}

// Admin screen for any shared-platform game: live preview of the board on the
// left, prize editor on the right (stacked on phones).
export default function GameAdmin({ slug, title, mechanic, maxPrizes }: Props) {
  const Board = MECHANICS[mechanic].component
  const configUrl = `/api/games/${slug}/config`
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [prizes, setPrizes] = useState<EditablePrize[]>([])
  const [original, setOriginal] = useState<Map<string, ApiPrize>>(new Map())
  const [copySource, setCopySource] = useState('')

  const copySources = GAMES.filter((g) => g.slug !== slug && g.prizesConfigUrl)

  function applyLoaded(list: ApiPrize[]) {
    setPrizes(list)
    setOriginal(new Map(list.map((p) => [p.id, p])))
  }

  useEffect(() => {
    let cancelled = false
    fetchPrizes(configUrl, `${title} prizes`)
      .then((list) => {
        if (!cancelled) applyLoaded(list)
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [configUrl, title])

  // What players would see if saved now: active, named prizes in order.
  const previewPrizes = useMemo<ApiPrize[]>(
    () =>
      prizes
        .map((p, i) => ({ ...p, id: p.id ?? `new-${i}`, displayOrder: i }))
        .filter((p) => p.active && p.name.trim() !== ''),
    [prizes]
  )

  // Replaces the editor's rows with another game's prizes as new, unsaved
  // rows. Nothing changes for players until Save.
  async function handleCopy() {
    const source = copySources.find((g) => g.slug === copySource)
    if (!source?.prizesConfigUrl) return
    setMessage(null)
    try {
      const list = await fetchPrizes(source.prizesConfigUrl, `${source.title} prizes`)
      const copied: EditablePrize[] = list.slice(0, maxPrizes).map((p, i) => ({
        name: p.name, prizeType: p.prizeType, probability: p.probability, inventory: p.inventory, active: p.active, displayOrder: i,
      }))
      setPrizes(copied)
      const leftOut = list.length - copied.length
      setMessage({
        type: 'success',
        text: `Copied ${copied.length} prize(s) from ${source.title}${leftOut > 0 ? ` (${leftOut} left out — max ${maxPrizes})` : ''}. Press Save to keep them.`,
      })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Copy failed.' })
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const payload: { prizes: SubmittedPrize[] } = {
        prizes: prizes.map((p, i) => {
          const body: SubmittedPrize = { name: p.name, prizeType: p.prizeType, probability: p.probability, active: p.active, displayOrder: i }
          if (p.id) body.id = p.id
          // Only send stock the admin actually changed, so plays since the
          // page loaded aren't overwritten.
          if (!p.id || p.inventory !== original.get(p.id)?.inventory) body.inventory = p.inventory
          return body
        }),
      }
      const res = await fetch(configUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to save ${title} prizes.`)
      // Saving replaces rows with new ids -- reload so the next save's
      // untouched-stock check compares against the real rows.
      applyLoaded(await fetchPrizes(configUrl, `${title} prizes`))
      setMessage({ type: 'success', text: `${title} prizes saved.` })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : `Failed to save ${title} prizes.` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={s.page}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading {title} prizes…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={s.page}>
        <div className={s.loadErrorBox}>Failed to load {title} prizes: {loadError}</div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className="w-full max-w-6xl">
        <h1 className={s.title}>
          <span className={s.titleAccent} />
          Admin: {title}
        </h1>

        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="md:sticky md:top-6">
            <h2 className={s.sectionHeading}>Preview</h2>
            <p className={s.sectionSubtext}>Shows your changes as you type. Players see them after you press Save.</p>
            <div className="mx-auto max-w-[240px] md:max-w-sm">
              <Board prizes={previewPrizes} target={null} onFinished={noop} />
            </div>
          </section>

          <section>
            {copySources.length > 0 && (
              <div className="mb-6 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className={s.fieldLabel}>Copy prizes from another game</span>
                  <select value={copySource} onChange={(e) => setCopySource(e.target.value)} className={s.input}>
                    <option value="">Choose a game…</option>
                    {copySources.map((g) => (
                      <option key={g.slug} value={g.slug}>{g.title}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleCopy} disabled={!copySource} className={`${s.secondaryButton} disabled:opacity-50`}>
                  Copy
                </button>
              </div>
            )}

            <PrizeEditor prizes={prizes} maxPrizes={maxPrizes} onChange={setPrizes} />

            {message && <div className={message.type === 'success' ? s.messageSuccess : s.messageError}>{message.text}</div>}

            <button type="button" onClick={handleSave} disabled={saving || prizes.length > maxPrizes} className={s.primaryButton}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
