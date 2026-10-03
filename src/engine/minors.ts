import { index } from './data';
import { ensureDefaultDesigns } from './designs';
import { makeEmpire } from './empireFactory';
import { designFor, exploreSystem, spawnShip } from './fleetActions';
import { maxPopFor } from './galaxy';
import { hopDistances } from './graph';
import type { Rng } from './rng';
import { getEmpire, ownedSystems } from './state';
import type { Empire, GameData, GameState } from './types';

export const MINOR_PREFIX = 'emp_minor_';
export const ENVOY_COST = 15;
export const ENVOY_GAIN = 20;
export const MINOR_GIFT = 40;
export const GIFT_GAIN = 15;
export const ASSIMILATE_AT = 100;

export function minorKey(minorId: string, empireId: string): string { return `${minorId}|${empireId}`; }

export function minorRelation(state: GameState, minorId: string, empireId: string): number {
  return state.minorRelations[minorKey(minorId, empireId)] ?? 0;
}

export function minorEmpires(state: GameState): Empire[] {
  return state.empires.filter((e) => e.isMinor && !e.eliminated);
}

function nearestOwned(state: GameState): Record<string, number> {
  const best: Record<string, number> = {};
  for (const s of state.galaxy.systems.filter((x) => x.ownerId)) {
    const d = hopDistances(state.galaxy.lanes, s.id);
    for (const [k, v] of Object.entries(d)) if (best[k] === undefined || v < best[k]) best[k] = v;
  }
  return best;
}

/** Seeds minor factions on unowned systems at least two jumps from anyone. Call after major homes exist. */
export function placeMinors(state: GameState, data: GameData, rng: Rng): void {
  const idx = index(data);
  const count = Math.max(1, Math.min(data.minors.length, Math.floor(state.galaxy.systems.length / 12)));
  for (const def of rng.shuffle([...data.minors]).slice(0, count)) {
    const dist = nearestOwned(state);
    const candidates = state.galaxy.systems.filter((s) => !s.ownerId && (dist[s.id] ?? 99) >= 2);
    if (!candidates.length) break;
    const system = rng.weighted(candidates, (s) => Math.min(4, dist[s.id] ?? 1));
    const faction = idx.faction[def.id];
    const empire = makeEmpire(MINOR_PREFIX + def.id, faction, data, { isMinor: true, homeSystemId: system.id, techs: ['warship_frames'], dust: 50 });
    const home = system.planets[0];
    const ptype = idx.planetType[faction.homePlanet];
    home.type = ptype.id;
    home.anomalyId = null;
    home.maxPop = maxPopFor(ptype, home.size) + 1;
    home.pop = Math.min(def.pop, home.maxPop);
    home.status = 'colony';
    home.outpostTurns = 0;
    system.ownerId = empire.id;
    system.improvements = [];
    state.empires.push(empire);
    ensureDefaultDesigns(data, empire);
    exploreSystem(state, empire, system.id);
    for (let i = 0; i < def.guards; i++) spawnShip(state, data, empire, system, designFor(data, empire, 'dagger'));
  }
}

function bump(state: GameState, minorId: string, empireId: string, amount: number): void {
  const k = minorKey(minorId, empireId);
  state.minorRelations[k] = Math.max(0, Math.min(ASSIMILATE_AT, (state.minorRelations[k] ?? 0) + amount));
}

export function sendEnvoys(state: GameState, empireId: string, minorId: string): string | null {
  const minor = getEmpire(state, minorId), empire = getEmpire(state, empireId);
  if (minor.eliminated) return 'That faction no longer exists.';
  if (empire.influence < ENVOY_COST) return `Envoys cost ${ENVOY_COST} influence.`;
  empire.influence -= ENVOY_COST;
  bump(state, minorId, empireId, ENVOY_GAIN);
  return null;
}

export function giftMinor(state: GameState, empireId: string, minorId: string): string | null {
  const minor = getEmpire(state, minorId), empire = getEmpire(state, empireId);
  if (minor.eliminated) return 'That faction no longer exists.';
  if (empire.dust < MINOR_GIFT) return `A gift costs ${MINOR_GIFT} Dust.`;
  empire.dust -= MINOR_GIFT;
  minor.dust += MINOR_GIFT;
  bump(state, minorId, empireId, GIFT_GAIN);
  return null;
}

/** Folds a minor faction into the empire once goodwill is full: its systems, people and boon. */
export function assimilateMinor(state: GameState, empireId: string, minorId: string): string | null {
  const minor = getEmpire(state, minorId), empire = getEmpire(state, empireId);
  if (minor.eliminated) return 'That faction no longer exists.';
  if (minorRelation(state, minorId, empireId) < ASSIMILATE_AT) return `Goodwill must reach ${ASSIMILATE_AT} first.`;
  for (const s of ownedSystems(state, minorId)) { s.ownerId = empireId; s.siege = null; s.buildQueue = []; exploreSystem(state, empire, s.id); }
  state.fleets = state.fleets.filter((f) => f.ownerId !== minorId);
  minor.eliminated = true;
  empire.assimilated.push(minor.factionId);
  return null;
}

/** Goodwill fades by one point every other turn. */
export function decayMinorRelations(state: GameState): void {
  if (state.turn % 2) return;
  for (const k of Object.keys(state.minorRelations)) {
    const v = state.minorRelations[k] - 1;
    if (v <= 0) delete state.minorRelations[k]; else state.minorRelations[k] = v;
  }
}
