# chessed — Web Chess UX Specification

Interaction spec for a chess.com/lichess-style web chess game: **human vs. bot**, built as a custom chess module inside a LayaAir app (TypeScript). No external bot API.

---

## 1. Board Rendering

- **Grid**: 8×8 squares rendered as one LayaAir container (`boardRoot`) containing 64 square shapes (or a 2-color background texture) + a piece layer + an overlay/effects layer (highlights) + a coordinate layer.
- **Square colors** (dark modern theme):
  - Dark squares: `#4d3f35` (warm brown, lichess-dark style)
  - Light squares: `#a58a6f` (tan)
  - Alternative cooler palette if preferred: dark `#3d4451`, light `#8f9bb0` — pick one, keep consistent.
  - Board frame: 4px inset border `#2a2118`; outer page background `#1e1e1e`.
- **Coordinates**: file letters `a–h` and rank numbers `1–8` rendered as small labels *inside* the squares on the edge of the board (lichess style: file letters in the bottom-row squares, rank numbers in the left-column squares), color = the *opposite* square color of the cell they sit in (for contrast), font ~ 0.22 × square size.
- **Orientation**: White at the bottom by default (black at top). A flip rotates the board 180° and swaps coordinate placement. Flip is user-toggleable (§5) and auto-applies when the human plays Black (see Play-as selector).
- **Sizing**: board is a square; side length = `min(availableWidth, availableHeight)` minus margin for side panels/status banner, clamped to a minimum. Aspect ratio must stay 1:1 at any window size (§6).
- **Square size**: `boardSize / 8`; all hit areas, highlights, and piece scales derive from this unit so everything scales together.

## 2. Interaction Model

Two equivalent input paths; both feed the same `onTapSquare(sq)` / `onDropPiece(piece, from, to)` handlers.

### (a) Tap-to-move
1. Tap own piece → select it: draw **selection ring** on the piece (see §2c) and **highlight all legal destinations**:
   - Empty target squares: filled circle, radius ≈ 0.15 × square size, color `rgba(0,0,0,0.25)`.
   - Capture targets (piece on target): ring outline, stroke ≈ 0.06 × square size, same color.
   - Show a subtle move-preview (ghost of the moving piece at 30% opacity) on the selected piece's square only; do not clutter the board.
2. Tap a highlighted target → execute the move.
3. Tap another own piece → reselect (highlights swap).
4. Tap anywhere else (empty non-target square, opponent piece) → deselect, clear highlights.
5. Taps while a move is mid-animation are ignored until the animation completes.

### (b) Drag-and-drop
1. Pointer-down on own piece (mouse or touch) starts a potential drag; a **ghost piece** (the actual piece sprite, lifted ~1.1× scale with a soft shadow) follows the pointer, and the original piece hides (or stays at 30% opacity as a "hole" marker).
2. While dragging, live-highlight the square under the pointer (legal vs. illegal coloring): legal targets get the destination highlight; illegal squares get a faint red tint `rgba(200,60,60,0.15)`.
3. Drop:
   - On a legal square → snap piece to square center (tween ~120 ms), execute move, clear highlights.
   - On an illegal square / outside the board → **cancel**: ghost tweens back to the original square (or fades back instantly), no move applied.
4. Pointer-up before movement exceeds a threshold (~0.1 × square size of travel) is treated as a tap (path (a)), so drag and tap don't conflict.

### (c) Persistent highlights (always on)
- **Last move**: from-square and to-square tinted `rgba(155,199,0,0.41)` (lichess yellow-green) — persists until the next move.
- **Check**: the checked king's square gets a radial red glow, color `rgba(255,0,0,0.5)`, pulsing optional. Shown whenever the side to move is in check.
- **Selected piece**: ring around the piece sprite, stroke ≈ 0.08 × square size, color `#2196f3` (or gold `#ffeb3b`); drawn on the overlay layer above the piece.

All highlights render on a dedicated overlay layer between the board background and the piece layer (last-move/check) plus a top overlay for selection rings and destination dots, so pieces never clip under highlights.

## 3. Rules Engine Requirements

Pure TypeScript module, no DOM/Laya dependencies (unit-testable). Must produce fully legal moves:

1. **Move generation**: pseudo-legal move generation per piece type, then a **king-in-check filter** (a move is legal iff the moving side's king is not attacked in the resulting position). This is the core legality check — every move (including castling) passes through it.
2. **Castling**: track rights per side (king-side/queenside, invalidated when king moves, when a rook moves/captured, and when a rook or king is captured). Verify path: squares between are empty, king not in check, king does not pass through nor land on an attacked square.
3. **En passant**: track the ep-target square each turn (set only after a pawn double-step, cleared after one turn); ep capture removes the captured pawn on the adjacent rank.
4. **Promotion**:
   - **Default: auto-queen** — a pawn reaching the last rank promotes to queen immediately with a brief "pop" animation.
   - **Optional 4-choice dialog** (Q/R/B/N, rendered as a LayaAir popup listing the four piece images) shown when a promotion is made. **Tradeoff**: the dialog adds friction on a fast tempo and a mobile tap target; auto-queen keeps flow smooth and is what the bot assumes. Ship auto-queen; make the dialog a toggle behind a settings flag, and wire the engine to accept an explicit promotion piece either way.
5. **Game-state detection after every move**:
   - Check (opponent king attacked).
   - **Checkmate**: in check + no legal moves.
   - **Stalemate**: not in check + no legal moves.
   - **Insufficient material**: K vs K, K+B vs K, K+N vs K, K+B vs K+B with same-color bishops → draw.
   - **50-move rule** (nice-to-have): half-move clock; reset on any pawn move or capture; 100 plies → draw.
   - **Threefold repetition** (nice-to-have): Zobrist hash of positions (FEN-like, excluding move counters); 3 occurrences → draw.
6. The engine exposes `legalMoves(state, side)`, `apply(state, move)`, `unapply` (for undo), `status(state)` → `in-progress | check | checkmate | stalemate | draw-material | draw-50 | draw-repetition`, and a move history array (needed for SAN, undo, repetition).

## 4. Bot

- **Difficulty selectable**: a 5-step **ELO range slider** with named ticks 300 / 700 /
  1100 / 1500 / 1900, the active tick highlighted and a live value readout (replaces the
  old segmented buttons). Persist the choice across games while the app runs.
- **Algorithm**: alpha-beta search over the rules engine above.
  - Easy → depth **1** (plus a slight random tie-break among equal-best moves so it feels less deterministic).
  - Medium → depth **2**.
  - Hard → depth **3** **+ quiescence search** (extend leaf nodes through captures/checks, cap extensions ~2 plies) to avoid horizon blunders.
  - Evaluation function: piece values (P=100, N=320, B=330, R=500, Q=900, K=20000) + simple piece-square tables + mobility term. Keep it static-table based; no opening book, no endgame tablebases.
- **Must run in-app**: the bot is a TypeScript module inside the LayaAir app — **NOT** an external API call (no network dependency, works offline, deterministic with a seedable RNG).
- **Think delay**: after the human moves, the bot responds after a short delay (Easy ~400 ms, Medium ~700 ms, Hard ~1 s) so the UI can show "bot thinking" and the move feels deliberate. The search itself runs synchronously (depth 3 + qsearch is well under 500 ms in JS for this eval) or in a `setTimeout`-chunked loop if needed.
- **Visual parity**: the bot's move renders with the exact same feedback as a human move — piece tween, last-move highlight, sound/haptics hook, and the new last-move/check overlays.
- The bot is blocked from moving while the game is over; a new game resets its state.

## 5. UI Panels

Layout: board centered-left; status banner top; controls + move list in a right column (stacks below the board on narrow/mobile layouts).

- **Status banner** (top, always visible): text states — "Your turn (White)", "Bot is thinking…", "Check!", "Checkmate — you win / bot wins", "Stalemate — draw", "Draw (insufficient material / 50-move / repetition)". Color-coded (green = your turn, red = check/loss, amber = draw).
- **Move list**: SAN (e.g. `1. e4 e5 2. Nf3 Nc6 …`, check suffix `+`, mate `#`). Scrollable, auto-scrolls to the newest entry after each move. Optional: click a move to journey the board to that position (replay forward/backward with the full rules engine; returns to "live" on the latest move). Journey is nice-to-have; scroll + auto-follow is required.
- **Controls** (buttons, distinct tap targets ≥ 44 px):
  - **Play as White / Play as Black** — each starts a fresh game in that color (this
    replaces the old New Game button; Black auto-flips the board so the human is at the
    bottom); re-applies the current ELO slider level.
  - **Resign** — human resigns; game ends with the bot winning. Disabled (or no-op) when the game is already over.
  - **Take Back** — undo the most recent **human+bot pair** (i.e., roll back to the position before the human's last move; if only a human move exists with no bot reply, undo that single move). Repeated taps step back by pairs. Disabled when no human move exists or game is over… actually allow it after game-over to continue play? Keep simple: disabled after game is over.
  - **Flip Board** — toggle orientation (animation: 180° rotation, ~200 ms).
  - **ELO slider** — 5 named ticks (300/700/1100/1500/1900), active tick highlighted, live
    value readout; takes effect from the bot's *next* move.
  - *Play-as doubles as New Game; no separate side toggle.*
- **Captured-pieces tray**: two rows (bot-captured / human-captured) showing small piece icons in capture order, plus the material advantage score (e.g. `+3`) shown next to the leading side, using the same point values as the eval (P=1, N=3, B=3, R=5, Q=9).
- **Best-move hint**: optional feature — **skipped** in v1 (not implemented).

## 6. Edge Cases

- **Clicking while the bot is thinking**: input on the board is ignored (or, if the human's tap would select a piece, simply show nothing / dismiss selection). Queueing human moves is not needed since only the human's side can move and the bot has the turn — the rule is: *if it's the bot's turn, all board input is inert*. Controls (New Game, Flip, Take Back) remain live; New Game cancels the pending bot move (clear the pending timer/task).
- **Rapid repeated New Games**: New Game must be idempotent and safe to spam — each press cancels any pending bot-think timer, resets state, and re-renders the initial position. No async leaks (track the pending task and invalidate by generation counter).
- **Window resize**: the board re-measures on resize/orientation change, stays **centered**, preserves 1:1 aspect (side = min(w, h) of the board region), and all derived sizes (pieces, highlights, coordinates) rescale. Mid-drag resizes cancel the drag gracefully.
- **Mobile touch**: tap and drag work via touch events (touchstart/touchmove/touchend); prevent default scrolling/zoom gestures over the board (`touch-action: none` on the board node); tap targets (pieces, buttons) sized for fingers; no hover-dependent UI.

## 7. Pieces

- Vendor the **CC0-licensed cburnett set** from lichess (lila repo) into the app, e.g. `assets/pieces/cburnett/*.svg`, so the app is fully offline.
- **Verified working base URL** (tested 2026-10-22; all 12 files return `HTTP 200` + `content-type: image/svg+xml`):

  ```
  https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/
  ```

  File naming is `<color><piece>.svg` with `w`/`b` prefix — there are **no** `white/`/`black/` subdirectories in the current lila tree:

  | Piece | File |
  |---|---|
  | White King | `wK.svg` |
  | White Queen | `wQ.svg` |
  | White Rook | `wR.svg` |
  | White Bishop | `wB.svg` |
  | White Knight | `wN.svg` |
  | White Pawn | `wP.svg` |
  | Black King | `bK.svg` |
  | Black Queen | `bQ.svg` |
  | Black Rook | `bR.svg` |
  | Black Bishop | `bB.svg` |
  | Black Knight | `bN.svg` |
  | Black Pawn | `bP.svg` |

- URLs that do **not** work (do not use):
  - `https://lichess.org/assets/pieces/cburnett/white/K.svg` → 404 (path moved long ago).
  - `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/assets/pieces/...` → 403, package exceeds jsDelivr's 50 MB limit.
- SVGs are single-path, fill-based: white pieces are filled white with dark outline, black pieces filled dark — ideal for tinting/dark themes as-is. For LayaAir, import as textures (rasterize at 2× for crispness) or parse the path into a shape; rasterizing is the low-risk route.
