import type { Rng } from './rng';
import type { Effect, Empire, GameData, GameState, Notification } from './types';

export const EVENT_CHANCE = 0.07;
export const MAX_ACTIVE_EVENTS = 2;

export function eventEffects(data: GameData, empire: Empire): Effect[] {
  const out: Effect[] = [];
  for (const ev of empire.activeEvents) out.push(...(data.events.find((e) => e.id === ev.id)?.effects ?? []));
  return out;
}

/** Expires finished events and may start a new one. */
export function processEvents(state: GameState, data: GameData, empire: Empire, rng: Rng, notes: Array<Omit<Notification, 'turn'>>): void {
  const byId = (id: string) => data.events.find((e) => e.id === id);
  for (const ev of empire.activeEvents.filter((e) => e.until <= state.turn)) notes.push({ kind: 'event', text: `${byId(ev.id)?.name ?? ev.id} has ended.` });
  empire.activeEvents = empire.activeEvents.filter((e) => e.until > state.turn);
  if (empire.activeEvents.length >= MAX_ACTIVE_EVENTS || !rng.chance(EVENT_CHANCE)) return;
  const pool = data.events.filter((e) => e.minTurn <= state.turn && !empire.activeEvents.some((a) => a.id === e.id));
  if (!pool.length) return;
  const ev = rng.weighted(pool, (e) => e.weight);
  empire.activeEvents.push({ id: ev.id, until: state.turn + ev.duration });
  notes.push({ kind: 'event', text: `${ev.name}: ${ev.description}` });
}
