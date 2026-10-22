// Entry: boot Laya, lay out the tuistore/mocha terminal UI, wire Game <-> BoardView.
import { palette, FONT } from "../theme";
import { BoardView } from "./BoardView";
import { Game } from "./Game";
import { loadPieceTextures } from "./pieces";

let board: BoardView;
let game: Game;

// ---------------- icons (inline SVG, stroke = currentColor) ----------------

const ICONS: Record<string, string> = {
  white: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#cdd6f4" stroke-width="1.5" fill="#cdd6f4"/></svg>',
  black: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#45475a" stroke-width="1.5" fill="none"/></svg>',
  resign: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  takeback: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L2 6l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 6h7a3 3 0 010 6H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  flip: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 5.5C4 3.5 10 3.5 11.5 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11.5 8.5C10 10.5 4 10.5 2.5 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9 4l2.5 1.5L9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10l-2.5-1.5L5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function iconBtn(id: string, tip: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "icbtn";
  b.innerHTML = ICONS[id];
  b.dataset.tip = tip;
  return b;
}

// ---------------- CSS ----------------

function css(): void {
  const style = document.createElement("style");
  style.textContent = `
:root{
  --bg:${palette.bg};--surface:${palette.surface};--panel:${palette.panel};
  --border:${palette.border};--border-focus:${palette.borderFocus};--cursor:${palette.cursor};
  --text:${palette.text};--sub:${palette.sub};--dim:${palette.dim};--faint:${palette.faint};
  --accent:${palette.accent};--lav:${palette.lav};--peach:${palette.peach};
  --good:${palette.good};--warn:${palette.warn};--bad:${palette.bad};--overlay:${palette.overlay};
}
html,body{margin:0;height:100%;background:var(--bg);color:var(--text);
  font-family:${FONT};font-size:14px;line-height:1.5;font-feature-settings:"liga" 0,"calt" 0;
  font-variant-ligatures:none;overflow:hidden}
#page{height:100%;display:flex;flex-direction:column;padding:8px;gap:8px;box-sizing:border-box}
/* header */
.hdr{display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid var(--border);border-radius:8px}
.hdr .logo{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center}
.hdr h1{font-size:14px;font-weight:700;margin:0;letter-spacing:.02em}
.hdr .dot{width:8px;height:8px;border-radius:50%;background:var(--good);flex:none}
.hdr .status{font-size:12px;color:var(--sub)}
.hdr .status.tone-warn{color:var(--peach)}
.hdr .status.tone-good{color:var(--good)}
.hdr .status.tone-accent{color:var(--accent)}
.hdr .spacer{flex:1}
.hdr .score{font-size:12px;color:var(--dim)}
/* main split */
.main{flex:1;display:flex;gap:8px;min-height:0}
/* board pane */
.pane{border:1px solid var(--border);border-radius:8px;display:flex;flex-direction:column;min-width:0;min-height:0}
.pane-title{font-size:11px;color:var(--sub);padding:4px 8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;user-select:none}
.pane-body{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;position:relative}
#boardPane{flex:1.6}
#boardPane .pane-title{color:var(--text)}
#sidePane{flex:1;display:flex;flex-direction:column}
#sidePane .pane-title{color:var(--lav)}
#sideBody{flex:1;display:flex;flex-direction:column;gap:8px;padding:8px;overflow-y:auto;min-height:0}
/* card sections inside side pane */
.card{border:1px solid var(--border);border-radius:8px;padding:8px}
.card h3{font-size:11px;font-weight:700;color:var(--sub);margin:0 0 6px;letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;gap:6px}
.card h3 .cdot{width:6px;height:6px;border-radius:50%;background:var(--dim);flex:none}
/* controls row */
.ctrls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.icbtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;
  background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--sub);
  cursor:pointer;padding:0;position:relative}
.icbtn:hover{border-color:var(--border-focus);color:var(--text)}
.icbtn:active{background:var(--cursor)}
/* tooltip */
.tip{position:fixed;background:var(--panel);border:1px solid var(--border-focus);border-radius:8px;
  padding:2px 8px;font-size:11px;color:var(--text);pointer-events:none;z-index:99;
  box-shadow:0 4px 12px var(--overlay)}
/* ELO selector */
.elo-row{display:flex;gap:4px}
.elo-btn{flex:1;font-family:inherit;font-size:12px;padding:4px 0;background:transparent;
  border:1px solid var(--border);border-radius:8px;color:var(--sub);cursor:pointer}
.elo-btn:hover{border-color:var(--border-focus);color:var(--text)}
.elo-btn.on{border-color:var(--accent);color:var(--accent);background:rgba(137,180,250,.08)}
/* laya choices */
.choices{display:flex;flex-direction:column;gap:2px;font-size:12px}
.ch-row{display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:4px}
.ch-row .cdot{width:6px;height:6px;border-radius:50%;background:var(--dim);flex:none}
.ch-row:nth-child(1) .cdot{background:var(--accent)}
.ch-row:nth-child(2) .cdot{background:var(--lav)}
.ch-row .san{color:var(--text)}
.ch-row .sc{margin-left:auto;color:var(--dim);font-size:11px}
.ch-empty{color:var(--dim);font-size:12px;padding:2px 0}
/* moves strip */
.moves-strip{display:flex;gap:4px;flex-wrap:wrap;font-size:12px}
.mv{display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border:1px solid var(--faint);border-radius:4px;color:var(--sub)}
.mv .n{color:var(--dim);font-size:11px}
.mv.w{color:var(--text)}
.mv.b{color:var(--sub)}
.moves-empty{color:var(--dim);font-size:12px}
/* footer */
.ftr{display:flex;gap:16px;padding:4px 8px;border:1px solid var(--border);border-radius:8px;
  font-size:12px;color:var(--dim);align-items:center}
.ftr .hint{white-space:nowrap}
.ftr .k{color:var(--sub)}
@media(max-width:700px){.ftr .hint:nth-child(n+4){display:none}}
/* promo modal */
#promoOverlay{position:fixed;inset:0;background:var(--overlay);display:none;align-items:center;justify-content:center;z-index:50}
#promoBox{background:var(--panel);border:1px solid var(--border-focus);border-radius:8px;padding:8px 16px;
  display:flex;gap:8px;align-items:center;animation:pop .15s cubic-bezier(.22,1,.36,1)}
@keyframes pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
#promoBox label{font-size:12px;color:var(--sub)}
.pbtn{width:36px;height:36px;font-family:inherit;font-size:14px;font-weight:700;background:transparent;
  border:1px solid var(--border);border-radius:8px;color:var(--text);cursor:pointer}
.pbtn:hover{border-color:var(--accent);color:var(--accent)}
`;
  document.head.appendChild(style);
}

// ---------------- DOM ----------------

function buildDom(): void {
  const page = document.createElement("div");
  page.id = "page";

  // header
  const hdr = document.createElement("div");
  hdr.className = "hdr";
  const logo = document.createElement("span");
  logo.className = "logo";
  logo.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="#89b4fa" stroke-width="1.5"/><circle cx="8" cy="8" r="3" fill="#89b4fa"/></svg>';
  const h1 = document.createElement("h1");
  h1.textContent = "chessed";
  const dot = document.createElement("span");
  dot.className = "dot";
  const status = document.createElement("span");
  status.className = "status tone-accent";
  status.id = "status";
  status.textContent = "You play White";
  const spacer = document.createElement("span");
  spacer.className = "spacer";
  const score = document.createElement("span");
  score.className = "score";
  score.id = "score";
  score.textContent = "+0.0";
  hdr.append(logo, h1, dot, status, spacer, score);

  // main
  const main = document.createElement("div");
  main.className = "main";

  // board pane
  const boardPane = document.createElement("div");
  boardPane.className = "pane";
  boardPane.id = "boardPane";
  const bpTitle = document.createElement("div");
  bpTitle.className = "pane-title";
  bpTitle.textContent = "board";
  const bpBody = document.createElement("div");
  bpBody.className = "pane-body";
  bpBody.id = "boardCard";
  boardPane.append(bpTitle, bpBody);

  // side pane
  const sidePane = document.createElement("div");
  sidePane.className = "pane";
  sidePane.id = "sidePane";
  const spTitle = document.createElement("div");
  spTitle.className = "pane-title";
  spTitle.textContent = "detail";
  const spBody = document.createElement("div");
  spBody.id = "sideBody";

  // controls card
  const ctrlCard = document.createElement("div");
  ctrlCard.className = "card";
  const ctrlH = document.createElement("h3");
  ctrlH.innerHTML = '<span class="cdot"></span>controls';
  const ctrls = document.createElement("div");
  ctrls.className = "ctrls";
  const btnW = iconBtn("white", "Play as White");
  btnW.id = "btnWhite";
  const btnB = iconBtn("black", "Play as Black");
  btnB.id = "btnBlack";
  const btnResign = iconBtn("resign", "Resign");
  btnResign.id = "btnResign";
  const btnTake = iconBtn("takeback", "Take back");
  btnTake.id = "btnTake";
  const btnFlip = iconBtn("flip", "Flip board");
  btnFlip.id = "btnFlip";
  ctrls.append(btnW, btnB, btnResign, btnTake, btnFlip);
  ctrlCard.append(ctrlH, ctrls);

  // ELO card
  const eloCard = document.createElement("div");
  eloCard.className = "card";
  const eloH = document.createElement("h3");
  eloH.innerHTML = '<span class="cdot"></span>elo';
  const eloRow = document.createElement("div");
  eloRow.className = "elo-row";
  const eloLabels = ["300", "700", "1100", "1500", "1900"];
  eloLabels.forEach((lbl, i) => {
    const b = document.createElement("button");
    b.className = "elo-btn" + (i === 2 ? " on" : "");
    b.textContent = lbl;
    b.dataset.level = String(i);
    b.addEventListener("click", () => {
      game.setLevel(Number(b.dataset.level));
      eloRow.querySelectorAll(".elo-btn").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    });
    eloRow.appendChild(b);
  });
  eloCard.append(eloH, eloRow);

  // laya choices card
  const chCard = document.createElement("div");
  chCard.className = "card";
  const chH = document.createElement("h3");
  chH.innerHTML = '<span class="cdot"></span>laya choices';
  const chList = document.createElement("div");
  chList.className = "choices";
  chList.id = "choices";
  chCard.append(chH, chList);

  // moves card
  const mvCard = document.createElement("div");
  mvCard.className = "card";
  const mvH = document.createElement("h3");
  mvH.innerHTML = '<span class="cdot"></span>moves';
  const mvStrip = document.createElement("div");
  mvStrip.className = "moves-strip";
  mvStrip.id = "moves";
  mvCard.append(mvH, mvStrip);

  spBody.append(ctrlCard, eloCard, chCard, mvCard);
  sidePane.append(spTitle, spBody);
  main.append(boardPane, sidePane);

  // footer
  const ftr = document.createElement("div");
  ftr.className = "ftr";
  ftr.innerHTML = [
    '<span class="hint"><span class="k">drag</span> move</span>',
    '<span class="hint"><span class="k">tab</span> nav</span>',
    '<span class="hint"><span class="k">esc</span> deselect</span>',
    '<span class="hint"><span class="k">promo</span> auto-q</span>',
  ].join("");

  // promo overlay — pick fn held in closure, wired into Wire.setPick
  const promoOverlay = document.createElement("div");
  promoOverlay.id = "promoOverlay";
  const promoBox = document.createElement("div");
  promoBox.id = "promoBox";
  const promoLabel = document.createElement("label");
  promoLabel.textContent = "Promote to:";
  promoBox.appendChild(promoLabel);
  let pickFn: ((c: "q" | "r" | "b" | "n") => void) | null = null;
  (["q", "r", "b", "n"] as const).forEach((c) => {
    const b = document.createElement("button");
    b.className = "pbtn";
    b.textContent = c.toUpperCase();
    b.addEventListener("click", () => {
      pickFn?.(c);
      promoOverlay.style.display = "none";
    });
    promoBox.appendChild(b);
  });
  promoOverlay.appendChild(promoBox);
  window.__setPromoPick = (fn) => { pickFn = fn; };

  page.append(hdr, main, ftr, promoOverlay);
  document.body.appendChild(page);
}

interface Wire {
  status: HTMLElement;
  score: HTMLElement;
  moves: HTMLElement;
  choices: HTMLElement;
  promo: HTMLElement;
  setPick: (fn: ((c: "q" | "r" | "b" | "n") => void) | null) => void;
}
declare global {
  interface Window { __wire: Wire; __setPromoPick: (fn: ((c: "q" | "r" | "b" | "n") => void) | null) => void }
}

function refreshMoves(w: Wire): void {
  const rows = game.moveListSnapshot();
  if (rows.length === 0) {
    w.moves.innerHTML = '<span class="moves-empty">—</span>';
    return;
  }
  w.moves.innerHTML = rows
    .map((r) => `<span class="mv"><span class="n">${r.n}.</span><span class="w">${r.white || "…"}</span><span class="b">${r.black}</span></span>`)
    .join("");
  w.moves.scrollLeft = w.moves.scrollWidth;
}

function refreshChoices(w: Wire, choices: { san: string; score: number }[]): void {
  if (!choices.length) {
    w.choices.innerHTML = '<span class="ch-empty">—</span>';
    return;
  }
  w.choices.innerHTML = choices
    .map((c) => `<span class="ch-row"><span class="cdot"></span><span class="san">${c.san}</span><span class="sc">${c.score >= 0 ? "+" : ""}${c.score.toFixed(2)}</span></span>`)
    .join("");
}

// ---------------- tooltip ----------------

function attachTooltips(): void {
  let tipEl: HTMLDivElement | null = null;
  const show = (target: Element, e: PointerEvent | MouseEvent) => {
    const tip = (target as HTMLElement).dataset?.tip;
    if (!tip) return;
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tip";
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = tip;
    tipEl.style.left = e.clientX + 12 + "px";
    tipEl.style.top = e.clientY - 8 + "px";
    tipEl.style.display = "block";
  };
  const hide = () => { if (tipEl) tipEl.style.display = "none"; };
  document.querySelectorAll(".icbtn").forEach((b) => {
    b.addEventListener("pointerenter", (e) => show(b, e as PointerEvent));
    b.addEventListener("pointermove", (e) => show(b, e as PointerEvent));
    b.addEventListener("pointerleave", hide);
  });
}

// ---------------- sizing / resize ----------------

let currentSide = 0;
let resizeTimer: number | null = null;

function computeSide(): number {
  const card = document.getElementById("boardCard");
  if (!card) return 320;
  const availH = card.clientHeight;
  const availW = card.clientWidth;
  return Math.max(160, Math.min(availH, availW));
}

/**
 * Laya appends #layaCanvas (position:absolute, transform:matrix) to the body
 * and re-applies that transform on every setScreenSize. Move it into #boardCard
 * and neutralize the absolute positioning so the card's flex centers it.
 */
function fixCanvasStyle(): void {
  const canvas = document.getElementById("layaCanvas");
  const card = document.getElementById("boardCard");
  if (!canvas || !card) return;
  if (canvas.parentElement !== card) card.appendChild(canvas);
  canvas.style.position = "static";
  canvas.style.transform = "none";
  canvas.style.width = currentSide + "px";
  canvas.style.height = currentSide + "px";
  canvas.style.display = "block";
  canvas.style.background = palette.bg;
}

function doResize(): void {
  const side = computeSide();
  if (side === currentSide) return;
  currentSide = side;
  Laya.stage.size(side, side);
  board.resize(side);
  board.x = 0;
  board.y = 0;
  game.render();
}

function onResize(): void {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    doResize();
  }, 100);
}

// ---------------- boot ----------------

async function boot(): Promise<void> {
  css();
  buildDom();
  attachTooltips();

  currentSide = computeSide();
  await Laya.init(currentSide, currentSide);

  const stage = Laya.stage;
  stage.scaleMode = Laya.Stage.SCALE_NONE;
  stage.bgColor = palette.bg;

  board = new BoardView();
  stage.addChild(board);
  board.resize(currentSide);
  board.x = 0;
  board.y = 0;

  const w = window.__wire = {
    status: document.getElementById("status")!,
    score: document.getElementById("score")!,
    moves: document.getElementById("moves")!,
    choices: document.getElementById("choices")!,
    promo: document.getElementById("promoOverlay")!,
    setPick: (fn) => window.__setPromoPick(fn),
  };

  game = new Game(board, {
    onStatus: (text, tone) => {
      w.status.textContent = text;
      w.status.className = "status tone-" + tone;
      const dot = document.querySelector(".hdr .dot") as HTMLElement | null;
      if (dot) dot.style.background = tone === "warn" ? palette.peach : palette.good;
    },
    onScore: (text) => (w.score.textContent = text),
    onPromo: (_choices, pick) => {
      w.setPick(pick);
      w.promo.style.display = "flex";
    },
    onBotThinking: (thinking) => {
      if (thinking) {
        w.status.textContent = "bot thinking…";
        w.status.className = "status tone-accent";
      }
    },
    onMoves: () => refreshMoves(w),
    onChoices: (choices) => refreshChoices(w, choices),
  });

  wireBoardToGame();

  // control buttons
  document.getElementById("btnWhite")!.addEventListener("click", () => game.newGame("w"));
  document.getElementById("btnBlack")!.addEventListener("click", () => game.newGame("b"));
  document.getElementById("btnResign")!.addEventListener("click", () => game.resign());
  document.getElementById("btnTake")!.addEventListener("click", () => game.takeBack());
  document.getElementById("btnFlip")!.addEventListener("click", () => game.flip());

  fixCanvasStyle();
  Laya.stage.on("resize", null, fixCanvasStyle);

  const tex = await loadPieceTextures();
  board.setTextures(tex);

  game.newGame("w");
  window.addEventListener("resize", onResize);
}

boot();

function wireBoardToGame(): void {
  board.onDown = (x, y) => game.down(x, y);
  board.onMove = () => {};
  board.onUp = (x, y) => game.up(x, y);
}
