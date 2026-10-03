# Vesper Reach

A single-player, turn-based 4X grand strategy game in the spirit of the classic space 4X genre.
It is a static web app: TypeScript, Vite, HTML5 Canvas for the galaxy map and plain DOM for the panels.
No backend, no frameworks, no external art. Everything on screen is drawn procedurally.

## Play

Open the GitHub Pages deployment of this repository, or run it locally:

```bash
npm install
npm run dev
```

Then open the printed URL. Saves live in your browser (`localStorage`) and can be exported or imported as JSON from the menu.

| Key | Action |
| --- | --- |
| Enter | End turn |
| E / R / D / P / H / S | Empire, Research, Designer, Diplomacy, Heroes, Senate |
| Esc | Menu, or close the open screen |
| Home | Centre on your capital |
| F | Fit the whole galaxy on screen |
| N | Cycle idle fleets |
| Right-click | Send the selected fleet to a system |

## Development

```bash
npm test        # Vitest suite for the pure game engine
npm run build   # type-check and produce dist/
npm run preview # serve dist/ locally
```

Game data (factions, planet types, anomalies, improvements, hulls, modules, techs, laws, events) is JSON under `data/`.
The engine in `src/engine` has no DOM access; the UI in `src/ui` renders it. See `docs/ARCHITECTURE.md` for the schemas and the milestone plan.

## Deployment

The workflow in `.github/workflows/deploy.yml` builds on every push to `main` and publishes `dist/` to GitHub Pages.
Enable Pages in the repository settings with source "GitHub Actions". The build uses a relative base path, so it works at any Pages URL.

## Status

Milestones 1 to 4 are complete: galaxy generation, the map, systems and planets, colonisation, the five-resource economy, end turn, save/load, research, a ship designer, fleet command limits, three-phase combat with tactic cards and battle reports, sieges and invasions, AI empires at three difficulties, diplomacy with attitudes and treaties, pirates, heroes, a senate with elections and laws, galactic events, faction quest chains, minor factions, and six victory conditions.
Balance, a tutorial overlay and polish follow in milestone 5.
