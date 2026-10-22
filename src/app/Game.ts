// Game: pure game controller. Owns the chess State plus a UI snapshot that
// React observes via subscribe(). No rendering code here — the React layer
// owns the board SVG and all chrome.
import {
  initialState,
  apply,
  undo,
  legalMoves,
  inCheck,
  san,
  status,
  materialDiff,
  Piece,
  Color,
  State,
  Move,
} from "../chess/engine";
import { pickMove, botChoices, Difficulty } from "../chess/bot";

export type Tone = "accent" | "warn" | "good" | "bad" | "dim";

export interface Choice {
  san: string;
  score: number;
}

export interface MoveLabel {
  san: string;
  captured: boolean;
  isCheck: boolean;
  isMate: boolean;
}

export interface Snap {
  board: (Piece | null)[];
  turn: Color;
  playingAs: Color;
  selected: number;
  targets: number[];
  lastMove: { from: number; to: number } | null;
  checkSq: number;
  flipped: boolean;
  statusText: string;
  statusTone: Tone;
  scoreText: string;
  thinking: boolean;
  gameOver: boolean;
  level: number;
  promo: "q" | "r" | "b" | "n" | null;
  /** True while the promotion picker is open (promoPending set). */
  promoOpen: boolean;
  moveList: MoveLabel[][];
  choices: Choice[];
}

const LEVELS: Difficulty[] = ["easy", "easy", "medium", "hard", "hard"];
export const ELO_LABELS = ["300", "700", "1100", "1500", "1900"];

type Listener = (s: Snap) => void;

function isCapture(board: (Piece | null)[], m: Move): boolean {
  return board[m.to] !== null || (m.flags ?? "").includes("e");
}

export class Game {
  private state: State = initialState();
  private level = 0;
  private playingAs: Color = "w";
  private selected = -1;
  private targets: number[] = [];
  private lastMove: { from: number; to: number } | null = null;
  private checkSq = -1;
  private flipped = false;
  private botTimer: number | undefined;
  private promoPending: Move | null = null;
  private moveList: MoveLabel[][] = [];
  private gameOver = false;
  private statusText = "You play White";
  private statusTone: Tone = "accent";
  private scoreText = "0.0";
  private thinking = false;
  private promo: "q" | "r" | "b" | "n" | null = null;
  private choices: Choice[] = [];
  private snapCache: Snap | null = null;
  private listeners = new Set<Listener>();

  // ---- observer -----------------------------------------------------------
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  snapshot(): Snap {
    // useSyncExternalStore requires a stable reference between notifies;
    // rebuilding a fresh object each call would trip React error #185.
    if (this.snapCache === null) this.rebuildSnapshot();
    return this.snapCache!;
  }

  private rebuildSnapshot(): void {
    this.snapCache = {
      board: this.state.board,
      turn: this.state.turn,
      playingAs: this.playingAs,
      selected: this.selected,
      targets: this.targets,
      lastMove: this.lastMove,
      checkSq: this.checkSq,
      flipped: this.flipped,
      statusText: this.statusText,
      statusTone: this.statusTone,
      scoreText: this.scoreText,
      thinking: this.thinking,
      gameOver: this.gameOver,
      level: this.level,
      promo: this.promo,
      promoOpen: this.promoPending !== null,
      choices: this.choices,
      moveList: this.moveList,
    };
  }

  private notify(): void {
    this.rebuildSnapshot();
    for (const f of this.listeners) f(this.snapCache!);
  }

  // ---- public API ---------------------------------------------------------
  newGame(as?: Color): void {
    this.state = initialState();
    this.playingAs = as ?? this.playingAs;
    this.selected = -1;
    this.targets = [];
    this.lastMove = null;
    this.checkSq = -1;
    this.clearTimer();
    this.promoPending = null;
    this.moveList = [];
    this.gameOver = false;
    this.thinking = false;
    this.promo = null;
    this.choices = [];
    this.settle();
    this.recomputeChoices();
    if (this.playingAs === "b") this.botGo();
    this.notify();
  }

  setLevel(n: number): void {
    this.level = Math.max(0, Math.min(4, n));
    this.recomputeChoices();
    this.notify();
  }

  down(sq: number): void {
    if (this.gameOver || this.thinking) return;
    const p = this.state.board[sq];
    if (p && p.c === this.playingAs) {
      this.selected = sq;
      this.targets = legalMoves(this.state).filter((m) => m.from === sq).map((m) => m.to);
    } else {
      this.selected = -1;
      this.targets = [];
    }
    this.notify();
  }

  up(sq: number): void {
    if (this.gameOver || this.thinking) return;
    if (sq < 0 || this.selected < 0) return;
    if (sq === this.selected) { this.notify(); return; }
    const moves = legalMoves(this.state).filter(
      (m) => m.from === this.selected && m.to === sq,
    );
    if (moves.length === 0) {
      this.selected = -1;
      this.targets = [];
      this.notify();
      return;
    }
    if (moves.length > 1) {
      this.promoPending = moves[0];
      this.promo = null;
      this.notify();
      return;
    }
    this.makeHumanMove(moves[0]);
  }

  pickPromo(c: "q" | "r" | "b" | "n"): void {
    if (!this.promoPending) return;
    const m: Move = { ...this.promoPending, promo: c };
    this.promoPending = null;
    this.promo = null;
    this.makeHumanMove(m);
  }

  cancelPromo(): void {
    if (!this.promoPending) return;
    this.promoPending = null;
    this.promo = null;
    this.selected = -1;
    this.targets = [];
    this.notify();
  }

  resign(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.clearTimer();
    this.thinking = false;
    this.statusText = `You resigned — ${this.playingAs === "w" ? "Black" : "White"} wins`;
    this.statusTone = "warn";
    this.choices = [];
    this.notify();
  }

  flip(): void {
    this.flipped = !this.flipped;
    this.notify();
  }

  takeBack(): void {
    if (this.gameOver || this.thinking) return;
    this.clearTimer();
    let st = this.state;
    for (let i = 0; i < 2 && st.hist.length > 0; i++) {
      st = undo(st);
    }
    this.state = st;
    this.selected = -1;
    this.targets = [];
    this.rebuildMoveList();
    this.settle();
    this.recomputeChoices();
    if (this.playingAs === "b" && !this.gameOver) this.botGo();
    this.notify();
  }

  // ---- internals ----------------------------------------------------------
  private makeHumanMove(m: Move): void {
    const cap = isCapture(this.state.board, m);
    const label = san(this.state, m);
    this.state = apply(this.state, m);
    this.lastMove = { from: m.from, to: m.to };
    this.pushMove(label, cap);
    this.selected = -1;
    this.targets = [];
    this.settle();
    this.recomputeChoices();
    if (!this.gameOver) this.botGo();
    this.notify();
  }

  private botGo(): void {
    this.clearTimer();
    this.thinking = true;
    this.notify();
    const delay = 250 + Math.floor(Math.random() * 450);
    this.botTimer = window.setTimeout(() => {
      this.botTimer = undefined;
      const { move: mv } = pickMove(this.state, LEVELS[this.level], Date.now() & 0xffff);
      const cap = isCapture(this.state.board, mv);
      const label = san(this.state, mv);
      this.state = apply(this.state, mv);
      this.lastMove = { from: mv.from, to: mv.to };
      this.pushMove(label, cap);
      this.thinking = false;
      this.settle();
      this.recomputeChoices();
      this.notify();
    }, delay);
  }

  private clearTimer(): void {
    if (this.botTimer !== undefined) {
      window.clearTimeout(this.botTimer);
      this.botTimer = undefined;
    }
  }

  private pushMove(sanLabel: string, isCap: boolean): void {
    const isCheck = inCheck(this.state);
    const isMate = status(this.state) === "checkmate";
    const entry: MoveLabel = {
      san: sanLabel,
      captured: isCap,
      isCheck,
      isMate,
    };
    const lastRow = this.moveList[this.moveList.length - 1];
    if (lastRow && lastRow.length < 2) lastRow.push(entry);
    else this.moveList.push([entry]);
  }

  private rebuildMoveList(): void {
    this.moveList = [];
    let st = initialState();
    for (let i = 0; i < this.state.hist.length; i++) {
      const mv = this.state.hist[i];
      const label = san(st, mv);
      const cap = isCapture(st.board, mv);
      st = apply(st, mv);
      const entry: MoveLabel = {
        san: label,
        captured: cap,
        isCheck: inCheck(st),
        isMate: status(st) === "checkmate",
      };
      const lastRow = this.moveList[this.moveList.length - 1];
      if (lastRow && lastRow.length < 2) lastRow.push(entry);
      else this.moveList.push([entry]);
      this.lastMove = { from: mv.from, to: mv.to };
    }
  }

  private settle(): void {
    const st = this.state;
    const s = status(st);
    if (s === "checkmate") {
      this.gameOver = true;
      this.thinking = false;
      this.statusText = st.turn === this.playingAs ? "Checkmate — you lose" : "Checkmate — you win";
      this.statusTone = st.turn === this.playingAs ? "bad" : "good";
    } else if (s === "stalemate") {
      this.gameOver = true;
      this.thinking = false;
      this.statusText = "Stalemate — draw";
      this.statusTone = "warn";
    } else if (s === "draw-material" || s === "draw-50" || s === "draw-repetition") {
      this.gameOver = true;
      this.thinking = false;
      this.statusText = `Draw (${s.replace("draw-", "")})`;
      this.statusTone = "warn";
    } else {
      this.gameOver = false;
      const chk = inCheck(st);
      this.checkSq = chk ? this.findKing(st, st.turn) : -1;
      if (this.thinking) {
        this.statusText = "Laya is thinking…";
        this.statusTone = "dim";
      } else if (st.turn === this.playingAs) {
        this.statusText = chk ? "Check!" : `Your move (${st.turn === "w" ? "White" : "Black"})`;
        this.statusTone = chk ? "warn" : "accent";
      } else {
        this.statusText = "Opponent to move";
        this.statusTone = "dim";
      }
    }
    this.scoreText = materialScoreText(materialDiff(this.state.board));
  }

  private recomputeChoices(): void {
    if (this.gameOver) { this.choices = []; return; }
    this.choices = botChoices(this.state, LEVELS[this.level]);
  }

  private findKing(st: State, c: Color): number {
    const bd = st.board;
    for (let i = 0; i < 64; i++) {
      const p = bd[i];
      if (p && p.t === "k" && p.c === c) return i;
    }
    return -1;
  }
}

export function materialScoreText(d: number): string {
  if (d === 0) return "0.0";
  const s = (Math.abs(d) / 2).toFixed(1);
  return d > 0 ? `+${s}` : `-${s}`;
}
