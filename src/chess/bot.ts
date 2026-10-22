// Alpha-beta bot over engine.ts. Synchronous; Hard depth-3 + quiescence targets <500 ms.
import {
  State, Move, Color, Piece,
  initialState, cloneState, apply, legalMoves, inCheck, materialDiff,
} from "./engine";

export type Difficulty = "easy" | "medium" | "hard";

// mulberry32 — small deterministic PRNG
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables from White's perspective, index 0..63 (rank 0 = rank 1).
// White tables read directly; Black reads mirrored vertically.
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const mirror = (sq: number) => (7 - (sq >> 3)) * 8 + (sq & 7);

export function evaluate(board: (Piece | null)[], side: Color): number {
  // score from `side`'s perspective
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p: Piece | null = board[i];
    if (!p) continue;
    const v = VAL[p.t] + PST[p.t][p.c === "w" ? i : mirror(i)];
    score += p.c === side ? v : -v;
  }
  return score;
}

function mobility(board: (Piece | null)[], side: Color): number {
  let n = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.c === side) {
      // reuse knight/king offsets cheaply: count via a tiny local ray check is overkill —
      // approximate mobility with knight+king moves only (cheap, bounded signal).
      const r = i >> 3, f = i & 7;
      for (const [dr, df] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
        if (r + dr >= 0 && r + dr < 8 && f + df >= 0 && f + df < 8) {
          const t = board[(r + dr) * 8 + (f + df)];
          if (!t || t.c !== side) n++;
        }
      }
    }
  }
  return n;
}

const MATE = 100000;

function qsearch(s: State, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(s.board, s.turn);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;
  for (const m of legalMoves(s)) {
    if (s.board[m.to] && s.board[m.from]!.t !== "p") continue; // capture extensions only (pawn pushes approximated by capture)
    if (!s.board[m.to] && m.flags !== "e") continue;
    const score = -qsearch(apply(s, m), -beta, -alpha, depth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(s: State, depth: number, alpha: number, beta: number): number {
  if (depth <= 0) return qsearch(s, alpha, beta, 4);
  const moves = legalMoves(s);
  if (moves.length === 0) {
    return inCheck(s) ? -MATE + depth : 0;
  }
  // simple ordering: captures first
  moves.sort((a, b) => (b.to < 64 && s.board[b.to] ? 1 : 0) - (s.board[a.to] ? 1 : 0));
  let best = -Infinity;
  for (const m of moves) {
    const score = -search(apply(s, m), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export function pickMove(state: State, difficulty: Difficulty, seed: number): { move: Move; ms: number } {
  const t0 = Date.now();
  const rng = mulberry32(seed);
  const depth = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
  const moves = legalMoves(state);
  if (moves.length === 0) return { move: moves[0] ?? { from: 0, to: 0 }, ms: Date.now() - t0 };

  let best: Move[] = [moves[0]];
  let bestScore = -Infinity;
  let tie = 0;

  if (difficulty === "easy") {
    // shallow + random tie-break among top half
    const scored = moves.map((m) => ({ m, s: -search(apply(state, m), 1, -Infinity, Infinity) }));
    scored.sort((a, b) => b.s - a.s);
    const cutoff = Math.max(1, Math.floor(scored.length * 0.5));
    best = scored.slice(0, cutoff).map((x) => x.m);
    bestScore = scored[0].s;
    tie = best.length;
  } else {
    for (const m of moves) {
      const score = -search(apply(state, m), depth, -Infinity, Infinity);
      if (score > bestScore) { bestScore = score; best = [m]; tie = 1; }
      else if (score === bestScore) { best.push(m); tie++; }
    }
  }

  // deterministic-with-seed choice among ties
  const idx = tie > 1 ? Math.floor(rng() * tie) : 0;
  return { move: best[idx], ms: Date.now() - t0 };
}

// Convenience for tests: fresh-game bot sanity
export function openingMove(seed = 1): Move {
  return pickMove(initialState(), "medium", seed).move;
}
