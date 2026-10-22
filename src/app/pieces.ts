// Piece textures: loads the 12 PNGs from public/assets/pieces (base-path safe
// because we resolve a relative path against the page location). Returns a
// Promise that settles once every URL has resolved OR failed, so a single
// missing asset never blocks first paint — the board renders with whatever
// loaded and re-renders on the next tick with the rest.
export function loadPieceTextures(): Promise<Record<string, Laya.Texture>> {
  const names = ["p", "n", "b", "r", "q", "k"] as const;
  const keys: string[] = [];
  for (const t of names) keys.push("w" + t, "b" + t);
  const out: Record<string, Laya.Texture> = {};
  const base = (location.href.endsWith("/") ? "" : location.href.slice(0, location.href.lastIndexOf("/") + 1)) + "assets/pieces/";
  const jobs = keys.map((k) => {
    const url = base + k + ".png";
    return Laya.loader
      .load(url, "image")
      .then((res: Laya.Texture) => {
        // loader.load(..., "image") resolves to the Texture itself, not an Image.
        out[k] = res;
      })
      .catch((e: unknown) => console.warn("piece load failed", url, e));
  });
  return Promise.all(jobs).then(() => out);
}
