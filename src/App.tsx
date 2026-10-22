// App: the full tuistore/mocha terminal-styled UI. Pure React + inline SVG
// board; observes Game via useSyncExternalStore. No canvas, no Laya.
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  useRef,
  useCallback,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import { Game, ELO_LABELS, type Snap } from "./app/Game";
import { palette, FONT } from "./theme";
import { Piece, INNER, type PieceCode } from "./app/pieces";

const p = palette;

function pieceCode(pc: { t: string; c: string }): PieceCode {
  return (pc.c + pc.t.toUpperCase()) as PieceCode;
}

// ---- inline SVG icons (16px, stroke = currentColor) -----------------------
type IconProps = { className?: string };
function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="16" height="16"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const IW = () => (<Svg><path d="M12 4v16" /><path d="M5 11l7 7 7-7" /></Svg>);
const IB = () => (<Svg><path d="M12 20V4" /><path d="M5 13l7-7 7 7" /></Svg>);
const IResign = () => (<Svg><path d="M4 21V4" /><path d="M4 4h14l-3 4 3 4H4" /></Svg>);
const ITake = () => (<Svg><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Svg>);
const IFlip = () => (<Svg><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /></Svg>);

function IconBtn({ icon, label, onClick, active }: {
  icon: ReactNode; label: string; onClick: () => void; active?: boolean;
}) {
  return (
    <button className={"ibtn" + (active ? " on" : "")} onClick={onClick} aria-label={label}>
      {icon}
      <span className="tip">{label}</span>
    </button>
  );
}

// ---- formatting -----------------------------------------------------------
function fmtScore(s: number): string {
  const v = Math.round(s) / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

const TONE: Record<string, string> = {
  accent: "var(--accent)", warn: "var(--warn)", good: "var(--good)",
  bad: "var(--bad)", dim: "var(--dim)",
};

// ---- board geometry -------------------------------------------------------
// Square 0..63, index = row*8+col (row 0 = rank 8 at the top in white view).
function dispCoords(sq: number, flipped: boolean): [number, number] {
  const row = Math.floor(sq / 8);
  const col = sq % 8;
  return flipped ? [7 - col, 7 - row] : [col, row];
}

// ============================================================================
export default function App() {
  const game = useMemo(() => new Game(), []);
  const snap = useSyncExternalStore(
    (fn) => game.subscribe(fn),
    () => game.snapshot(),
  );

  // Board sizing: side = min(available width, available height) of the pane.
  const boardPaneRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState(0);

  useEffect(() => {
    const el = boardPaneRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 16;
      const h = el.clientHeight - 16;
      setBoardSize(Math.max(120, Math.min(w, h)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "n") { game.newGame("w"); e.preventDefault(); }
      else if (k === "b") { game.newGame("b"); e.preventDefault(); }
      else if (k === "r") game.resign();
      else if (k === "t") game.takeBack();
      else if (k === "f") game.flip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  // Escape dismisses the promo modal.
  useEffect(() => {
    if (!snap.promoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { game.cancelPromo(); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, snap.promoOpen]);

  // ---- drag / click-to-move -----------------------------------------------
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ from: number; x: number; y: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ sq: number; x: number; y: number } | null>(null);

  const localPoint = useCallback((e: RPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }, []);

  const squareAt = useCallback((x: number, y: number, w: number, h: number): number => {
    if (w <= 0 || h <= 0) return -1;
    const cell = (Math.min(w, h) - 20) / 8;
    const ox = (w - cell * 8) / 2;
    const oy = (h - cell * 8) / 2;
    const dc = Math.floor((x - ox) / cell);
    const dr = Math.floor((y - oy) / cell);
    if (dc < 0 || dc > 7 || dr < 0 || dr > 7) return -1;
    const fl = snap.flipped;
    const row = fl ? 7 - dr : dr;
    const col = fl ? 7 - dc : dc;
    return row * 8 + col;
  }, [snap.flipped]);

  const onDown = useCallback((e: RPointerEvent<SVGSVGElement>) => {
    const lp = localPoint(e);
    if (!lp) return;
    const sq = squareAt(lp.x, lp.y, lp.w, lp.h);
    if (sq < 0) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* headless */ }
    const from = sq;
    dragRef.current = { from, x: lp.x, y: lp.y, moved: false };
    game.down(sq);
  }, [game, localPoint, squareAt]);

  const onMove = useCallback((e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const lp = localPoint(e);
    if (!lp) return;
    const dx = lp.x - d.x;
    const dy = lp.y - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setGhost({ sq: d.from, x: e.clientX, y: e.clientY });
  }, [localPoint]);

  const onUp = useCallback((e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setGhost(null);
    if (!d) return;
    const lp = localPoint(e);
    if (!lp) return;
    const to = squareAt(lp.x, lp.y, lp.w, lp.h);
    game.up(to);
  }, [game, localPoint, squareAt]);

  const onLeave = useCallback(() => {
    dragRef.current = null;
    setGhost(null);
  }, []);

  // ---- board rendering ----------------------------------------------------
  const cell = boardSize / 8;
  const lastFrom = snap.lastMove?.from ?? -1;
  const lastTo = snap.lastMove?.to ?? -1;

  const squares: ReactNode[] = [];
  const pieces: ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = row * 8 + col;
      const [dc, dr] = dispCoords(sq, snap.flipped);
      const light = (row + col) % 2 === 0;
      let fill: string = light ? p.surface : p.panel;
      if (sq === lastFrom || sq === lastTo) fill = p.lastMove;
      else if (sq === snap.checkSq) fill = p.checkGlow;
      else if (sq === snap.selected) fill = p.selectTint;
      squares.push(<rect key={"s" + sq} x={10 + dc * cell} y={10 + dr * cell} width={cell} height={cell} fill={fill} />);
    }
  }
  for (let sq = 0; sq < 64; sq++) {
    const pc = snap.board[sq];
    if (!pc) continue;
    const [dc, dr] = dispCoords(sq, snap.flipped);
    const dragged = ghost !== null && ghost.sq === sq;
    pieces.push(
      <g key={"p" + sq} data-square={sq} transform={`translate(${10 + dc * cell},${10 + dr * cell})`}>
        <g opacity={dragged ? 0.35 : 1} transform={`scale(${cell / 45})`}>
          <g dangerouslySetInnerHTML={{ __html: INNER[pieceCode(pc)] }} />
        </g>
      </g>,
    );
  }
  const targets: ReactNode[] = [];
  for (const t of snap.targets) {
    const [dc, dr] = dispCoords(t, snap.flipped);
    targets.push(<circle key={"t" + t} cx={10 + (dc + 0.5) * cell} cy={10 + (dr + 0.5) * cell} r={cell * 0.16} fill={p.destDot} />);
  }

  const FILES = "abcdefgh";
  const fileLabels: ReactNode[] = [];
  const rankLabels: ReactNode[] = [];
  for (let i = 0; i < 8; i++) {
    // display column i -> file
    const fileCol = snap.flipped ? 7 - i : i;
    fileLabels.push(
      <text key={"f" + i} x={10 + (i + 0.5) * cell} y={10 + boardSize + 12} fontSize="10"
        fill={p.dim} textAnchor="middle">{FILES[fileCol]}</text>,
    );
    // display row i -> rank
    const rankRow = snap.flipped ? i : 7 - i;
    const rank = 8 - rankRow;
    rankLabels.push(
      <text key={"r" + i} x={4} y={10 + (i + 0.5) * cell + 3} fontSize="10"
        fill={p.dim} textAnchor="end">{rank}</text>,
    );
  }

  // ---- promo modal --------------------------------------------------------
  const PROMO: { code: PieceCode; letter: string; name: string }[] = [
    { code: "wQ", letter: "q", name: "Queen" },
    { code: "wR", letter: "r", name: "Rook" },
    { code: "wB", letter: "b", name: "Bishop" },
    { code: "wN", letter: "n", name: "Knight" },
  ];
  const ghostPiece = ghost ? snap.board[ghost.sq] ?? null : null;

  return (
    <div className="app" data-title="chessed">
      <style>{CSS}</style>

      {/* header */}
      <header className="hdr">
        <div className="brand">
          <span className="dot" style={{ background: "var(--accent)" }} />
          <span className="bname">chessed</span>
        </div>
        <div className="status">
          <span className="dot" style={{ background: TONE[snap.statusTone] }} />
          <span className="stext">{snap.statusText}</span>
          {snap.thinking && <span className="think">· · ·</span>}
        </div>
        <div className="score" data-score>{snap.scoreText}</div>
      </header>

      {/* main: board pane + detail pane */}
      <main className="main">
        <section className="pane board-pane" ref={boardPaneRef}>
          <div className="pane-title">board</div>
          <div className="pane-body">
            <div className="board-wrap" data-board-size={boardSize}>
              <svg
                ref={svgRef}
                className="board"
                width={boardSize + 20}
                height={boardSize + 20}
                viewBox={`0 0 ${boardSize + 20} ${boardSize + 20}`}
                style={{ touchAction: "none" }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={onLeave}
              >
                <g>{squares}</g>
                <g>{targets}</g>
                <g>{pieces}</g>
                <g>{fileLabels}</g>
                <g>{rankLabels}</g>
              </svg>
            </div>
          </div>
        </section>

        <aside className="pane side">
          {/* controls */}
          <div className="card">
            <div className="card-title">controls</div>
            <div className="row">
              <IconBtn icon={<IW />} label="Play as White" onClick={() => game.newGame("w")} />
              <IconBtn icon={<IB />} label="Play as Black" onClick={() => game.newGame("b")} />
              <IconBtn icon={<IResign />} label="Resign" onClick={() => game.resign()} />
              <IconBtn icon={<ITake />} label="Take Back" onClick={() => game.takeBack()} />
              <IconBtn icon={<IFlip />} label="Flip Board" onClick={() => game.flip()} active={snap.flipped} />
            </div>
          </div>

          {/* elo */}
          <div className="card">
            <div className="card-title">elo</div>
            <div className="elo">
              {ELO_LABELS.map((lab, i) => (
                <button key={lab} className={"elo-btn" + (i === snap.level ? " on" : "")}
                  onClick={() => game.setLevel(i)}>{lab}</button>
              ))}
            </div>
          </div>

          {/* laya choices */}
          <div className="card">
            <div className="card-title">laya choices</div>
            <div className="choices">
              {snap.choices.length === 0
                ? <div className="cempty">{snap.gameOver ? "— game over —" : "—"}</div>
                : snap.choices.map((c, i) => (
                  <div className="crow" key={c.san + i}>
                    <span className="ci">{i + 1}</span>
                    <span className="csan">{c.san}</span>
                    <span className={"cscore" + (c.score >= 0 ? " pos" : " neg")}>{fmtScore(c.score)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* moves */}
          <div className="card moves-card">
            <div className="card-title">moves</div>
            <div className="moves">
              {snap.moveList.length === 0
                ? <span className="mempty">no moves</span>
                : snap.moveList.map((row, ri) => (
                  <div className="mrow" key={ri}>
                    <span className="mno">{ri + 1}.</span>
                    {row.map((mv, mi) => (
                      <span key={mi} className={
                        "mtok" + (mv.isMate ? " mate" : mv.isCheck ? " chk" : mv.captured ? " cap" : "")
                      }>{mv.san}</span>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </aside>
      </main>

      {/* footer hint bar */}
      <footer className="ftr">
        <span className="hint"><kbd>n</kbd> new·white</span>
        <span className="hint"><kbd>b</kbd> new·black</span>
        <span className="hint"><kbd>r</kbd> resign</span>
        <span className="hint"><kbd>t</kbd> take-back</span>
        <span className="hint"><kbd>f</kbd> flip</span>
        <span className="hint wide"><kbd>esc</kbd> cancel promo</span>
      </footer>

      {/* promo modal */}
      {snap.promoOpen && (
        <div className="overlay" onPointerDown={() => game.cancelPromo()}>
          <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
            <div className="modal-title">promote to</div>
            <div className="promo-row">
              {PROMO.map((x) => (
                <button key={x.letter} className="promo-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => game.pickPromo(x.letter as "q" | "r" | "b" | "n")}>
                  <Piece code={x.code} size={40} />
                  <span className="plabel">{x.name}</span>
                </button>
              ))}
            </div>
            <button className="cancel-btn" onClick={() => game.cancelPromo()}>cancel</button>
          </div>
        </div>
      )}

      {/* drag ghost */}
      {ghost && ghostPiece && (
        <div className="ghost"
          style={{ left: ghost.x - (boardSize / 8) * 0.45, top: ghost.y - (boardSize / 8) * 0.45 }}>
          <Piece code={pieceCode(ghostPiece)} size={boardSize / 8 * 0.9} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles — single source: palette + FONT from theme.ts. One animation only:
// the modal/overlay pop-in. Everything else is instant.
// ============================================================================
const CSS = `
/* self-hosted JetBrains Mono (terminal monospace); ligatures disabled in .app */
@font-face{font-family:'JetBrains Mono';font-weight:400;font-style:normal;font-display:swap;src:url(/chessed/assets/fonts/jbmono-400.woff2) format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:500;font-style:normal;font-display:swap;src:url(/chessed/assets/fonts/jbmono-500.woff2) format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:700;font-style:normal;font-display:swap;src:url(/chessed/assets/fonts/jbmono-700.woff2) format('woff2')}
:root{
  --bg:${p.bg};--surface:${p.surface};--panel:${p.panel};--border:${p.border};
  --border-focus:${p.borderFocus};--cursor:${p.cursor};--text:${p.text};
  --sub:${p.sub};--dim:${p.dim};--faint:${p.faint};--accent:${p.accent};
  --lav:${p.lav};--peach:${p.peach};--good:${p.good};--warn:${p.warn};
  --bad:${p.bad};--overlay:${p.overlay};
  --font:${FONT};
}
*{box-sizing:border-box}
html,body,#laya-host{height:100%;margin:0;padding:0}
body{background:var(--bg);overflow:hidden}
.app{
  height:100%;display:flex;flex-direction:column;
  background:var(--bg);color:var(--text);
  font-family:var(--font);font-size:14px;line-height:1.5;
  font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0;
  -webkit-font-smoothing:antialiased;user-select:none;
}
.app button{font-family:var(--font)}
.app :focus-visible{outline:none;border-color:var(--border-focus)!important}

/* header */
.hdr{height:40px;flex:0 0 40px;display:flex;align-items:center;gap:12px;
  padding:0 12px;border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.5px}
.bname{font-size:15px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:0 0 auto}
.status{display:flex;align-items:center;gap:8px;color:var(--sub);font-size:13px}
.stext{white-space:nowrap}
.think{color:var(--dim);letter-spacing:2px}
.score{margin-left:auto;font-size:20px;font-weight:700;color:var(--accent)}

/* main split */
.main{flex:1;display:flex;min-height:0}
.pane{border:1px solid var(--border);border-radius:8px;display:flex;flex-direction:column;min-height:0}
.board-pane{flex:1;min-width:0;margin:8px}
.side{width:300px;flex:0 0 300px;margin:8px 8px 8px 0;padding:8px;display:flex;flex-direction:column;gap:8px}
.pane-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--sub);
  padding:6px 10px;border-bottom:1px solid var(--border)}
.board-pane .pane-title{color:var(--text)}
.side .pane-title{color:var(--lav)}
.pane-body{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:8px}

/* board */
.board-wrap{display:flex;align-items:center;justify-content:center}
.board{display:block;overflow:visible;cursor:crosshair}

/* cards */
.card{border:1px solid var(--border);border-radius:8px;background:transparent}
.card-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--lav);
  padding:6px 10px;border-bottom:1px solid var(--border)}
.card .row,.card .elo{padding:8px 10px;display:flex;gap:8px;flex-wrap:wrap}

/* icon buttons + custom tooltip */
.ibtn{position:relative;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;
  background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--sub);cursor:pointer}
.ibtn:hover{color:var(--text);border-color:var(--border-focus)}
.ibtn.on{border-color:var(--accent);color:var(--accent)}
.ibtn .tip{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);
  background:var(--panel);border:1px solid var(--border);border-radius:4px;
  padding:2px 8px;font-size:11px;white-space:nowrap;color:var(--text);
  opacity:0;pointer-events:none;z-index:30}
.ibtn:hover .tip{opacity:1}

/* elo */
.elo-btn{background:transparent;border:1px solid var(--border);border-radius:6px;
  color:var(--sub);font-size:12px;padding:4px 8px;cursor:pointer}
.elo-btn:hover{color:var(--text);border-color:var(--border-focus)}
.elo-btn.on{border-color:var(--accent);color:var(--accent)}

/* laya choices */
.choices{padding:4px 0;max-height:180px;overflow-y:auto}
.crow{display:flex;align-items:center;gap:8px;padding:3px 10px;font-size:12px}
.ci{color:var(--dim);width:16px;text-align:right}
.csan{color:var(--text);flex:1}
.cscore{font-variant-numeric:tabular-nums}
.cscore.pos{color:var(--good)}
.cscore.neg{color:var(--bad)}
.cempty{padding:6px 10px;color:var(--dim);font-size:12px}

/* moves */
.moves-card{flex:1;display:flex;flex-direction:column;min-height:0}
.moves{flex:1;padding:8px 10px;overflow:auto;display:flex;flex-direction:row;flex-wrap:wrap;gap:4px;align-content:flex-start;min-height:0}
.mrow{display:inline-flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap}
.mno{color:var(--dim);width:22px;text-align:right}
.mtok{border:1px solid var(--border);border-radius:4px;padding:1px 6px;color:var(--text)}
.mtok.cap{color:var(--good)}
.mtok.chk{color:var(--warn)}
.mtok.mate{color:var(--bad);border-color:var(--bad)}
.mempty{color:var(--dim)}

/* footer */
.ftr{flex:0 0 28px;height:28px;display:flex;align-items:center;gap:12px;
  padding:0 12px;border-top:1px solid var(--border);font-size:12px;color:var(--dim);overflow:hidden}
.hint{white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.hint kbd{font-family:var(--font);font-size:11px;border:1px solid var(--border);
  border-radius:3px;padding:0 4px;color:var(--sub);background:var(--panel)}

/* modal — the ONLY animation in the app */
.overlay{position:fixed;inset:0;background:var(--overlay);display:flex;
  align-items:center;justify-content:center;z-index:50;
  animation:popin .15s cubic-bezier(.22,1,.36,1)}
@keyframes popin{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.modal{background:var(--panel);border:1px solid var(--border-focus);border-radius:8px;
  padding:8px 16px;display:flex;flex-direction:column;gap:8px;align-items:center}
.modal-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--lav)}
.promo-row{display:flex;gap:8px}
.promo-btn{display:flex;flex-direction:column;align-items:center;gap:2px;
  background:transparent;border:1px solid var(--border);border-radius:6px;
  padding:6px 10px;cursor:pointer;color:var(--sub)}
.promo-btn:hover{border-color:var(--border-focus);color:var(--text)}
.plabel{font-size:11px}
.cancel-btn{background:transparent;border:1px solid var(--border);border-radius:6px;
  color:var(--sub);font-size:12px;padding:4px 12px;cursor:pointer}
.cancel-btn:hover{color:var(--text);border-color:var(--border-focus)}

/* drag ghost */
.ghost{position:fixed;z-index:60;pointer-events:none}

@media (max-width:760px){.side{width:220px;flex-basis:220px}.hint.wide{display:none}}
`;
