# Pachinko + Shared Game Platform — Design

Date: 2026-09-28 · Status: approved in chat, pending spec review

## Intent

Claire wants adding a **new game type** (first: Pachinko) to be cheap. A new game
brings its own animation, but everything around it — LakiWin yellow/black look,
play screen chrome, prize reveal, prize odds/stock/draw logic, admin screen,
home-page listing — must already exist and just work. Prizes per game are
editable, and can be the same as another game's (copy) or different.

Success = Pachinko is live on Cloudflare, playable at the booth, fully managed
from its admin screen, and the next game type only needs its animation
component + one registry entry.

**Out of scope (now):** moving Wheel / Color Game / Duck Race onto the shared
platform (they stay untouched — later, one at a time); home page visual redesign;
per-game themes/artwork; creating games from the admin UI (a new game type needs
new animation code anyway).

## Pachinko gameplay

- Tall board in brand style (black frame, yellow board, dark pegs), staggered
  peg rows, **one slot per active prize** at the bottom (1–8), slot labels = prize
  names. Silver ball (same look as the Color Game ring).
- Player taps **DROP** → server draws the prize (odds + stock) → client animates
  the ball bouncing peg-by-peg into **that prize's slot** → peg tick sounds →
  reveal overlay with confetti/chime/prize photo (same as other games).
- Path planning is a pure function `planPachinkoPath(targetSlot, slotCount, rng)`:
  a random left/right walk across the peg rows, constrained so it ends in the
  target slot and never leaves the board. Every drop looks different; the landing
  slot is always the server's result. Animation ~4–5 s via requestAnimationFrame
  (short parabolic hop between pegs, final fall into the slot).

## Architecture

### Game registry — `lib/games.ts`
One list of every game, used by the home page, admin header, and generic routes:
`{ slug, title, mechanic, maxPrizes, platform: 'shared' | 'legacy', playHref, adminHref, configUrl }`.
Legacy entries (wheel, color-game, duck-race) point at their existing pages/APIs.
Pachinko: `{ slug: 'pachinko', mechanic: 'pachinko', maxPrizes: 8, platform: 'shared' }`.
Adding a game type = add a mechanic component + one registry entry.

### Data — `migrations/0003_game_prizes.sql`
New table `game_prizes` (same columns as the existing prize tables + `game TEXT NOT NULL`,
index on `game`). Legacy tables untouched. Pachinko is seeded with the Wheel's
current prizes (Totebag / Coin Purse / Round Fan, unlimited) so it's playable at once.

### Server
- `lib/db.ts`: add game-scoped helpers (select by game, atomic batch replace for a
  game, existing optimistic-lock decrement reused).
- `lib/prize-draw.ts`: `weightedPick` + `drawPrize(game)` (read candidates →
  pick → optimistic decrement → retry ×5), written once for all shared games.
- `app/api/games/[game]/config/route.ts` — GET / PUT (same validation and
  "keep live stock for rows the admin didn't touch" merge as today's routes;
  max prizes from the registry).
- `app/api/games/[game]/play/route.ts` — POST draw.
- Unknown or legacy slug → 404.

### Client
- `components/play/game-shell.tsx`: shared play screen — back + manage-prizes
  buttons, loading/error states, the big action button, calls the play API,
  hands the result to the mechanic, shows the reveal (confetti, sounds, photo).
- Mechanic contract: `{ prizes, target, onFinished }` — the mechanic animates to
  `target` and calls `onFinished`; with `target: null` it renders static, which
  is what the admin preview uses.
- `components/games/pachinko.tsx`: the board + animation; `lib/pachinko-path.ts`
  holds the pure path planner.
- `app/play/[game]/page.tsx` and `app/admin/[game]/page.tsx`: dynamic routes for
  shared games (static `/play/wheel` etc. keep winning over the dynamic segment).
- `components/admin/prize-editor.tsx`: shared prize list editor (name, type,
  probability, inventory, active, add/remove, probability total, max-prizes guard,
  save). **Admin layout: live game preview on the left, prize editor on the
  right** (stacked on phones). Preview reflects unsaved edits.
- **Copy prizes from…** dropdown in the editor: loads another game's prize list
  (any registry game whose config returns `prizes`) into the editor as new,
  unsaved rows; nothing changes until Save.
- Home page and admin header read the registry, so Pachinko appears automatically.

## Error handling
Same as existing games: API errors return `{ error }` with 4xx/5xx; play screen
shows the message under the button; out-of-stock everywhere → "No prizes
available to draw."; 0 active prizes → "No prizes configured yet."; >8 prizes
blocked client- and server-side.

## Testing
- Add Vitest for pure logic: path planner (every target × every slot count 1–8
  lands in the right slot, never leaves the board, many seeds) and `weightedPick`.
- Local Workers runtime (`wrangler dev` + local D1): config GET/PUT, stock
  decrement to zero, rejected invalid save leaves data intact, 404 for unknown
  game, legacy APIs unchanged.
- Playwright: 20 drops, each ball's landing slot matches the prize the API
  returned; phone-size screenshots of play + admin screens; home shows 4 games.
- Deploy: `npm run db:migrate` then `npm run deploy`; re-run checks on the live URL.
