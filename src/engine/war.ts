import { index } from './data';
import { adjustMemory, relationOf, setRelation } from './diplomacy';
import { getEmpire } from './state';
import type { GameData, GameState, RelationStatus } from './types';

export function relation(state: GameState, a: string, b: string): RelationStatus {
  return relationOf(state, a, b).status;
}

/** Pirates are at war with everyone, always. */
export function atWar(state: GameState, a: string, b: string): boolean {
  if (a === b) return false;
  const ea = state.empires.find((e) => e.id === a), eb = state.empires.find((e) => e.id === b);
  if (ea?.isPirate || eb?.isPirate) return true;
  return relation(state, a, b) === 'war';
}

export function declareWar(state: GameState, data: GameData, from: string, to: string): string | null {
  if (from === to) return 'You cannot declare war on yourself.';
  const empire = getEmpire(state, from);
  const faction = index(data).faction[empire.factionId];
  if (faction.modifiers.pacifist) return `${faction.name} cannot declare war.`;
  if (atWar(state, from, to)) return 'Already at war.';
  const wasAllied = relationOf(state, from, to).status === 'alliance';
  setRelation(state, from, to, { status: 'war', sinceTurn: state.turn, warScore: 0, trade: false, research: false });
  empire.warDeclarations += 1;
  adjustMemory(state, to, from, wasAllied ? -50 : -30);
  for (const other of state.empires) if (other.id !== from && other.id !== to && !other.isPirate) adjustMemory(state, other.id, from, -5);
  return null;
}

/** Immediate peace between two empires (AI-to-AI deals and tests). Player-facing peace goes through proposals. */
export function makePeace(state: GameState, a: string, b: string): string | null {
  if (!atWar(state, a, b)) return 'Not at war.';
  if (getEmpire(state, a).isPirate || getEmpire(state, b).isPirate) return 'The Corsairs never make peace.';
  setRelation(state, a, b, { status: 'peace', sinceTurn: state.turn, warScore: 0 });
  return null;
}

/** Empires the given empire has met: any whose systems it has explored, or that it has relations with. Pirates excluded. */
export function knownEmpires(state: GameState, empireId: string): string[] {
  const me = getEmpire(state, empireId);
  const out = new Set<string>();
  for (const s of state.galaxy.systems) if (s.ownerId && s.ownerId !== empireId && me.exploredSystems.includes(s.id)) out.add(s.ownerId);
  for (const key of Object.keys(state.relations)) { const [a, b] = key.split('|'); if (a === empireId) out.add(b); if (b === empireId) out.add(a); }
  return [...out].filter((id) => { const e = state.empires.find((x) => x.id === id); return e && !e.isPirate && !e.isMinor && !e.eliminated; });
}
