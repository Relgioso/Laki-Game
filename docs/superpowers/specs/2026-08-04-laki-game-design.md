# Laki-Game: Booth Activation Game System

## Overview

Laki-Game digitizes two LakiWin booth prize games: **Spin the Wheel** and **Color Game**. This is a standalone web app, separate from SSS Intelligence and Claire's other tools.

**v2 scope (superseding the original design below this point in git history):** no accounts, no login, no event/booth records, no player identity, no per-play transaction log. Just a config screen where prizes/probabilities/inventory are set up, and a public play screen anyone at the booth can tap. Prize verification and physical hand-out happen outside the app entirely, by whoever's staffing the booth — this system's only job is to run a fair random draw and keep prize inventory accurate.

This is a significant simplification from the first pass at this design, which included events, booths, staff accounts, a qualified-player CSV import, and a full transaction log — cut entirely after review. If any of that is needed later (e.g. player tracking, staff accountability), it can be layered back on; nothing about v2's data model below assumes it will be.

## Shared mechanics

- **Server-authoritative randomization.** The random draw and any inventory decrement happen in a Next.js API route (server-side), never in the browser — even with no login gating who can play, the *odds themselves* must not be inspectable or riggable from devtools. The play screen sends "I want to play [wheel|color_game]" and gets back a result; it never sends or computes the outcome itself.
- **Inventory decrements atomically at draw time**, not at any separate "claim" step — there is no claim step in v2. A single database statement performs "pick a weighted-random prize from the currently active + in-stock set, and decrement its inventory" so two simultaneous plays (e.g. two tablets at once) can't both be told they won the last unit of a limited prize.
- **A prize whose inventory hits zero is automatically excluded** from future draws — no manual disable step required.
- **No live inventory display.** The config screen shows/edits the settings below; it does not surface current remaining stock. (Explicit choice — revisit if this turns out to be annoying in practice.)
- **Config screen has no authentication.** This was an explicit simplification choice (no accounts anywhere in v2), not an oversight — worth flagging plainly: anyone with the URL can currently change prize odds/inventory. Acceptable if this only ever runs on a private/internal URL or a controlled device; revisit with at least a shared PIN if it's ever exposed more broadly.

## Spin the Wheel

Unchanged from the original design:

- **Slot count**: 6 (default), 8, 10, or 12.
- **Prizes**, one per slot: name, type (`merchandise` | `bonus` | `cash` | `voucher` | `consolation` | `custom`), probability (optional — if unset, split evenly among active/in-stock prizes), inventory (nullable for non-physical types like Bonus/Cash, which don't deplete), active flag, display order.
- Play: tap Spin → server draws a weighted-random prize from the active+in-stock set, decrements inventory if finite → client animates the wheel to the returned slot and shows the result.

## Color Game

Reveals 3 symbols (yellow/WIN, white/LAKI, black/Clover — matching the reference image) and resolves to one of two outcome families:

### 3-of-a-kind combo prizes

Exactly 3 slots, one per symbol, each independently admin-configured — same shape as a Wheel prize (name, type, value, inventory, active) plus its own probability:

| Combo | Example probability |
|---|---|
| 3× WIN (yellow) | e.g. 0.02% |
| 3× LAKI (white) | e.g. 0.02% |
| 3× Clover (black) | e.g. 0.02% |

The "x3/x2/x1" multiplier framing from the original reference image is **not** literal math in v2 — there's no deposit or bet to multiply. Each combo is just its own named, admin-configured prize; label it however makes sense on screen (could still say "x3" as flavor text if desired, but the underlying value is whatever admin sets).

### Everything else → shared Merchandise pool

Any result that is NOT a 3-of-a-kind (two symbols match, or all three differ) draws from one shared Merchandise prize list — structured identically to the Wheel's prizes (name, probability, inventory, active), but this list is separate from the Wheel's own prize list.

### Play flow

1. Tap Play.
2. Server draws the 3-symbol result: first determine if this play lands on a 3-of-a-kind (weighted by the three combo probabilities above) or falls through to "other" (remaining probability mass); if "other," separately draw a merchandise prize from the shared pool (weighted, active+in-stock only).
3. Decrement inventory for whichever prize was drawn (combo prize or merchandise prize), same atomic pattern as the Wheel.
4. Client animates the 3 symbols to the drawn result (matching combo, or a plausible non-matching arrangement if it was a Merchandise win) and displays the prize.

## Explicitly out of scope for v2

- Any login, accounts, or roles.
- Events, booths.
- Player identity, qualifying-deposit tracking, CSV import.
- Transaction/play history log of any kind.
- Reports (nothing to report on without a log).
- Deposit-based multiplier math for Color Game.

## Tech stack

Next.js + Supabase (Postgres for prize config/inventory, accessed server-side via the service-role client in API routes — no Supabase Auth needed since there's no login). Vercel hosting. New repo at `Desktop/Laki-Game`.

## Testing

No automated test suite convention set yet for this project. `npm run build` as the primary automated check. The one thing worth a dedicated concurrency check before relying on this at a live event: two near-simultaneous draws against a prize with 1 remaining unit of inventory — confirm only one succeeds and the prize is correctly excluded from the very next draw.
