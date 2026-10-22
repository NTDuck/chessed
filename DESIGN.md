# chessed — Design Document (Authoritative)

Single source of truth for implementation. Supersedes `research/LAYA.md`,
`research/TUISTORE_STYLE.md`, `research/UX_SPEC.md` — those are research input; this file is
what you build.

---

## 1. Overview

A web chess game: **human vs. in-app TypeScript bot** (no network, no bot API).

- Board rendered as **inline SVG in React**; all UI chrome is **DOM** (React).
- **LayaAir 3.3.13** is vendored and used **only for its rAF-based `Laya.timer` animation
  clock** (no canvas rendering).
- Styled after **tuistore**: Catppuccin-Mocha dark theme, outlined panels, focus-blue borders.
- Deployed to **GitHub Pages under `/chessed/`** via Actions; Vite build.
- Fully offline after load: vendored Laya libs + vendored cburnett piece SVGs (already in
  `assets/pieces/`).

---

## 2. Architecture

Two strict layers:

1. **Game model (plain TS, zero Laya imports)** — single source of truth. All state lives here:
   position, history, status, selection. The view never owns game state.
2. **React view layer** — the board is inline SVG and all UI chrome is DOM, rendered in
   `src/App.tsx`. It observes the model via `useSyncExternalStore` and re-renders from state
   on every change. LayaAir contributes only the `Laya.timer` animation clock (no canvas).

### Module layout

```
src/
  App.tsx                 # React board (inline SVG) + all DOM chrome + styles
  main.tsx                # React root (mounts into <div id="laya-host">)
  theme.ts                # shared palette constants (single source)
  chess/
    engine.ts             # pure rules engine — NO Laya/DOM deps, unit-testable
    bot.ts                # alpha-beta bot — imports only engine
    analysis.ts           # eval layer: stateEval, analyzePosition, candidateMoves, classifyMove
  app/
    Game.ts               # model + UI snapshot; subscribe() for React (useSyncExternalStore)
    pieces.tsx            # 12 cburnett piece SVG inner-markup strings
  types/
    laya.d.ts             # ambient types: declares only Laya.timer
  assets/pieces/*.svg     # 12 cburnett SVGs (wK wQ wR wB wN wP bK bQ bR bB bN bP) — already vendored
public/
  lib/
    laya.core.js          # vendored 3.3.13 UMD (timer only)
    laya.webgl_2D.js      # vendored 3.3.13 UMD (timer only)
index.html
vite.config.ts
tsconfig.json
```

No npm Laya package exists (`@layaair/laya-core` is a 404 on the registry) — **do not** add one;
the UMD files are vendored under `public/lib/` and loaded via a `<script>` tag in `index.html`
(not imported in `main.tsx`); they provide the `Laya.timer` global only.

### `engine.ts` (pure)

- Position representation: board array + side-to-move + castling rights + ep square +
  halfmove clock + Zobrist hash; move = `{from, to, promo?, flags}`.
- `legalMoves(state)` — pseudo-legal gen per piece type, then king-in-check filter
  (every move, incl. castling, passes: king not in check, doesn't pass through check,
  path empty, rights intact).
- `apply(state, move)`, `unapply` (undo), `status(state)` →
  `in-progress | check | checkmate | stalemate | draw-material | draw-50 | draw-repetition`.
  - Castling rights invalidated on king move, rook move/capture, rook/king capture.
  - En passant target set only after pawn double-step, cleared next turn.
  - Promotion: engine accepts explicit `promo`; **default auto-queen** in the app.
  - Insufficient material: K vs K, K+B vs K, K+N vs K, K+B vs K+B same-color bishops.
  - 50-move (halfmove clock, reset on pawn move/capture) and threefold (Zobrist, ×3) draws.
- SAN generation with `+`/`#` suffixes; move history array for SAN/undo/repetition.

### `bot.ts`

- Alpha-beta over `engine.ts`. Difficulty: **Easy depth 1** (random tie-break among equal
  best), **Medium depth 2**, **Hard depth 3 + quiescence** (extend through captures/checks,
  cap ~2 plies).
- Eval: P=100 N=320 B=330 R=500 Q=900 K=20000 + piece-square tables + mobility term.
  Static tables only — no book, no tablebases.
- **Seedable RNG** (deterministic games); search runs synchronously in a `setTimeout` tick
  (depth-3+qsearch is well under 500 ms in JS with this eval) after a think delay:
  Easy ~400 ms, Medium ~700 ms, Hard ~1 s — total bot reply **≤ 2 s on Hard**.
- Bot blocked once game is over; New Game resets it.

### `app/`

- **Board** (`App.tsx`): inline SVG, layers bottom→top: squares (64, light `#313244` /
  dark `#181825`) → highlight overlay (last-move tint, check glow) → piece layer (cburnett
  SVG markup, ~0.9× square) → top overlay (selection ring, destination dots). File letters
  inside bottom-row squares, rank numbers inside left-column squares, font ~0.22× square,
  color = opposite square tone for contrast. White at bottom by default; flip rotates 180°.
  Square size = `boardSide/8`; everything derives from it.
- **Chrome** (`App.tsx`, DOM, tuistore tokens): status banner, score, control icon buttons,
  ELO range slider, left vertical eval bar (`.evalbar`/`.eval-fill`), move list (SAN rows +
  move-quality symbols, auto-scroll to newest), captured tray (material advantage, point
  values P=1 N=3 B=3 R=5 Q=9), promo modal, footer hint bar.
- **Game** (`Game.ts`): pure game controller — owns the chess `State` + a UI snapshot,
  exposes `subscribe()`; React observes it via `useSyncExternalStore`. No rendering code.

### Pieces as inline SVG

`src/app/pieces.tsx` holds the 12 cburnett piece SVG inner-markup strings, inlined directly
into the board SVG (no asset loading). cburnett pieces are single-path fill-based (white =
white fill + dark outline, black = dark fill), so they work on the mocha board as-is; no
tinting needed.

---

## 3. Theme tokens (tuistore mocha — exact values)

CSS/custom-property contract; the React/DOM + inline-SVG view reads the same constants from
one shared `src/theme.ts` module (single source for all colors).

| Token | Value | Use |
|---|---|---|
| `--bg` | `#1e1e2e` | page / stage background |
| `--surface` | `#313244` | raised surfaces (light board squares) |
| `--panel` | `#181825` | deepest panel, modal bg (dark board squares) |
| `--border` | `#45475a` | resting panel borders |
| `--border-focus` | `#89b4fa` | focused/selected border (= accent) |
| `--cursor` | `#3e4869` | highlighted row background |
| `--text` | `#cdd6f4` | primary text |
| `--sub` | `#a6adc8` | secondary text |
| `--dim` | `#6c7086` | hints, footer |
| `--accent` | `#89b4fa` | selection, links, legal-move dots |
| `--peach` | `#fab387` | the one warm signal: check/warning |
| `--good` | `#a6e3a1` | success (your turn, win) |
| `--warn` | `#f9e2af` | warning/draw |
| `--bad` | `#f38ba8` | error/loss, illegal-drop tint base |
| `--overlay` | `rgba(0,0,0,.4)` | modal dim layer |

**Board squares: light `#313244`, dark `#181825`** — mocha ramp, NOT brown/green.
Panels are outlined (1px `--border`, radius `8px`), not filled; no box-shadows on inline
panels. Modals: `--panel` bg, blue border, centered over `--overlay`.

### 10 design rules

1. Background `#1e1e2e`; panels outlined not filled (1px `#45475a`, 8px radius, no shadow).
2. Focus/selection = border recolor to `#89b4fa`; nothing else animates.
3. Two-tone mocha board only (`#313244`/`#181825`).
4. Four state colors, no new hues: accent `#89b4fa` (selection/legal dots/last-move),
   peach `#fab387` (check), `#f38ba8` (loss/invalid), `#a6e3a1` (win/turn).
5. Role-based text only: `#cdd6f4` / `#a6adc8` / `#6c7086`.
6. Display face: **Amazon Ember** (self-hosted serif, woff2 weights 400/700 under
   `public/assets/fonts/`), replacing the old monospace chrome; 12/14/20 px steps; bold
   only for title + entry names.
7. Modals: centered, `#181825`, blue rounded border, `rgba(0,0,0,.4)` dim, 8px 16px padding.
8. Pixelated motion set (steps()-eased, no easing curves): `piemove` (180ms steps(4)),
   `capdissolve` (240ms steps(4)), `chkpulse` (1s steps(2) ∞), `dotpulse` (1.2s steps(2) ∞),
   `lmflash` (300ms steps(3)), `tokpop` (150ms steps(3)), plus the pre-existing `popin`
   modal (0.15s cubic-bezier) and ONE transition — `.eval-fill` height (.3s steps(6)).
   `prefers-reduced-motion` collapses all of them.
9. 8px spacing unit; list rows single-line with leading colored dot/glyph markers.
10. Footer hint bar: single line, 12px, `#6c7086`, hide trailing hints on narrow widths
    (never wrap, never scroll).

---

## 4. Interaction spec

Two equivalent input paths feeding the same handlers; both must work (mouse and touch).

### Tap-to-move
1. Tap own piece → select: **selection ring** around the piece (stroke ≈ 0.08× square,
   `#89b4fa`) + legal destinations: empty targets get a filled dot (r ≈ 0.15× square,
   `rgba(0,0,0,0.25)` — in-palette dark), capture targets get a ring outline (≈0.06× square).
2. Tap a highlighted target → move. Tap another own piece → reselect. Tap elsewhere →
   deselect.
3. Taps during a move animation are ignored until it completes.

### Drag-and-drop
1. Pointer-down on own piece starts a potential drag: ghost piece follows the pointer at
   1.1× scale; original fades to 30% "hole" marker.
2. Live-highlight the square under the pointer: legal → destination dot; illegal → faint
   red tint `rgba(243,139,168,0.15)` (derived from `--bad`, in-palette).
3. Drop on legal square → snap tween (~120 ms) + apply. Drop elsewhere → ghost tweens back,
   no move.
4. Pointer-up before 0.1× square of travel = treated as a tap (paths never conflict).

### Persistent highlights (decided — all in-palette)
- **Last move**: from + to squares tinted **`rgba(137,180,250,0.35)`** (accent `#89b4fa`
  tint — DECIDED over lichess yellow-green to stay in the mocha palette). Persists until
  next move.
- **Check**: checked king's square gets a radial glow **`rgba(255,163,135,0.4)`**
  (peach `#fab387`-based) while in check. No pulsing.
- **Selection**: `#89b4fa` ring per above.

### Input lock & edge cases
- **Bot thinking**: all board input inert; controls stay live. A new game (Play-as)
  cancels the pending bot think (generation counter invalidates the timer).
- **New game (Play-as)**: idempotent, spam-safe; resets state + re-renders initial position.
- **Resize**: board re-measures, stays **1:1, centered** (side = min(w,h) of board region,
  clamped to a minimum); all derived sizes (pieces, highlights, coordinates) rescale;
  mid-drag resize cancels the drag gracefully.
- **Mobile touch**: touchstart/move/end; no scroll/zoom over the board
  (`touch-action: none` equivalent on the board node); tap targets ≥ 44 px; no hover UI.

### Controls (5 icon buttons, tap targets ≥ 44 px)
Play-as White · Play-as Black (each starts a fresh game in that color — this replaces the
old New Game button; Black auto-flips the board so the human is at the bottom) · Resign
(disabled when over) · Take Back (undo human+bot pair; disabled when over or no human
move) · Flip Board (200 ms rotation). Difficulty is the **ELO range slider** (5 named
ticks 300/700/1100/1500/1900, active tick highlighted, live value readout) — not a button.

Status banner states (color-coded): your turn (`--good`) / bot thinking (`--sub`) /
check (`--peach`) / checkmate win (`--good`) / loss (`--bad`) / draw-stalemate /
draw-material / draw-50 / draw-repetition (`--warn`).

---

## 5. LayaAir integration notes (facts from 3.3.13)

LayaAir 3.3.13 is vendored under `public/lib/` (`laya.core.js` + `laya.webgl_2D.js`) and loaded
via a `<script>` tag in `index.html`. It is used **only as `Laya.timer`** — an rAF-backed
`callLater`/`clear` clock that drives the animation/render tick. There is **no `Laya.init`, no
`Laya.stage`, no WebGL canvas, no `Laya.Text`/`Graphics`/`RES` asset loading** in the shipped
app. Ambient types for the single `Laya.timer` surface live in `src/types/laya.d.ts`.

The board and all UI chrome are React (inline SVG + DOM), so there is no canvas to manage:
no context-loss recovery, no per-frame loop, no event-synthesis concerns.

---

## 6. Build & deploy

- **Vite + TypeScript (strict)**. `tsconfig.json`: `"strict": true`, `include` covers
  `src/` and `src/types/laya.d.ts` (ambient `Laya.timer`; do not import Laya as a module).
- `vite.config.ts`: `base: "/chessed/"` (MUST match the Pages sub-path),
  `build.target: "es2020"`. The vendored Laya UMD files live in `public/lib/` (copied
  verbatim into `dist/`).
- npm scripts:

```json
{ "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
} }
```

- **GitHub Pages via Actions**: on push to `main`, `npm ci && npm run build`, upload `dist/`
  to Pages (or `actions/deploy-pages`). Site URL: `https://<user>.github.io/chessed/`.
- Vendoring (one-time, already done): pieces SVGs are in `src/assets/pieces/`; the Laya UMD
  libs are in `public/lib/` (`laya.core.js`, `laya.webgl_2D.js`) and the ambient type file is
  `src/types/laya.d.ts`.

---

## 7. Acceptance checklist

- [ ] `npm run build` succeeds (tsc strict + vite), `dist/` deployable to Pages `/chessed/`.
- [ ] Served app renders: mocha background `#1e1e2e`, 8×8 board (light `#313244` /
      dark `#181825`), coordinates, 32 pieces, outlined panels with status/moves/controls/tray.
- [ ] Human can move by **tap-to-move** AND **drag-and-drop**; both legal and illegal
      feedback correct; illegal drop cancels without a move.
- [ ] Highlights render per §4: selection ring, destination dots, last-move `#89b4fa` tint,
      check peach glow — all in-palette.
- [ ] Bot replies **within 2 s on Hard** (and faster on Easy/Medium); "bot thinking…" shown;
      board input inert while thinking.
- [ ] All 5 controls work: Play-as White/Black (fresh game, spam-safe), Resign,
      Take Back (pair undo), Flip Board; plus the ELO slider (5 named levels, real
      depth difference observable).
- [ ] Status detection fires correctly: check, checkmate (win/loss), stalemate,
      insufficient material, 50-move, threefold repetition.
- [ ] Move list shows SAN with `+`/`#`; captured tray shows pieces + material advantage.
- [ ] Resize (incl. mobile rotation): board stays 1:1, centered, all elements rescaled;
      no layout breakage.
- [ ] Touch works on a mobile viewport: tap + drag with no scroll/zoom fighting over the board.
- [ ] No console errors on load, normal play, spam-New-Game, and tab background/foreground
      cycle (React re-renders from state).
