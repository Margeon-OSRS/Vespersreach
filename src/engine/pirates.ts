import { index } from './data';
import { ensureDefaultDesigns } from './designs';
import { makeEmpire } from './empireFactory';
import { designFor, spawnShip } from './fleetActions';
import { fleetIsArmed } from './fleets';
import { hopDistances, neighbours, shortestPath } from './graph';
import type { Rng } from './rng';
import { getEmpire } from './state';
import type { Difficulty, Empire, GameData, GameState, Notification, StarSystem } from './types';


export const PIRATE_ID = 'emp_pirates';
export const PIRATE_BOUNTY = 15;
export const RAID_APPROVAL_TURNS = 5;

const SPAWN: Record<Difficulty, { first: number; every: number; extra: number }> = {
  easy: { first: 14, every: 16, extra: 0 }, normal: { first: 8, every: 12, extra: 0 }, hard: { first: 6, every: 9, extra: 1 },
};

export function ensurePirateEmpire(state: GameState, data: GameData): Empire {
  let pirates = state.empires.find((e) => e.id === PIRATE_ID);
  if (pirates) return pirates;
  const faction = index(data).faction.corsairs;
  pirates = makeEmpire(PIRATE_ID, faction, data, { isPirate: true, techs: ['warship_frames'], dust: 0 });
  ensureDefaultDesigns(data, pirates);
  state.empires.push(pirates);
  return pirates;
}

/** Hop distance from every system to the nearest owned system. */
function distanceToCivilisation(state: GameState): Record<string, number> {
  const owned = state.galaxy.systems.filter((s) => s.ownerId).map((s) => s.id);
  const best: Record<string, number> = {};
  for (const id of owned) {
    const d = hopDistances(state.galaxy.lanes, id);
    for (const [k, v] of Object.entries(d)) if (best[k] === undefined || v < best[k]) best[k] = v;
  }
  return best;
}

type Note = (empireId: string, n: Omit<Notification, 'turn'>) => void;

export function spawnPirates(state: GameState, data: GameData, rng: Rng, note: Note): void {
  const cfg = SPAWN[state.settings.difficulty] ?? SPAWN.normal;
  if (state.turn < cfg.first || (state.turn - cfg.first) % cfg.every !== 0) return;
  const pirates = ensurePirateEmpire(state, data);
  const dist = distanceToCivilisation(state);
  const player = getEmpire(state, state.playerEmpireId);
  const candidates = state.galaxy.systems.filter((s) => !s.ownerId && (dist[s.id] ?? 99) >= 2 && !state.fleets.some((f) => f.systemId === s.id));
  if (!candidates.length) return;
  const lair = rng.weighted(candidates, (s) => (player.exploredSystems.includes(s.id) ? 3 : 1));
  const size = 1 + Math.floor(state.turn / 20) + cfg.extra;
  let fleet = null;
  for (let i = 0; i < size; i++) fleet = spawnShip(state, data, pirates, lair, designFor(data, pirates, i === 0 ? 'lance' : 'dagger'));
  if (fleet) fleet.name = `Corsair Raiders ${state.fleets.filter((f) => f.ownerId === PIRATE_ID).length}`;
  pirates.knownSystems = state.galaxy.systems.map((s) => s.id);
  pirates.exploredSystems = pirates.knownSystems.slice();
  if (player.exploredSystems.includes(lair.id)) note(player.id, { kind: 'pirate', text: `Corsair raiders have gathered at ${lair.name}.`, systemId: lair.id, fleetId: fleet?.id });
}

function raid(state: GameState, system: StarSystem, note: Note): void {
  const owner = getEmpire(state, system.ownerId!);
  const loot = Math.min(Math.max(10, Math.round(owner.dust * 0.1)), Math.max(0, owner.dust));
  owner.dust -= loot;
  system.raidedTurn = state.turn;
  note(owner.id, { kind: 'pirate', text: `Corsairs raided ${system.name} and carried off ${loot} Dust.`, systemId: system.id });
}

/** Pirate fleets raid undefended colonies, then move toward the next nearest one. */
export function runPirates(state: GameState, data: GameData, rng: Rng, note: Note): void {
  for (const fleet of state.fleets.filter((f) => f.ownerId === PIRATE_ID && f.systemId && !f.path.length)) {
    const here = state.galaxy.systems.find((s) => s.id === fleet.systemId)!;
    if (here.ownerId && here.ownerId !== PIRATE_ID) {
      const defended = state.fleets.some((f) => f.systemId === here.id && f.ownerId === here.ownerId && fleetIsArmed(state, data, f));
      if (!defended && here.raidedTurn !== state.turn) raid(state, here, note);
    }
    const dist = hopDistances(state.galaxy.lanes, here.id);
    const targets = state.galaxy.systems.filter((s) => s.ownerId && s.ownerId !== PIRATE_ID && s.id !== here.id && (dist[s.id] ?? 99) <= 5);
    const target = targets.length ? rng.weighted(targets, (s) => 1 / Math.pow(dist[s.id] ?? 1, 2)) : null;
    const dest = target ? target.id : rng.pick(neighbours(state.galaxy.lanes, here.id));
    fleet.path = shortestPath(state.galaxy.lanes, here.id, dest);
  }
}

export function raidApprovalPenalty(state: GameState, system: StarSystem): number {
  return system.raidedTurn !== undefined && state.turn - system.raidedTurn < RAID_APPROVAL_TURNS ? 10 : 0;
}
