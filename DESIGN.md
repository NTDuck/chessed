# chessed — Design Document (Authoritative)

Single source of truth for implementation. Supersedes `research/LAYA.md`,
`research/TUISTORE_STYLE.md`, `research/UX_SPEC.md` — those are research input; this file is
what you build.

---

## 1. Overview

A web chess game: **human vs. in-app TypeScript bot** (no network, no bot API).

- Rendered **entirely with LayaAir 3.3.13** (WebGL canvas; no DOM UI chrome).
- Styled after **tuistore**: Catppuccin-Mocha dark theme, outlined panels, focus-blue borders.
- Deployed to **GitHub Pages under `/chessed/`** via Actions; Vite build.
- Fully offline after load: vendored Laya libs + vendored cburnett piece SVGs (already in
  `assets/pieces/`).

---

## 2. Architecture

Two strict layers:

1. **Game model (plain TS, zero Laya imports)** — single source of truth. All state lives here:
   position, history, status, selection. The view never owns game state.
2. **Laya view layer** — pure rendering of model state. Rebuilt/patched from state on every
   change. This makes WebGL context-loss recovery trivial (re-init + re-render from state).

### Module layout

```
src/
  lib/
    laya.core.js          # vendored 3.3.13 UMD (from GitHub release zip)
    laya.webgl_2D.js      # vendored 3.3.13 UMD
  types/
    LayaAir.d.ts          # vendored ambient d.ts (global `Laya` namespace)
  chess/
    engine.ts             # pure rules engine — NO Laya/DOM deps, unit-testable
    bot.ts                # alpha-beta bot — imports only engine
  app/
    main.ts               # entry: Laya.init, build views, start frameLoop
    BoardView.ts          # Laya Sprite: 64 squares, coordinates, piece layer, highlight overlay
    Panels.ts             # status banner, move list, controls, captured tray (Laya nodes)
    Game.ts               # glue: model ↔ views, input routing, bot scheduling
  assets/pieces/*.svg     # 12 cburnett SVGs (wK wQ wR wB wN wP bK bQ bR bB bN bP) — already vendored
index.html
vite.config.ts
tsconfig.json
```

No npm Laya package exists (`@layaair/laya-core` is a 404 on the registry) — **do not** add one;
vendor the UMD files. Import order in `main.ts` is source-order and mandatory:
`core → webgl_2D` (`import "/lib/laya.core.js"; import "/lib/laya.webgl_2D.js";`).
Skip `laya.ui.js` — use `Sprite`+`Text` nodes only.

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

- **BoardView**: container with layers bottom→top: squares (64 `Sprite`s,
  `graphics.drawRect`, light `#313244` / dark `#181825`) → base highlight overlay
  (last-move, check glow) → piece layer (SVG-texture sprites, ~0.9× square) → top overlay
  (selection ring, destination dots, ghost piece). File letters inside bottom-row squares,
  rank numbers inside left-column squares, font ~0.22× square, color = opposite square tone
  for contrast. White at bottom by default; flip rotates 180° (~200 ms tween) and swaps
  coordinate placement. Square size = `boardSide/8`; everything derives from it.
- **Panels** (Laya nodes, tuistore tokens): status banner (top), right column with move list
  (SAN rows, auto-scroll to newest), controls, captured tray (two rows + material advantage,
  point values P=1 N=3 B=3 R=5 Q=9).
- **Game** glue: owns `engine` state, routes input, schedules bot (`setTimeout` + generation
  counter so spammed New Games invalidate pending thinks), re-renders from state on every
  mutation.

### Pieces as textures

Load the 12 vendored SVGs via Laya `RES` (3.x supports SVG assets). On load, create a texture
per piece at **2× square size** for crispness. **Fallback if SVG loading proves flaky in the
target browsers: rasterize the SVGs to PNG at build time** (script in `scripts/`) and load the
PNGs — identical code path (`RES.load` url swap). cburnett pieces are single-path fill-based
(white = white fill + dark outline, black = dark fill), so they work on the mocha board
as-is; no tinting needed.

---

## 3. Theme tokens (tuistore mocha — exact values)

CSS/custom-property contract; Laya views read the same constants from one shared
`src/theme.ts` module (single source for DOM-free canvas colors).

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
6. Monospace chrome: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
   12/14/20 px steps; bold only for title + entry names.
7. Modals: centered, `#181825`, blue rounded border, `rgba(0,0,0,.4)` dim, 8px 16px padding.
8. One animation only (0.15 s modal pop-in, `cubic-bezier(0.22,1,0.36,1)`); piece moves
   tween ≤ 200 ms; everything else instant color change.
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
- **Bot thinking**: all board input inert; controls stay live. New Game cancels the pending
  bot think (generation counter invalidates the timer).
- **New Game**: idempotent, spam-safe; resets state + re-renders initial position.
- **Resize**: board re-measures, stays **1:1, centered** (side = min(w,h) of board region,
  clamped to a minimum); all derived sizes (pieces, highlights, coordinates) rescale;
  mid-drag resize cancels the drag gracefully.
- **Mobile touch**: touchstart/move/end; no scroll/zoom over the board
  (`touch-action: none` equivalent on the board node); tap targets ≥ 44 px; no hover UI.

### Controls (6, tap targets ≥ 44 px)
New Game · Resign (disabled when over) · Take Back (undo human+bot pair; disabled when over
or no human move) · Flip Board (200 ms rotation) · Difficulty Easy/Med/Hard (segmented;
effective from bot's next move) · Play-as White/Black (fresh game on mid-game change,
auto-flips board so human is at bottom).

Status banner states (color-coded): your turn (`--good`) / bot thinking (`--sub`) /
check (`--peach`) / checkmate win (`--good`) / loss (`--bad`) / draw-stalemate /
draw-material / draw-50 / draw-repetition (`--warn`).

---

## 5. Laya integration notes (facts from 3.3.13)

- **Bootstrap** (no editor, no div — engine creates its own canvas):

```ts
import "/lib/laya.core.js";
import "/lib/laya.webgl_2D.js";
Laya.Config.useRetinalCanvas = true;        // crisp pieces on high-DPI
Laya.init(designW, designH).then(() => {    // async! build scene inside .then()
  const stage = Laya.stage;
  stage.bgColor = "#1e1e2e";
  stage.scaleMode = "none";                 // we manage size ourselves (fixed square stage)
  // add board + panels...
});
```

- **No `tap` event in 3.x.** No `Event.TAP`/`TOUCH_TAP` constants exist. Event strings that
  ship: `mousedown`, `mouseup`, `mousemove`, `mouseover`, `mouseout`, `mousedrag`,
  `mousedragend`, `click`, `touchstart`, `touchmove`, `touchend`, `touchcancel`.
  Synthesize tap from `mousedown`/`click` (desktop) + `touchstart`/`touchend` (mobile);
  drag = `mousedown`/`touchstart` + `stage`-level `mousemove`/`touchmove` +
  `mouseup`/`touchend`. Event objects expose `globalX/globalY` and `localX/localY`;
  `pointToNode(x, y)` resolves the topmost sprite under a point.
- **Per-frame loop**: `Laya.timer.frameLoop(1, this, update)`. Piece animation:
  `Laya.Tween.to(target, {x, y, alpha}, ms, ease)`; cancel with `Tween.killTweens(target)`.
- **Vector drawing** (`sprite.graphics`): `drawRect`, `drawRoundRect`, `drawCircle`,
  `drawLine`, path API (`beginPath/moveTo/lineTo/closePath/fill/stroke`), `clear()`.
  Square sizes derive from `boardSide/8`.
- **Text**: `new Laya.Text()` — `text`, `fontSize`, `color` (hex string), `bold`, `align`,
  `font` (use `"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"`).
- **WebGL context loss**: 3.3.13 exposes no recovery hook. Strategy: keep all state in the
  plain-JS model; on `visibilitychange` → visible, re-run `Laya.init` and rebuild the scene
  tree from state (cheap: vector board + 32 piece sprites). Never treat rendered pixels as
  source of truth.
- **Assets**: zero external binary assets except the 12 piece SVGs (relative `./assets/...`
  URLs); Vite `base` handles sub-path resolution, so `RES` base-path config is unnecessary.
- **Resize**: no automatic resize — handle `window` `resize` (debounced) yourself:
  recompute board side, re-center, rescale layers. Fixed 1:1 stage is more stable than fluid.

---

## 6. Build & deploy

- **Vite + TypeScript (strict)**. `tsconfig.json`: `"strict": true`, `include` covers
  `src/` and `src/types/LayaAir.d.ts` (ambient global `Laya`; do not import Laya as a module).
- `vite.config.ts`: `base: "/chessed/"` (MUST match the Pages sub-path),
  `build.target: "es2020"`. Vendored `lib/*.js` live in `src/lib/` (imported, bundled) or
  `public/` (copied verbatim) — either works; pick one and keep it.
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
- Vendoring (one-time, already done for pieces; Laya libs still to fetch): download
  `LayaAir_3.3.13.libs.zip` from `github.com/layabox/LayaAir/releases` → copy
  `libs/laya.core.js`, `libs/laya.webgl_2D.js` to `src/lib/`, `types/LayaAir.d.ts` to
  `src/types/`.

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
- [ ] All 6 controls work: New Game (spam-safe), Resign, Take Back (pair undo), Flip Board,
      Difficulty (3 levels, real depth difference observable), Play-as (fresh game + auto-flip).
- [ ] Status detection fires correctly: check, checkmate (win/loss), stalemate,
      insufficient material, 50-move, threefold repetition.
- [ ] Move list shows SAN with `+`/`#`; captured tray shows pieces + material advantage.
- [ ] Resize (incl. mobile rotation): board stays 1:1, centered, all elements rescaled;
      no layout breakage.
- [ ] Touch works on a mobile viewport: tap + drag with no scroll/zoom fighting over the board.
- [ ] No console errors on load, normal play, spam-New-Game, and tab background/foreground
      cycle (context-loss re-render path).
