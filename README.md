# Vesper Reach

A single-player, turn-based 4X grand strategy game in the spirit of the classic space 4X genre, built as a static web app.
TypeScript and Vite, an HTML5 Canvas galaxy map, plain DOM panels, no frameworks, no backend, no external art: every star, lane and planet is drawn procedurally.

Play it on GitHub Pages (this repository's deployment) or run it locally:

```bash
npm install
npm run dev
```

## The game

- **Six original factions**, each with an affinity that bends the rules: the world-consuming Vael, the nomadic Keth who settle with Arks and can uproot whole systems, the pacifist Solenne who cannot declare war, the Mercator who turn every resource into Dust, the industrial Ferron, and the slow-breeding, fast-thinking Oneiri. Each has a lore blurb, traits, a unique hull, a unique improvement and a three-step quest chain.
- **Procedural galaxies** in four shapes and five sizes, joined by star lanes. Systems hold one to six planets of eleven types with sizes, anomalies and strategic or luxury deposits. Hostile planet types unlock through research.
- **Five resources**: Food grows population, Industry builds the queue, Dust pays upkeep and rush-buys, Science drives research, Influence pays for laws and diplomacy. Approval scales everything.
- **Research** across four quadrants and three eras; costs rise with every technology known.
- **Ships and fleets**: seven hull classes with weapon, defence and support slots; a designer for your own blueprints; command-point limits; merge, split, tactic cards, repair.
- **Combat** resolved in three range phases with kinetic, laser and missile weapons against shields, armour and flak, admiral bonuses, tactic counters and a readable battle report. Blockades halve a system's output; invasions land troops against ground defence.
- **AI empires** at three difficulties that explore, settle, research, build, trade, declare war, besiege and invade.
- **Diplomacy** with explained attitudes, peace, trade, research and alliance treaties, tribute demands, gifts, offers and war score.
- **Pirates** who raid undefended colonies, **heroes** with levels and skill trees as governors or admirals, a **senate** with five parties, elections and laws, **galactic events**, and **minor factions** to court or conquer.
- **Six victory conditions**: conquest, supremacy, wonder, science, economic, and score at the turn limit.
- **Saves** in the browser with four slots and JSON export and import; a seed reproduces any galaxy exactly.

## Controls

| Key | Action |
| --- | --- |
| Enter | End turn (asks twice if something looks unattended) |
| E / R / D / P / H / S | Empire, Research, Designer, Diplomacy, Heroes, Senate |
| Esc | Menu, or close the open screen |
| Home | Centre on your capital |
| F | Fit the whole galaxy on screen |
| N | Cycle idle fleets |
| Left-click | Select a star or fleet; drag to pan; wheel to zoom |
| Right-click | Send the selected fleet to a system |

A tutorial overlay guides the first turns of a new game; it can be hidden or replayed from the menu.

## Development

```bash
npm test        # Vitest suite for the engine (determinism, economy, combat, AI, diplomacy, politics, balance)
npm run build   # type-check and produce dist/
npm run preview # serve dist/ locally
```

- `data/` holds all content as JSON (factions, planets, anomalies, deposits, improvements, hulls, modules, techs, laws, events, tactics, heroes, hero skills, quests, minor factions), cross-validated on load.
- `src/engine/` is the game: pure functions over a JSON-serialisable `GameState`, with no DOM access.
- `src/ui/` renders it: the Canvas map and the DOM panels and screens.
- `docs/ARCHITECTURE.md` documents the folder layout, data schemas and every rule by milestone.

## Deployment

`.github/workflows/deploy.yml` runs the tests and the build on every push to `main` and publishes `dist/` to GitHub Pages. In the repository settings, set the Pages source to "GitHub Actions". The build uses a relative base path, so it works at any Pages URL.
