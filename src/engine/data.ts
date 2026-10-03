import factionsJson from '@data/factions.json';
import planetsJson from '@data/planets.json';
import anomaliesJson from '@data/anomalies.json';
import depositsJson from '@data/deposits.json';
import improvementsJson from '@data/improvements.json';
import hullsJson from '@data/hulls.json';
import modulesJson from '@data/modules.json';
import techsJson from '@data/techs.json';
import lawsJson from '@data/laws.json';
import eventsJson from '@data/events.json';
import tacticsJson from '@data/tactics.json';
import heroesJson from '@data/heroes.json';
import heroSkillsJson from '@data/heroSkills.json';
import questsJson from '@data/quests.json';
import minorsJson from '@data/minors.json';
import type {
  AnomalyDef, DepositDef, EventDef, FactionDef, GameData, HeroDef, HeroSkillDef, HullDef, ImprovementDef,
  LawDef, MinorDef, ModuleDef, PlanetTypeDef, QuestDef, TacticDef, TechDef,
} from './types';
import { IDEOLOGIES } from './types';

/** Loads the bundled JSON data. The JSON is trusted; types are asserted, then validated. */
export function loadData(): GameData {
  const data: GameData = {
    factions: factionsJson as unknown as FactionDef[],
    planetTypes: planetsJson as unknown as PlanetTypeDef[],
    anomalies: anomaliesJson as unknown as AnomalyDef[],
    deposits: depositsJson as unknown as DepositDef[],
    improvements: improvementsJson as unknown as ImprovementDef[],
    hulls: hullsJson as unknown as HullDef[],
    modules: modulesJson as unknown as ModuleDef[],
    techs: techsJson as unknown as TechDef[],
    laws: lawsJson as unknown as LawDef[],
    events: eventsJson as unknown as EventDef[],
    tactics: tacticsJson as unknown as TacticDef[],
    heroes: heroesJson as unknown as HeroDef[],
    heroSkills: heroSkillsJson as unknown as HeroSkillDef[],
    quests: questsJson as unknown as QuestDef[],
    minors: minorsJson as unknown as MinorDef[],
  };
  const problems = validateData(data);
  if (problems.length) throw new Error('Invalid game data:\n' + problems.join('\n'));
  return data;
}

/** Cross-reference checks so a typo in one JSON file fails loudly at startup and in tests. */
export function validateData(d: GameData): string[] {
  const out: string[] = [];
  const ids = (list: Array<{ id: string }>) => new Set(list.map((x) => x.id));
  const techs = ids(d.techs), impr = ids(d.improvements), hulls = ids(d.hulls), mods = ids(d.modules);
  const laws = ids(d.laws), planets = ids(d.planetTypes), factions = ids(d.factions);
  const dup = (name: string, list: Array<{ id: string }>) => {
    const seen = new Set<string>();
    for (const x of list) { if (seen.has(x.id)) out.push(`${name}: duplicate id ${x.id}`); seen.add(x.id); }
  };
  dup('techs', d.techs); dup('improvements', d.improvements); dup('hulls', d.hulls); dup('modules', d.modules);
  dup('factions', d.factions); dup('planetTypes', d.planetTypes); dup('anomalies', d.anomalies); dup('deposits', d.deposits); dup('tactics', d.tactics);
  const tacticIds = ids(d.tactics), skillIds = ids(d.heroSkills);
  dup('heroes', d.heroes); dup('heroSkills', d.heroSkills);
  for (const h of d.heroes) { for (const s of h.innate) if (!skillIds.has(s)) out.push(`hero ${h.id}: unknown skill ${s}`); if (h.faction && !factions.has(h.faction)) out.push(`hero ${h.id}: unknown faction ${h.faction}`); }
  for (const s of d.heroSkills) if (s.requires && !skillIds.has(s.requires)) out.push(`skill ${s.id}: unknown requirement ${s.requires}`);
  for (const l of d.laws) { if (!IDEOLOGIES.includes(l.ideology)) out.push(`law ${l.id}: unknown ideology ${l.ideology}`); if (l.requires && !techs.has(l.requires)) out.push(`law ${l.id}: unknown tech ${l.requires}`); }
  for (const q of d.quests) { if (!factions.has(q.factionId)) out.push(`quest for unknown faction ${q.factionId}`); for (const s of q.steps) { if (s.reward.tech && !techs.has(s.reward.tech)) out.push(`quest step ${s.id}: unknown reward tech ${s.reward.tech}`); if ((s.objective.kind === 'tech' && !techs.has(String(s.objective.target))) || (s.objective.kind === 'improvement' && !impr.has(String(s.objective.target)))) out.push(`quest step ${s.id}: unknown objective ${s.objective.target}`); } }
  for (const m of d.minors) if (!d.factions.some((f) => f.id === m.id && f.minor)) out.push(`minor ${m.id}: no minor faction definition`);
  for (const t of d.tactics) for (const c of t.counters) if (!tacticIds.has(c)) out.push(`tactic ${t.id}: unknown counter ${c}`);
  for (const f of d.factions) {
    if (!hulls.has(f.uniqueHull)) out.push(`faction ${f.id}: unknown uniqueHull ${f.uniqueHull}`);
    if (!impr.has(f.uniqueImprovement)) out.push(`faction ${f.id}: unknown uniqueImprovement ${f.uniqueImprovement}`);
    if (!planets.has(f.homePlanet)) out.push(`faction ${f.id}: unknown homePlanet ${f.homePlanet}`);
  }
  for (const i of d.improvements) {
    if (i.requires && !techs.has(i.requires)) out.push(`improvement ${i.id}: unknown tech ${i.requires}`);
    if (i.factionOnly && !factions.has(i.factionOnly)) out.push(`improvement ${i.id}: unknown faction ${i.factionOnly}`);
  }
  for (const h of d.hulls) {
    if (h.requires && !techs.has(h.requires)) out.push(`hull ${h.id}: unknown tech ${h.requires}`);
    if (h.factionOnly && !factions.has(h.factionOnly)) out.push(`hull ${h.id}: unknown faction ${h.factionOnly}`);
  }
  for (const m of d.modules) if (m.requires && !techs.has(m.requires)) out.push(`module ${m.id}: unknown tech ${m.requires}`);
  for (const t of d.techs) {
    for (const p of t.prerequisites) if (!techs.has(p)) out.push(`tech ${t.id}: unknown prerequisite ${p}`);
    for (const x of t.unlocks.improvements ?? []) if (!impr.has(x)) out.push(`tech ${t.id}: unknown improvement ${x}`);
    for (const x of t.unlocks.hulls ?? []) if (!hulls.has(x)) out.push(`tech ${t.id}: unknown hull ${x}`);
    for (const x of t.unlocks.modules ?? []) if (!mods.has(x)) out.push(`tech ${t.id}: unknown module ${x}`);
    for (const x of t.unlocks.laws ?? []) if (!laws.has(x)) out.push(`tech ${t.id}: unknown law ${x}`);
  }
  return out;
}

export interface DataIndex {
  faction: Record<string, FactionDef>;
  planetType: Record<string, PlanetTypeDef>;
  anomaly: Record<string, AnomalyDef>;
  deposit: Record<string, DepositDef>;
  improvement: Record<string, ImprovementDef>;
  hull: Record<string, HullDef>;
  module: Record<string, ModuleDef>;
  tech: Record<string, TechDef>;
  law: Record<string, LawDef>;
  tactic: Record<string, TacticDef>;
  hero: Record<string, HeroDef>;
  heroSkill: Record<string, HeroSkillDef>;
  minor: Record<string, MinorDef>;
  quest: Record<string, QuestDef>;
}

const indexCache = new WeakMap<GameData, DataIndex>();

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  const r: Record<string, T> = {};
  for (const x of list) r[x.id] = x;
  return r;
}

/** Id lookup tables, memoised per GameData instance. */
export function index(d: GameData): DataIndex {
  let idx = indexCache.get(d);
  if (!idx) {
    idx = {
      faction: byId(d.factions), planetType: byId(d.planetTypes), anomaly: byId(d.anomalies),
      deposit: byId(d.deposits), improvement: byId(d.improvements), hull: byId(d.hulls),
      module: byId(d.modules), tech: byId(d.techs), law: byId(d.laws), tactic: byId(d.tactics), hero: byId(d.heroes), heroSkill: byId(d.heroSkills), minor: byId(d.minors),
      quest: Object.fromEntries(d.quests.map((q) => [q.factionId, q])),
    };
    indexCache.set(d, idx);
  }
  return idx;
}
