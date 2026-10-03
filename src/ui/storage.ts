import { deserialize, serialize } from '@engine/save';
import type { GameState } from '@engine/types';

const PREFIX = 'vesper-reach.';
export const SLOTS = ['autosave', 'slot1', 'slot2', 'slot3'] as const;
export type Slot = (typeof SLOTS)[number];

export interface SaveMeta {
  slot: Slot;
  turn: number;
  seed: string;
  savedAt: string;
  faction: string;
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function listSaves(): SaveMeta[] {
  const out: SaveMeta[] = [];
  for (const slot of SLOTS) {
    const raw = safeGet(PREFIX + slot);
    if (!raw) continue;
    try {
      const file = JSON.parse(raw) as { turn: number; seed: string; savedAt: string; state: GameState };
      const player = file.state.empires.find((e) => e.id === file.state.playerEmpireId);
      out.push({ slot, turn: file.turn, seed: file.seed, savedAt: file.savedAt, faction: player?.name ?? '?' });
    } catch { /* ignore corrupt slot */ }
  }
  return out;
}

export function saveToSlot(slot: Slot, state: GameState): boolean {
  try { localStorage.setItem(PREFIX + slot, serialize(state)); return true; } catch { return false; }
}

export function loadFromSlot(slot: Slot): GameState | null {
  const raw = safeGet(PREFIX + slot);
  if (!raw) return null;
  try { return deserialize(raw); } catch { return null; }
}

export function deleteSlot(slot: Slot): void {
  try { localStorage.removeItem(PREFIX + slot); } catch { /* ignore */ }
}
