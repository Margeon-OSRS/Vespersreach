import { index } from './data';
import { addWarScore } from './diplomacy';
import { shipStats } from './fleets';
import { admiralMods, admiralOf, heroXp } from './heroes';
import { PIRATE_BOUNTY } from './pirates';
import { Rng } from './rng';
import { getEmpire, nextId } from './state';
import type { BattleReport, BattleSide, Fleet, GameData, GameState, Ship, TacticDef } from './types';

const PHASES = ['Long range', 'Medium range', 'Close range'];
const RANGE_MULT: Record<'kinetic' | 'laser' | 'missile', number[]> = {
  missile: [1.0, 0.7, 0.4], laser: [0.7, 1.0, 0.8], kinetic: [0.4, 0.8, 1.0],
};
const COUNTER_BONUS = 0.15;

interface Combatant {
  ship: Ship;
  side: 0 | 1;
  stats: ReturnType<typeof shipStats>;
  shield: number;
  pending: number;
}

interface SideMods { damage: Record<'kinetic' | 'laser' | 'missile', number>; accuracy: number; evasion: number; shields: number; damageTaken: number; flak: number }

function sideMods(mine: TacticDef, theirs: TacticDef, flak: number): SideMods {
  const counter = mine.counters.includes(theirs.id) ? COUNTER_BONUS : 0;
  return {
    damage: {
      kinetic: 1 + (mine.damage.kinetic ?? 0) / 100 + counter,
      laser: 1 + (mine.damage.laser ?? 0) / 100 + counter,
      missile: 1 + (mine.damage.missile ?? 0) / 100 + counter,
    },
    accuracy: 1 + (mine.accuracy ?? 0) / 100,
    evasion: 1 - (mine.evasion ?? 0) / 100,
    shields: 1 + (mine.shields ?? 0) / 100,
    damageTaken: 1 + (mine.damageTaken ?? 0) / 100,
    flak,
  };
}

function makeSide(state: GameState, empireId: string, fleets: Fleet[]): BattleSide {
  const e = getEmpire(state, empireId);
  const ships = fleets.flatMap((f) => f.ships);
  return {
    empireId, empireName: e.name, fleetNames: fleets.map((f) => f.name),
    tactic: fleets[0]?.tactic ?? 'balanced', shipsBefore: ships.length, shipsAfter: ships.length,
    hpBefore: ships.reduce((n, s) => n + s.hp, 0), hpAfter: 0, damageDealt: 0, lost: [],
  };
}

/**
 * Resolves one battle between two empires' fleets parked at a system.
 * Three simultaneous phases; destroyed ships are removed from their fleets; empty fleets are deleted.
 */
export function resolveBattle(state: GameState, data: GameData, systemId: string, attackerId: string, defenderId: string): BattleReport {
  const idx = index(data);
  const rng = new Rng(`${state.settings.seed}:battle:${state.turn}:${systemId}:${attackerId}:${defenderId}`);
  const system = state.galaxy.systems.find((s) => s.id === systemId)!;
  const fleetsOf = (id: string) => state.fleets.filter((f) => f.ownerId === id && f.systemId === systemId);
  const sidesFleets = [fleetsOf(attackerId), fleetsOf(defenderId)];
  const sides = [makeSide(state, attackerId, sidesFleets[0]), makeSide(state, defenderId, sidesFleets[1])];
  const empires = [getEmpire(state, attackerId), getEmpire(state, defenderId)];
  const tactics = sides.map((s) => idx.tactic[s.tactic] ?? idx.tactic.balanced);
  const combatants: Combatant[] = [];
  for (const side of [0, 1] as const) {
    for (const f of sidesFleets[side]) for (const ship of f.ships) {
      combatants.push({ ship, side, stats: shipStats(data, empires[side], ship), shield: 0, pending: 0 });
    }
  }
  const flakOf = (side: 0 | 1) => Math.min(0.8, combatants.filter((c) => c.side === side).reduce((n, c) => n + c.stats.flak, 0));
  const mods = [sideMods(tactics[0], tactics[1], flakOf(0)), sideMods(tactics[1], tactics[0], flakOf(1))];
  const admirals = [0, 1].map((side) => sidesFleets[side].map((f) => admiralOf(state, f)).find((h) => h) ?? null);
  admirals.forEach((hero, side) => {
    const am = admiralMods(data, hero);
    const m = mods[side];
    for (const k of ['kinetic', 'laser', 'missile'] as const) m.damage[k] *= 1 + am.damage / 100;
    m.accuracy *= 1 + am.accuracy / 100;
    m.evasion *= 1 - am.evasion / 100;
    m.shields *= 1 + am.shields / 100;
    m.damageTaken /= 1 + am.hp / 100;
  });
  const phases: BattleReport['phases'] = [];
  const alive = (side: 0 | 1) => combatants.filter((c) => c.side === side && c.ship.hp > 0);

  for (let phase = 0; phase < 3; phase++) {
    if (!alive(0).length || !alive(1).length) break;
    const lines: string[] = [];
    for (const c of combatants) { c.shield = c.stats.shield * mods[c.side].shields; c.pending = 0; }
    const tally = [{ shots: 0, hits: 0, dmg: 0, flak: 0 }, { shots: 0, hits: 0, dmg: 0, flak: 0 }];
    for (const c of combatants) {
      if (c.ship.hp <= 0) continue;
      const enemySide = (1 - c.side) as 0 | 1;
      const targets = alive(enemySide);
      if (!targets.length) break;
      for (const w of c.stats.weapons) {
        tally[c.side].shots++;
        const target = rng.pick(targets);
        if (!rng.chance(Math.min(0.98, w.accuracy * mods[c.side].accuracy * mods[enemySide].evasion))) continue;
        if (w.kind === 'missile' && rng.chance(mods[enemySide].flak)) { tally[c.side].flak++; continue; }
        let dmg = w.damage * RANGE_MULT[w.kind][phase] * mods[c.side].damage[w.kind] * mods[enemySide].damageTaken;
        if (w.kind === 'laser') { const absorbed = Math.min(target.shield, dmg); target.shield -= absorbed; dmg -= absorbed; }
        else dmg *= 100 / (100 + target.stats.armour);
        target.pending += dmg;
        tally[c.side].hits++;
        tally[c.side].dmg += dmg;
      }
    }
    for (const c of combatants) {
      if (c.pending <= 0 || c.ship.hp <= 0) continue;
      c.ship.hp = Math.max(0, Math.round(c.ship.hp - c.pending));
      if (c.ship.hp === 0) { sides[c.side].lost.push(c.ship.name); lines.push(`${sides[c.side].empireName}: ${c.ship.name} destroyed.`); }
    }
    for (const side of [0, 1] as const) {
      const t = tally[side];
      sides[side].damageDealt += Math.round(t.dmg);
      lines.unshift(`${sides[side].empireName}: ${t.hits}/${t.shots} shots hit for ${Math.round(t.dmg)} damage${t.flak ? `, ${t.flak} missiles shot down` : ''}.`);
    }
    phases.push({ phase: phase + 1, name: PHASES[phase], lines });
  }
  for (const side of [0, 1] as const) {
    const survivors = alive(side);
    sides[side].shipsAfter = survivors.length;
    sides[side].hpAfter = survivors.reduce((n, c) => n + c.ship.hp, 0);
  }
  for (const f of [...sidesFleets[0], ...sidesFleets[1]]) f.ships = f.ships.filter((s) => s.hp > 0);
  state.fleets = state.fleets.filter((f) => f.ships.length > 0);
  const outcome: BattleReport['outcome'] = !alive(1).length && alive(0).length ? 'attacker' : !alive(0).length && alive(1).length ? 'defender' : 'stalemate';
  const report: BattleReport = { id: nextId(state, 'battle'), turn: state.turn, systemId, systemName: system.name, attacker: sides[0], defender: sides[1], phases, outcome };
  state.battles.push(report);
  if (outcome !== 'stalemate') empires[outcome === 'attacker' ? 0 : 1].stats.battlesWon += 1;
  if (state.battles.length > 30) state.battles.splice(0, state.battles.length - 30);
  admirals.forEach((hero, side) => { if (hero) heroXp(empires[side], hero.id, 8); });
  if (!empires[0].isPirate && !empires[1].isPirate) addWarScore(state, attackerId, defenderId, Math.round(((sides[0].damageDealt - sides[1].damageDealt) / 30) * 10) / 10);
  for (const side of [0, 1] as const) if (empires[side].isPirate && sides[side].lost.length) empires[1 - side].dust += PIRATE_BOUNTY * sides[side].lost.length;
  return report;
}
