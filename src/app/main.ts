// Entry: boot Laya, lay out the tuistore-styled page, wire Game <-> BoardView.
import { palette, FONT } from "../theme";
import { BoardView } from "./BoardView";
import { Game } from "./Game";
import { loadPieceTextures } from "./pieces";

let board: BoardView;
let game: Game;

function el(tag: string, cls: string, text = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function css(): void {
  const style = document.createElement("style");
  style.textContent = `
  html,body{margin:0;height:100%;background:${palette.bg};color:${palette.text};
    font-family:${FONT};font-size:14px}
  #page{max-width:960px;margin:0 auto;padding:20px 16px 48px}
  h1{font-size:22px;margin:0 0 2px;letter-spacing:-.01em}
  .sub{color:${palette.sub};margin:0 0 18px}
  .row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
  .card{background:${palette.surface};border:1px solid ${palette.border};
    border-radius:10px;padding:14px}
  #boardCard{padding:10px;display:flex;justify-content:center}
  #layaCanvas,#LayaAirDisplay{display:block}
  .side{flex:1;min-width:260px;display:flex;flex-direction:column;gap:14px}
  .card h2{font-size:13px;margin:0 0 10px;color:${palette.sub};font-weight:600}
  button{background:${palette.panel};color:${palette.text};border:1px solid ${palette.border};
    border-radius:8px;padding:7px 12px;font:inherit;cursor:pointer}
  button:hover{border-color:${palette.accent}}
  button.active{border-color:${palette.accent};color:${palette.accent}}
  .opts{display:flex;gap:8px;flex-wrap:wrap}
  #status{font-size:15px;min-height:22px}
  #status.tone-accent{color:${palette.accent}}
  #status.tone-warn{color:${palette.warn}}
  #status.tone-good{color:${palette.good}}
  #score{color:${palette.sub};font-variant-numeric:tabular-nums}
  #moves{max-height:280px;overflow:auto;font-size:13px;line-height:1.9}
  #moves .n{color:${palette.dim};margin-right:8px}
  .promo{display:none;position:fixed;inset:0;background:${palette.overlay};
    align-items:center;justify-content:center;z-index:10}
  .promo .box{background:${palette.surface};border:1px solid ${palette.border};
    border-radius:12px;padding:18px;display:flex;gap:10px;align-items:center}
  .promo b{margin-right:8px}
  `;
  document.head.appendChild(style);
}

function buildDom(): void {
  const page = el("div", "", "");
  page.id = "page";
  const h1 = el("h1", "", "mkident · chess");
  const sub = el("p", "sub", "Human vs bot, rendered with LayaAir. Styled after tuistore.");
  const row = el("div", "row");

  const boardCard = el("div", "card");
  boardCard.id = "boardCard";

  const side = el("div", "side");

  const controlCard = el("div", "card");
  controlCard.appendChild(el("h2", "", "New game"));
  const opts = el("div", "opts");
  const btnW = el("button", "", "Play White");
  const btnB = el("button", "", "Play Black");
  opts.append(btnW, btnB);
  controlCard.appendChild(opts);

  const levelCard = el("div", "card");
  levelCard.appendChild(el("h2", "", "Bot strength"));
  const lvOpts = el("div", "opts");
  const levels = ["Off", "Easy", "Medium", "Hard", "Brutal"];
  let lvIdx = 2;
  levels.forEach((label, i) => {
    const b = el("button", i === 2 ? "active" : "", label);
    b.onclick = () => {
      lvIdx = i;
      lvOpts.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      game.setLevel(i);
    };
    lvOpts.appendChild(b);
  });
  levelCard.appendChild(lvOpts);

  const statusCard = el("div", "card");
  const statusRow = el("div", "row");
  const status = el("div", "");
  status.id = "status";
  const score = el("div", "");
  score.id = "score";
  score.textContent = "0.0";
  statusRow.append(status, score);
  statusCard.appendChild(statusRow);

  const movesCard = el("div", "card");
  movesCard.appendChild(el("h2", "", "Moves"));
  const moves = el("div", "");
  moves.id = "moves";
  movesCard.appendChild(moves);

  side.append(controlCard, levelCard, statusCard, movesCard);
  row.append(boardCard, side);
  page.append(h1, sub, row);
  document.body.appendChild(page);

  // promotion overlay
  const promo = el("div", "promo");
  promo.id = "promo";
  const box = el("div", "box");
  box.appendChild(el("b", "", "Promote to:"));
  let pick: ((c: "q" | "r" | "b" | "n") => void) | null = null;
  (["q", "r", "b", "n"] as const).forEach((c) => {
    const b = el("button", "", c.toUpperCase());
    b.onclick = () => {
      promo.style.display = "none";
      pick?.(c);
    };
    box.appendChild(b);
  });
  promo.appendChild(box);
  page.appendChild(promo);

  btnW.onclick = () => game.newGame("w");
  btnB.onclick = () => game.newGame("b");

  window.__wire = {
    status,
    score,
    moves,
    promo,
    setPick: (fn: ((c: "q" | "r" | "b" | "n") => void) | null) => (pick = fn),
  };
}

interface Wire {
  status: HTMLElement;
  score: HTMLElement;
  moves: HTMLElement;
  promo: HTMLElement;
  setPick: (fn: ((c: "q" | "r" | "b" | "n") => void) | null) => void;
}
declare global {
  interface Window { __wire: Wire }
}

function refreshMoves(w: Wire): void {
  const rows = game.moveListSnapshot();
  w.moves.innerHTML = rows
    .map((r) => `<div><span class="n">${r.n}.</span>${r.white || "…"} ${r.black}</div>`)
    .join("");
}

let currentSide = 0;
let resizeTimer: number | null = null;

function computeSide(): number {
  const page = document.getElementById("page");
  if (!page) return 320;
  const avail = Math.min(page.clientWidth - 32, 640);
  const sideW = window.innerWidth > 900 ? 300 : 0;
  return Math.max(280, Math.min(avail - sideW, window.innerHeight - 160));
}

/**
 * Laya appends #layaCanvas (position:absolute, transform:matrix) to the body
 * and re-applies that transform on every setScreenSize (at init and on every
 * resize). Move it into #boardCard and neutralize the absolute positioning and
 * centering transform so the card's flex centers it. Re-run on every stage
 * "resize" because Laya re-sets the transform each time.
 */
function fixCanvasStyle(): void {
  const canvas = document.getElementById("layaCanvas");
  const card = document.getElementById("boardCard");
  if (!canvas || !card) return;
  if (canvas.parentElement !== card) card.appendChild(canvas);
  // Laya sizes the element to side*pixelRatio and scales it back with a CSS
  // matrix; we drop that transform, so pin the box to the logical board size.
  canvas.style.position = "static";
  canvas.style.transform = "none";
  canvas.style.width = currentSide + "px";
  canvas.style.height = currentSide + "px";
  canvas.style.margin = "0 auto";
  canvas.style.display = "block";
  canvas.style.background = palette.bg;
}

function doResize(): void {
  const side = computeSide();
  if (side === currentSide) return;
  currentSide = side;
  // Resizes the stage + canvas element and fires stage "resize", which re-runs
  // fixCanvasStyle after Laya re-applies its transform.
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
  }, 150);
}

async function boot(): Promise<void> {
  css();
  buildDom();

  // Measure BEFORE init so the stage is created at the final board size, not
  // the full window — a full-window canvas would overlay the DOM side panel.
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

  const w = window.__wire;
  game = new Game(board, {
    onStatus: (text, tone) => {
      w.status.textContent = text;
      w.status.className = "tone-" + tone;
    },
    onScore: (text) => (w.score.textContent = text),
    onPromo: (choices, pick) => {
      w.setPick(pick);
      w.promo.style.display = "flex";
      void choices;
    },
    onBotThinking: (thinking) => {
      if (thinking) {
        w.status.textContent = "Bot is thinking…";
        w.status.className = "tone-accent";
      }
    },
  });
  wireBoardToGame();

  // Confine the canvas to the board card (before Laya's deferred setScreenSize
  // runs) and re-fix after each of Laya's style re-applies.
  fixCanvasStyle();
  Laya.stage.on("resize", null, fixCanvasStyle);

  // Load the 12 piece textures BEFORE the first render so the opening position
  // paints with pieces on the very first frame. A single failed asset is caught
  // (Promise.all settles) and the board renders with whatever loaded.
  const tex = await loadPieceTextures();
  board.setTextures(tex);

  // newGame() calls render() internally; cell is already sized above, and the
  // textures are loaded, so the opening 12 pieces render on first paint.
  game.newGame("w");

  window.addEventListener("resize", onResize);
  // refresh move list after each render tick
  Laya.timer.frameLoop(20, () => refreshMoves(w));
}

boot();

function wireBoardToGame(): void {
  board.onDown = (x, y) => game.down(x, y);
  board.onMove = () => {};
  board.onUp = (x, y) => game.up(x, y);
}
