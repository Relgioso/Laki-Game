# Duck Race — Design

## Overview

A third booth game alongside Spin the Wheel and Color Game: prize-carrying ducks race across the screen, the winning duck (chosen server-side, same as the other two games) crosses the finish line first, and its prize is revealed. Same v2 philosophy as the rest of Laki-Game — no accounts, no login, no player identity, no play-history log. See `2026-08-04-laki-game-design.md` for the shared mechanics (server-authoritative randomization, atomic inventory decrement, no-auth config screen) — Duck Race follows those unchanged.

Inspiration: a reference screen recording of a generic third-party "duck race" random picker (ducks lined up with name-tag flags, racing left-to-right to a checkered finish line, winner highlighted after). Only the *mechanic* is reused — visuals are entirely restyled to Laki-Game's own black/yellow/white brand (matching the Wheel's palette), not the reference's green-grass/blue-water look or its stock multicolor duck clipart.

## Data model

One new table, `duck_race_prizes` — same shape as `wheel_prizes` (no separate "settings" table, since there's no slot-count concept to store):

```sql
CREATE TABLE IF NOT EXISTS duck_race_prizes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  prize_type VARCHAR(20) NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability NUMERIC(6,3),
  inventory INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE duck_race_prizes ENABLE ROW LEVEL SECURITY;
-- No policies — deny-all, same as every other table in this app. All access via supabaseAdmin.
```

**Duck count is derived, not configured**: however many active prizes exist, that many ducks race — no fixed lane count like the Wheel's slot count. **Capped at 8 prizes max**, enforced in the admin UI (disable "Add Prize" past 8) and in the `PUT` API route (reject a 9th with a 400). If only 4 prizes are configured, the race shows exactly 4 ducks, not 4 ducks plus empty lanes.

## Admin (`/admin/duck-race`)

Same prize-picker table as `/admin/wheel` (name, type, probability, inventory, active, display order, add/remove row, running probability-total display) — no slot-count section, since there's nothing to pick. Add a "Prizes (max 8)" label and disable the add-row button at 8. `GET`/`PUT /api/duck-race/config` mirror `app/api/wheel/config/route.ts` exactly, minus the `slotCount` field, plus the max-8 validation.

## Play (`/play/duck-race`)

### Draw

`POST /api/duck-race/play` — identical logic to `app/api/wheel/play/route.ts`: weighted-random draw across active + in-stock prizes (null-probability prizes split the remaining mass evenly), atomic inventory decrement with optimistic-lock retry on a concurrent write. Returns the winning prize (id, name, prizeType, displayOrder).

### Layout

Portrait phone screen, capped to `max-w-md` (matching the Wheel's desktop-width fix). One horizontal lane per active prize, stacked top to bottom, each lane holding:
- A duck sprite (see Duck art below) at the starting edge.
- A small rounded flag/tag beside the duck showing the prize name — same idea as the reference video's speech-bubble tags, restyled as a black-text-on-white (or on-yellow) chip.
- A lane track running to a checkered finish line at the far edge.

A yellow "RACE" button (styled like the Wheel's SPIN button) sits below the lanes to start.

### Race animation

1. Tap RACE → `POST /api/duck-race/play`.
2. Client receives the winning prize + its `displayOrder` (which lane it's in).
3. Every duck's lane gets a `translateX` animation from start to finish. **The winning lane always gets a fixed finish duration of 3.2s; every other lane gets an independently randomized duration between 3.6s and 4.6s** (drawn fresh per race), so the winner always crosses first (0.4s of guaranteed daylight over the next-fastest possible non-winner) but the field doesn't look mechanically identical. This is the same "guarantee the correct outcome mathematically, layer cosmetic randomness on top" approach as the Wheel's spin.
4. Each duck also gets a small continuous vertical bob/wobble (sine-wave, decoupled from the horizontal race timer) purely for a "swimming" feel — cosmetic only, never affects finish order.
5. When the winning duck's animation completes, trigger the reveal.

### Duck art

Claude-designed (no source art provided for this game, unlike the Wheel's SVGs): a simple inline SVG duck in side-profile swimming pose, black outline + white body/black eye, sized to read clearly against the yellow lane background — same contrast logic as the Wheel's black-outlined yellow SPIN button. No multicolor ducks like the reference video. One shared duck asset reused in every lane (color/pattern doesn't need to vary per duck — the flag tag is what identifies which prize each duck carries).

### Reveal

Reuses the Wheel's existing full-screen reveal overlay pattern as-is: black/90 overlay, product photo if the prize has one, "You won / {name}", confetti burst (`lib/confetti.ts`) + pop sound (`playConfettiPop`) + win chime (`playWinChime`) — all already game-agnostic, no changes needed to `lib/sound.ts` or `lib/confetti.ts`. Tap anywhere to dismiss and race again.

**New shared extraction**: `PRIZE_PHOTOS`/`prizePhotoFor` currently live only inside `app/play/wheel/page.tsx`. Move them to `lib/prize-photos.ts` so Duck Race's reveal can use the same photo-matching logic without duplicating the map; update the Wheel page to import from there instead.

## Navigation

- `app/page.tsx` (landing): add a third yellow pill button, "Duck Race" → `/play/duck-race`, same style as the existing two.
- `app/site-header.tsx` (admin-only shared header): add "Admin: Duck Race" and "Play: Duck Race" links.

## Explicitly out of scope

- Custom/branded duck or background art (placeholder Claude-designed sprite for now, matching how Color Game's play screen also started plain before its own design).
- More than 8 prizes/ducks per race.
- Any "photo finish" ambiguity — the winner is always unambiguously first, no near-ties.
- Multiplayer / betting on a specific duck — this is a single-tap instant-win draw, same as the other two games.

## Testing

Same conventions as the rest of this app: `npm run build` + `npx tsc --noEmit` as the baseline, live-verification scripts (written, run once, deleted) for anything with real risk. Before shipping: verify the concurrency-safe inventory decrement (two near-simultaneous draws against a 1-unit prize, confirm only one succeeds) — same check already proven for the Wheel, needs its own pass here since it's a separate table/route. Verify the race animation with a scripted check (not just eyeballing): confirm the winning lane's element always finishes its transform before every other lane's, across several draws.
