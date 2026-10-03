import { runAiDiplomacy, runAiHeroes } from './aiDiplomacy';
import { bestColonyTarget, runAiFleets } from './aiFleets';
import { availableDesigns, availableImprovements, canBuildShips, queueImprovement, queueShip } from './build';
import { index } from './data';
import { designStats } from './designs';
import { empireReport, systemReport } from './economy';
import { assimilateMinor, minorEmpires, minorRelation, sendEnvoys, ASSIMILATE_AT } from './minors';
import { availableLaws, MAX_LAWS, passLaw } from './politics';
import { availableTechs, setResearch } from './research';
import type { Rng } from './rng';
import { ownedSystems } from './state';
import type { Difficulty, Empire, GameData, GameState, Notification } from './types';
import { atWar } from './war';

export interface AiProfile { warships: number; aggressionTurn: number; peaceful: boolean }
export const AI_PROFILE: Record<Difficulty, AiProfile> = {
  easy: { warships: 0.6, aggressionTurn: 9999, peaceful: true },
  normal: { warships: 1, aggressionTurn: 30, peaceful: false },
  hard: { warships: 1.6, aggressionTurn: 15, peaceful: false },
};

const RESEARCH_PREF: Record<string, string[]> = {
  devourer: ['empire', 'economy'], nomad: ['science', 'empire'], serene: ['empire', 'economy'],
  broker: ['economy', 'science'], forgeborn: ['military', 'economy'], dreamer: ['science', 'empire'],
};

export type Note = (empireId: string, n: Omit<Notification, 'turn'>) => void;

export function aiProfile(state: GameState): AiProfile {
  return AI_PROFILE[state.settings.difficulty] ?? AI_PROFILE.normal;
}

/** One AI empire takes its turn: research, builds, diplomacy, heroes, then fleet orders. */
export function runAi(state: GameState, data: GameData, empire: Empire, rng: Rng, note: Note): void {
  if (empire.isPlayer || empire.isPirate || empire.isMinor || empire.eliminated) return;
  aiResearch(data, empire, rng);
  aiBuild(state, data, empire);
  runAiDiplomacy(state, data, empire, rng, note);
  runAiHeroes(state, data, empire);
  aiPolitics(state, data, empire, rng);
  runAiFleets(state, data, empire, rng);
}

function aiResearch(data: GameData, empire: Empire, rng: Rng): void {
  if (empire.research.current) return;
  const pref = RESEARCH_PREF[index(data).faction[empire.factionId].affinity.id] ?? [];
  const options = availableTechs(data, empire);
  if (!options.length) return;
  const scored = options.map((t) => ({ t, s: (t.cost / (pref.includes(t.quadrant) ? 1.6 : 1)) * rng.float(0.9, 1.1) })).sort((a, b) => a.s - b.s);
  setResearch(data, empire, scored[0].t.id);
}

const IMPROVEMENT_ORDER = ['fabrication_yards', 'exchange_hub', 'observatory', 'hydroponic_terraces', 'orbital_dock', 'civic_forum', 'deep_mines', 'research_campus', 'trade_port', 'colonial_charter'];

function aiBuild(state: GameState, data: GameData, empire: Empire): void {
  const idx = index(data);
  const profile = aiProfile(state);
  const systems = ownedSystems(state, empire.id).filter(canBuildShips).sort((a, b) => b.lastOutput.industry - a.lastOutput.industry);
  if (!systems.length) return;
  const designs = availableDesigns(data, empire);
  const hullRoles = (hullId: string) => idx.hull[hullId]?.roles ?? [];
  const isSettler = (hullId: string) => hullRoles(hullId).includes('outpost') || hullRoles(hullId).includes('ark');
  const myShips = state.fleets.filter((f) => f.ownerId === empire.id).flatMap((f) => f.ships);
  const queuedHulls = systems.flatMap((s) => s.buildQueue.filter((b) => b.kind === 'ship').map((b) => empire.designs.find((d) => d.id === b.defId)?.hullId ?? ''));
  let settlers = myShips.filter((s) => isSettler(s.hullId)).length + queuedHulls.filter(isSettler).length;
  let explorers = myShips.filter((s) => hullRoles(s.hullId).includes('explore')).length + queuedHulls.filter((h) => hullRoles(h).includes('explore')).length;
  let warships = myShips.filter((s) => (idx.hull[s.hullId]?.slots.weapon ?? 0) > 0).length + queuedHulls.filter((h) => (idx.hull[h]?.slots.weapon ?? 0) > 0).length;
  const anyWar = state.empires.some((e) => e.id !== empire.id && !e.isPirate && !e.eliminated && atWar(state, empire.id, e.id));
  const wantedWar = Math.round((2 + state.turn / 15 + 2 * (systems.length - 1)) * profile.warships) + (anyWar ? 3 : 0);
  const netDust = empireReport(state, data, empire).netDust;
  if (empire.dust < -50 && netDust < 0) {
    const fleet = state.fleets.filter((f) => f.ownerId === empire.id && f.systemId === empire.homeSystemId).sort((a, b) => a.ships.length - b.ships.length)[0];
    const victim = fleet?.ships.find((s) => (idx.hull[s.hullId]?.slots.weapon ?? 0) > 0);
    if (fleet && victim) { fleet.ships = fleet.ships.filter((s) => s.id !== victim.id); if (!fleet.ships.length) state.fleets = state.fleets.filter((f) => f.id !== fleet.id); }
    for (const s of systems) s.buildQueue = s.buildQueue.filter((b) => b.kind !== 'ship' || isSettler(empire.designs.find((d) => d.id === b.defId)?.hullId ?? ''));
  }
  const maxSystems = 4 + Math.floor(state.turn / 20);
  const settlerDesign = designs.find((d) => isSettler(d.hullId));
  const explorerDesign = designs.find((d) => hullRoles(d.hullId).includes('explore'));
  const warDesign = designs.filter((d) => designStats(data, d).weapons.length > 0).sort((a, b) => designStats(data, b).cost - designStats(data, a).cost)[0];
  systems.forEach((s, i) => {
    if (s.buildQueue.length >= 2 || s.siege) return;
    const r = systemReport(state, data, s);
    if (!r) return;
    if (i === 0 && settlerDesign && settlers === 0 && ownedSystems(state, empire.id).length < maxSystems && bestColonyTarget(state, data, empire, s.id)) {
      if (!queueShip(state, data, s.id, settlerDesign.id)) { settlers++; return; }
    }
    if (i === 0 && explorerDesign && explorers === 0 && state.turn < 80) {
      if (!queueShip(state, data, s.id, explorerDesign.id)) { explorers++; return; }
    }
    if (warDesign && warships < wantedWar && i < 2 && empire.dust > 60 && (anyWar || netDust > 2)) {
      if (!queueShip(state, data, s.id, warDesign.id)) { warships++; return; }
    }
    const avail = availableImprovements(state, data, s).filter((d) => netDust > 0 || d.upkeep === 0);
    if (!avail.length || empire.dust < -20) return;
    let pick = r.foodNet < 1 ? avail.find((d) => d.effects.some((e) => e.resource === 'food')) : undefined;
    if (!pick && r.approval < 45) pick = avail.find((d) => d.effects.some((e) => (e.approval ?? 0) > 0));
    if (!pick) pick = IMPROVEMENT_ORDER.map((id) => avail.find((d) => d.id === id)).find((d): d is NonNullable<typeof d> => !!d) ?? [...avail].sort((a, b) => a.cost - b.cost)[0];
    if (pick) queueImprovement(state, data, s.id, pick.id);
  });
}

function aiPolitics(state: GameState, data: GameData, empire: Empire, rng: Rng): void {
  if (empire.senate.laws.length < MAX_LAWS && empire.influence > 80) {
    const laws = availableLaws(data, empire).sort((a, b) => (a.ideology === empire.senate.ruling ? -1 : 0) - (b.ideology === empire.senate.ruling ? -1 : 0));
    if (laws.length) passLaw(data, empire, laws[0].id);
  }
  for (const minor of minorEmpires(state)) {
    if (!empire.exploredSystems.includes(minor.homeSystemId)) continue;
    if (minorRelation(state, minor.id, empire.id) >= ASSIMILATE_AT) { assimilateMinor(state, empire.id, minor.id); continue; }
    if (empire.influence > 60 && rng.chance(0.3)) sendEnvoys(state, empire.id, minor.id);
  }
}
