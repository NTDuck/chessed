import { evaluate } from "./bot";
import {
  State, Move, Color, Piece, PT,
  apply, legalMoves, inCheck, status, san,
} from "./engine";

const MATE = 100000;

// Shallow depth keeps classify/candidates responsive in the UI.
// (pickMove's full-depth search in bot.ts is untouched.)
const SHALLOW_DEPTH = 3;

// ---------------------------------------------------------------- FEN

// Parse a standard FEN into a fresh State (empty hist/snaps).
export function fenToState(fen: string): State {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split("/");
  const board: (Piece | null)[] = new Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (ch >= "1" && ch <= "8") { f += Number(ch); continue; }
      const isWhite = ch === ch.toUpperCase();
      board[(7 - r) * 8 + f] = { t: ch.toLowerCase() as PT, c: isWhite ? "w" : "b" };
      f++;
    }
  }
  const turn: Color = parts[1] === "b" ? "b" : "w";
  const castlingTok = parts[2] ?? "-";
  const castle = {
    wk: castlingTok.includes("K"),
    wq: castlingTok.includes("Q"),
    bk: castlingTok.includes("k"),
    bq: castlingTok.includes("q"),
  };
  const epTok = parts[3] ?? "-";
  let ep = -1;
  if (epTok !== "-" && epTok.length === 2) {
    ep = (Number(epTok[1]) - 1) * 8 + (epTok.charCodeAt(0) - 97);
  }
  const half = parts[4] ? Number(parts[4]) : 0;
  const full = parts[5] ? Number(parts[5]) : 1;
  return { board, turn, castle, ep, half, full, hist: [], snaps: [] };
}

// ---------------------------------------------------------------- search

// Thin shallow negamax around bot.evaluate (mirrors bot.search, no quiescence).
// Returns the score from the side-to-move's perspective.
function nega(s: State, depth: number, alpha: number, beta: number): number {
  if (depth <= 0) return evaluate(s.board, s.turn);
  const moves = legalMoves(s);
  if (moves.length === 0) return inCheck(s) ? -MATE + depth : 0;
  moves.sort((a, b) => (s.board[b.to] ? 1 : 0) - (s.board[a.to] ? 1 : 0));
  let best = -Infinity;
  for (const m of moves) {
    const sc = -nega(apply(s, m), depth - 1, -beta, -alpha);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// White-perspective centipawns (positive = white better) at `depth`.
function evalWhite(s: State, depth: number): number {
  const sc = nega(s, depth, -Infinity, Infinity);
  return s.turn === "w" ? sc : -sc;
}

// White-perspective score of every legal move, best first.
function scoreMoves(s: State, depth: number): { m: Move; cp: number }[] {
  const out = legalMoves(s).map((m) => {
    const sc = -nega(apply(s, m), depth, -Infinity, Infinity);
    return { m, cp: s.turn === "w" ? sc : -sc };
  });
  out.sort((a, b) => b.cp - a.cp);
  return out;
}

// ---------------------------------------------------------------- API

export function analyzePosition(fen: string): { evalCp: number; bestMoveSan: string } {
  const s = fenToState(fen);
  const scored = scoreMoves(s, SHALLOW_DEPTH);
  if (!scored.length) return { evalCp: evalWhite(s, SHALLOW_DEPTH), bestMoveSan: "" };
  return { evalCp: scored[0].cp, bestMoveSan: san(s, scored[0].m) };
}

export function candidateMoves(fen: string, depth: number = SHALLOW_DEPTH): { san: string; scoreCp: number }[] {
  const s = fenToState(fen);
  return scoreMoves(s, depth).slice(0, 8).map((x) => ({ san: san(s, x.m), scoreCp: x.cp }));
}

export function classifyMove(
  fenBefore: string,
  moveSan: string,
): { symbol: string; label: string; tone: "good" | "warn" | "bad" | "brilliant"; deltaCp: number } {
  const s = fenToState(fenBefore);
  const moves = legalMoves(s);
  const played = moves.find((m) => san(s, m) === moveSan);
  if (!played) throw new Error(`classifyMove: "${moveSan}" is not a legal move at ${fenBefore}`);

  // Best-available move at fenBefore (white perspective).
  const best = scoreMoves(s, SHALLOW_DEPTH)[0];
  const bestCp = best ? best.cp : evalWhite(s, SHALLOW_DEPTH);

  // Eval the position after the played move (white perspective).
  const after = apply(s, played);
  const afterCp = evalWhite(after, SHALLOW_DEPTH);

  // How much worse the played move is than best, from the mover's view (positive = worse).
  const deltaCp = s.turn === "w" ? bestCp - afterCp : afterCp - bestCp;

  const isCapture = s.board[played.to] !== null || played.flags === "e";
  const isMate = status(after) === "checkmate";
  const brilliant = deltaCp <= 15 && (isCapture || isMate);

  if (brilliant) return { symbol: "!!", label: "Brilliant move", tone: "brilliant", deltaCp };
  if (deltaCp <= 15) return { symbol: "★", label: "Best/Great move", tone: "good", deltaCp };
  if (deltaCp <= 40) return { symbol: "?", label: "Inaccuracy", tone: "warn", deltaCp };
  if (deltaCp <= 80) return { symbol: "??", label: "Bad move", tone: "bad", deltaCp };
  return { symbol: "???", label: "Blunder", tone: "bad", deltaCp };
}
