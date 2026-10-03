import { index } from './data';
import { designStats, getDesign, type DesignStats } from './designs';
import { admiralMods, admiralOf } from './heroes';
import { getEmpire, getFleet, nextId } from './state';
import type { Empire, Fleet, GameData, GameState, Ship } from './types';

export const BASE_COMMAND_LIMIT = 6;

export function shipStats(data: GameData, empire: Empire, ship: Ship): DesignStats {
  const design = getDesign(empire, ship.designId) ?? { id: '', name: '', hullId: ship.hullId, modules: [] };
  return designStats(data, design);
}

export function fleetCommandPoints(data: GameData, fleet: Fleet): number {
  const idx = index(data);
  let n = 0;
  for (const s of fleet.ships) n += idx.hull[s.hullId]?.commandPoints ?? 1;
  return n;
}

/** Six base command points plus two per military technology. */
export function commandLimit(data: GameData, empire: Empire): number {
  const idx = index(data);
  return BASE_COMMAND_LIMIT + 2 * empire.techs.filter((t) => idx.tech[t]?.quadrant === 'military').length;
}

export function fleetSpeed(state: GameState, data: GameData, fleet: Fleet): number {
  const empire = getEmpire(state, fleet.ownerId);
  let speed = Infinity;
  for (const s of fleet.ships) speed = Math.min(speed, shipStats(data, empire, s).speed);
  return Number.isFinite(speed) ? speed + admiralMods(data, admiralOf(state, fleet)).speed : 0;
}

export function fleetIsArmed(state: GameState, data: GameData, fleet: Fleet): boolean {
  const empire = getEmpire(state, fleet.ownerId);
  return fleet.ships.some((s) => shipStats(data, empire, s).weapons.length > 0);
}

export function fleetTroops(state: GameState, data: GameData, fleet: Fleet): number {
  const empire = getEmpire(state, fleet.ownerId);
  let n = 0;
  for (const s of fleet.ships) n += shipStats(data, empire, s).troops;
  return n;
}

export function fleetHp(state: GameState, data: GameData, fleet: Fleet): { hp: number; max: number } {
  const empire = getEmpire(state, fleet.ownerId);
  let hp = 0, max = 0;
  for (const s of fleet.ships) { hp += s.hp; max += shipStats(data, empire, s).hp; }
  return { hp, max };
}

export function setTactic(state: GameState, data: GameData, fleetId: string, tacticId: string): string | null {
  if (!index(data).tactic[tacticId]) return 'Unknown tactic.';
  getFleet(state, fleetId).tactic = tacticId;
  return null;
}

export function mergeFleets(state: GameState, data: GameData, intoId: string, fromId: string): string | null {
  const into = getFleet(state, intoId), from = getFleet(state, fromId);
  if (into.id === from.id) return 'Pick a different fleet.';
  if (into.ownerId !== from.ownerId) return 'Fleets belong to different empires.';
  if (!into.systemId || into.systemId !== from.systemId) return 'Both fleets must be parked in the same system.';
  const limit = commandLimit(data, getEmpire(state, into.ownerId));
  if (fleetCommandPoints(data, into) + fleetCommandPoints(data, from) > limit) return `Merged fleet would exceed ${limit} command points.`;
  into.ships.push(...from.ships);
  const admiral = admiralOf(state, from);
  if (admiral && !admiralOf(state, into)) admiral.assignment = { kind: 'admiral', fleetId: into.id };
  state.fleets = state.fleets.filter((f) => f.id !== from.id);
  return null;
}

export function splitFleet(state: GameState, fleetId: string, shipIds: string[]): Fleet | string {
  const fleet = getFleet(state, fleetId);
  if (!fleet.systemId) return 'Fleets can only split while parked.';
  const moving = fleet.ships.filter((s) => shipIds.includes(s.id));
  if (!moving.length) return 'Select at least one ship.';
  if (moving.length === fleet.ships.length) return 'Leave at least one ship behind.';
  fleet.ships = fleet.ships.filter((s) => !shipIds.includes(s.id));
  const n = state.fleets.filter((f) => f.ownerId === fleet.ownerId).length + 1;
  const created: Fleet = { id: nextId(state, 'fleet'), ownerId: fleet.ownerId, name: `${fleet.name.replace(/ \d+$/, '')} ${n}`, systemId: fleet.systemId, transit: null, path: [], ships: moving, tactic: fleet.tactic };
  state.fleets.push(created);
  return created;
}

/** Repairs ships: 20% at a friendly system plus repair modules anywhere. */
export function repairFleet(state: GameState, data: GameData, fleet: Fleet): void {
  const empire = getEmpire(state, fleet.ownerId);
  const system = fleet.systemId ? state.galaxy.systems.find((s) => s.id === fleet.systemId) : null;
  const friendly = !!system && system.ownerId === fleet.ownerId;
  let repair = 0;
  for (const s of fleet.ships) repair += shipStats(data, empire, s).repair;
  const rate = (friendly ? 0.2 : 0) + repair;
  if (rate <= 0) return;
  for (const s of fleet.ships) {
    const max = shipStats(data, empire, s).hp;
    s.hp = Math.min(max, Math.round(s.hp + max * rate));
  }
}
