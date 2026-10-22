// Minimal ambient types for the LayaAir global we actually use (Laya.timer).
// The full lib ships at /chessed/lib/laya.core.js (loaded in index.html, no
// canvas — the rAF render loop runs at module load and drives the timer).
export {};

declare global {
  const Laya: {
    timer: {
      callLater(method: (...args: any[]) => void, target: any, delay: number, args?: any[] | null): void;
      clear(target: any, method: ((...args: any[]) => void) | null): void;
    };
  };
}
