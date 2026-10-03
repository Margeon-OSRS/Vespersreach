# Vesper Reach: architecture and data schemas

## Folder layout

```
Paths are relative to the repository root.
index.html              Vite entry page
vite.config.ts          Vite + Vitest config; base './' for GitHub Pages
data/                   All game content as JSON (see schemas below)
src/main.ts             Boots the UI
src/engine/             Pure game logic. No DOM, no globals, fully serialisable state.
  types.ts              Every data and state type
  rng.ts                Seeded mulberry32 RNG with fork() for independent streams
  names.ts              Procedural star and ship names
  data.ts               Loads and cross-validates the JSON; id lookup tables
  galaxyLayout.ts       Star placement per shape; MST + extra non-crossing lanes
  galaxy.ts             Systems, planets, home systems
  graph.ts              Lane adjacency, Dijkstra paths, hop distances
  economy.ts            System and empire reports: FIDSI output, approval, upkeep, growth
  build.ts              Build queue actions, availability, rush-buy
  fleetActions.ts       Movement orders, exploration, colonisation, uprooting
  turn.ts               End-turn pipeline
  game.ts               New game setup
  save.ts               Save file format and validation
  research.ts           Research queue and tech unlocks
  designs.ts            Ship blueprints: stats, validation, auto-fit defaults
  fleets.ts             Command points, merge/split, tactics, repair
  combat.ts             Three-phase battle resolver with reports
  siege.ts              Blockades and ground invasion
  war.ts                War/peace relations
  diplomacy.ts          Attitudes, treaties, offers, war score, strength
  ai.ts aiDiplomacy.ts aiFleets.ts   AI empires: research, builds, diplomacy, heroes, fleets
  pirates.ts            Corsair spawning, raids, bounties
  heroes.ts             Hero market, assignment, skills, experience
  politics.ts           Senate support, elections, laws, empire-wide effects
  events.ts quests.ts   Galactic events; per-faction quest chains
  minors.ts             Minor factions: placement, goodwill, assimilation
  victory.ts            Score and the six victory conditions
  empireFactory.ts      One place that builds a complete Empire record
  __tests__/            Vitest suites
src/ui/                 Browser presentation
  app.ts                App shell: selection, screens, keyboard, rendering
  map.ts                Canvas galaxy map with zoom, pan, picking
  panels.ts             System panel; buildPanel.ts build queue; fleetPanel.ts fleets
  researchScreen.ts designerScreen.ts diplomacyScreen.ts heroesScreen.ts senateScreen.ts
  warScreens.ts (battle reports) victoryScreen.ts empireExtras.ts minorPanel.ts
  topbar.ts screens.ts menu.ts storage.ts planetArt.ts dom.ts styles.css
docs/                   This document
.github/workflows/      GitHub Pages deployment
```

## Principles

- The engine mutates a single `GameState` object and never touches the DOM. Every action is a function `(state, data, ...args) => string | null` that returns an error message or null.
- `GameState` is plain JSON: arrays and objects only, so saves are `JSON.stringify(state)` and tests compare serialised states for determinism.
- All randomness comes from `Rng` seeded by the galaxy seed. Sub-systems take `rng.fork(label)` so adding a random call in one place does not reshuffle the others.
- Content lives in `data/*.json`, validated on load by `validateData`, which checks every cross-reference (tech prerequisites, unlock ids, faction uniques).

## Data schemas (data/*.json)

Types are declared in `src/engine/types.ts`; this is the summary.

| File | Shape |
| --- | --- |
| factions.json | `FactionDef { id, name, demonym, blurb, affinity{id,name,description}, traits[{name,description}], modifiers, uniqueHull, uniqueImprovement, colours{primary,secondary}, homePlanet, shipPrefix, startingDust }` |
| planets.json | `PlanetTypeDef { id, name, description, tier, yieldsPerPop{food,industry,dust,science,influence}, basePop, approval, palette[3], weight }` |
| anomalies.json | `AnomalyDef { id, name, description, modifiers{partial FIDSI}, approval?, popBonus?, weight }` |
| deposits.json | `DepositDef { id, name, kind: strategic\|luxury, description, colour, weight }` |
| improvements.json | `ImprovementDef { id, name, description, cost, upkeep, effects[], requires?, unique?, hidden?, capitalOnly?, factionOnly? }` |
| hulls.json | `HullDef { id, name, class, description, cost, hp, speed, commandPoints, slots{weapon,defence,support}, roles?[explore\|outpost\|ark], cargoPop?, requires?, factionOnly? }` |
| modules.json | `ModuleDef { id, name, slot, kind, description, cost, stats{}, requires? }` |
| techs.json | `TechDef { id, name, quadrant, era, cost, description, prerequisites[], unlocks{improvements?,hulls?,modules?,planetTier?,laws?} }` |
| laws.json | `LawDef { id, name, ideology, description, cost, upkeep, effects[] }` |
| events.json | `EventDef { id, name, description, weight, minTurn, duration, effects[] }` |

`Effect` is the shared modifier shape: `{ resource?, flat?, perPop?, percent?, approval?, growth?, shipCost? }`.
`FactionModifiers` holds percent bonuses per resource plus rule switches: `cannotOutpost`, `instantColony`, `depletionEvery`, `pacifist`, `dustPerOutput`.

## Game state

```
GameState { version, settings, turn, galaxy{width,height,systems[],lanes[]}, empires[], fleets[], playerEmpireId, nextId, notifications[] }
StarSystem { id, name, x, y, starClass, planets[], ownerId, improvements[], buildQueue[], growthStock, lastOutput, lastApproval }
Planet     { id, type, size, anomalyId, depositId, maxPop, pop, status: none|outpost|colony, outpostTurns }
Lane       { a, b, length }            length in lane units (pixels / 40); ships move `speed` units per turn
Fleet      { id, ownerId, name, systemId | null, transit{from,to,progress} | null, path[], ships[] }
Ship       { id, hullId, name, hp, cargoPop }
Empire     { id, factionId, name, colour, isPlayer, homeSystemId, dust, influence, science, techs[], planetTier,
             exploredSystems[], knownSystems[], approval, lastTotals, eliminated }
BuildItem  { id, kind: improvement|ship, defId, cost, progress }
```

## Economy rules (milestone 1)

- A settled planet yields `pop × yieldsPerPop`; outposts yield half. Anomalies add flat modifiers; luxury deposits add 2 Dust and 5 approval, strategic deposits add 1 Industry. Every owned system adds 1 Influence.
- Improvements add `flat`, `perPop × system pop` and `percent`. Faction percent modifiers apply after that. Approval then multiplies everything: below 20 ×0.6, below 40 ×0.8, 40–59 ×1, 60–79 ×1.1, 80+ ×1.2.
- Approval starts at 50, adds planet-type and anomaly values, improvement effects and faction modifiers, loses 3 per system beyond five, 15 while the treasury is negative, and 10 for five turns after a pirate raid.
- Food net = food − population. Positive net (scaled by growth bonuses) fills a growth stock; at `16 + 8 × pop` a new citizen is born on the colony with most room. A negative stock of the same size costs a citizen.
- Industry feeds the head of the build queue; overflow carries to the next item; leftover with an empty queue becomes Dust at half value. Rush-buy costs twice the remaining industry in Dust.
- Dust upkeep: improvement upkeep plus `max(1, hull cost / 40)` per ship. Science and Influence stockpile until milestones 2 and 4 spend them.
- Outposts become colonies after 6 turns. Ships can only be built at a colony. The Keth build Arks that found colonies instantly and may uproot a whole system back into an Ark. The Vael lose one max population on every settled planet every 15 turns.

## End-turn pipeline (`turn.ts`)

1. Fleets move along their path, spending `min(ship speed)` lane units; arrivals explore the system and reveal neighbours (explorer hulls also explore the neighbours).
2. For every empire and owned system: compute the report, apply growth, promote outposts, spend industry on the queue, apply depletion.
3. Empire stocks update; notifications for the player are collected; the turn counter increments.

## Milestones

1. Galaxy generation, map, systems, colonisation, FIDSI economy, end turn, save/load. **Done.**
2. Research tree, improvements by tech, ship designer, fleets (merge/split, command points), movement, combat with tactic cards and reports, orbital siege, invasion. **Done.**
3. AI empires, diplomacy (attitudes, treaties, demands, war score), pirates, heroes. **Done.**
4. Politics and laws, events, quest chains, minor factions, victory conditions. **Done.**
5. Balance pass, tutorial overlay, polish, tests, README. **Done.**

## Milestone 2 rules

- **Research.** Science flows into the current tech; when none is selected it stockpiles and is spent the moment one is chosen. Every technology already known makes the next 30% dearer (`cost × (1 + 0.3 × techs known)`), so a full tree takes most of a 200-turn game. Completing a tech grants its unlocks (hulls, modules, improvements, planet tier) and refreshes stock ship designs.
- **Designs.** A design is a hull plus modules that fit its weapon/defence/support slots. Stats: weapons (kind, damage, accuracy), shields (absorb laser damage each phase), armour (reduces kinetic and missile damage by `100/(100+armour)`), flak (chance to shoot down each incoming missile, capped 80%), speed, repair, troops. Cost = hull + modules; upkeep = `max(1, cost/40)` Dust.
- **Fleets.** Command points per hull; a fleet may hold `6 + 2 × military techs` points. New ships join an idle fleet with room or start a new one. Fleets merge or split while parked. Ships repair 20% per turn at a friendly system plus repair modules anywhere.
- **Combat.** Triggered after movement wherever warring empires share a system. Three simultaneous phases (long, medium, close); missiles are strongest at long range, kinetics at close range, lasers in the middle. Each side's tactic card modifies damage, accuracy, evasion or shields and gains +15% damage when it counters the enemy card. Destroyed ships leave the fleet; battle reports keep the last 30.
- **Sieges and invasion.** An armed fleet at war with a system's owner, with no armed defenders present, blockades it: output halves and construction stops. Ground defence is `pop × 2 + 4 for a capital + 0.5 per improvement`, decaying 10% per siege turn. An invasion rolls fleet troops against that defence (both ±20%); success transfers the system and costs the besieged world a citizen.
- **Relations.** Milestone 2 ships a minimal war/peace toggle (peace is always accepted). Attitudes, treaties and war score come with milestone 3.

## Milestone 3 rules

- **AI empires** act at the start of every end turn with a seeded RNG fork, so games stay reproducible. Each AI researches the cheapest available tech weighted toward its affinity, keeps one settler and one explorer in play while it has room to grow (`4 + turn/20` systems), queues improvements by need (food, approval, then a fixed priority list), and builds warships toward `(2 + turn/15 + 2 × extra systems) × difficulty factor` while its income is positive. In debt it stops queuing upkeep-bearing buildings and scraps a warship.
- **AI fleets** split settlers and explorers out of mixed fleets, send explorers to the nearest unexplored known system, settle the best explored system within six jumps (room divided by distance), defend threatened systems, invade when a siege is established and troops exceed ground defence, hunt nearby pirates when clearly stronger, and otherwise rally and merge at home.
- **Difficulty**: AI output −15% / 0 / +25% (easy / normal / hard); starting techs and home guards; aggression unlocked from turn 30 on normal and 15 on hard, never on easy; pirate spawns every 16 / 12 / 9 turns.
- **Attitude** is a sum of reasons: remembered deeds (decays one point per turn), pacifist outlook, kindred affinity, contested borders, envy of expansion, warmongering, treaties, war, and difficulty. Labels: Hostile below −40, Cold below −10, Neutral, Warm above 10, Friendly above 40.
- **Treaties**: peace, trade (+4 Dust per turn per partner), research (+4 science), alliance (status with +30 attitude), tribute demands. Proposals to an AI cost influence and are judged immediately on attitude, war score and strength; AI proposals to the player become offers that expire after ten turns. Cancelling a treaty costs 20 attitude; gifts of 50 Dust earn 12. Declaring war costs 30 attitude with the victim (50 if allied) and 5 with everyone else.
- **War score** moves with damage dealt in battles and captured systems; AIs sue for peace when losing, when a war has dragged on, or when attitude recovers.
- **Pirates** are a permanent empire at war with everyone. Raiders spawn at an unowned system at least two jumps from civilisation, grow with the turn count, raid undefended colonies for 10% of the owner's Dust (−10 approval for five turns) and move on. Each Corsair ship destroyed pays a 15 Dust bounty.
- **Heroes** are hired from a three-slot academy (Dust plus 10 influence; one slot rotates every 15 turns) and cost 3 Dust upkeep. Governors add their skill effects plus +2% output per level to their system; admirals add damage, accuracy, evasion, shields, damage reduction and speed to their fleet and gain 8 experience per battle. Experience thresholds are `25 × level^1.5`; each level grants one skill point spent on a tiered tree.
- **Elimination**: an empire with no systems and no settler-capable ship is eliminated.

## Milestone 4 rules

- **Senate.** Five parties (industrialist, mercantile, scientific, pacifist, militarist) share 100% support. Support drifts each turn toward what the empire does (queued buildings, Dust income and treaties, research, peace, wars and warships) and back toward the faction's natural lean. Elections every 20 turns seat the largest party, whose bonus applies empire-wide; laws of any party below 8% are repealed.
- **Laws** cost influence to pass and influence per turn to keep; at most three are active. A law needs its party to rule or hold 15% support, plus any tech it requires. If influence runs out, the newest law is repealed.
- **Events** start with a 7% chance per empire per turn (at most two active) and apply empire-wide effects for their duration.
- **Quests** are a three-step chain per faction (explore, hold systems, research, build, field warships, win battles, bank Dust, reach population, recruit, pass a law). Each step pays Dust, influence or science on completion.
- **Minor factions** hold one system each (one per twelve systems in the galaxy), guarded by a few corvettes. Envoys (15 influence, +20) and gifts (40 Dust, +15) raise goodwill, which fades one point every other turn; at 100 the faction can be assimilated: its system and people join the empire and its boon applies empire-wide. They can instead be conquered by siege and invasion, without the boon. AI empires also court minors they have found.
- **Victory**, checked at the end of every turn, in priority order: conquest (every rival eliminated), supremacy (hold every founding capital), wonder (build the Vesper Beacon, unlocked by Grand Design), science (every technology), economic (Dust stock of 6000 to 15000 by galaxy size), and score when the turn limit is reached. Score = systems × 10 + population × 3 + techs × 5 + Dust / 50 + warships × 2 + heroes × 5 + laws × 5 + assimilated × 10 + battles won × 2. The game continues after a victory if you wish.

## Milestone 5: balance and polish

- Simulated 200-turn AI-only games on normal and hard drove the tuning: research scaling (above), the softer expansion penalty, slower early growth, AI war thresholds (`-20` attitude on normal, `-5` on hard, with an extra push against bordering empires) and AI approval defence (approval buildings below 55, approval laws below 50, no further expansion below 40, dismantling upkeep buildings when more than 100 Dust in debt).
- `src/engine/__tests__/balance.test.ts` keeps those properties: no victory before turn 80 on normal, every AI solvent with approval of at least 30, and at least one war within 150 turns on hard.
- A tutorial overlay walks a new player through selecting the capital, queuing a build, choosing research, moving the scout, founding an outpost and ending the turn; it auto-advances as each is done, can be hidden, and is replayable from the menu.
- Ending the turn with no research, idle fleets, empty colony queues or unanswered offers asks for a second Enter. The top bar shows the current research with turns remaining and a badge for waiting offers.
