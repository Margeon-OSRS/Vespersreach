import { index } from './data';
import { empireStrength, fleetStrength } from './diplomacy';
import { canColonise, colonise, orderFleetMove } from './fleetActions';
import { fleetIsArmed, fleetTroops, mergeFleets, splitFleet } from './fleets';
import { hopDistances } from './graph';
import type { Rng } from './rng';
import { groundDefence, invade } from './siege';
import { ownedSystems } from './state';
import type { Empire, Fleet, GameData, GameState, StarSystem } from './types';
import { atWar } from './war';

function colonisable(data: GameData, empire: Empire, system: StarSystem) {
  const idx = index(data);
  return system.planets.filter((p) => p.status === 'none' && idx.planetType[p.type].tier <= empire.planetTier);
}

/** Best explored, unowned, unthreatened system to settle, weighted by room and nearness. */
export function bestColonyTarget(state: GameState, data: GameData, empire: Empire, fromId: string): StarSystem | null {
  const dist = hopDistances(state.galaxy.lanes, fromId);
  let best: StarSystem | null = null, bestScore = 0;
  for (const s of state.galaxy.systems) {
    if (s.ownerId || !empire.exploredSystems.includes(s.id) || (dist[s.id] ?? 99) > 6) continue;
    if (state.fleets.some((f) => f.systemId === s.id && atWar(state, f.ownerId, empire.id))) continue;
    const room = colonisable(data, empire, s).reduce((n, p) => n + p.maxPop, 0);
    if (!room) continue;
    const score = room / (1 + (dist[s.id] ?? 0));
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function roles(data: GameData, fleet: Fleet): { settlerIds: string[]; explorer: boolean } {
  const idx = index(data);
  const settlerIds = fleet.ships.filter((s) => { const r = idx.hull[s.hullId]?.roles ?? []; return r.includes('outpost') || r.includes('ark'); }).map((s) => s.id);
  const explorer = fleet.ships.some((s) => idx.hull[s.hullId]?.roles?.includes('explore'));
  return { settlerIds, explorer };
}

function settlerAct(state: GameState, data: GameData, empire: Empire, fleet: Fleet, home: string): void {
  const idx = index(data);
  const here = state.galaxy.systems.find((s) => s.id === fleet.systemId)!;
  const options = colonisable(data, empire, here).filter((p) => canColonise(state, data, empire.id, here.id, p.id).ok)
    .sort((a, b) => b.maxPop - a.maxPop || idx.planetType[b.type].yieldsPerPop.food - idx.planetType[a.type].yieldsPerPop.food);
  if (options.length && (!here.ownerId || here.ownerId === empire.id)) { colonise(state, data, empire.id, here.id, options[0].id); return; }
  const target = bestColonyTarget(state, data, empire, fleet.systemId!);
  if (target && target.id !== fleet.systemId) orderFleetMove(state, fleet.id, target.id);
  else if (!target && fleet.systemId !== home) orderFleetMove(state, fleet.id, home);
}

function exploreAct(state: GameState, empire: Empire, fleet: Fleet, rng: Rng): void {
  const dist = hopDistances(state.galaxy.lanes, fleet.systemId!);
  const frontier = empire.knownSystems.filter((id) => !empire.exploredSystems.includes(id) && dist[id] !== undefined).sort((a, b) => dist[a] - dist[b]);
  if (frontier.length) { orderFleetMove(state, fleet.id, frontier[0]); return; }
  if (rng.chance(0.3)) orderFleetMove(state, fleet.id, rng.pick(empire.exploredSystems));
}

function militaryAct(state: GameState, data: GameData, empire: Empire, home: string): void {
  let pool = state.fleets.filter((f) => f.ownerId === empire.id && f.systemId && !f.path.length && fleetIsArmed(state, data, f) && roles(data, f).settlerIds.length === 0)
    .sort((a, b) => fleetStrength(state, data, b) - fleetStrength(state, data, a));
  const take = (f: Fleet) => { pool = pool.filter((x) => x.id !== f.id); };
  const threatened = ownedSystems(state, empire.id).filter((s) => state.fleets.some((h) => h.systemId === s.id && atWar(state, h.ownerId, empire.id) && fleetIsArmed(state, data, h)));
  for (const s of threatened) {
    const defender = pool.find((f) => f.systemId !== s.id);
    if (!defender) break;
    orderFleetMove(state, defender.id, s.id);
    take(defender);
  }
  const enemies = state.empires.filter((e) => e.id !== empire.id && !e.isPirate && !e.eliminated && atWar(state, empire.id, e.id))
    .sort((a, b) => empireStrength(state, data, a.id) - empireStrength(state, data, b.id));
  const main = pool[0];
  if (enemies.length && main) {
    const enemy = enemies[0];
    const dist = hopDistances(state.galaxy.lanes, main.systemId!);
    const target = state.galaxy.systems.filter((s) => s.ownerId === enemy.id && empire.knownSystems.includes(s.id) && dist[s.id] !== undefined).sort((a, b) => dist[a.id] - dist[b.id])[0];
    if (target && fleetStrength(state, data, main) >= Math.max(20, empireStrength(state, data, enemy.id) * 0.7)) {
      if (main.systemId === target.id) { if (target.siege?.by === empire.id && fleetTroops(state, data, main) >= groundDefence(state, target) * 1.1) invade(state, data, main.id); }
      else orderFleetMove(state, main.id, target.id);
      take(main);
    }
  }
  for (const p of state.fleets.filter((f) => f.systemId && state.empires.find((e) => e.id === f.ownerId)?.isPirate && empire.knownSystems.includes(f.systemId))) {
    const dist = hopDistances(state.galaxy.lanes, p.systemId!);
    if (!ownedSystems(state, empire.id).some((s) => (dist[s.id] ?? 99) <= 2)) continue;
    const hunter = pool.find((f) => fleetStrength(state, data, f) >= fleetStrength(state, data, p) * 1.5);
    if (hunter) { orderFleetMove(state, hunter.id, p.systemId!); take(hunter); }
  }
  const atHome = pool.filter((f) => f.systemId === home);
  for (const f of pool) if (f.systemId !== home) orderFleetMove(state, f.id, home);
  for (const f of atHome.slice(1)) mergeFleets(state, data, atHome[0].id, f.id);
}

export function runAiFleets(state: GameState, data: GameData, empire: Empire, rng: Rng): void {
  for (const f of state.fleets.filter((f) => f.ownerId === empire.id && f.systemId)) {
    const { settlerIds } = roles(data, f);
    const idx = index(data);
    if (settlerIds.length && settlerIds.length < f.ships.length) splitFleet(state, f.id, settlerIds);
    const explorerIds = f.ships.filter((s) => idx.hull[s.hullId]?.roles?.includes('explore')).map((s) => s.id);
    if (explorerIds.length && explorerIds.length < f.ships.length) splitFleet(state, f.id, explorerIds);
  }
  const home = empire.homeSystemId || ownedSystems(state, empire.id)[0]?.id;
  if (!home) return;
  for (const f of state.fleets.filter((f) => f.ownerId === empire.id)) {
    if (f.transit || f.path.length || !f.systemId) continue;
    const r = roles(data, f);
    if (r.settlerIds.length) settlerAct(state, data, empire, f, home);
    else if (r.explorer && !fleetIsArmed(state, data, f)) exploreAct(state, empire, f, rng);
  }
  militaryAct(state, data, empire, home);
}
