import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'

// Tables the API routes are allowed to address by name (interpolated into SQL,
// so this list is the only thing that may ever reach a query as a table name).
export type PrizeTable = 'wheel_prizes' | 'color_combo_prizes' | 'color_merch_prizes' | 'duck_race_prizes'

export type PrizeRow = {
  id: string
  symbol?: string
  name: string
  prize_type: string
  probability: number | null
  inventory: number | null
  active: boolean
  display_order?: number
}

export function getDb(): D1Database {
  return getCloudflareContext().env.DB
}

// D1 stores booleans as 0/1 — convert back so the JSON API matches what the
// Supabase version returned.
export function toPrizeRow(row: Record<string, unknown>): PrizeRow {
  return { ...(row as PrizeRow), active: row.active === 1 || row.active === true }
}

export async function selectPrizes(table: PrizeTable, where = '', orderBy = ''): Promise<PrizeRow[]> {
  const sql = `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}${orderBy ? ` ORDER BY ${orderBy}` : ''}`
  const { results } = await getDb().prepare(sql).all()
  return results.map(toPrizeRow)
}

// Optimistic-lock decrement: only succeeds if inventory still matches what we
// read. Returns false if another request took the unit first.
export async function decrementInventory(table: PrizeTable, id: string, expected: number): Promise<boolean> {
  const { meta } = await getDb()
    .prepare(`UPDATE ${table} SET inventory = ?, updated_at = ? WHERE id = ? AND inventory = ?`)
    .bind(expected - 1, new Date().toISOString(), id, expected)
    .run()
  return meta.changes > 0
}

type ReplacementPrize = {
  name: string
  prize_type: string
  probability: number | null
  inventory: number | null
  active: boolean
  display_order: number
}

// Full replace of a prize list: delete every row, insert the submitted set.
// Runs as one D1 batch, which is atomic — a failed insert rolls back the delete.
export async function replacePrizes(table: Exclude<PrizeTable, 'color_combo_prizes'>, rows: ReplacementPrize[]) {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO ${table} (id, name, prize_type, probability, inventory, active, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  await db.batch([
    db.prepare(`DELETE FROM ${table}`),
    ...rows.map(r =>
      insert.bind(crypto.randomUUID(), r.name, r.prize_type, r.probability, r.inventory, r.active ? 1 : 0, r.display_order)
    ),
  ])
}

export async function currentInventoryBy(table: PrizeTable, key: 'id' | 'symbol'): Promise<Map<string, number | null>> {
  const { results } = await getDb().prepare(`SELECT ${key}, inventory FROM ${table}`).all<Record<string, unknown>>()
  return new Map(results.map(r => [r[key] as string, r.inventory as number | null]))
}
