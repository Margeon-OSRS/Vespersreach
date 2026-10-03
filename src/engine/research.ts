import { index } from './data';
import { ensureDefaultDesigns } from './designs';
import type { Empire, GameData, Notification, TechDef } from './types';

export function techResearched(empire: Empire, techId: string): boolean {
  return empire.techs.includes(techId);
}

export function techAvailable(empire: Empire, tech: TechDef): boolean {
  return !empire.techs.includes(tech.id) && tech.prerequisites.every((p) => empire.techs.includes(p));
}

export function availableTechs(data: GameData, empire: Empire): TechDef[] {
  return data.techs.filter((t) => techAvailable(empire, t));
}

/** Starts researching a tech now (if available) or appends it to the queue. */
export function setResearch(data: GameData, empire: Empire, techId: string): string | null {
  const tech = index(data).tech[techId];
  if (!tech) return 'Unknown technology.';
  if (empire.techs.includes(techId)) return 'Already researched.';
  if (empire.research.current === techId || empire.research.queue.includes(techId)) return 'Already queued.';
  if (!tech.prerequisites.every((p) => empire.techs.includes(p) || empire.research.current === p || empire.research.queue.includes(p))) {
    return 'Prerequisites are not researched or queued.';
  }
  if (empire.research.current === null) {
    empire.research.current = techId;
    empire.research.progress += empire.science;
    empire.science = 0;
  } else {
    empire.research.queue.push(techId);
  }
  return null;
}

export function cancelResearch(empire: Empire, techId: string): void {
  if (empire.research.current === techId) {
    empire.research.current = empire.research.queue.shift() ?? null;
  } else {
    empire.research.queue = empire.research.queue.filter((t) => t !== techId);
  }
}

/** Grants a tech and applies its passive unlocks. */
export function grantTech(data: GameData, empire: Empire, techId: string): void {
  const tech = index(data).tech[techId];
  if (!tech || empire.techs.includes(techId)) return;
  empire.techs.push(techId);
  if (tech.unlocks.planetTier) empire.planetTier = Math.max(empire.planetTier, tech.unlocks.planetTier);
  ensureDefaultDesigns(data, empire);
}

export function turnsToComplete(data: GameData, empire: Empire, sciencePerTurn: number): number | null {
  const tech = empire.research.current ? index(data).tech[empire.research.current] : null;
  if (!tech) return null;
  if (sciencePerTurn <= 0) return Infinity;
  return Math.max(1, Math.ceil((tech.cost - empire.research.progress) / sciencePerTurn));
}

/** Applies one turn of science. Completed techs are reported through `notes`. */
export function processResearch(data: GameData, empire: Empire, science: number, notes: Array<Omit<Notification, 'turn'>>): void {
  const idx = index(data);
  const r = empire.research;
  if (r.current === null && r.queue.length) r.current = r.queue.shift()!;
  if (r.current === null) {
    empire.science = Math.round((empire.science + science) * 10) / 10;
    return;
  }
  r.progress += science;
  let guard = 0;
  while (r.current && guard++ < 10) {
    const tech = idx.tech[r.current];
    if (!tech) { r.current = r.queue.shift() ?? null; continue; }
    if (r.progress < tech.cost) break;
    r.progress -= tech.cost;
    grantTech(data, empire, tech.id);
    notes.push({ kind: 'research', text: `Research complete: ${tech.name}.` });
    r.current = r.queue.shift() ?? null;
    if (r.current === null) { empire.science = Math.round((empire.science + r.progress) * 10) / 10; r.progress = 0; }
  }
  r.progress = Math.round(r.progress * 10) / 10;
}
