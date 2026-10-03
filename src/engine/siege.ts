import { fleetIsArmed, fleetTroops } from './fleets';
import { Rng } from './rng';
import { getEmpire, getFleet, getSystem, systemPop } from './state';
import type { GameData, GameState, Notification, StarSystem } from './types';
import { atWar } from './war';


/** Updates the siege marker of a system after battles have been resolved. */
export function updateSiege(state: GameState, data: GameData, system: StarSystem, notes: Array<Omit<Notification, 'turn'> & { empireId: string }>): void {
  if (!system.ownerId) { system.siege = null; return; }
  const here = state.fleets.filter((f) => f.systemId === system.id);
  const defenders = here.some((f) => f.ownerId === system.ownerId && fleetIsArmed(state, data, f));
  const besieger = defenders ? null : here.find((f) => atWar(state, f.ownerId, system.ownerId!) && fleetIsArmed(state, data, f));
  if (!besieger) { system.siege = null; return; }
  if (system.siege?.by === besieger.ownerId) {
    system.siege.turns += 1;
  } else {
    system.siege = { by: besieger.ownerId, turns: 1 };
    const by = getEmpire(state, besieger.ownerId);
    notes.push({ empireId: system.ownerId, kind: 'siege', text: `${system.name} is under siege by ${by.name}. Output is halved.`, systemId: system.id });
    notes.push({ empireId: besieger.ownerId, kind: 'siege', text: `Your fleet has blockaded ${system.name}.`, systemId: system.id, fleetId: besieger.id });
  }
}

/** Defence value of a system against invasion; sieges erode it by 10% per turn. */
export function groundDefence(state: GameState, system: StarSystem): number {
  const owner = system.ownerId ? getEmpire(state, system.ownerId) : null;
  const base = systemPop(system) * 2 + (owner?.homeSystemId === system.id ? 4 : 0) + system.improvements.length * 0.5;
  return Math.round(base * Math.pow(0.9, system.siege?.turns ?? 0) * 10) / 10;
}

export interface InvasionResult { success: boolean; attack: number; defence: number }

function damageFleet(state: GameState, fleetId: string, total: number): void {
  const fleet = getFleet(state, fleetId);
  const per = total / Math.max(1, fleet.ships.length);
  for (const s of fleet.ships) s.hp = Math.max(1, Math.round(s.hp - per));
}

/** Lands troops from a fleet on the enemy system it is besieging. */
export function invade(state: GameState, data: GameData, fleetId: string): InvasionResult | string {
  const fleet = getFleet(state, fleetId);
  if (!fleet.systemId) return 'The fleet must be in orbit.';
  const system = getSystem(state, fleet.systemId);
  if (!system.ownerId || system.ownerId === fleet.ownerId) return 'There is nothing to invade here.';
  if (!atWar(state, fleet.ownerId, system.ownerId)) return 'You are not at war with that empire.';
  if (system.siege?.by !== fleet.ownerId) return 'The system must be under your siege first (clear the defenders and end a turn).';
  const troops = fleetTroops(state, data, fleet);
  if (troops <= 0) return 'No troops aboard. Warships carry troops; scouts and settlers do not.';
  const rng = new Rng(`${state.settings.seed}:invade:${state.turn}:${system.id}:${fleet.id}`);
  const attack = Math.round(troops * rng.float(0.8, 1.2) * 10) / 10;
  const defence = Math.round(groundDefence(state, system) * rng.float(0.8, 1.2) * 10) / 10;
  const attacker = getEmpire(state, fleet.ownerId);
  const defender = getEmpire(state, system.ownerId);
  const biggest = system.planets.filter((p) => p.status !== 'none').sort((a, b) => b.pop - a.pop)[0];
  if (attack > defence) {
    if (biggest && biggest.pop > 1) biggest.pop -= 1;
    system.ownerId = fleet.ownerId;
    attacker.stats.systemsCaptured += 1;
    system.buildQueue = [];
    system.siege = null;
    system.improvements = system.improvements.filter((i) => i !== 'capital_seat');
    for (const f of state.fleets.filter((x) => x.systemId === system.id && x.ownerId === defender.id)) state.fleets = state.fleets.filter((y) => y.id !== f.id);
    damageFleet(state, fleet.id, defence * 4);
    if (!attacker.exploredSystems.includes(system.id)) attacker.exploredSystems.push(system.id);
    state.notifications.push({ turn: state.turn, kind: 'battle', text: `${attacker.name} captured ${system.name} (${attack} vs ${defence}).`, systemId: system.id });
    return { success: true, attack, defence };
  }
  if (biggest && biggest.pop > 1) biggest.pop -= 1;
  damageFleet(state, fleet.id, defence * 6);
  state.notifications.push({ turn: state.turn, kind: 'battle', text: `The invasion of ${system.name} failed (${attack} vs ${defence}).`, systemId: system.id });
  return { success: false, attack, defence };
}
