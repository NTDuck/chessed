// Minimal ambient types for the LayaAir 2.x runtime bundle
// (public/lib/laya.core.js + public/lib/laya.webgl_2D.js), loaded via <script>.
//
// We deliberately do NOT use the vendor's full LayaAir.d.ts: it targets the 3.x
// API and fails type-checking under this tsconfig (missing `spine`, `i18n`,
// `WechatMinigame` namespaces, TerrainVector2Set variance, etc.). The chess logic
// (src/chess/*) is strictly typed; only the thin rendering layer is typed against
// the runtime bundle, so we describe just the small surface the app touches.
//
// Global script (no import/export) => `Laya` is available in both value and type
// positions across the project without importing it.

declare namespace Laya {
  // Opaque texture handle handed back by the loader; only ever passed to
  // `new Image(tex)` / stored, never inspected.
  type Texture = unknown;

  class Graphics {
    x: number;
    y: number;
    width: number;
    height: number;
    drawRect(
      x: number,
      y: number,
      w: number,
      h: number,
      fill?: string | null,
      lineWidth?: number,
      lineColor?: string | null,
    ): Graphics;
    drawCircle(
      x: number,
      y: number,
      radius: number,
      fill?: string | null,
      lineWidth?: number,
      lineColor?: string | null,
    ): Graphics;
    drawTexture(
      tex: Texture,
      x: number,
      y: number,
      width: number,
      height: number,
      color?: number,
    ): Graphics;
  }

  class Image extends Graphics {
    constructor(texture?: Texture);
    texture?: Texture;
  }

  class Sprite {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    alpha: number;
    mouseEnabled: boolean;
    graphics: Graphics;
    addChild(node: Sprite | Graphics): Sprite | Graphics | this;
    numChildren: number;
    removeChildAt(index: number): void;
    removeSelf(): void;
    on(type: string, caller: unknown, handler: (...args: unknown[]) => void): void;
    animateTo(props: Record<string, number>, duration?: number): void;
  }

  class Text extends Sprite {}
  class Label extends Sprite {}
  class Scene extends Sprite {}

  const Event: {
    INITED: string;
    MOUSE_DOWN: string;
    MOUSE_UP: string;
    MOUSE_MOVE: string;
    TOUCH_START: string;
    TOUCH_END: string;
    TOUCH_MOVE: string;
  };

  const Stage: { SCALE_NONE: string };

  class Loader {
    load(url: string, type?: string): Promise<Texture>;
  }

  class Timer {
    frameLoop(interval: number, callback: () => void, caller?: unknown): void;
  }

  class StageInstance {
    scaleMode: string;
    bgColor: string | number;
    mouseX: number;
    mouseY: number;
    width: number;
    height: number;
    addChild(node: Sprite | Graphics): void;
    on(type: string, caller: unknown, handler: (...args: unknown[]) => void): void;
    size(width: number, height: number): void;
  }

  const stage: StageInstance;
  const timer: Timer;
  const loader: Loader;
  function init(width?: number, height?: number, type?: boolean | number): Promise<void> | void;
}
