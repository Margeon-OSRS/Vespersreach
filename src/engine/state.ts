import type { Empire, Fleet, GameState, StarSystem } from './types';

export function getSystem(state: GameState, id: string): StarSystem {
  const s = state.galaxy.systems.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown system ${id}`);
  return s;
}

export function findSystem(state: GameState, id: string | null): StarSystem | undefined {
  return id ? state.galaxy.systems.find((x) => x.id === id) : undefined;
}

export function getEmpire(state: GameState, id: string): Empire {
  const e = state.empires.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown empire ${id}`);
  return e;
}

export function getFleet(state: GameState, id: string): Fleet {
  const f = state.fleets.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown fleet ${id}`);
  return f;
}

export function playerEmpire(state: GameState): Empire {
  return getEmpire(state, state.playerEmpireId);
}

export function fleetsAt(state: GameState, systemId: string, ownerId?: string): Fleet[] {
  return state.fleets.filter((f) => f.systemId === systemId && (!ownerId || f.ownerId === ownerId));
}

export function ownedSystems(state: GameState, empireId: string): StarSystem[] {
  return state.galaxy.systems.filter((s) => s.ownerId === empireId);
}

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}_${state.nextId++}`;
}

export function systemPop(system: StarSystem): number {
  let n = 0;
  for (const p of system.planets) if (p.status !== 'none') n += p.pop;
  return n;
}

export function isColony(system: StarSystem): boolean {
  return system.planets.some((p) => p.status === 'colony');
}

export function addUnique(list: string[], id: string): boolean {
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}
