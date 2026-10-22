// Single color source (tuistore mocha). Laya views and any DOM chrome read from here.
export const palette = {
  bg: "#1e1e2e",
  surface: "#313244",
  panel: "#181825",
  border: "#45475a",
  borderFocus: "#89b4fa",
  cursor: "#3e4869",
  text: "#cdd6f4",
  sub: "#a6adc8",
  dim: "#6c7086",
  accent: "#89b4fa",
  peach: "#fab387",
  good: "#a6e3a1",
  warn: "#f9e2af",
  bad: "#f38ba8",
  overlay: "rgba(0,0,0,0.4)",

  // Board squares (mocha ramp — NOT brown/green)
  boardLight: "#313244",
  boardDark: "#181825",

  // Highlight tints (derived, in-palette)
  lastMove: "rgba(137,180,250,0.35)", // accent #89b4fa tint
  checkGlow: "rgba(255,163,135,0.4)", // peach #fab387-based
  destDot: "rgba(0,0,0,0.25)",
  dragIllegal: "rgba(243,139,168,0.15)", // from --bad
  dragHole: "rgba(0,0,0,0.3)",
} as const;

export const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// Piece point values for the captured tray
export const PIECE_POINTS: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
