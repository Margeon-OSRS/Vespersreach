import { index } from './data';
import { treatyBonus } from './diplomacy';
import { shipStats } from './fleets';
import { governorEffects, governorOf, HERO_UPKEEP } from './heroes';
import { raidApprovalPenalty } from './pirates';
import { empireEffects } from './politics';
import { getEmpire, ownedSystems } from './state';
import type { Difficulty, Effect, Empire, Fidsi, GameData, GameState, StarSystem } from './types';
import { RESOURCE_KEYS, zeroFidsi } from './types';

export interface SystemReport {
  /** Net output after percent bonuses and approval. */
  output: Fidsi;
  /** Output before percent bonuses and approval. */
  gross: Fidsi;
  approval: number;
  pop: number;
  /** Dust upkeep of improvements. */
  upkeep: number;
  /** Food minus population consumption. */
  foodNet: number;
  growthThreshold: number;
  growthPerTurn: number;
  shipCostPercent: number;
}

export interface EmpireReport {
  totals: Fidsi;
  upkeep: number;
  shipUpkeep: number;
  netDust: number;
  approval: number;
  systems: number;
  pop: number;
}

export const OUTPOST_TURNS = 6;
export const EXPANSION_FREE_SYSTEMS = 5;
export const EXPANSION_PENALTY = 3;
export const SIEGE_OUTPUT_MULT = 0.5;
/** Percent output bonus for AI empires by difficulty. */
export const AI_OUTPUT_BONUS: Record<Difficulty, number> = { easy: -15, normal: 0, hard: 25 };

export function approvalMultiplier(approval: number): number {
  if (approval < 20) return 0.6;
  if (approval < 40) return 0.8;
  if (approval < 60) return 1;
  if (approval < 80) return 1.1;
  return 1.2;
}

export function approvalLabel(approval: number): string {
  if (approval < 20) return 'Rebellious';
  if (approval < 40) return 'Unhappy';
  if (approval < 60) return 'Content';
  if (approval < 80) return 'Happy';
  return 'Ecstatic';
}

export function growthThreshold(pop: number): number {
  return 16 + 8 * pop;
}

export function shipUpkeepFor(cost: number): number {
  return Math.max(1, Math.round(cost / 40));
}

export function systemEffects(system: StarSystem, data: GameData): Effect[] {
  const idx = index(data);
  const out: Effect[] = [];
  for (const id of system.improvements) {
    const def = idx.improvement[id];
    if (def) out.push(...def.effects);
  }
  return out;
}

export function systemReport(state: GameState, data: GameData, system: StarSystem): SystemReport | null {
  if (!system.ownerId) return null;
  const idx = index(data);
  const empire = getEmpire(state, system.ownerId);
  const mods = idx.faction[empire.factionId].modifiers;
  const gross = zeroFidsi();
  let approval = 50 + (mods.approval ?? 0);
  let pop = 0;
  let upkeep = 0;
  for (const planet of system.planets) {
    if (planet.status === 'none') continue;
    const def = idx.planetType[planet.type];
    const mult = planet.status === 'outpost' ? 0.5 : 1;
    pop += planet.pop;
    for (const k of RESOURCE_KEYS) gross[k] += planet.pop * def.yieldsPerPop[k] * mult;
    approval += def.approval;
    if (planet.anomalyId) {
      const an = idx.anomaly[planet.anomalyId];
      if (an) {
        for (const k of RESOURCE_KEYS) gross[k] += an.modifiers[k] ?? 0;
        approval += an.approval ?? 0;
      }
    }
    if (planet.depositId) {
      const dep = idx.deposit[planet.depositId];
      if (dep?.kind === 'luxury') { gross.dust += 2; approval += 5; } else if (dep) gross.industry += 1;
    }
  }
  gross.influence += 1;
  const percent = zeroFidsi();
  let shipCostPercent = 0;
  let growthPercent = mods.growth ?? 0;
  const governor = governorOf(state, system);
  const allEffects = [...empireEffects(data, empire), ...systemEffects(system, data), ...(governor ? governorEffects(data, governor) : [])];
  for (const e of allEffects) {
    if (e.resource) {
      gross[e.resource] += (e.flat ?? 0) + (e.perPop ?? 0) * pop;
      percent[e.resource] += e.percent ?? 0;
    }
    approval += e.approval ?? 0;
    growthPercent += e.growth ?? 0;
    shipCostPercent += e.shipCost ?? 0;
  }
  for (const id of system.improvements) upkeep += idx.improvement[id]?.upkeep ?? 0;
  const owned = ownedSystems(state, empire.id).length;
  approval -= Math.max(0, owned - EXPANSION_FREE_SYSTEMS) * EXPANSION_PENALTY;
  if (empire.dust < 0) approval -= 15;
  approval -= raidApprovalPenalty(state, system);
  const aiBonus = !empire.isPlayer && !empire.isPirate ? (AI_OUTPUT_BONUS[state.settings.difficulty] ?? 0) : 0;
  approval = Math.max(0, Math.min(100, Math.round(approval)));
  const am = approvalMultiplier(approval) * (system.siege ? SIEGE_OUTPUT_MULT : 1);
  const output = zeroFidsi();
  for (const k of RESOURCE_KEYS) {
    const pct = percent[k] + (mods[k] ?? 0) + aiBonus;
    output[k] = Math.round(gross[k] * (1 + pct / 100) * am * 10) / 10;
  }
  if (mods.dustPerOutput) {
    output.dust = Math.round((output.dust + mods.dustPerOutput * (output.food + output.industry + output.science + output.influence)) * 10) / 10;
  }
  const foodNet = Math.round((output.food - pop) * 10) / 10;
  const growthPerTurn = foodNet > 0 ? Math.round(foodNet * (1 + growthPercent / 100) * 10) / 10 : foodNet;
  return { output, gross, approval, pop, upkeep, foodNet, growthThreshold: growthThreshold(pop), growthPerTurn, shipCostPercent };
}

export function empireReport(state: GameState, data: GameData, empire: Empire): EmpireReport {
  const idx = index(data); void idx;
  const totals = zeroFidsi();
  let upkeep = 0, approvalSum = 0, weight = 0, pop = 0;
  const systems = ownedSystems(state, empire.id);
  for (const s of systems) {
    const r = systemReport(state, data, s);
    if (!r) continue;
    for (const k of RESOURCE_KEYS) totals[k] += r.output[k];
    upkeep += r.upkeep;
    const w = Math.max(1, r.pop);
    approvalSum += r.approval * w;
    weight += w;
    pop += r.pop;
  }
  let shipUpkeep = 0;
  for (const f of state.fleets) {
    if (f.ownerId !== empire.id) continue;
    for (const ship of f.ships) shipUpkeep += shipUpkeepFor(shipStats(data, empire, ship).cost);
  }
  const treaty = treatyBonus(state, empire);
  totals.dust += treaty.dust;
  totals.science += treaty.science;
  upkeep += empire.heroes.length * HERO_UPKEEP;
  for (const k of RESOURCE_KEYS) totals[k] = Math.round(totals[k] * 10) / 10;
  return {
    totals, upkeep, shipUpkeep,
    netDust: Math.round((totals.dust - upkeep - shipUpkeep) * 10) / 10,
    approval: weight ? Math.round(approvalSum / weight) : 50,
    systems: systems.length, pop,
  };
}

export function shipCost(data: GameData, empire: Empire, system: StarSystem, baseCost: number): number {
  const mods = index(data).faction[empire.factionId].modifiers;
  let sysPct = 0;
  for (const e of systemEffects(system, data)) sysPct += e.shipCost ?? 0;
  return Math.max(1, Math.round(baseCost * (1 + (mods.shipCost ?? 0) / 100) * (1 - sysPct / 100)));
}
