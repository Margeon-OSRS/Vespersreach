import { index } from './data';
import { designStats, getDesign, hullAvailable } from './designs';
import { shipCost } from './economy';
import { getEmpire, getSystem, isColony, nextId } from './state';
import type { BuildItem, Empire, GameData, GameState, HullDef, ImprovementDef, ShipDesign, StarSystem } from './types';

export const RUSH_MULTIPLIER = 2;

function queuedIds(system: StarSystem): string[] {
  return system.buildQueue.map((b) => b.defId);
}

/** Improvements the system owner may queue here right now. */
export function availableImprovements(state: GameState, data: GameData, system: StarSystem): ImprovementDef[] {
  if (!system.ownerId) return [];
  const empire = getEmpire(state, system.ownerId);
  const queued = queuedIds(system);
  return data.improvements.filter((def) => {
    if (def.hidden) return false;
    if (def.factionOnly && def.factionOnly !== empire.factionId) return false;
    if (def.requires && !empire.techs.includes(def.requires)) return false;
    if (def.capitalOnly && system.id !== empire.homeSystemId) return false;
    if (system.improvements.includes(def.id) || queued.includes(def.id)) return false;
    if (def.unique) {
      const elsewhere = state.galaxy.systems.some(
        (s) => s.ownerId === empire.id && (s.improvements.includes(def.id) || queuedIds(s).includes(def.id)),
      );
      if (elsewhere) return false;
    }
    return true;
  });
}

/** Hulls an empire can currently design ships on. */
export function availableHulls(data: GameData, empire: Empire): HullDef[] {
  const mods = index(data).faction[empire.factionId].modifiers;
  return data.hulls.filter((h) => hullAvailable(empire, h) && !(mods.cannotOutpost && h.roles?.includes('outpost')));
}

/** Designs an empire can currently build. */
export function availableDesigns(data: GameData, empire: Empire): ShipDesign[] {
  const hulls = new Set(availableHulls(data, empire).map((h) => h.id));
  return empire.designs.filter((d) => hulls.has(d.hullId));
}

export function canBuildShips(system: StarSystem): boolean {
  return isColony(system);
}

export function queueImprovement(state: GameState, data: GameData, systemId: string, improvementId: string): string | null {
  const system = getSystem(state, systemId);
  const def = availableImprovements(state, data, system).find((d) => d.id === improvementId);
  if (!def) return 'That improvement cannot be built here.';
  system.buildQueue.push({ id: nextId(state, 'bld'), kind: 'improvement', defId: def.id, cost: def.cost, progress: 0 });
  return null;
}

export function queueShip(state: GameState, data: GameData, systemId: string, designId: string): string | null {
  const system = getSystem(state, systemId);
  if (!system.ownerId) return 'No one owns this system.';
  if (!canBuildShips(system)) return 'Ships can only be built at a colony, not an outpost.';
  const empire = getEmpire(state, system.ownerId);
  const design = availableDesigns(data, empire).find((d) => d.id === designId) ?? getDesign(empire, designId);
  if (!design) return 'That design is not available.';
  const cost = shipCost(data, empire, system, designStats(data, design).cost);
  system.buildQueue.push({ id: nextId(state, 'bld'), kind: 'ship', defId: design.id, cost, progress: 0 });
  return null;
}

export function removeQueueItem(state: GameState, systemId: string, itemId: string): void {
  const system = getSystem(state, systemId);
  system.buildQueue = system.buildQueue.filter((b) => b.id !== itemId);
}

export function moveQueueItem(state: GameState, systemId: string, itemId: string, delta: number): void {
  const q = getSystem(state, systemId).buildQueue;
  const i = q.findIndex((b) => b.id === itemId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= q.length) return;
  [q[i], q[j]] = [q[j], q[i]];
}

export function rushCost(item: BuildItem): number {
  return Math.ceil(Math.max(0, item.cost - item.progress) * RUSH_MULTIPLIER);
}

/** Pays Dust to finish an item; it completes during the next end turn. */
export function rushBuy(state: GameState, systemId: string, itemId: string): string | null {
  const system = getSystem(state, systemId);
  if (!system.ownerId) return 'No one owns this system.';
  const empire = getEmpire(state, system.ownerId);
  const item = system.buildQueue.find((b) => b.id === itemId);
  if (!item) return 'Nothing to buy.';
  const cost = rushCost(item);
  if (cost <= 0) return 'Already complete.';
  if (empire.dust < cost) return `Not enough Dust (need ${cost}).`;
  empire.dust -= cost;
  item.progress = item.cost;
  return null;
}
