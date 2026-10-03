import { index } from './data';
import { eventEffects } from './events';
import { ownedSystems } from './state';
import type { Effect, Empire, FactionDef, GameData, GameState, Ideology, LawDef, Notification, Senate } from './types';
import { IDEOLOGIES } from './types';
import { atWar } from './war';

export const ELECTION_INTERVAL = 20;
export const MAX_LAWS = 3;
export const LAW_SUPPORT_THRESHOLD = 15;
export const PARTY_COLLAPSE = 8;

export const RULING_BONUS: Record<Ideology, Effect[]> = {
  industrialist: [{ resource: 'industry', percent: 5 }],
  mercantile: [{ resource: 'dust', percent: 5 }],
  scientific: [{ resource: 'science', percent: 5 }],
  pacifist: [{ approval: 5 }],
  militarist: [{ shipCost: 5 }],
};

export const RULING_BONUS_TEXT: Record<Ideology, string> = {
  industrialist: '+5% industry', mercantile: '+5% Dust', scientific: '+5% science', pacifist: '+5 approval', militarist: 'ships cost 5% less',
};

/** Each faction's natural political lean. */
export function partyBias(faction: FactionDef): Record<Ideology, number> {
  const base: Record<Ideology, number> = { industrialist: 20, mercantile: 20, scientific: 20, pacifist: 20, militarist: 20 };
  const lean: Record<string, Ideology[]> = {
    devourer: ['industrialist', 'militarist'], nomad: ['scientific', 'pacifist'], serene: ['pacifist', 'scientific'],
    broker: ['mercantile', 'mercantile'], forgeborn: ['industrialist', 'militarist'], dreamer: ['scientific', 'scientific'],
  };
  for (const p of lean[faction.affinity.id] ?? []) base[p] += 8;
  return normalise(base);
}

function normalise(s: Record<Ideology, number>): Record<Ideology, number> {
  const total = IDEOLOGIES.reduce((n, k) => n + Math.max(0, s[k]), 0) || 1;
  const out = {} as Record<Ideology, number>;
  for (const k of IDEOLOGIES) out[k] = Math.round((Math.max(0, s[k]) / total) * 1000) / 10;
  return out;
}

function leader(support: Record<Ideology, number>): Ideology {
  return IDEOLOGIES.reduce((best, k) => (support[k] > support[best] ? k : best), IDEOLOGIES[0]);
}

export function initialSenate(_data: GameData, faction: FactionDef): Senate {
  const support = partyBias(faction);
  return { support, ruling: leader(support), nextElection: 1 + ELECTION_INTERVAL, laws: [] };
}

export function lawAvailable(empire: Empire, law: LawDef): boolean {
  if (empire.senate.laws.includes(law.id)) return false;
  if (law.requires && !empire.techs.includes(law.requires)) return false;
  return empire.senate.ruling === law.ideology || empire.senate.support[law.ideology] >= LAW_SUPPORT_THRESHOLD;
}

export function availableLaws(data: GameData, empire: Empire): LawDef[] {
  return data.laws.filter((l) => lawAvailable(empire, l));
}

export function passLaw(data: GameData, empire: Empire, lawId: string): string | null {
  const law = index(data).law[lawId];
  if (!law) return 'Unknown law.';
  if (!lawAvailable(empire, law)) return 'The senate will not pass that law.';
  if (empire.senate.laws.length >= MAX_LAWS) return `Only ${MAX_LAWS} laws may be active at once.`;
  if (empire.influence < law.cost) return `Passing ${law.name} needs ${law.cost} influence.`;
  empire.influence -= law.cost;
  empire.senate.laws.push(lawId);
  return null;
}

export function repealLaw(empire: Empire, lawId: string): void {
  empire.senate.laws = empire.senate.laws.filter((l) => l !== lawId);
}

export function lawUpkeep(data: GameData, empire: Empire): number {
  const idx = index(data);
  return empire.senate.laws.reduce((n, id) => n + (idx.law[id]?.upkeep ?? 0), 0);
}

/** Empire-wide effects applied to every system: ruling party, laws, events, assimilated minors. */
export function empireEffects(data: GameData, empire: Empire): Effect[] {
  const idx = index(data);
  const out: Effect[] = [...(RULING_BONUS[empire.senate.ruling] ?? [])];
  for (const id of empire.senate.laws) out.push(...(idx.law[id]?.effects ?? []));
  out.push(...eventEffects(data, empire));
  for (const id of empire.assimilated) out.push(...(idx.minor[id]?.bonus ?? []));
  return out;
}

/** Drifts party support toward what the empire is doing, charges law upkeep, and holds elections. */
export function processPolitics(state: GameState, data: GameData, empire: Empire, notes: Array<Omit<Notification, 'turn'>>): void {
  const idx = index(data);
  const faction = idx.faction[empire.factionId];
  const systems = ownedSystems(state, empire.id);
  const wars = state.empires.filter((e) => e.id !== empire.id && !e.isPirate && !e.isMinor && !e.eliminated && atWar(state, empire.id, e.id)).length;
  const warships = state.fleets.filter((f) => f.ownerId === empire.id).flatMap((f) => f.ships).filter((s) => (idx.hull[s.hullId]?.slots.weapon ?? 0) > 0).length;
  const treaties = Object.entries(state.relations).filter(([k, r]) => k.includes(empire.id) && (r.trade || r.research || r.status === 'alliance')).length;
  const pull: Record<Ideology, number> = {
    industrialist: systems.filter((s) => s.buildQueue.some((b) => b.kind === 'improvement')).length,
    mercantile: (empire.lastTotals.dust > 15 ? 2 : 0) + treaties,
    scientific: (empire.research.current ? 2 : 0) + empire.techs.length / 5,
    pacifist: (wars ? 0 : 2) + treaties,
    militarist: wars * 3 + warships / 4,
  };
  const bias = partyBias(faction);
  const s = empire.senate.support;
  for (const k of IDEOLOGIES) s[k] = s[k] * 0.96 + bias[k] * 0.04 + pull[k] * 0.6;
  empire.senate.support = normalise(s);
  const upkeep = lawUpkeep(data, empire);
  empire.influence = Math.round((empire.influence - upkeep) * 10) / 10;
  if (empire.influence < 0 && empire.senate.laws.length) {
    const dropped = empire.senate.laws.pop()!;
    empire.influence = 0;
    notes.push({ kind: 'senate', text: `Influence ran dry: ${idx.law[dropped]?.name ?? dropped} was repealed.` });
  }
  if (state.turn >= empire.senate.nextElection) {
    const winner = leader(empire.senate.support);
    const changed = winner !== empire.senate.ruling;
    empire.senate.ruling = winner;
    empire.senate.nextElection = state.turn + ELECTION_INTERVAL;
    const collapsed = empire.senate.laws.filter((id) => (empire.senate.support[idx.law[id]?.ideology ?? 'pacifist'] ?? 0) < PARTY_COLLAPSE);
    for (const id of collapsed) repealLaw(empire, id);
    notes.push({ kind: 'senate', text: `Election: the ${winner} party ${changed ? 'takes' : 'keeps'} the senate (${RULING_BONUS_TEXT[winner]}).${collapsed.length ? ` Repealed: ${collapsed.map((id) => idx.law[id]?.name ?? id).join(', ')}.` : ''}` });
  }
}
