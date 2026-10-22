// One-shot codegen: emit src/app/pieces.tsx from the 12 piece SVG assets.
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "assets", "pieces");
const names = ["wP","wN","wB","wR","wQ","wK","bP","bN","bB","bR","bQ","bK"];
const inner = {};
for (const n of names) {
  const raw = fs.readFileSync(path.join(dir, n + ".svg"), "utf8");
  const m = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!m) throw new Error("no svg body for " + n);
  inner[n] = m[1].replace(/\s+$/, "");
}
const js = JSON.stringify(inner, null, 2);
const out = `// Piece SVGs as inline React components (viewBox 0 0 45 45), generated from
// assets/pieces/*.svg - the canonical piece artwork, verbatim.
import type { JSX } from "react";

const INNER: Record<string, string> = ${js};

export type PieceCode = "wP" | "wN" | "wB" | "wR" | "wQ" | "wK" | "bP" | "bN" | "bB" | "bR" | "bQ" | "bK";

export function Piece({ code, size, className }: { code: PieceCode; size?: number | string; className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 45 45"
      className={"pc " + (className ?? "")}
      style={{ width: size ?? "100%", height: size ?? "100%", display: "block", overflow: "visible" }}
      dangerouslySetInnerHTML={{ __html: INNER[code] }}
    />
  );
}
`;
fs.writeFileSync(path.join(__dirname, "..", "src", "app", "pieces.tsx"), out);
console.log("pieces.tsx written:", out.length, "bytes");
