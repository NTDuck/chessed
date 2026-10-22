// Game controller: engine state, bot turns, promotion, rendering glue.
import {
  Color, Move, State, Status, initialState, legalMoves, apply, san, inCheck,
  materialDiff, undo,
} from "../chess/engine";
import { Difficulty, pickMove } from "../chess/bot";
import { BoardView, ViewModel } from "./BoardView";

export interface GameCallbacks {
  onStatus: (text: string, tone: "neutral" | "accent" | "warn" | "good") => void;
  onScore: (text: string) => void;
  onPromo: (choices: ("q" | "r" | "b" | "n")[], pick: (c: "q" | "r" | "b" | "n") => void) => void;
  onBotThinking: (thinking: boolean) => void;
  onMoves?: () => void;
}

const LEVELS: Difficulty[] = ["easy", "easy", "medium", "hard", "hard"]; // 0..4

export class Game {
  private state: State = initialState();
  private level = 2;
  private playingAs: Color = "w";
  private flipped = false;
  private botThinking = false;
  private selected = -1;
  private targets: { sq: number; capture: boolean }[] = [];
  private promoPending: Move[] | null = null;
  private moveList: { n: number; white: string; black: string }[] = [];
  private gameOver = false;
  private botTimer: number | undefined;
  private boardView: BoardView;
  private cb: GameCallbacks;

  constructor(boardView: BoardView, cb: GameCallbacks) {
    this.boardView = boardView;
    this.cb = cb;
  }

  setLevel(level: number) {
    this.level = Math.min(Math.max(level, 0), 4);
  }

  newGame(as: Color) {
    this.state = initialState();
    this.playingAs = as;
    this.selected = -1;
    this.targets = [];
    this.promoPending = null;
    this.moveList = [];
    this.gameOver = false;
    this.flipped = as === "b";
    this.botThinking = false;
    this.botTimer = undefined;
    this.render();
    this.cb.onStatus(as === "w" ? "You play White" : "You play Black", "accent");
    if (as === "b") this.botGo();
  }

  // ---------------- pointer input (from BoardView)

  down(lx: number, ly: number) {
    if (this.botThinking || this.gameOver) return;
    const sq = this.boardView.squareAt(lx, ly);
    if (sq < 0) return;
    const p = this.state.board[sq];
    if (p && p.c === this.playingAs) {
      this.selected = sq;
      this.targets = legalMoves(this.state)
        .filter((m) => m.from === sq)
        .map((m) => ({ sq: m.to, capture: this.state.board[m.to] !== null || m.flags === "e" }));
    } else if (p) {
      // Tapping an opponent piece cancels the current selection.
      this.selected = -1;
      this.targets = [];
    } else if (this.selected < 0) {
      // Empty square with nothing selected: no-op. Keep a pending selection so
      // tap-piece-then-tap-target works (the target's down must not clear it).
    }
    this.render();
  }

  up(lx: number, ly: number) {
    if (this.botThinking || this.gameOver) return;
    if (this.selected < 0) return;
    const sq = this.boardView.squareAt(lx, ly);
    if (sq < 0 || sq === this.selected) return;
    const moves = legalMoves(this.state).filter((m) => m.from === this.selected && m.to === sq);
    if (moves.length === 0) {
      this.selected = -1;
      this.targets = [];
      this.render();
      return;
    }
    if (moves.length > 1) {
      // pawn reached the last rank
      this.promoPending = moves;
      this.cb.onPromo(["q", "r", "b", "n"], (c) => {
        const m = this.promoPending?.find((x) => x.promo === c);
        this.promoPending = null;
        if (m) this.makeHumanMove(m);
      });
      return;
    }
    this.makeHumanMove(moves[0]);
  }

  private makeHumanMove(m: Move) {
    const label = san(this.state, m);
    this.state = apply(this.state, m);
    this.pushMove(label, this.playingAs);
    this.selected = -1;
    this.targets = [];
    this.render();
    if (this.endOfTurn()) return;
    this.botGo();
  }

  private botGo() {
    window.clearTimeout(this.botTimer);
    this.botThinking = true;
    this.cb.onBotThinking(true);
    this.botTimer = window.setTimeout(() => {
      this.botTimer = undefined;
      if (!this.botThinking || this.gameOver) return;
      const { move } = pickMove(this.state, LEVELS[this.level], Date.now() & 0xffff);
      const label = san(this.state, move);
      this.state = apply(this.state, move);
      this.pushMove(label, this.playingAs === "w" ? "b" : "w");
      this.botThinking = false;
      this.render();
      this.cb.onBotThinking(false);
      this.endOfTurn();
    }, 200);
  }

  private pushMove(label: string, side: "w" | "b") {
    const n = this.moveList.length;
    if (side === "w") {
      this.moveList[n] = { n: n + 1, white: label, black: "" };
    } else {
      if (!this.moveList[n]) this.moveList[n] = { n: n + 1, white: "", black: label };
      else this.moveList[n].black = label;
    }
  }

  moveListSnapshot(): { n: number; white: string; black: string }[] {
    return this.moveList;
  }

  private endOfTurn(): boolean {
    const st = this.status();
    if (st !== "playing" && st !== "check") {
      this.gameOver = true;
      this.cb.onStatus(st.replace("-", " "), "warn");
      return true;
    }
    if (st === "check") {
      this.cb.onStatus(this.state.turn === this.playingAs ? "Check!" : "Bot is in check", "warn");
    } else if (this.state.turn === this.playingAs) {
      this.cb.onStatus(this.playingAs === "w" ? "You play White" : "You play Black", "accent");
    }
    return false;
  }

  private status(): Status {
    const moves = legalMoves(this.state);
    if (moves.length === 0) return inCheck(this.state) ? "checkmate" : "stalemate";
    if (this.state.half >= 100) return "draw-50";
    return inCheck(this.state) ? "check" : "playing";
  }

  // ---------------- rendering

  render() {
    let checkSq = -1;
    if (inCheck(this.state)) {
      const c = this.state.turn;
      for (let i = 0; i < 64; i++) {
        const p = this.state.board[i];
        if (p && p.t === "k" && p.c === c) { checkSq = i; break; }
      }
    }
    const vm: ViewModel = {
      board: this.state.board,
      selected: this.selected,
      targets: this.targets,
      lastMove: this.state.hist.length
        ? { from: this.state.hist[this.state.hist.length - 1].from, to: this.state.hist[this.state.hist.length - 1].to }
        : null,
      checkSq,
      flipped: this.flipped,
    };
    this.boardView.render(vm);
    this.cb.onScore(materialScoreText(materialDiff(this.state.board)));
    this.cb.onMoves?.();
  }

  resign() {
    if (this.gameOver) return;
    this.gameOver = true;
    window.clearTimeout(this.botTimer);
    this.botTimer = undefined;
    this.botThinking = false;
    this.cb.onStatus("You resigned — bot wins", "warn");
  }

  flip() {
    this.flipped = !this.flipped;
    this.render();
  }

  takeBack() {
    if (this.botThinking) { window.clearTimeout(this.botTimer); this.botTimer = undefined; this.botThinking = false; }
    const n = this.state.turn === this.playingAs ? 2 : 1;
    for (let i = 0; i < n && this.state.snaps.length > 0; i++) this.state = undo(this.state);
    this.gameOver = false;
    this.selected = -1;
    this.targets = [];
    this.promoPending = null;
    this.rebuildMoveList();
    this.render();
    this.cb.onStatus(this.playingAs === "w" ? "You play White" : "You play Black", "accent");
  }

  // Re-derive moveList from the (possibly shortened) history so it stays in
  // sync after takeBack. SAN is recomputed by replaying from the initial state.
  private rebuildMoveList() {
    const list: { n: number; white: string; black: string }[] = [];
    let s = initialState();
    for (const m of this.state.hist) {
      const label = san(s, m);
      const nn = s.full;
      if (s.turn === "w") {
        if (!list[nn - 1]) list[nn - 1] = { n: nn, white: label, black: "" };
        else list[nn - 1].white = label;
      } else {
        if (!list[nn - 1]) list[nn - 1] = { n: nn, white: "", black: label };
        else list[nn - 1].black = label;
      }
      s = apply(s, m);
    }
    this.moveList = list;
  }
}

export function materialScoreText(diff: number): string {
  const v = Math.abs(diff);
  if (v === 0) return "0.0";
  return (v / 100).toFixed(1);
}
