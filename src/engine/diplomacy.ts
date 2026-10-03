import { index } from './data';
import { shipStats } from './fleets';
import { neighbours } from './graph';
import { getEmpire, nextId, ownedSystems } from './state';
import type { Empire, Fleet, GameData, GameState, Relation, TreatyKind } from './types';

export const TREATY_COST: Record<TreatyKind, number> = { peace: 10, trade: 20, research: 25, alliance: 50, tribute: 10 };
export const TRIBUTE_AMOUNT = 60;
export const GIFT_AMOUNT = 50;
export const TREATY_FLAT_BONUS = 4;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function pairKey(a: string, b: string): string { return [a, b].sort().join('|'); }
export function memoryKey(from: string, to: string): string { return `${from}>${to}`; }

export function relationOf(state: GameState, a: string, b: string): Relation {
  return state.relations[pairKey(a, b)] ?? { status: 'peace', trade: false, research: false, warScore: 0, sinceTurn: 1 };
}

export function setRelation(state: GameState, a: string, b: string, patch: Partial<Relation>): Relation {
  const r = { ...relationOf(state, a, b), ...patch };
  state.relations[pairKey(a, b)] = r;
  return r;
}

export function adjustMemory(state: GameState, from: string, to: string, delta: number): void {
  const k = memoryKey(from, to);
  state.attitudes[k] = clamp((state.attitudes[k] ?? 0) + delta, -100, 100);
}

export function decayAttitudes(state: GameState): void {
  for (const k of Object.keys(state.attitudes)) {
    const v = state.attitudes[k];
    if (Math.abs(v) <= 1) delete state.attitudes[k]; else state.attitudes[k] = v - Math.sign(v);
  }
}

export function fleetStrength(state: GameState, data: GameData, fleet: Fleet): number {
  const empire = getEmpire(state, fleet.ownerId);
  let n = 0;
  for (const s of fleet.ships) {
    const st = shipStats(data, empire, s);
    n += st.weapons.reduce((d, w) => d + w.damage * w.accuracy, 0) + (s.hp + st.shield + st.armour) / 10;
  }
  return Math.round(n);
}

export function empireStrength(state: GameState, data: GameData, empireId: string): number {
  return state.fleets.filter((f) => f.ownerId === empireId).reduce((n, f) => n + fleetStrength(state, data, f), 0);
}

export interface AttitudeReport { value: number; label: string; reasons: Array<{ label: string; value: number }> }

export function attitudeLabel(v: number): string {
  if (v <= -40) return 'Hostile';
  if (v <= -10) return 'Cold';
  if (v < 10) return 'Neutral';
  if (v < 40) return 'Warm';
  return 'Friendly';
}

/** How `from` feels about `to`, with the reasons behind it. */
export function attitude(state: GameState, data: GameData, from: string, to: string): AttitudeReport {
  const idx = index(data);
  const a = getEmpire(state, from), b = getEmpire(state, to);
  const reasons: AttitudeReport['reasons'] = [];
  const add = (label: string, value: number) => { if (value) reasons.push({ label, value: Math.round(value) }); };
  add('Remembered deeds', state.attitudes[memoryKey(from, to)] ?? 0);
  const fa = idx.faction[a.factionId], fb = idx.faction[b.factionId];
  if (fa.modifiers.pacifist) add('Pacifist outlook', 10);
  if (fb.modifiers.pacifist) add('They keep the peace', 5);
  if (fb.modifiers.depletionEvery) add('They consume worlds', -10);
  if (fa.affinity.id === fb.affinity.id) add('Kindred affinity', 5);
  const rel = relationOf(state, from, to);
  if (rel.status === 'war') add('At war', -40);
  if (rel.status === 'alliance') add('Allied', 30);
  if (rel.trade) add('Trade treaty', 10);
  if (rel.research) add('Research treaty', 10);
  const mine = ownedSystems(state, from), theirs = new Set(ownedSystems(state, to).map((s) => s.id));
  let border = 0;
  for (const s of mine) for (const n of neighbours(state.galaxy.lanes, s.id)) if (theirs.has(n)) border++;
  if (border) add('Contested borders', -Math.min(20, border * 4));
  const ratio = theirs.size / Math.max(1, mine.length);
  if (ratio >= 2) add('Alarming expansion', -20); else if (ratio >= 1.5) add('Envy of their expansion', -10);
  if (b.warDeclarations) add('Warmonger', -Math.min(24, b.warDeclarations * 8));
  if (b.isPlayer && !a.isPlayer) {
    if (state.settings.difficulty === 'easy') add('Easy difficulty', 10);
    if (state.settings.difficulty === 'hard') add('Hard difficulty', -10);
  }
  const value = clamp(reasons.reduce((n, r) => n + r.value, 0), -100, 100);
  return { value, label: attitudeLabel(value), reasons };
}

export function warScoreFor(state: GameState, me: string, them: string): number {
  const r = relationOf(state, me, them);
  return [me, them].sort()[0] === me ? r.warScore : -r.warScore;
}

export function addWarScore(state: GameState, winner: string, loser: string, amount: number): void {
  const r = relationOf(state, winner, loser);
  const signed = [winner, loser].sort()[0] === winner ? amount : -amount;
  setRelation(state, winner, loser, { warScore: Math.round((r.warScore + signed) * 10) / 10 });
}

/** Flat Dust and science from trade and research treaties with living partners. */
export function treatyBonus(state: GameState, empire: Empire): { dust: number; science: number } {
  let dust = 0, science = 0;
  for (const [key, r] of Object.entries(state.relations)) {
    const [x, y] = key.split('|');
    if (x !== empire.id && y !== empire.id) continue;
    const other = state.empires.find((e) => e.id === (x === empire.id ? y : x));
    if (!other || other.eliminated) continue;
    if (r.trade) dust += TREATY_FLAT_BONUS;
    if (r.research) science += TREATY_FLAT_BONUS;
  }
  return { dust, science };
}

/** Whether an AI empire agrees to a proposal from `from`. */
export function aiAccepts(state: GameState, data: GameData, ai: Empire, from: string, kind: TreatyKind): boolean {
  const att = attitude(state, data, ai.id, from).value;
  const rel = relationOf(state, ai.id, from);
  switch (kind) {
    case 'peace': return rel.status === 'war' && (warScoreFor(state, ai.id, from) < -10 || att >= -15 || state.turn - rel.sinceTurn > 20);
    case 'trade': return rel.status !== 'war' && att >= 0;
    case 'research': return rel.status !== 'war' && att >= 15;
    case 'alliance': return rel.status === 'peace' && att >= 45;
    case 'tribute': return empireStrength(state, data, from) > empireStrength(state, data, ai.id) * 1.5 && ai.dust >= TRIBUTE_AMOUNT;
  }
}

function validateProposal(state: GameState, from: string, to: string, kind: TreatyKind): string | null {
  const rel = relationOf(state, from, to);
  if (getEmpire(state, to).isPirate) return 'The Corsairs do not negotiate.';
  if (kind === 'peace' && rel.status !== 'war') return 'You are not at war.';
  if (kind !== 'peace' && rel.status === 'war') return 'Make peace first.';
  if (kind === 'trade' && rel.trade) return 'A trade treaty already exists.';
  if (kind === 'research' && rel.research) return 'A research treaty already exists.';
  if (kind === 'alliance' && rel.status === 'alliance') return 'Already allied.';
  return null;
}

function settle(state: GameState, from: string, to: string, kind: TreatyKind): void {
  if (kind === 'tribute') {
    const payer = getEmpire(state, to);
    const amount = Math.min(TRIBUTE_AMOUNT, Math.max(0, payer.dust));
    payer.dust -= amount;
    getEmpire(state, from).dust += amount;
    return;
  }
  if (kind === 'peace') setRelation(state, from, to, { status: 'peace', warScore: 0, sinceTurn: state.turn });
  if (kind === 'trade') setRelation(state, from, to, { trade: true });
  if (kind === 'research') setRelation(state, from, to, { research: true });
  if (kind === 'alliance') setRelation(state, from, to, { status: 'alliance', sinceTurn: state.turn });
}

export interface ProposalResult { accepted: boolean | null; message: string }

/** Proposes a treaty. AI recipients answer at once; the player receives an offer to answer later. */
export function proposeTreaty(state: GameState, data: GameData, from: string, to: string, kind: TreatyKind): ProposalResult {
  const a = getEmpire(state, from), b = getEmpire(state, to);
  const invalid = validateProposal(state, from, to, kind);
  if (invalid) return { accepted: false, message: invalid };
  if (b.isPlayer) {
    if (state.offers.some((o) => o.from === from && o.to === to && o.kind === kind)) return { accepted: null, message: 'An offer is already pending.' };
    state.offers.push({ id: nextId(state, 'offer'), from, to, kind, turn: state.turn });
    return { accepted: null, message: 'Offer sent.' };
  }
  const cost = TREATY_COST[kind];
  if (a.isPlayer) {
    if (a.influence < cost) return { accepted: false, message: `That proposal needs ${cost} influence.` };
    a.influence -= cost;
  }
  if (aiAccepts(state, data, b, from, kind)) {
    settle(state, from, to, kind);
    adjustMemory(state, to, from, kind === 'tribute' ? -10 : 5);
    return { accepted: true, message: `${b.name} accepts.` };
  }
  adjustMemory(state, to, from, kind === 'tribute' ? -15 : -3);
  return { accepted: false, message: `${b.name} refuses.` };
}

export function respondOffer(state: GameState, offerId: string, accept: boolean): string | null {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return 'That offer has lapsed.';
  state.offers = state.offers.filter((o) => o.id !== offerId);
  if (accept) {
    if (validateProposal(state, offer.from, offer.to, offer.kind)) return 'That offer no longer applies.';
    settle(state, offer.from, offer.to, offer.kind);
    adjustMemory(state, offer.from, offer.to, 8);
  } else {
    adjustMemory(state, offer.from, offer.to, -5);
  }
  return null;
}

export function expireOffers(state: GameState): void {
  state.offers = state.offers.filter((o) => state.turn - o.turn < 10 && !getEmpire(state, o.from).eliminated);
}

export function cancelTreaty(state: GameState, from: string, to: string, kind: 'trade' | 'research' | 'alliance'): string | null {
  const rel = relationOf(state, from, to);
  if (kind === 'alliance') { if (rel.status !== 'alliance') return 'No alliance exists.'; setRelation(state, from, to, { status: 'peace', sinceTurn: state.turn }); }
  else { if (!rel[kind]) return 'No such treaty.'; setRelation(state, from, to, { [kind]: false }); }
  adjustMemory(state, to, from, -20);
  return null;
}

export function giftDust(state: GameState, from: string, to: string): string | null {
  const a = getEmpire(state, from);
  if (a.dust < GIFT_AMOUNT) return `A gift costs ${GIFT_AMOUNT} Dust.`;
  a.dust -= GIFT_AMOUNT;
  getEmpire(state, to).dust += GIFT_AMOUNT;
  adjustMemory(state, to, from, 12);
  return null;
}
