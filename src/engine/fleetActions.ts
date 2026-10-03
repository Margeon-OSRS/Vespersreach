import { index } from './data';
import { ensureDefaultDesigns } from './designs';
import { commandLimit, fleetCommandPoints } from './fleets';
import { neighbours, shortestPath } from './graph';
import { shipName } from './names';
import { Rng } from './rng';
import { addUnique, fleetsAt, getEmpire, getFleet, getSystem, nextId, systemPop } from './state';
import type { Empire, Fleet, GameData, GameState, Planet, ShipDesign, StarSystem } from './types';


export function fleetHasRole(data: GameData, fleet: Fleet, role: 'explore' | 'outpost' | 'ark'): boolean {
  const idx = index(data);
  return fleet.ships.some((s) => idx.hull[s.hullId]?.roles?.includes(role));
}

/** Marks a system explored for an empire and its neighbours as known. Returns true if newly explored. */
export function exploreSystem(state: GameState, empire: Empire, systemId: string, deep = false): boolean {
  const fresh = addUnique(empire.exploredSystems, systemId);
  addUnique(empire.knownSystems, systemId);
  for (const n of neighbours(state.galaxy.lanes, systemId)) {
    addUnique(empire.knownSystems, n);
    if (deep) addUnique(empire.exploredSystems, n);
  }
  return fresh;
}


export function orderFleetMove(state: GameState, fleetId: string, targetId: string): string | null {
  const fleet = getFleet(state, fleetId);
  const empire = getEmpire(state, fleet.ownerId);
  const origin = fleet.transit ? fleet.transit.to : fleet.systemId;
  if (!origin) return 'Fleet has no position.';
  if (!empire.knownSystems.includes(targetId)) return 'That system is unknown.';
  if (origin === targetId) {
    fleet.path = fleet.transit ? [fleet.transit.to] : [];
    return null;
  }
  const path = shortestPath(state.galaxy.lanes, origin, targetId, (id) => empire.knownSystems.includes(id));
  if (!path.length) return 'No known route to that system.';
  fleet.path = fleet.transit ? [fleet.transit.to, ...path] : path;
  return null;
}

export interface ColoniseCheck { ok: boolean; reason: string; fleetId?: string; shipId?: string; ark?: boolean }

export function canColonise(state: GameState, data: GameData, empireId: string, systemId: string, planetId: string): ColoniseCheck {
  const idx = index(data);
  const empire = getEmpire(state, empireId);
  const system = getSystem(state, systemId);
  const planet = system.planets.find((p) => p.id === planetId);
  if (!planet) return { ok: false, reason: 'No such planet.' };
  if (system.ownerId && system.ownerId !== empireId) return { ok: false, reason: 'Another empire holds this system.' };
  if (planet.status !== 'none') return { ok: false, reason: 'Already settled.' };
  const tier = idx.planetType[planet.type].tier;
  if (tier > empire.planetTier) return { ok: false, reason: `Requires planet tier ${tier} technology.` };
  for (const fleet of fleetsAt(state, systemId, empireId)) {
    for (const ship of fleet.ships) {
      const roles = idx.hull[ship.hullId]?.roles ?? [];
      if (roles.includes('ark')) return { ok: true, reason: '', fleetId: fleet.id, shipId: ship.id, ark: true };
      if (roles.includes('outpost')) return { ok: true, reason: '', fleetId: fleet.id, shipId: ship.id, ark: false };
    }
  }
  return { ok: false, reason: 'No settler or ark ship in orbit.' };
}

function settle(planet: Planet, pop: number, colony: boolean): void {
  planet.status = colony ? 'colony' : 'outpost';
  planet.pop = Math.min(planet.maxPop, Math.max(1, pop));
  planet.outpostTurns = 0;
}

export function colonise(state: GameState, data: GameData, empireId: string, systemId: string, planetId: string): string | null {
  const check = canColonise(state, data, empireId, systemId, planetId);
  if (!check.ok) return check.reason;
  const idx = index(data);
  const empire = getEmpire(state, empireId);
  const system = getSystem(state, systemId);
  const planet = system.planets.find((p) => p.id === planetId)!;
  const fleet = getFleet(state, check.fleetId!);
  const ship = fleet.ships.find((s) => s.id === check.shipId)!;
  const hull = idx.hull[ship.hullId];
  const instant = check.ark || !!idx.faction[empire.factionId].modifiers.instantColony;
  let pop = check.ark ? Math.max(1, ship.cargoPop || hull.cargoPop || 1) : 1;
  fleet.ships = fleet.ships.filter((s) => s.id !== ship.id);
  if (!fleet.ships.length) state.fleets = state.fleets.filter((f) => f.id !== fleet.id);
  settle(planet, pop, instant);
  pop -= planet.pop;
  if (pop > 0) {
    for (const other of system.planets) {
      if (pop <= 0) break;
      if (other.status !== 'none' || idx.planetType[other.type].tier > empire.planetTier) continue;
      settle(other, pop, true);
      pop -= other.pop;
    }
  }
  system.ownerId = empireId;
  if (!empire.homeSystemId) {
    empire.homeSystemId = system.id;
    addUnique(system.improvements, 'capital_seat');
  }
  exploreSystem(state, empire, systemId);
  return null;
}

/** Nomad affinity: load every citizen of a system into a new Ark and abandon it. */
export function uprootSystem(state: GameState, data: GameData, systemId: string): string | null {
  const idx = index(data);
  const system = getSystem(state, systemId);
  if (!system.ownerId) return 'Nobody lives here.';
  const empire = getEmpire(state, system.ownerId);
  const faction = idx.faction[empire.factionId];
  if (!faction.modifiers.instantColony) return 'Only nomadic factions can uproot a system.';
  const hull = idx.hull[faction.uniqueHull];
  const pop = systemPop(system);
  if (pop <= 0) return 'There is nobody to move.';
  for (const p of system.planets) { p.status = 'none'; p.pop = 0; p.outpostTurns = 0; }
  system.ownerId = null;
  system.improvements = [];
  system.buildQueue = [];
  system.growthStock = 0;
  if (empire.homeSystemId === system.id) empire.homeSystemId = '';
  spawnShip(state, data, empire, system, designFor(data, empire, hull.id), pop);
  return null;
}

/** The stock design for a hull, creating defaults if the empire has none. */
export function designFor(data: GameData, empire: Empire, hullId: string): ShipDesign {
  ensureDefaultDesigns(data, empire);
  const d = empire.designs.find((x) => x.hullId === hullId);
  if (d) return d;
  const made: ShipDesign = { id: `dsg_${empire.id}_${hullId}`, name: index(data).hull[hullId]?.name ?? hullId, hullId, modules: [] };
  empire.designs.push(made);
  return made;
}

/** Builds a ship from a design and parks it in an idle fleet with room, or a new fleet. Returns that fleet. */
export function spawnShip(state: GameState, data: GameData, empire: Empire, system: StarSystem, design: ShipDesign, cargoPop = 0): Fleet {
  const idx = index(data);
  const faction = idx.faction[empire.factionId];
  const hull = idx.hull[design.hullId];
  const rng = new Rng(`${state.settings.seed}:ship:${state.nextId}`);
  const ship = { id: nextId(state, 'ship'), hullId: design.hullId, designId: design.id, name: shipName(rng, faction.shipPrefix), hp: hull?.hp ?? 1, cargoPop };
  const limit = commandLimit(data, empire);
  let fleet = fleetsAt(state, system.id, empire.id).find((f) => f.path.length === 0 && fleetCommandPoints(data, f) + (hull?.commandPoints ?? 1) <= limit);
  if (!fleet) {
    const n = state.fleets.filter((f) => f.ownerId === empire.id).length + 1;
    fleet = { id: nextId(state, 'fleet'), ownerId: empire.id, name: `${faction.demonym} Fleet ${n}`, systemId: system.id, transit: null, path: [], ships: [], tactic: 'balanced' };
    state.fleets.push(fleet);
  }
  fleet.ships.push(ship);
  return fleet;
}
