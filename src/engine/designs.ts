import { index } from './data';
import type { Empire, GameData, HullDef, ModuleDef, ModuleSlot, ShipDesign } from './types';

export interface DesignStats {
  hp: number;
  weapons: Array<{ kind: 'kinetic' | 'laser' | 'missile'; damage: number; accuracy: number; name: string }>;
  shield: number;
  armour: number;
  flak: number;
  speed: number;
  repair: number;
  vision: number;
  troops: number;
  cost: number;
  commandPoints: number;
}

export function designStats(data: GameData, design: ShipDesign): DesignStats {
  const idx = index(data);
  const hull = idx.hull[design.hullId];
  const s: DesignStats = {
    hp: hull?.hp ?? 1, weapons: [], shield: 0, armour: 0, flak: 0, speed: hull?.speed ?? 1, repair: 0, vision: 0,
    troops: hull?.troops ?? 0, cost: hull?.cost ?? 0, commandPoints: hull?.commandPoints ?? 1,
  };
  for (const id of design.modules) {
    const m = idx.module[id];
    if (!m) continue;
    s.cost += m.cost;
    switch (m.kind) {
      case 'kinetic': case 'laser': case 'missile':
        s.weapons.push({ kind: m.kind, damage: m.stats.damage ?? 0, accuracy: m.stats.accuracy ?? 0.7, name: m.name }); break;
      case 'shield': s.shield += m.stats.shield ?? 0; break;
      case 'armour': s.armour += m.stats.armour ?? 0; break;
      case 'flak': s.flak = Math.min(0.8, s.flak + (m.stats.flak ?? 0)); break;
      case 'engine': s.speed += m.stats.speed ?? 0; break;
      case 'probe': s.vision += m.stats.vision ?? 0; break;
      case 'repair': s.repair += m.stats.repair ?? 0; break;
    }
  }
  return s;
}

export function moduleAvailable(empire: Empire, m: ModuleDef): boolean {
  return !m.requires || empire.techs.includes(m.requires);
}

export function availableModules(data: GameData, empire: Empire, slot?: ModuleSlot): ModuleDef[] {
  return data.modules.filter((m) => moduleAvailable(empire, m) && (!slot || m.slot === slot));
}

/** Returns an error message when the design does not fit its hull or uses locked modules. */
export function validateDesign(data: GameData, empire: Empire, hull: HullDef, modules: string[]): string | null {
  const idx = index(data);
  const used: Record<ModuleSlot, number> = { weapon: 0, defence: 0, support: 0 };
  for (const id of modules) {
    const m = idx.module[id];
    if (!m) return `Unknown module ${id}.`;
    if (!moduleAvailable(empire, m)) return `${m.name} is not researched.`;
    used[m.slot]++;
    if (used[m.slot] > hull.slots[m.slot]) return `Too many ${m.slot} modules for a ${hull.name}.`;
  }
  return null;
}

export function getDesign(empire: Empire, id: string): ShipDesign | undefined {
  return empire.designs.find((d) => d.id === id);
}

let designCounter = 0;

export function createDesign(data: GameData, empire: Empire, name: string, hullId: string, modules: string[]): ShipDesign | string {
  const hull = index(data).hull[hullId];
  if (!hull) return 'Unknown hull.';
  if (hull.factionOnly && hull.factionOnly !== empire.factionId) return 'That hull belongs to another faction.';
  if (hull.requires && !empire.techs.includes(hull.requires)) return `${hull.name} requires ${hull.requires}.`;
  const err = validateDesign(data, empire, hull, modules);
  if (err) return err;
  const trimmed = name.trim() || hull.name;
  const design: ShipDesign = { id: `dsg_${empire.id}_${empire.designs.length + 1}_${++designCounter}`, name: trimmed, hullId, modules: [...modules] };
  empire.designs.push(design);
  return design;
}

export function deleteDesign(empire: Empire, id: string): void {
  if (empire.designs.length <= 1) return;
  empire.designs = empire.designs.filter((d) => d.id !== id);
}

/** Picks sensible modules for a hull given the empire's research, used for AI and starting designs. */
export function autoFit(data: GameData, empire: Empire, hull: HullDef): string[] {
  const pick = (slot: ModuleSlot, prefer: string[]): ModuleDef[] => {
    const avail = availableModules(data, empire, slot);
    return prefer.map((id) => avail.find((m) => m.id === id)).filter((m): m is ModuleDef => !!m);
  };
  const out: string[] = [];
  const weapons = pick('weapon', ['railgun', 'beam_laser', 'torpedo']);
  for (let i = 0; i < hull.slots.weapon && weapons.length; i++) out.push(weapons[i % weapons.length].id);
  const defence = pick('defence', ['plating', 'deflector', 'flak_battery']);
  for (let i = 0; i < hull.slots.defence && defence.length; i++) out.push(defence[i % defence.length].id);
  const support = pick('support', hull.roles?.includes('explore') ? ['probe_bay', 'ion_drive', 'repair_drones'] : ['ion_drive', 'repair_drones', 'probe_bay']);
  for (let i = 0; i < hull.slots.support && support.length; i++) out.push(support[i % support.length].id);
  return out;
}

export function hullAvailable(empire: Empire, hull: HullDef): boolean {
  if (hull.factionOnly && hull.factionOnly !== empire.factionId) return false;
  return !hull.requires || empire.techs.includes(hull.requires);
}

/** Guarantees one stock design per available hull, named after the hull. */
export function ensureDefaultDesigns(data: GameData, empire: Empire): void {
  for (const hull of data.hulls) {
    if (!hullAvailable(empire, hull)) continue;
    if (empire.designs.some((d) => d.hullId === hull.id)) continue;
    empire.designs.push({ id: `dsg_${empire.id}_${hull.id}`, name: hull.name, hullId: hull.id, modules: autoFit(data, empire, hull) });
  }
}
