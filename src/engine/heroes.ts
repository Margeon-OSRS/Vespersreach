import { index } from './data';
import type { Rng } from './rng';
import { getEmpire, nextId } from './state';
import type { Effect, Empire, Fleet, GameData, GameState, Hero, HeroAssignment, HeroDef, HeroSkillDef, Notification, StarSystem } from './types';
import { RESOURCE_KEYS } from './types';

export const HERO_UPKEEP = 3;
export const MARKET_SIZE = 3;
export const RECRUIT_INFLUENCE = 10;

export function xpThreshold(level: number): number {
  return Math.round(25 * Math.pow(level, 1.5));
}

export function refreshHeroMarket(state: GameState, data: GameData, rng: Rng): void {
  const taken = new Set(state.empires.flatMap((e) => e.heroes.map((h) => h.defId)));
  const pool = data.heroes.filter((h) => !taken.has(h.id) && !state.heroMarket.includes(h.id));
  while (state.heroMarket.length < MARKET_SIZE && pool.length) {
    const pick = rng.pick(pool);
    state.heroMarket.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
}

export function recruitHero(state: GameState, data: GameData, empireId: string, defId: string): string | null {
  const def = index(data).hero[defId];
  if (!def || !state.heroMarket.includes(defId)) return 'That hero is not available.';
  const empire = getEmpire(state, empireId);
  if (empire.dust < def.cost) return `Recruiting ${def.name} costs ${def.cost} Dust.`;
  if (empire.influence < RECRUIT_INFLUENCE) return `Recruiting needs ${RECRUIT_INFLUENCE} influence.`;
  empire.dust -= def.cost;
  empire.influence -= RECRUIT_INFLUENCE;
  empire.heroes.push({ id: nextId(state, 'hero'), defId, level: 1, xp: 0, skills: [...def.innate], assignment: null });
  state.heroMarket = state.heroMarket.filter((h) => h !== defId);
  return null;
}

export function roleAllows(def: HeroDef, kind: 'governor' | 'admiral'): boolean {
  return def.role === 'both' || def.role === kind;
}

export function assignHero(state: GameState, data: GameData, empireId: string, heroId: string, assignment: HeroAssignment | null): string | null {
  const empire = getEmpire(state, empireId);
  const hero = empire.heroes.find((h) => h.id === heroId);
  if (!hero) return 'Unknown hero.';
  if (!assignment) { hero.assignment = null; return null; }
  const def = index(data).hero[hero.defId];
  if (!roleAllows(def, assignment.kind)) return `${def.name} cannot serve as ${assignment.kind}.`;
  if (assignment.kind === 'governor') {
    const system = state.galaxy.systems.find((s) => s.id === assignment.systemId);
    if (!system || system.ownerId !== empireId) return 'You do not own that system.';
    if (empire.heroes.some((h) => h.id !== heroId && h.assignment?.kind === 'governor' && h.assignment.systemId === assignment.systemId)) return 'That system already has a governor.';
  } else {
    const fleet = state.fleets.find((f) => f.id === assignment.fleetId);
    if (!fleet || fleet.ownerId !== empireId) return 'You do not own that fleet.';
    if (empire.heroes.some((h) => h.id !== heroId && h.assignment?.kind === 'admiral' && h.assignment.fleetId === assignment.fleetId)) return 'That fleet already has an admiral.';
  }
  hero.assignment = assignment;
  return null;
}

export function governorOf(state: GameState, system: StarSystem): Hero | null {
  if (!system.ownerId) return null;
  const owner = state.empires.find((e) => e.id === system.ownerId);
  return owner?.heroes.find((h) => h.assignment?.kind === 'governor' && h.assignment.systemId === system.id) ?? null;
}

export function admiralOf(state: GameState, fleet: Fleet): Hero | null {
  const owner = state.empires.find((e) => e.id === fleet.ownerId);
  return owner?.heroes.find((h) => h.assignment?.kind === 'admiral' && h.assignment.fleetId === fleet.id) ?? null;
}

/** Skill effects plus +2% to every resource per level above one. */
export function governorEffects(data: GameData, hero: Hero): Effect[] {
  const idx = index(data);
  const out: Effect[] = [];
  for (const id of hero.skills) out.push(...(idx.heroSkill[id]?.effects ?? []));
  if (hero.level > 1) for (const k of RESOURCE_KEYS) out.push({ resource: k, percent: 2 * (hero.level - 1) });
  return out;
}

export interface AdmiralMods { damage: number; accuracy: number; evasion: number; shields: number; hp: number; speed: number }

export function admiralMods(data: GameData, hero: Hero | null): AdmiralMods {
  const m: AdmiralMods = { damage: 0, accuracy: 0, evasion: 0, shields: 0, hp: 0, speed: 0 };
  if (!hero) return m;
  const idx = index(data);
  for (const id of hero.skills) {
    const c = idx.heroSkill[id]?.combat;
    if (!c) continue;
    m.damage += c.damage ?? 0; m.accuracy += c.accuracy ?? 0; m.evasion += c.evasion ?? 0;
    m.shields += c.shields ?? 0; m.hp += c.hp ?? 0; m.speed += c.speed ?? 0;
  }
  m.damage += 2 * (hero.level - 1);
  return m;
}

export function skillPoints(data: GameData, hero: Hero): number {
  const def = index(data).hero[hero.defId];
  const learned = hero.skills.filter((s) => !def.innate.includes(s)).length;
  return Math.max(0, hero.level - 1 - learned);
}

export function availableSkills(data: GameData, hero: Hero): HeroSkillDef[] {
  const def = index(data).hero[hero.defId];
  return data.heroSkills.filter((s) => !hero.skills.includes(s.id) && roleAllows(def, s.tree) && (!s.requires || hero.skills.includes(s.requires)));
}

export function learnSkill(data: GameData, empire: Empire, heroId: string, skillId: string): string | null {
  const hero = empire.heroes.find((h) => h.id === heroId);
  if (!hero) return 'Unknown hero.';
  if (skillPoints(data, hero) <= 0) return 'No skill points available.';
  if (!availableSkills(data, hero).some((s) => s.id === skillId)) return 'That skill cannot be learned yet.';
  hero.skills.push(skillId);
  return null;
}

export function heroXp(empire: Empire, heroId: string, amount: number): void {
  const hero = empire.heroes.find((h) => h.id === heroId);
  if (hero) hero.xp += amount;
}

/** Clears orphaned assignments, grants turn experience, levels up. Returns Dust upkeep. */
export function processHeroes(state: GameState, data: GameData, empire: Empire, notes: Array<Omit<Notification, 'turn'>>): number {
  const idx = index(data);
  for (const hero of empire.heroes) {
    const a = hero.assignment;
    if (a?.kind === 'governor' && state.galaxy.systems.find((s) => s.id === a.systemId)?.ownerId !== empire.id) hero.assignment = null;
    if (a?.kind === 'admiral' && !state.fleets.some((f) => f.id === a.fleetId && f.ownerId === empire.id)) hero.assignment = null;
    hero.xp += hero.assignment?.kind === 'governor' ? 4 : hero.assignment?.kind === 'admiral' ? 2 : 0;
    while (hero.xp >= xpThreshold(hero.level) && hero.level < 10) {
      hero.xp -= xpThreshold(hero.level);
      hero.level += 1;
      notes.push({ kind: 'hero', text: `${idx.hero[hero.defId]?.name ?? 'A hero'} reached level ${hero.level}. A skill point is waiting.` });
    }
  }
  return empire.heroes.length * HERO_UPKEEP;
}
