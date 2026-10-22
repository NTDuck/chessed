# tuistore — Design System Research

Source of truth: the **ricekit** library (tuistore's UI kit, `Gheat1/ricekit`) and tuistore's own
`tuistore/app.py` CSS. All values below are quoted verbatim from source — not guesses.
tuistore is a **Textual (terminal) app**, so its "CSS" is Textual CSS and its colors live in two
places: `ricekit/palette.py` (text/data roles) and `ricekit/themes.py` (theme CSS-variable
contract). A web chess app translates these 1:1 into CSS custom properties.

---

## 1. Color palette (exact hex)

### 1.1 Primary theme — "mocha" (Catppuccin Mocha-based, the default)

From `ricekit/themes.py`, `Theme(name="mocha", …)`:

| Role | Hex | Use |
|---|---|---|
| `background` | `#1e1e2e` | page background |
| `surface` | `#313244` | raised surfaces, list rows |
| `panel` | `#181825` | deepest panel (modal bg) |
| `foreground` | `#cdd6f4` | primary text |
| `primary` | `#89b4fa` | accent blue — focus borders, links, highlights |
| `secondary` | `#cba6f7` | mauve accent |
| `accent` | `#f5c2e7` | pink accent |
| `success` | `#a6e3a1` | success/green |
| `warning` | `#f9e2af` | warning/yellow |
| `error` | `#f38ba8` | error/red |

Mocha `variables` (the kit chrome contract):

| Variable | Value | Use |
|---|---|---|
| `kit-border` | `#45475a` | resting border on every panel |
| `kit-border-focus` | `#89b4fa` | focused panel border (= primary blue) |
| `kit-border-alt` | `#b4befe` | secondary-emphasis border (detail pane) |
| `kit-modal-bg` | `#181825` | modal/overlay boxes |
| `kit-cursor` | `#3e4869` | highlighted/list-cursor row background |
| `kit-overlay` | `black 40%` | modal dim layer (→ `rgba(0,0,0,.4)`) |
| `scrollbar` / hover / active | `#313244` / `#45475a` / `#585b70` | scrollbar states |
| `screen-selection-background` | `#b4befe 35%` | text selection (→ `rgba(180,190,254,.35)`) |

### 1.2 Text/data role palette — `ricekit/palette.py` (`TRUECOLOR`)

| Role | Hex | Use |
|---|---|---|
| `text` | `#cdd6f4` | primary text |
| `sub` | `#a6adc8` | secondary text (titles, subtitles) |
| `dim` | `#6c7086` | muted text, hints |
| `faint` | `#45475a` | faintest markers (empty dots) |
| `vfaint` | `#313244` | near-background marks |
| `blue` | `#89b4fa` | accent/info |
| `lav` | `#b4befe` | lavender accent |
| `peach` | `#fab387` | warm highlight (stars, warnings, special) |
| `green` | `#a6e3a1` | success |
| `red` | `#f38ba8` | error |
| `mauve` | `#cba6f7` | secondary accent |
| `yellow` | `#f9e2af` | warning |

### 1.3 Alternate themes (same variable contract, different values)

- **void**: `background #000000`, `surface #101018`, `panel #070709`, `kit-border #26262e`,
  `kit-modal-bg #0a0a10`, `kit-cursor #1e2a4a`.
- **onyx** (desaturated grey): `background #0e0e11`, `surface #1b1b20`, `panel #131317`,
  `foreground #d4d6dd`, `primary #9aa5b5`, `kit-border #33333c`, `kit-cursor #2b303b`.
- **clear / system**: `background = ansi_default` (terminal-transparent); chrome stays
  muted grey-slate (`kit-border #3c3f4a`, `kit-cursor #282c38`).

→ For the web app: **mocha is the dark theme** (default). There is **no light theme** in
ricekit — all five themes are dark. If a light theme is wanted later, derive one by inverting
mocha's luminance structure; don't invent one now.

---

## 2. Layout structure (from `tuistore/app.py` CSS)

The main screen (`StoreApp.CSS`) is **three panes under a search box** (verbatim intent from the
module docstring: *"Layout is three panes under a search box: categories · results · detail"*):

```
Screen { layers: base; }

#search {
    height: 3; margin: 0 1; padding: 0 1;
    border: round $kit-border; background: transparent;
    border-title-color: #a6adc8;          /* palette.sub */
}
#search:focus { border: round $kit-border-focus; }

#main { height: 1fr; padding: 0 1 0 0; }

#sidebar {
    width: 25; margin: 0 0 0 1;
    border: round $kit-border; border-title-color: #a6adc8;
}
#sidebar:focus { border: round $kit-border-focus; border-title-color: $kit-border-focus; }

#results {
    width: 1fr; min-width: 16;
    border: round $kit-border;
    border-title-color: #cdd6f4;          /* palette.text */
    border-subtitle-color: #6c7086;       /* palette.dim  */
}
#results:focus { border: round $kit-border-focus; }

#detail {
    width: 46%; min-width: 40;
    border: round $kit-border;
    border-title-color: $kit-border-alt;  /* #b4befe */
    border-subtitle-color: #6c7086;
}
OptionList > .option-list--option-highlighted { background: $kit-cursor; }  /* #3e4869 */
```

Modals (e.g. `InstallModal`, `WelcomeModal`) follow one fixed pattern:

```
XModal { align: center middle; background: $kit-overlay; }     /* black 40% */
XModal #box {
    width: 84; max-width: 92%; height: auto; max-height: 88%;
    background: $kit-modal-bg; border: round $kit-border-focus; padding: 1 2;
}
XModal #cmd {
    height: auto; padding: 1 2; margin: 0 0 1 0;
    border: round $kit-border; background: $kit-cursor;        /* inset code box */
}
XModal #trust.warn { border-left: thick $kit-border-alt; }     /* warning rail */
```

### Structural tokens (translate Textual grid units → px for web)
- **Corner radii**: every border is `round` (Textual's 1-cell rounded corner) → web:
  `border-radius: 8px` (≈ the visual weight of a 1-cell radius at terminal scale).
  Inset boxes (`#cmd`) also `round`.
- **Spacing rhythm**: margins/padding are in *cells* of `0`, `1`, `2`. Map `1 cell → 8px`
  base unit: panel padding `8px 16px`, gaps `8px`, search-bar height `3 cells → ~48px`.
- **Borders**: 1px, color `$kit-border` (`#45475a`) at rest; **focus recolors the whole border
  to `$kit-border-focus` (`#89b4fa`)** — this is the signature interaction. No box-shadows in
  the terminal version; the web translation uses a very soft shadow to replace depth:
  `box-shadow: 0 1px 3px rgba(0,0,0,.35)` on modals only, `none` on inline panels (borders do
  the separation).
- **Panels are transparent-backed**: `background: transparent` on `#search`; only modals
  get `$kit-modal-bg` (`#181825`). Inline panels sit directly on the page background
  (`#1e1e2e`) and are separated by their border alone.
- **Footer**: `KitFooter` shows ~7 key hints, compact, and *hides* overflowing trailing keys on
  narrow widths (never scrolls). Web analog: a single-line hint bar, `font-size 12px`,
  `color #6c7086`, truncate/hide overflow.

---

## 3. Typography

Textual has no font families — it's a monospace terminal. The web translation:

- **Font family**: monospace-first to keep the terminal identity:
  `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` for UI chrome and labels;
  an optional `system-ui` sans for long body copy (readme panes).
- **Sizes** (terminal cell ≈ 16px line): body `14px/1.5`; panel titles `14px`;
  large numbers/stat values `20px`; footer hints `12px`; h1 `26px` with
  `letter-spacing: -.01em` (matches the layaForWeb page's own h1 rule, same aesthetic family).
- **Weights**: normal (400) body; `bold` for titles and emphasized tokens (tuistore uses
  rich-markup `bold` on entry names, `bold` + peach on `[WARN]`).
- **Color-by-role, not by size** (doctrine, quoted from the ricekit palette header:
  *"Reference palette.<role> at render time"*):
  title `#cdd6f4`, subtitle `#a6adc8`, muted/hint `#6c7086`, accent `#89b4fa`,
  warn `#fab387`, success `#a6e3a1`, error `#f38ba8`.
- **Data markers**: small colored dots/glyphs in front of rows (e.g. language dots from the
  `LANG_COLOR` map, `#dea584` rust, `#00add8` go, …) — a per-item accent dot is a core
  tuistore idiom.

---

## 4. Dark vs light theme

- **Dark only.** All five ricekit themes are dark; mocha (`#1e1e2e` base) is the default and
  the one to port.
- Theme switching is a first-class feature (`t` cycles `mocha → void → onyx → clear → system`),
  implemented as a *variable swap* — the same CSS references `$kit-*` variables, never raw hex.
  The web app should do exactly the same: define CSS custom properties, ship mocha as default,
  and make a theme toggle a variable override.

---

## 5. Visual feel (prose)

A calm, low-saturation **Catppuccin-Mocha terminal**: deep indigo-grey background, panels that
are *outlined, not filled* — thin rounded `#45475a` borders doing all the separation, content
sitting on bare background. The single loud moment is **focus**: the active panel's border turns
soft blue `#89b4fa` and nothing else changes. Secondary text steps down through `#a6adc8 →
#6c7086 → #45475a`; the only warm color is a peach `#fab387` used sparingly for stars/warnings.
One motion doctrine (*"one animation"*): a single pop-in on modals (`out_cubic`, ~0.15s),
everything else instant. Dense, legible, no shadows, no gradients, no decoration beyond a
colored dot or glyph. It reads as a carefully-made developer tool, not a consumer app.

---

## 6. Ten design rules for our chess app

1. **Background `#1e1e2e`, panels outlined not filled** — 1px `#45475a` rounded
   (`8px` radius) borders on the board panel, side panel, and hint bar; no backgrounds on
   inline panels, no box-shadows.
2. **Focus = border recolor to `#89b4fa`.** The selected square, the active panel, and the
   focused control all get the blue border; nothing else animates.
3. **Two-tone board from the palette**: light squares `#313244` (surface), dark squares
   `#1e1e2e`/`#181825` — never vivid green/brown; the board stays inside the mocha ramp.
4. **One accent, used for state**: `#89b4fa` for selection/move-legal dots; `#fab387` (peach)
   reserved for the *one* warm signal (check/warning); `#f38ba8` for last-move/invalid;
   `#a6e3a1` for success/captures-available.
5. **Role-based text only**: `#cdd6f4` primary, `#a6adc8` secondary, `#6c7086` hints —
   never grey-out by size, always by role token.
6. **Monospace chrome** (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) for the
   title, coordinates, move list, and hints; 12–14px; bold only for the app name and entry
   titles.
7. **Modals**: centered, `background: #181825`, `border: round #89b4fa`, `padding: 8px 16px`,
   over a `rgba(0,0,0,.4)` dim layer, pop-in 0.15s `cubic-bezier(0.22,1,0.36,1)`.
8. **One animation only** — the modal pop-in. Piece moves are a short tween (≤200ms);
   everything else (hover, selection) is instant color change.
9. **Density & alignment**: 8px spacing unit; move-list rows are single-line with a leading
   colored dot/glyph (game-state markers use the same idiom as tuistore's language dots).
10. **Footer hint bar**: one line, 12px, `#6c7086`, showing ≤7 key hints; on narrow widths hide
    trailing hints (never wrap, never scroll) — the KitFooter doctrine.

---

## Key decisions for our chess app

- Port **mocha as the single (default) theme** via CSS custom properties mirroring the
  `kit-*` contract: `--bg #1e1e2e`, `--surface #313244`, `--panel #181825`,
  `--border #45475a`, `--border-focus #89b4fa`, `--cursor #3e4869`, `--text #cdd6f4`,
  `--sub #a6adc8`, `--dim #6c7086`, `--accent #89b4fa`, `--peach #fab387`,
  `--good #a6e3a1`, `--warn #f9e2af`, `--bad #f38ba8`, `--overlay rgba(0,0,0,.4)`.
- **No light theme** initially (ricekit has none); theme = variable swap if added later.
- Board squares are the only filled surfaces; everything else is outline-only on `#1e1e2e`.
- Selection/last-move/check states use the four accent colors above — no new hues.
- 8px spacing unit, 8px corner radius, 1px borders, one 0.15s pop-in animation.
- Monospace UI font stack; 12/14/20px size steps; bold only for title + entry names.
- Modal pattern: `#181825` box, blue `round` border, 40% black dim, centered.
- Per-row status dots (move list, game state) reuse tuistore's colored-glyph idiom.
- Footer hint bar: single line, dim color, hide-overflow on narrow widths.
- Render the board in LayaAir `Graphics` with these exact hex values so canvas and DOM chrome
  share one palette source.
