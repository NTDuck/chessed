# chessed — web chess

chessed is a browser chess game where you play against an in-app bot. The board is rendered with LayaAir 3.3.13 on canvas, wrapped in a tuistore-inspired Catppuccin-Mocha dark UI, and the opponent is a TypeScript engine running alpha-beta search directly in the page — no server round-trips between moves.

## Features

- Human vs bot: play against an in-app TypeScript engine with alpha-beta search
- LayaAir 3.3.13 canvas rendering of the board
- Tuistore-inspired Catppuccin-Mocha dark theme
- Pure frontend: everything runs in the browser, built with Vite + TypeScript
- Deployable to GitHub Pages as a static sub-path site

<!-- screenshot -->

## Getting Started

```bash
npm i
npm run dev
```

The dev server starts at http://localhost:5173 (served under `/chessed/`).

## Build

```bash
npm run build
```

Type-checks with `tsc`, then emits a production bundle to `dist/`.

## Deploy

Pushing to `master` builds the site and publishes it to GitHub Pages via GitHub Actions at https://NTDuck.github.io/chessed/. The `base: /chessed/` path is set in `vite.config.ts`; no repo name is hardcoded in the workflow.

## Project Structure

```
.
├── .github/workflows/pages.yml  # GitHub Pages deploy workflow
├── assets/                      # static assets
├── research/                    # design/research notes
├── src/                         # Vite + TypeScript app entry & game code
├── index.html                   # HTML entry (Vite)
├── vite.config.ts               # Vite config (base, target, dev server)
├── tsconfig.json                # TypeScript config (strict)
├── package.json
└── LICENSE                      # BSD-3-Clause
```

## License

[BSD-3-Clause](./LICENSE) — see [LICENSE](./LICENSE).
