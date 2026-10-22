// Pure chess rules engine. Zero Laya/DOM imports.
// Square = 0..63, rank*8+file, rank 0 = rank 1 (White's home rank at the bottom).

export type Color = "w" | "b";
export type PT = "p" | "n" | "b" | "r" | "q" | "k";
export interface Piece { t: PT; c: Color }
export type Square = number;

export interface Move {
  from: Square;
  to: Square;
  promo?: PT;
  flags?: string; // 'e' en-passant, 'c' castle, 'd' double push
}

interface Snap {
  board: (Piece | null)[];
  turn: Color;
  castle: Castle;
  ep: number;
  half: number;
  full: number;
}

export interface Castle { wk: boolean; wq: boolean; bk: boolean; bq: boolean }

export interface State {
  board: (Piece | null)[];
  turn: Color;
  castle: Castle;
  ep: number; // -1 if none
  half: number; // halfmove clock
  full: number; // fullmove number
  hist: Move[];
  snaps: Snap[]; // undo stack (one entry per applied move)
}

export type Status =
  | "playing" | "check" | "checkmate" | "stalemate"
  | "draw-material" | "draw-50" | "draw-repetition";

// ---------------------------------------------------------------- init

export function initialState(): State {
  const board: (Piece | null)[] = new Array(64).fill(null);
  const back: PT[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let f = 0; f < 8; f++) {
    board[f] = { t: back[f], c: "w" };
    board[8 + f] = { t: "p", c: "w" };
    board[48 + f] = { t: "p", c: "b" };
    board[56 + f] = { t: back[f], c: "b" };
  }
  return {
    board,
    turn: "w",
    castle: { wk: true, wq: true, bk: true, bq: true },
    ep: -1,
    half: 0,
    full: 1,
    hist: [],
    snaps: [],
  };
}

export function cloneState(s: State): State {
  return {
    board: s.board.slice(),
    turn: s.turn,
    castle: { ...s.castle },
    ep: s.ep,
    half: s.half,
    full: s.full,
    hist: s.hist.slice(),
    snaps: s.snaps, // shared by reference for cheap temp clones; apply() never mutates snaps
  };
}

// ---------------------------------------------------------------- geometry

const KNIGHT_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISH_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const rank = (sq: Square) => (sq >> 3) & 7;
const file = (sq: Square) => sq & 7;
const sq = (r: number, f: number) => r * 8 + f;
const inB = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
const other = (c: Color): Color => (c === "w" ? "b" : "w");

// ---------------------------------------------------------------- attack

export function attacked(board: (Piece | null)[], target: Square, by: Color): boolean {
  const r = rank(target), f = file(target);
  // pawns: a 'w' pawn sits one rank BELOW the square it attacks
  const pr = by === "w" ? r - 1 : r + 1;
  for (const df of [-1, 1]) {
    if (inB(pr, f + df)) {
      const p = board[sq(pr, f + df)];
      if (p && p.c === by && p.t === "p") return true;
    }
  }
  for (const [dr, df] of KNIGHT_D) {
    if (inB(r + dr, f + df)) {
      const p = board[sq(r + dr, f + df)];
      if (p && p.c === by && p.t === "n") return true;
    }
  }
  for (const [dr, df] of KING_D) {
    if (inB(r + dr, f + df)) {
      const p = board[sq(r + dr, f + df)];
      if (p && p.c === by && p.t === "k") return true;
    }
  }
  for (const [dr, df] of ROOK_D) {
    let rr = r + dr, ff = f + df;
    while (inB(rr, ff)) {
      const p = board[sq(rr, ff)];
      if (p) {
        if (p.c === by && (p.t === "r" || p.t === "q")) return true;
        break;
      }
      rr += dr; ff += df;
    }
  }
  for (const [dr, df] of BISH_D) {
    let rr = r + dr, ff = f + df;
    while (inB(rr, ff)) {
      const p = board[sq(rr, ff)];
      if (p) {
        if (p.c === by && (p.t === "b" || p.t === "q")) return true;
        break;
      }
      rr += dr; ff += df;
    }
  }
  return false;
}

function findKing(board: (Piece | null)[], c: Color): Square {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.t === "k" && p.c === c) return i;
  }
  return -1;
}

export function inCheck(s: State): boolean {
  const k = findKing(s.board, s.turn);
  return k >= 0 && attacked(s.board, k, other(s.turn));
}

// ---------------------------------------------------------------- generation

export function genPseudo(s: State, color: Color): Move[] {
  const out: Move[] = [];
  const b = s.board;
  const add = (from: Square, to: Square, extra?: Partial<Move>) =>
    out.push({ from, to, ...extra });

  for (let from = 0; from < 64; from++) {
    const p = b[from];
    if (!p || p.c !== color) continue;
    const r = rank(from), f = file(from);

    if (p.t === "p") {
      const dir = color === "w" ? 1 : -1;
      const start = color === "w" ? 1 : 6;
      const promoR = color === "w" ? 7 : 0;
      const one = sq(r + dir, f);
      if (inB(r + dir, f) && !b[one]) {
        if (r + dir === promoR) {
          for (const promo of ["q", "r", "b", "n"] as PT[]) add(from, one, { promo });
        } else {
          add(from, one);
          if (r === start && !b[sq(r + 2 * dir, f)]) add(from, sq(r + 2 * dir, f), { flags: "d" });
        }
      }
      for (const df of [-1, 1]) {
        if (!inB(r + dir, f + df)) continue;
        const to = sq(r + dir, f + df);
        const t = b[to];
        if (t && t.c !== color) {
          if (r + dir === promoR) {
            for (const promo of ["q", "r", "b", "n"] as PT[]) add(from, to, { promo });
          } else add(from, to);
        } else if (to === s.ep && !t) {
          add(from, to, { flags: "e" });
        }
      }
    } else if (p.t === "n") {
      for (const [dr, df] of KNIGHT_D) {
        if (!inB(r + dr, f + df)) continue;
        const to = sq(r + dr, f + df);
        if (!b[to] || b[to]!.c !== color) add(from, to);
      }
    } else if (p.t === "k") {
      for (const [dr, df] of KING_D) {
        if (!inB(r + dr, f + df)) continue;
        const to = sq(r + dr, f + df);
        if (!b[to] || b[to]!.c !== color) add(from, to);
      }
      // castling (path emptiness here; attack checks in legalMoves)
      const home = color === "w" ? 4 : 60;
      if (from === home) {
        const canK = color === "w" ? s.castle.wk : s.castle.bk;
        const canQ = color === "w" ? s.castle.wq : s.castle.bq;
        if (canK && !b[home + 1] && !b[home + 2] && b[home + 3]?.t === "r" && b[home + 3]!.c === color) {
          add(home, home + 2, { flags: "c" });
        }
        if (canQ && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4]?.t === "r" && b[home - 4]!.c === color) {
          add(home, home - 2, { flags: "c" });
        }
      }
    } else {
      const dirs = p.t === "r" ? ROOK_D : p.t === "b" ? BISH_D : KING_D; // q = all 8
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (inB(rr, ff)) {
          const to = sq(rr, ff);
          const t = b[to];
          if (!t) add(from, to);
          else {
            if (t.c !== color) add(from, to);
            break;
          }
          rr += dr; ff += df;
        }
      }
    }
  }
  return out;
}

function kingSafeAfter(b: (Piece | null)[], color: Color): boolean {
  const k = findKing(b, color);
  return k < 0 || !attacked(b, k, other(color));
}

export function legalMoves(s: State): Move[] {
  const color = s.turn;
  const out: Move[] = [];
  for (const m of genPseudo(s, color)) {
    // quick fail: king walks into / through attack
    if (m.flags === "c") {
      const home = color === "w" ? 4 : 60;
      if (attacked(s.board, home, other(color))) continue;
      const mid = (home + m.to) >> 1;
      if (attacked(s.board, mid, other(color))) continue;
    }
    const b = s.board.slice();
    const p = b[m.from]!;
    b[m.to] = m.promo ? { t: m.promo, c: color } : p;
    b[m.from] = null;
    if (m.flags === "e") {
      b[m.to + (color === "w" ? -8 : 8)] = null; // captured pawn
    }
    if (m.flags === "c") {
      const home = color === "w" ? 4 : 60;
      if (m.to > home) { b[home + 1] = b[home + 3]; b[home + 3] = null; }
    }
    if (kingSafeAfter(b, color)) out.push(m);
  }
  return out;
}

export function apply(prev: State, m: Move): State {
  const color = prev.turn;
  const s = cloneState(prev);
  const b = s.board;
  const snap: Snap = {
    board: prev.board,
    turn: prev.turn,
    castle: { ...prev.castle },
    ep: prev.ep,
    half: prev.half,
    full: prev.full,
  };
  s.snaps = prev.snaps.length ? [...prev.snaps, snap] : [snap];
  s.hist = [...prev.hist, m];

  const p = b[m.from]!;
  const cap = b[m.to];
  b[m.to] = m.promo ? { t: m.promo, c: color } : p;
  b[m.from] = null;

  if (m.flags === "e") b[m.to + (color === "w" ? -8 : 8)] = null;
  if (m.flags === "c") {
    const home = color === "w" ? 4 : 60;
    if (m.to > home) { b[home + 1] = b[home + 3]; b[home + 3] = null; }
    else { b[home - 1] = b[home - 4]; b[home - 4] = null; }
  }

  // castling rights
  const c = s.castle;
  if (p.t === "k") {
    if (color === "w") { c.wk = false; c.wq = false; }
    else { c.bk = false; c.bq = false; }
  }
  const strip = (sqIdx: Square, col: Color) => {
    if (col === "w") {
      if (sqIdx === 0) c.wq = false;
      if (sqIdx === 7) c.wk = false;
    } else {
      if (sqIdx === 56) c.bq = false;
      if (sqIdx === 63) c.bk = false;
    }
  };
  if (p.t === "r") strip(m.from, color);
  if (cap && cap.t === "r") strip(m.to, cap.c);

  // en passant target
  s.ep = -1;
  if (p.t === "p" && Math.abs(rank(m.to) - rank(m.from)) === 2) {
    s.ep = sq((rank(m.from) + rank(m.to)) >> 1, file(m.from));
  }

  s.half = p.t === "p" || cap ? 0 : prev.half + 1;
  s.full = color === "b" ? prev.full + 1 : prev.full;
  s.turn = other(color);
  return s;
}

export function undo(s: State): State {
  if (!s.snaps.length) return s;
  const last = s.snaps[s.snaps.length - 1];
  return {
    board: last.board,
    turn: last.turn,
    castle: last.castle,
    ep: last.ep,
    half: last.half,
    full: last.full,
    hist: s.hist.slice(0, -1),
    snaps: s.snaps.slice(0, -1),
  };
}
export function positionKey(s: State): string {
  // FEN-like, excludes move counters
  let rows = "";
  for (let r = 7; r >= 0; r--) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { row += String(empty); empty = 0; }
      row += p.t === "p" ? p.c.toUpperCase() : p.t;
    }
    if (empty) row += String(empty);
    rows += row + "/";
  }
  const c = s.castle;
  const cs = (c.wk ? "K" : "") + (c.wq ? "Q" : "") + (c.bk ? "k" : "") + (c.bq ? "q" : "") || "-";
  const ep = s.ep < 0 ? "-" : "abcdefgh"[file(s.ep)] + String(rank(s.ep) + 1);
  return rows + " " + s.turn + " " + cs + " " + ep;
}

// ---------------------------------------------------------------- status


function insufficientMaterial(b: (Piece | null)[]): boolean {
  const minors: { t: PT; sq: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p.t === "k") continue;
    if (p.t === "p" || p.t === "r" || p.t === "q") return false;
    minors.push({ t: p.t, sq: i });
  }
  if (minors.length <= 1) return true; // K vs K, K+minor vs K
  if (minors.length === 2 && minors.every((m) => m.t === "b")) {
    // K+B vs K+B: draw only when the bishops sit on the same square color
    const parity = (i: number) => ((i >> 3) + (i & 7)) & 1;
    return parity(minors[0].sq) === parity(minors[1].sq);
  }
  return false;
}

export function status(s: State): Status {
  const moves = legalMoves(s);
  const check = inCheck(s);
  if (moves.length === 0) return check ? "checkmate" : "stalemate";
  if (insufficientMaterial(s.board)) return "draw-material";
  if (s.half >= 100) return "draw-50";
  // threefold: count this key through the snap history
  const cur = positionKey(s);
  let count = 1;
  for (const snap of s.snaps) {
    const key = positionKey({
      board: snap.board, turn: snap.turn, castle: snap.castle,
      ep: snap.ep, half: 0, full: 0, hist: [], snaps: [],
    });
    if (key === cur) count++;
  }
  if (count >= 3) return "draw-repetition";
  return check ? "check" : "playing";
}

// ---------------------------------------------------------------- SAN

const FILE_CH = "abcdefgh";

export function san(s: State, m: Move): string {
  const p = s.board[m.from]!;
  let out = "";
  if (p.t !== "p") {
    out = p.t.toUpperCase();
    // disambiguation
    const rivals: Square[] = [];
    for (const other of legalMoves(s)) {
      if (other.to === m.to && other.from !== m.from) {
        const op = s.board[other.from]!;
        if (op.t === p.t) rivals.push(other.from);
      }
    }
    if (rivals.length) {
      const sameFile = rivals.some((r) => file(r) === file(m.from));
      const sameRank = rivals.some((r) => rank(r) === rank(m.from));
      if (!sameFile) out += FILE_CH[file(m.from)];
      else if (!sameRank) out += String(rank(m.from) + 1);
      else out += FILE_CH[file(m.from)] + String(rank(m.from) + 1);
    }
  } else if (file(m.to) !== file(m.from)) {
    out = FILE_CH[file(m.from)]; // pawn capture
  }
  const isCap = s.board[m.to] !== null || (m.flags === "e");
  if (isCap) out += "x";
  out += FILE_CH[file(m.to)] + String(rank(m.to) + 1);
  if (m.promo) out += "=" + m.promo.toUpperCase();
  const after = apply(s, m);
  const st = status(after);
  if (st === "checkmate") out += "#";
  else if (st === "check") out += "+";
  return out;
}

// ---------------------------------------------------------------- material

export function materialDiff(board: (Piece | null)[]): number {
  // positive = advantage for White
  const V: Record<PT, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  let d = 0;
  for (const p of board) {
    if (!p) continue;
    d += p.c === "w" ? V[p.t] : -V[p.t];
  }
  return d;
}
