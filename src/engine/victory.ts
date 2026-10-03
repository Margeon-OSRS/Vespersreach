import { index } from './data';
import { ownedSystems, systemPop } from './state';
import type { Empire, GalaxySize, GameData, GameState, Victory, VictoryKind } from './types';

export const ECONOMIC_TARGET: Record<GalaxySize, number> = { tiny: 3000, small: 4000, medium: 5000, large: 6500, huge: 8000 };
export const WONDER_ID = 'wonder_beacon';

export const VICTORY_TITLE: Record<VictoryKind, string> = {
  score: 'Victory by Score', conquest: 'Conquest Victory', science: 'Science Victory',
  economic: 'Economic Victory', wonder: 'Wonder Victory', supremacy: 'Supremacy Victory',
};

export const VICTORY_TEXT: Record<VictoryKind, string> = {
  score: 'The turn limit was reached with the highest score.',
  conquest: 'Every rival empire has been eliminated.',
  science: 'Every technology has been researched.',
  economic: 'The treasury reached the economic target.',
  wonder: 'The Vesper Beacon was completed.',
  supremacy: 'Every founding capital is held by one empire.',
};

/** Major empires: not pirates, not minor factions. */
export function majors(state: GameState): Empire[] {
  return state.empires.filter((e) => !e.isPirate && !e.isMinor);
}

export function scoreOf(state: GameState, data: GameData, empire: Empire): number {
  const idx = index(data);
  const systems = ownedSystems(state, empire.id);
  const pop = systems.reduce((n, s) => n + systemPop(s), 0);
  const warships = state.fleets.filter((f) => f.ownerId === empire.id).flatMap((f) => f.ships).filter((s) => (idx.hull[s.hullId]?.slots.weapon ?? 0) > 0).length;
  return Math.round(systems.length * 10 + pop * 3 + empire.techs.length * 5 + Math.max(0, empire.dust) / 50 + warships * 2
    + empire.heroes.length * 5 + empire.senate.laws.length * 5 + empire.assimilated.length * 10 + empire.stats.battlesWon * 2);
}

export function economicTarget(state: GameState): number {
  return ECONOMIC_TARGET[state.settings.size] ?? 5000;
}

/** Returns the first victory condition met this turn, or null. Checked after all empires have acted. */
export function checkVictory(state: GameState, data: GameData): Victory | null {
  const all = majors(state);
  const alive = all.filter((e) => !e.eliminated);
  const capitals = all.map((e) => e.homeSystemId).filter(Boolean);
  const turn = state.turn;
  for (const e of alive) {
    if (all.length > 1 && alive.length === 1) return { empireId: e.id, kind: 'conquest', turn };
    if (all.length > 1 && capitals.every((id) => state.galaxy.systems.find((s) => s.id === id)?.ownerId === e.id)) return { empireId: e.id, kind: 'supremacy', turn };
    if (ownedSystems(state, e.id).some((s) => s.improvements.includes(WONDER_ID))) return { empireId: e.id, kind: 'wonder', turn };
    if (data.techs.every((t) => e.techs.includes(t.id))) return { empireId: e.id, kind: 'science', turn };
    if (e.dust >= economicTarget(state)) return { empireId: e.id, kind: 'economic', turn };
  }
  if (state.settings.turnLimit && turn >= state.settings.turnLimit && alive.length) {
    const best = [...alive].sort((a, b) => scoreOf(state, data, b) - scoreOf(state, data, a))[0];
    return { empireId: best.id, kind: 'score', turn };
  }
  return null;
}
