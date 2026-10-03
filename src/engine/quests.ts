import { index } from './data';
import { grantTech } from './research';
import { ownedSystems, systemPop } from './state';
import type { Empire, GameData, GameState, Notification, QuestDef, QuestStep } from './types';

export function questFor(data: GameData, empire: Empire): QuestDef | undefined {
  return index(data).quest[empire.factionId];
}

export function currentStep(data: GameData, empire: Empire): QuestStep | null {
  const q = questFor(data, empire);
  if (!q || empire.quest.completed) return null;
  return q.steps[empire.quest.step] ?? null;
}

export interface QuestProgress { value: number; target: number; done: boolean; text: string }

export function objectiveProgress(state: GameState, data: GameData, empire: Empire, step: QuestStep): QuestProgress {
  const idx = index(data);
  const o = step.objective;
  const num = typeof o.target === 'number' ? o.target : 1;
  const ships = state.fleets.filter((f) => f.ownerId === empire.id).flatMap((f) => f.ships);
  let value = 0, text = '';
  switch (o.kind) {
    case 'explore': value = empire.exploredSystems.length; text = `${value}/${num} systems charted`; break;
    case 'systems': value = ownedSystems(state, empire.id).length; text = `${value}/${num} systems held`; break;
    case 'techs': value = empire.techs.length; text = `${value}/${num} technologies`; break;
    case 'tech': value = empire.techs.includes(String(o.target)) ? 1 : 0; text = `Research ${idx.tech[String(o.target)]?.name ?? o.target}`; break;
    case 'improvement': value = ownedSystems(state, empire.id).some((s) => s.improvements.includes(String(o.target))) ? 1 : 0; text = `Build ${idx.improvement[String(o.target)]?.name ?? o.target}`; break;
    case 'warships': value = ships.filter((s) => (idx.hull[s.hullId]?.slots.weapon ?? 0) > 0).length; text = `${value}/${num} warships`; break;
    case 'battles': value = empire.stats.battlesWon; text = `${value}/${num} battles won`; break;
    case 'captures': value = empire.stats.systemsCaptured; text = `${value}/${num} systems captured`; break;
    case 'dust': value = Math.floor(empire.dust); text = `${value}/${num} Dust banked`; break;
    case 'pop': value = ownedSystems(state, empire.id).reduce((n, s) => n + systemPop(s), 0); text = `${value}/${num} population`; break;
    case 'hero': value = empire.heroes.length; text = `${value}/${num} heroes`; break;
    case 'law': value = empire.senate.laws.length; text = `${value}/${num} laws passed`; break;
  }
  return { value, target: num, done: value >= num, text };
}

export function processQuests(state: GameState, data: GameData, empire: Empire, notes: Array<Omit<Notification, 'turn'>>): void {
  const q = questFor(data, empire);
  const step = currentStep(data, empire);
  if (!q || !step) return;
  if (!objectiveProgress(state, data, empire, step).done) return;
  const r = step.reward;
  empire.dust += r.dust ?? 0;
  empire.influence += r.influence ?? 0;
  empire.science += r.science ?? 0;
  if (r.tech) grantTech(data, empire, r.tech);
  empire.quest.step += 1;
  if (empire.quest.step >= q.steps.length) empire.quest.completed = true;
  notes.push({ kind: 'quest', text: `Quest complete: ${step.title} (${r.text}).${empire.quest.completed ? ` ${q.title} is finished.` : ''}` });
}
