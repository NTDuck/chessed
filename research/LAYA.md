# LayaAir 3.x — Web Integration Research

Scope: bootstrap a LayaAir 3.x web game **without the Laya editor** (plain HTML/JS/TS, Vite),
sized to the window, deployed under a **sub-path on GitHub Pages** (`/mkident/`).
Sources: the 3.3.13 lib distribution (`LayaAir_3.3.13.libs.zip`, `libs/*.js` + `types/LayaAir.d.ts`)
and the official docs repo `layabox/layaair-doc` (English).

> **Note on the `layaForWeb` reference.** The assigned URL
> (https://vishalmysore.github.io/layaForWeb/) is **not** a LayaAir demo — it is an
> unrelated "Laya" decision model (ConvAI Innovations, ModernBERT-based) running via
> **ONNX Runtime Web** in the browser. Its only relevance to us is its **GitHub Pages
> deployment technique**: it ships a `coi.js` service-worker that adds `Cross-Origin-
> Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy` headers so `SharedArrayBuffer`
> is available (needed by WASM multithreaded builds). We do **not** need COOP/COEP for a plain
> WebGL Laya game, so we can skip it; keep it in mind only if we later adopt a WASM worker.
---

## 1. npm packages & versions

**Verified fact (npm registry, 2026-10):** there is **no official `@layaair/*` core package** on
the public npm registry. `npm view @layaair/laya-core` → `E404 Not Found`;
`@layaair/laya-rapier2d` → same. The only `laya*` hits on npm are unrelated third-party
packages (`laya` 1.1.2, `@johnhenry/laya*`, `@sys-one/laya-serve-*`, …).

So the canonical 3.x distribution is the **GitHub release zip**:

```
https://github.com/layaair/LayaAir/releases  →  LayaAir_<ver>.libs.zip
  └─ libs/laya.core.js, laya.webgl_2D.js, laya.ui.js, …
  └─ types/LayaAir.d.ts   (single ambient module declaring global `Laya`)
```

Tested version: **3.3.13**. Options to consume it in a Vite project:

| Option | How | Notes |
|---|---|---|
| **A. Copy UMD libs** (recommended) | Drop `laya.core.js` / `laya.webgl_2D.js` / `laya.ui.js` into `src/lib/` and import them as side-effect modules | Zero build magic; each file is a UMD-ish wrapper that mutates `window.Laya` (`laya.core.js` starts with `window.Laya = (function (exports) {...`). Order: **core → webgl_2D → ui**. |
| B. Vendor via npm `file:` dep | `npm i file:./vendor/laya-3.3.13` after packaging the zip | Same as A, but reproducible install. |
| C. CDN `<script>` tags | `https://.../laya.core.js` etc. in `index.html` | Fine for a quick demo; worse for offline/CI. |

ESM vs UMD: the 3.3.x lib files are **not ESM** — they attach a global `window.Laya` and export
a namespace object. With Vite, import them for side effects and reference the global:

```ts
import "/lib/laya.core.js";
import "/lib/laya.webgl_2D.js";
import "/lib/laya.ui.js";       // only if using UIComponent/Label
declare const Laya: any;        // or add types/LayaAir.d.ts to tsconfig "include"
```

The `.d.ts` declares an ambient `global.Laya` namespace (classes `Scene`, `View`, `Graphics`,
`Text`, `Label`, `Sprite`, `Stage`, `Timer`, …). Point `tsconfig` `include` at it.

---

## 2. Minimal bootstrap (no editor)

No `<div id="LayaAirGame">` is required in 3.x. The engine creates its own canvas and appends
it to the body. You size the stage with `Laya.init(width, height)`:

```ts
// entry.ts
import "/lib/laya.core.js";
import "/lib/laya.webgl_2D.js";

const designW = window.innerWidth, designH = window.innerHeight;

Laya.init(designW, designH).then(() => {
  const stage = Laya.stage;              // global Stage (WebGLCanvas-backed)
  stage.bgColor = "#1e1e2e";
  stage.scaleMode = "fixedwidth";       // 3.3.13 values: "noscale" | "showall" | "full" | "fixedwidth" | "fixedheight" | "fixedauto"
  stage.alignV = "top";

  const box = new Laya.Sprite();
  box.graphics.drawRect(0, 0, 100, 100, "#89b4fa", null, 1);
  box.pos(50, 50);
  stage.addChild(box);

  const label = new Laya.Text();
  label.text = "hello laya";
  label.fontSize = 24;
  label.color = "#cdd6f4";
  label.pos(50, 160);
  stage.addChild(label);
});
```

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mkident chess</title>
  <style>html,body{margin:0;padding:0;background:#1e1e2e}canvas{display:block}</style>
</head>
<body>
  <script type="module" src="./entry.ts"></script>
</body>
</html>
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
export default defineConfig({
  base: "/mkident/",           // MUST match the GitHub Pages sub-path
  build: { target: "es2020", assetsInlineLimit: 0 },
  server: { port: 5173 },
});
```

`Laya.init` returns a `Promise` that resolves when the WebGL context is ready — build the scene
**inside** `.then()`.

### `Config` globals (set before init, top of entry.ts)

From `laya.core.js` defaults (verified in the lib): `Config.isAntialias=true`,
`Config.useWebGL2=true`, `Config.FPS=60`, `Config.useRetinalCanvas=false`,
`Config.animationInterval=50`. For a 2D board game you can leave defaults; consider
`Laya.Config.isAntialias = true` for crisp piece edges.

---

## 3. Core API surface we'll need

All verified against `LayaAir.d.ts` (3.3.13).

### Scene / View / Camera
- `Laya.Scene extends Sprite` — a container node; `addChild`, `childAt`, `removeChild`.
  Use plain `Scene`/`Sprite` containers for the board; no 3D needed.
- `Laya.View extends Scene` — higher-level page container: `dataSource`,
  `static regUI(url, json)` (registers editor-generated UI JSON — **we skip this**, we build
  nodes by code), `changeData(key)`. For a code-only app, `View` adds little over `Scene`;
  treat it as an optional root page type.
- `Laya.ViewStack extends Box` — paged navigation with `selectedIndex`. Optional for
  screens (board / settings).
- `Laya.Camera2D` / `Laya.Camera` — for zoom/pan of the board (`camera.scale`,
  `camera.fieldOfView`). For a fixed 8×8 board, a manual scale of a container `Sprite` is simpler.

### Graphics (vector drawing — the key to zero external assets)
`Laya.Graphics` (on every `Sprite` via `sprite.graphics`), methods verified in the 3.3.13 runtime:
- Shapes: `drawRect(x, y, w, h, fillColor, lineColor?, lineWidth?, percent?)`,
  `drawRoundRect(x, y, w, h, lt, rt, rb, lb, fillColor, lineColor?, lineWidth?)`,
  `drawCircle(x, y, radius, fillColor, lineColor?, lineWidth?)`, `drawEllipse`,
  `drawPoly(x, y, points, fillColor, lineColor?, lineWidth?)`,
  `drawLine(x, y, x2, y2, color, thickness)`, `drawLines`
- Path API: **there is no canvas-style `beginPath/moveTo/lineTo/fill/stroke` on `Graphics`**
  (verified: those names do not exist in 3.3.13). Instead use
  `drawPath(x, y, paths, brush?, pen?)` where `paths` is a command list:
  `[["moveTo",x,y],["lineTo",x,y],["arcTo",x1,y1,x2,y2,r],["closePath"]]` and
  `brush = {fillStyle:"#…", alpha?}`, `pen = {strokeStyle, lineWidth, lineJoin:"bevel|round|miter", lineCap:"butt|round|square"}`.
- `clear()`, `removeCmd(cmd)`, `fillTexture`, `clipRect`, `fillText`/`strokeText`
- Note: shape methods return a `*Cmd` object (e.g. `DrawRectCmd`) — keep it if you want
  to change/remove that single draw later (`graphics.removeCmd(cmd)`).

**The entire chess board + pieces can be vector-drawn** (squares with `drawRoundRect`,
pieces with `drawCircle`/`drawPath`) — no image assets at all. This eliminates the sub-path
asset problem (see §4).

### Text / Label
- `Laya.Text` (core): properties verified — `text`, `font`, `fontSize`, `color`,
  `bold`, `italic`, `align` ("left"|"center"|"right"), `valign`, `leading`, `padding`,
  `stroke`/`strokeColor`, `wordWrap`, `maxWidth`, plus `textWidth`/`textHeight` getters and
  `measureWidth()`/`measureHeight()`. **No `htmlText` property**: rich text is a boolean
  `text.html = true` flag enabling a small markup/UBB parser on `text` (also `ubb`).
  **No `cacheAsBitmap`** in the 3.3.13 public surface (only an internal render-pass note).
- `Laya.Label` / `Laya.UIComponent` / `Laya.Box` live in `laya.ui.js` (confirmed
  `undefined` without it): `Label` = `Text` + background/`border` composite with
  `labelText`, `background`, `sizeGrid`. Only needed for button-like widgets; a
  `Sprite`+`Text` pair is lighter for our use.

### Sprite events (3.x event names — verified strings in `laya.core.js`)
3.x **removed** the 2.x `Event.TOUCH_TAP` / `onMouseTap` conveniences (no `TAP`/`TOUCH_*`
constants exist in the 3.3.13 d.ts). The real event-name strings shipped in core are:

- mouse: `"mousedown"`, `"mouseup"`, `"mousemove"`, `"mouseover"`, `"mouseout"`,
  `"mousedrag"`, `"mousedragend"`, `"click"`, `"mousewheel"`, `"rightmousedown"`, `"rightmouseup"`
- touch: `"touchstart"`, `"touchmove"`, `"touchend"`, `"touchcancel"`

There is **no `"tap"`**. Tap must be synthesized from `touchstart`+`touchend` (or just use
`mousedown`/`click`, which LayaAir also fires for touch on desktop-class browsers).
Pattern for a selectable square:

```ts
sq.on("mousedown", sq, () => select(sq));
sq.on("touchstart", sq, (e: Laya.TouchEvent) => select(sq));
// drag: track on mousedown/touchstart, move on mousemove/touchmove on the stage,
// drop on mouseup/touchend.
stage.on("mousemove", stage, (e) => { /* e.globalX / e.globalY */ });
```

Event objects carry `globalX/globalY` (stage coords) and `localX/localY` (node coords).
Use `EventDispatcher.on/off` on any `Node`. For board picking the 3.3.13 runtime exposes
**`Sprite.hitTestPoint(x, y): boolean`** (verified; also `mouseEnabled`, `hitTestPrior`) —
there is **no `pointToNode`/`Laya.hitTest`** top-level helper, so pick by walking your own
square sprites (`sq.hitTestPoint(px, py)`), which is exactly what a chess board wants.

### Timers & per-frame loop
- `Laya.timer` — global `Timer`: `frameLoop(interval, caller, method, args?, thisArgs?)`,
  `loop(delayMs, …)`, `once(delayMs, …)`. **This is the per-frame update hook**:
  `Laya.timer.frameLoop(1, this, update)` runs `update()` every frame (~60fps).
- `Laya.stage` itself is a node; you can also drive updates via `stage.on("frameRateChanged")`
  but `timer.frameLoop` is the canonical loop.
- For animation, prefer `Laya.Tween` (`Tween.to(target, {x:.., alpha:..}, duration, ease)`)
  over manual timers for piece moves. Statics verified in the 3.3.13 runtime: `create`,
  `to`, `from`, `getTween`, `getTweens`, `isTweening`, `kill`, `clear`, `killAll`, `clearAll`.
  **There is no `killTweens(target)`** — keep the `Tween` handle returned by `Tween.to(...)`
  and call `Tween.kill(handle)` (or `Tween.getTweens(target)` then kill each) to cancel.

---

## 4. Static resources under a GitHub Pages sub-path

Two independent concerns:

**(a) Our own JS bundle / fonts** — handled entirely by Vite's `base: "/mkident/"`. Every
emitted asset URL is prefixed, so no runtime config needed.

**(b) Laya `RES.load` asset URLs** — `Loader`/`RES` resolve relative asset URLs against
`Laya.URL.basePath` (d.ts line ~49270: "If not set, it defaults to the path of the current
web page. The final address will be formatted as basePath + relative URL address"; also
`URL.basePaths` for prefix remapping and `URL.version` for cache-busting). If we loaded remote
images we'd set `Laya.URL.basePath = "https://<user>.github.io/mkident/assets/"`. **We avoid
this entirely** by drawing everything with `Graphics` (§3) and using a system font stack for
`Text.font`. Result: **zero external binary assets**, so the sub-path question is a non-issue
at runtime.

SVG embedding is possible (feed an SVG path's commands to `Graphics.drawPath`) but plain
vector primitives are simpler for chess geometry.

---

## 5. Known pitfalls

1. **WebGL context loss.** The 3.3.13 d.ts has **no** `contextlost`/`recreateContext` API
   (only a `devicelost` internal). Browsers can drop the WebGL context on tab sleep / GPU
   reset; LayaAir 3.x does not expose a clean recovery hook. Mitigations: (a) keep the game
   state in JS (re-render from state on visibilitychange), (b) on `visibilitychange`→visible,
   re-run `Laya.init` and rebuild the scene tree from your model. For a static board this is
   cheap; don't store rendered pixels as source of truth.
2. **Loading order.** `laya.core.js` **must** load before `laya.webgl_2D.js` before
   `laya.ui.js` — each wrapper closes over the `Laya` global the previous one created
   (`(function (exports, Laya) {...`). Importing in the wrong order → `Laya is undefined`.
   With ES imports in `entry.ts` the order is source-order; keep it explicit.
3. **Resize handling.** There is no automatic resize. Listen to `window` `resize` and call
   `Laya.stage.scaleMode`/re-init: simplest robust approach is `stage.scaleMode="fixedwidth"`
   (keeps design width, scales height) or re-run `Laya.init(newW, newH)` on a debounced
   resize and rebuild. For a chess board, a fixed aspect (square) stage centered in the window
   is more stable than fluid resize.
4. **`Laya.init` is async.** Building nodes before the promise resolves throws (no stage).
5. **No `tap` event in 3.x** (see §3) — a common 2.x code copy-paste breakage.
6. **Retina/DPR.** `Config.useRetinalCanvas=false` by default; enable for crisp lines on
   high-DPI displays, at a render-cost cost.
7. **TypeScript ambient global.** The `.d.ts` is a single huge ambient file; include it once,
   don't try to import `Laya` as a module (it's not one).
8. **No `clearChildren` in 3.x.** Verified against the vendored `laya.core.js`
   (3.3.13): `clearChildren` appears **0** times; `removeChildAt` (3), `numChildren`
   (5), `removeChild` (14) are present. Calling `sprite.clearChildren()` throws
   `TypeError: this.clearChildren is not a function` at runtime. To empty a node:
   `while (node.numChildren > 0) node.removeChildAt(0);`. This is a silent 2.x→3.x
   copy-paste breakage — type-checkers won't catch it if your ambient `.d.ts`
   declares `clearChildren` (ours did).
9. **Render-after-resize ordering.** A board view that computes cell size from a
   `resize(side)` call will bail early (`if (cell<=0) return`) if `render()` runs
   before the first `resize()`. Boot order must be: create view → `newGame()`/
   `render()` is fine to *schedule*, but the **first `layout()`/`resize()` must run
   before the first paint**, and every subsequent `resize()` must re-call `render()`.
   Otherwise the board sprite exists at full size with 0 square children and paints
   nothing. We hit exactly this: board was 340×340 in the tree with only its glow
   10. **Headless Chrome starves the frame loop.** Verified empirically (Puppeteer +
     SwiftShader, 21 s run): `Laya.timer.frameLoop(10, …)` fired **0** times while the
     initial synchronous board paint rendered fine. Laya's engine loop is driven by
     `requestAnimationFrame`, which headless Chrome throttles to zero when the page has
     no compositor activity. Flags tried without effect: `--disable-frame-rate-limit`,
     `--disable-features=CalculateNativeWinOcclusion`, `--run-all-compositor-stages-before-draw`,
     `--disable-gpu-vsync`. Practical impact: any Puppeteer/Playwright smoke test of a Laya
     app will see a frozen frame loop and can false-negative on timer-driven behaviour
     (bot turns, tweens). Mitigations: (a) drive critical logic off explicit user events,
     not timers, in test paths; (b) in CI, call `page.evaluate(() => requestAnimationFrame(()=>{}))`
     in a loop or use `page.bringToFront()` to nudge the compositor; (c) accept that
     headless timing tests are unreliable and validate timing in a real browser.

---

## 6. Working skeleton (Vite + TS)

```
mkident/
  index.html
  entry.ts
  lib/            # vendored 3.3.13 UMD files
    laya.core.js
    laya.webgl_2D.js
    (laya.ui.js)  # only if using Label/UIComponent
  types/LayaAir.d.ts
  vite.config.ts
```

`entry.ts` is §2's bootstrap. Board module sketch:

```ts
export class Board extends Laya.Scene {
  size = 8; cell = 64;
  constructor() {
    super();
    const b = new Laya.Sprite();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = new Laya.Sprite();
      sq.graphics.drawRect(0, 0, this.cell, this.cell,
        (x + y) % 2 ? "#313244" : "#89b4fa"); // tuistore mocha tones
      sq.pos(x * this.cell, y * this.cell);
      sq.name = `${x}${y}`;
      sq.on("mousedown", sq, () => this.pick(sq));
      b.addChild(sq);
    }
    this.addChild(b);
  }
  pick(sq: Laya.Sprite) { /* selection / move logic */ }
}
```

Per-frame loop: `Laya.timer.frameLoop(1, game, update)`; piece animation: `Laya.Tween`.

Deploy: `vite build` → `dist/` → GitHub Pages with `base: "/mkident/"`.

---

## Key decisions for our chess app

- **Vendor the 3.3.13 UMD libs** (`laya.core.js` + `laya.webgl_2D.js`) directly into `src/lib/`;
  there is no usable `@layaair/*` npm package — do not wait for one.
- **Draw the board and all 32 pieces with `Laya.Graphics` vectors** — zero image assets, which
  sidesteps every sub-path/`RES` base-URL concern on GitHub Pages.
- **Use a system font stack** for `Text.font`; no webfont download needed.
- **Synthesize tap** from `mousedown`/`click` (desktop) + `touchstart`/`touchend` (mobile);
  there is no `tap` event in 3.x.
- **Drive per-frame work with `Laya.timer.frameLoop(1, …)`** and piece movement with
  `Laya.Tween`.
- **Keep all game state in a plain JS model**; the Laya tree is a pure view rebuilt from state.
  This makes WebGL-context-loss recovery trivial (re-init + re-render).
- **Fix a square-aspect stage** (e.g. 512×512 design) centered in the window rather than
  fluidly resizing the board; handle window resize by re-centering only.
- **Set `vite base: "/mkident/"`** so the bundle self-locates under the Pages sub-path.
- **Skip `Laya.ui.js`/`Label`/`View.regUI`** unless a real widget is needed — `Sprite`+`Text`
  is lighter and avoids the UI JSON layer tied to the editor.
- **Enable `Laya.Config.useRetinalCanvas = true`** for crisp piece edges on high-DPI screens.
