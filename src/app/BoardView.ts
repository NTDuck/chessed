// Laya view layer for the chess board. Pure rendering + pointer handling.
// Never imports the engine; consumes a plain view-model object.
import { palette } from "../theme";

export interface ViewModel {
  board: ({ t: string; c: "w" | "b" } | null)[];
  selected: number; // -1 = none
  targets: { sq: number; capture: boolean }[];
  lastMove: { from: number; to: number } | null;
  checkSq: number; // -1 = none
  flipped: boolean; // true = black on bottom
}

const rank = (sq: number) => (sq >> 3) & 7;
const file = (sq: number) => sq & 7;
/** Remove all children of a node (Laya 3.x has no clearChildren). */
function clearAll(node: Laya.Sprite) {
  while (node.numChildren > 0) node.removeChildAt(0);
}

export class BoardView extends Laya.Sprite {
  private cell = 0;
  private textures: Record<string, Laya.Texture> = {};
  private checkGlow: Laya.Sprite;
  private dragGhost: Laya.Sprite | null = null;
  private dragging: { from: number; sx: number; sy: number; moved: boolean } | null = null;
  private lastVm: ViewModel | null = null;
  /** Canvas bounding rect captured at drag start; maps client→board coords. */
  private dragRect: DOMRect | null = null;

  // pointer hooks, wired by Game
  onDown: ((x: number, y: number) => void) | null = null;
  onMove: ((x: number, y: number) => void) | null = null;
  onUp: ((x: number, y: number) => void) | null = null;

  constructor() {
    super();
    this.mouseEnabled = true;
    this.checkGlow = new Laya.Sprite();
    this.addChild(this.checkGlow);
    this.attachPointer();
  }

  setTextures(t: Record<string, Laya.Texture>) {
    this.textures = t;
  }

  /** side = pixel size of the square board */
  resize(side: number) {
    this.cell = side / 8;
    this.width = side;
    this.height = side;
  }

  /** Native pointer handling. Laya's stage hit-test uses page coordinates and
   *  misses the canvas once it's CSS-offset into a card, so we listen on the
   *  canvas DOM element directly and derive board-local coords from its rect. */
  private attachPointer(): void {
    const c = document.getElementById("layaCanvas");
    if (!c) return;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.dragRect = c.getBoundingClientRect();
      const p = this.localPoint(e.clientX, e.clientY);
      if (p) this.handlePointer(p.x, p.y, "down");
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const p = this.localPoint(e.clientX, e.clientY);
      if (p) this.handlePointer(p.x, p.y, "move");
    });
    window.addEventListener("pointerup", (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      const p = this.localPoint(e.clientX, e.clientY);
      if (p) this.handlePointer(p.x, p.y, "up");
      else this.endDrag();
    });
    // pointercancel (touch interrupt, system gesture) — ghost must not linger
    window.addEventListener("pointercancel", () => {
      if (this.dragging) this.endDrag();
    });
  }

  /** clientX/Y → board-local coords, or null if outside the board. */
  private localPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.dragRect) return null;
    const lx = clientX - this.dragRect.left - this.x;
    const ly = clientY - this.dragRect.top - this.y;
    if (lx < 0 || ly < 0 || lx > this.width || ly > this.height) return null;
    return { x: lx, y: ly };
  }

  /** Instant 180° board-content rotation (no tween). */
  flip() {
    this.rotation = 180;
  }

  private handlePointer(lx: number, ly: number, phase: "down" | "move" | "up") {
    if (phase === "down") {
      this.dragging = { from: this.squareAt(lx, ly), sx: lx, sy: ly, moved: false };
      this.onDown?.(lx, ly);
    } else if (phase === "move") {
      if (this.dragging && Math.abs(lx - this.dragging.sx) + Math.abs(ly - this.dragging.sy) > 0.1 * this.cell) {
        this.dragging.moved = true;
        this.showGhost(this.dragging.from, lx, ly);
      }
      this.onMove?.(lx, ly);
    } else if (phase === "up") {
      // Drop the ghost BEFORE onUp: onUp may trigger a full re-render, which
      // would re-add a live ghost on top of the landed piece.
      this.endDrag();
      this.onUp?.(lx, ly);
    }
  }

  private endDrag() {
    this.dragGhost?.removeSelf();
    this.dragGhost = null;
    this.dragging = null;
  }

  private showGhost(sq: number, lx: number, ly: number) {
    if (!this.dragGhost) {
      this.dragGhost = new Laya.Sprite();
      this.addChild(this.dragGhost);
    }
    const vm = this.lastVm;
    const p = vm ? vm.board[sq] : null;
    const tex = p ? this.textures[p.c + p.t] : null;
    if (tex) {
        clearAll(this.dragGhost);
        const img = new Laya.Sprite();
        img.graphics.drawTexture(tex, 0, 0, this.cell * 0.94, this.cell * 0.94);
        img.width = this.cell * 0.94;
        img.height = this.cell * 0.94;
        img.x = this.cell * 0.03;
        img.y = this.cell * 0.03;
        this.dragGhost.addChild(img);
    }
    this.dragGhost.x = lx - this.cell / 2;
    this.dragGhost.y = ly - this.cell / 2;
    this.dragGhost.alpha = 0.85;
  }

  squareAt(lx: number, ly: number): number {
    const f = Math.floor(lx / this.cell);
    const r = Math.floor(ly / this.cell);
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    const vm = this.lastVm;
    if (!vm) return -1;
    const sf = vm.flipped ? 7 - f : f;
    const sr = vm.flipped ? r : 7 - r;
    return sr * 8 + sf;
  }

  render(vm: ViewModel) {
    this.lastVm = vm;
    const c = this.cell;
    if (c <= 0) return;

    clearAll(this);
    this.addChild(this.checkGlow);

    // squares
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const dark = (r + f) % 2 === 1;
        const g = new Laya.Sprite();
        g.graphics.drawRect(0, 0, c + 0.5, c + 0.5, dark ? palette.boardDark : palette.boardLight);
        g.x = f * c;
        g.y = r * c;
        this.addChild(g);
      }
    }

    // last-move highlight
    if (vm.lastMove) {
      for (const s of [vm.lastMove.from, vm.lastMove.to]) {
        const [f, r] = this.disp(s, vm.flipped);
        const hl = new Laya.Sprite();
        hl.graphics.drawRect(0, 0, c, c, palette.lastMove);
        hl.x = f * c;
        hl.y = r * c;
        this.addChild(hl);
      }
    }

    // check glow (peach radial under king)
    if (vm.checkSq >= 0) {
      const [f, r] = this.disp(vm.checkSq, vm.flipped);
      const holder = new Laya.Sprite();
      holder.graphics.drawCircle(c / 2, c / 2, c * 0.5, palette.checkGlow);
      holder.x = f * c;
      holder.y = r * c;
      clearAll(this.checkGlow);
      this.checkGlow.addChild(holder);
    } else {
      clearAll(this.checkGlow);
    }

    // pieces
    for (let i = 0; i < 64; i++) {
      const p = vm.board[i];
      if (!p) continue;
      const [f, r] = this.disp(i, vm.flipped);
      const tex = this.textures[p.c + p.t];
      if (tex) {
        // Laya.Image is undefined in the UMD bundle; draw the texture into a
        // sprite's graphics instead.
        const img = new Laya.Sprite();
        img.graphics.drawTexture(tex, 0, 0, c * 0.94, c * 0.94);
        img.width = c * 0.94;
        img.height = c * 0.94;
        img.x = f * c + c * 0.03;
        img.y = r * c + c * 0.03;
        this.addChild(img);
      }
    }

    // selection ring + legal-move dots
    if (vm.selected >= 0) {
      const [f, r] = this.disp(vm.selected, vm.flipped);
      const ring = new Laya.Sprite();
      ring.graphics.drawRect(c * 0.06, c * 0.06, c * 0.88, c * 0.88, null, 3, palette.accent);
      ring.x = f * c;
      ring.y = r * c;
      this.addChild(ring);
    }
    for (const t of vm.targets) {
      const [f, r] = this.disp(t.sq, vm.flipped);
      const dot = new Laya.Sprite();
      if (t.capture) {
        dot.graphics.drawCircle(c / 2, c / 2, c * 0.42, null, 3, palette.captureRing);
      } else {
        dot.graphics.drawCircle(c / 2, c / 2, c * 0.14, palette.destDot);
      }
      dot.x = f * c;
      dot.y = r * c;
      this.addChild(dot);
    }

    if (this.dragGhost) this.addChild(this.dragGhost);
  }

  /** square -> (display file col, display row) given orientation */
  private disp(sq: number, flipped: boolean): [number, number] {
    const r = rank(sq);
    const f = file(sq);
    return [flipped ? 7 - f : f, flipped ? r : 7 - r];
  }
}
