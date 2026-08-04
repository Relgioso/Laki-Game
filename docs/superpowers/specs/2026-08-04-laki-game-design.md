# Laki-Game: Booth Activation Game System

## Overview

Laki-Game systemizes LakiWin's existing on-ground booth activation games, which today run manually. It's a standalone web app (separate from SSS Intelligence and other internal tools) used at live events: qualified players (registered + made a qualifying deposit) get one play, staff operate the game on a tablet/device at the booth, and any won prize is confirmed and physically handed out by staff — no real-money wallet or wagering integration.

Two games ship under one shared platform: **Spin the Wheel** (configurable prize wheel with physical/merch inventory) and **Color Game** (a fixed three-outcome multiplier game applied to the player's qualifying deposit).

## Shared platform

Both games share the same underlying data and staff/admin workflow — an event can offer either or both games, and reporting spans both.

### Roles

- **Admin**: creates events and booths, uploads the qualified-player CSV per event, configures the Wheel's prizes/probabilities/inventory/slot count, configures Color Game's outcome probabilities, views reports across all events and both games.
- **Staff**: logs in, selects an event and booth, looks up a qualified player, lets them pick which game to play (if the event offers both), runs the play, confirms/claims the resulting prize. The logged-in staff member is recorded as the one who released the prize.

Auth via Supabase Auth; a `staff_accounts.role` column (`admin` | `staff`) gates access. Admin actions live behind role checks in both the UI (hide/redirect) and the API layer (never trust the client).

### Events, booths, and player qualification

- **`events`**: name, date range, status (active/closed), which game(s) are enabled for it.
- **`booths`**: scoped to an event — lets multiple physical booths run concurrently under the same event.
- **`qualified_players`**: the CSV-uploaded list per event — player ID, player name, qualifying deposit amount, and a `play_used` boolean. Admin uploads this before the event (same CSV-import pattern as SSS Intelligence). Staff can only search within this list — there is no free-form player entry and no live lookup against another system.
- **One play per qualifying deposit, across both games.** The moment a qualified player plays (either game), `play_used` flips to `true` and they cannot play again at that event, regardless of which game they chose. If an event offers both games, staff/player pick one at play time.

### Server-authoritative randomization

For both games, the *server* — never the client — performs the random draw. The client only receives the already-determined result and plays an animation to it. This matters for two reasons specific to this system:

1. **Concurrent booths share one prize pool** (Wheel's inventory). Two staff spinning at the same instant must not both be told they won the last unit of a limited prize — the winning draw and the inventory decrement happen together, atomically, in the database (a single `UPDATE ... WHERE inventory > 0 RETURNING *`-style statement, retried against the remaining in-stock/active prize set if the first draw's prize sold out in the same instant).
2. **Integrity** — prizes have real value; the odds can't live somewhere a player or staff member could inspect or influence.

### Transactions (the shared play/claim log)

One row per play, regardless of game:

| Field | Notes |
|---|---|
| `game_type` | `'wheel'` \| `'color_game'` |
| `event_id`, `booth_id` | |
| `qualified_player_id` | FK, snapshots player name + qualifying deposit amount at play time |
| `result` | Wheel: prize id + name/type snapshot. Color Game: outcome (WIN/LAKI/Clover) + multiplier + computed payout amount |
| `status` | `won` → `claimed` |
| `claimed_by_staff_id`, `claimed_at` | Set when staff confirms release |
| `played_at` | |

Snapshotting prize/outcome details onto the transaction (rather than only storing a foreign key) means later admin edits to prize config never rewrite history.

## Spin the Wheel

### Configuration

- **Slot count**: 6 (default), 8, 10, or 12 — set per active configuration.
- **Prizes**, one per slot: name, type (`merchandise` \| `bonus` \| `cash` \| `voucher` \| `consolation` \| `custom`), probability (optional — if unset, split evenly among active/in-stock prizes), inventory (nullable for non-physical types like Bonus/Cash, which don't deplete), active flag, display order.
- v1 keeps a single active prize configuration reused across all events — not a saved library of per-event configurations. The source doc calls "event-specific wheel configurations" a future enhancement, so this keeps the schema simple until that's actually needed.

### Play flow

1. Staff selects a qualified, unplayed player and taps Spin.
2. Server validates the player is qualified and unplayed, draws a weighted-random prize from the currently active + in-stock set, atomically decrements that prize's inventory (if it has finite stock), marks the player's `play_used = true`, and writes a `won` transaction.
3. Client animates the wheel to land on the returned slot and shows the winning screen (prize, player name, event, booth, timestamp).
4. Staff taps Claim — this is the only point a human confirms the release. Claiming updates the transaction to `claimed`, records the staff member and timestamp. (Inventory was already decremented at draw time in step 2, not at claim time — otherwise a won-but-unclaimed prize could still be drawn again by someone else while sitting in limbo.)

### Inventory behavior

- Decrements automatically on draw (see above), not on claim.
- A prize whose inventory reaches zero is automatically excluded from future draws (treated as inactive for randomization purposes) — no separate manual "disable" step required, though admin can still see it in the config UI to restock or replace it.

## Color Game

### Fixed outcomes

Not admin-editable — locked to exactly these three, matching the existing on-ground game's paytable:

| Combination | Multiplier |
|---|---|
| WIN (yellow) | x3 |
| LAKI (white) | x2 |
| Clover (black) | x1 |

### Configuration

- Each outcome has an admin-configurable probability, stored with enough decimal precision to support intentionally rare outcomes (e.g. 0.01% for the x3 tier) — not restricted to whole-percentage steps. The three probabilities are validated to sum to 100% in the admin UI.
- No bet amount, no inventory, no per-event payout budget/cap.

### Play flow

1. Staff selects a qualified, unplayed player and taps Play.
2. Server validates qualification, draws a weighted-random outcome from the three configured probabilities, computes `payout = qualifying_deposit_amount × multiplier`, marks `play_used = true`, writes a `won` transaction with the outcome + computed payout snapshotted.
3. Client animates to the drawn outcome and displays the computed payout amount.
4. Staff taps Claim, same as the Wheel — staff member + timestamp recorded, transaction marked `claimed`. The payout itself is handed out physically/outside the app, same as Wheel prizes; this system's job ends at recording who claimed what and when.

## Reports

Computed across both games (filterable by event, booth, staff, game type, date range):

- Total plays vs. total winners of an actual item — the Wheel's own example prize table includes a "Try Again" slot, modeled as an ordinary prize (`consolation` type) rather than a special "no win" case. Every play produces a result and a transaction, but "Try Again" doesn't count toward "total winners" or inventory-value-released figures. Color Game has no such outcome — its three combinations are all real payouts, so plays and winners are equal there.
- Prize/outcome distribution
- Remaining Wheel inventory
- Most-won Wheel prize
- Wheel inventory value released
- Color Game total payout released
- Plays per event, plays per staff, plays per booth

## Tech stack

Next.js + Supabase, matching the rest of Claire's tooling (SSS Intelligence, Kler-Management, Laki Core) — Vercel hosting, Supabase Auth for staff accounts, Postgres for the atomic draw/decrement logic. New standalone repo at `Desktop/Laki-Game`, separate from every existing project.

## Explicitly out of scope for v1

(From the source doc's "Future Enhancements," plus decisions made during design.)

- Event-specific Wheel configurations (v1 has one shared config).
- Prize images, sound effects, animation-speed settings.
- Lucky Spin multiplier events, QR-code prize claiming, digital vouchers.
- Automatic low-inventory alerts (v1 auto-excludes a depleted prize from the draw, but doesn't proactively notify admin).
- Any real-money wallet/wagering integration with LakiWin's actual platform — this system only records what staff observed and released.
- Configurable Color Game outcomes/labels/multipliers (locked to the 3 shown).
- Payout budget cap for Color Game.

## Testing

No automated test suite convention has been set for this new project yet — recommend following the same pattern as Claire's other apps (`npm run build` as the primary automated check, manual verification against a real Supabase instance for anything involving randomization/inventory races, disposable test data cleaned up afterward). The atomic-decrement race condition (two simultaneous draws for the last unit of a prize) is the one piece of this system worth a dedicated concurrency test before relying on it at a live event.
