import { ensureDefaultDesigns } from './designs';
import { refreshHeroMarket } from './heroes';
import { ensurePirateEmpire } from './pirates';
import { initialSenate } from './politics';
import { index } from './data';
import { Rng } from './rng';
import type { GameData, GameState } from './types';
import { SAVE_VERSION } from './types';

export interface SaveFile {
  app: 'vesper-reach';
  version: number;
  savedAt: string;
  turn: number;
  seed: string;
  state: GameState;
}

const SUPPORTED_VERSIONS = [1, 2, 3, 4];

export function serialize(state: GameState): string {
  const file: SaveFile = {
    app: 'vesper-reach', version: SAVE_VERSION, savedAt: new Date().toISOString(),
    turn: state.turn, seed: state.settings.seed, state,
  };
  return JSON.stringify(file);
}

/** Parses a save file. Throws with a readable message on anything that is not a compatible save. */
export function deserialize(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = parsed as Partial<SaveFile>;
  if (!file || file.app !== 'vesper-reach' || !file.state) throw new Error('That file is not a Vesper Reach save.');
  if (!SUPPORTED_VERSIONS.includes(file.version ?? -1)) throw new Error(`Save version ${file.version} is not supported (expected ${SAVE_VERSION}).`);
  const s = file.state;
  if (!Array.isArray(s.galaxy?.systems) || !Array.isArray(s.empires) || !Array.isArray(s.fleets) || typeof s.turn !== 'number') {
    throw new Error('The save file is missing required sections.');
  }
  return s;
}

/** Fills in fields added by later versions so older saves keep working. Safe to call on current saves. */
export function migrateState(state: GameState, data: GameData): GameState {
  state.relations ??= {};
  for (const [k, v] of Object.entries(state.relations as Record<string, unknown>)) {
    if (typeof v === 'string') state.relations[k] = { status: v === 'war' ? 'war' : 'peace', trade: false, research: false, warScore: 0, sinceTurn: 1 };
  }
  state.attitudes ??= {};
  state.offers ??= [];
  state.heroMarket ??= [];
  state.minorRelations ??= {};
  state.victory ??= null;
  state.battles ??= [];
  for (const e of state.empires) {
    e.research ??= { current: null, progress: 0, queue: [] };
    e.designs ??= [];
    e.isPirate ??= false;
    e.heroes ??= [];
    e.warDeclarations ??= 0;
    e.senate ??= initialSenate(data, index(data).faction[e.factionId]);
    e.activeEvents ??= [];
    e.quest ??= { step: 0, completed: false };
    e.stats ??= { battlesWon: 0, systemsCaptured: 0, improvementsBuilt: 0, shipsBuilt: 0 };
    e.isMinor ??= false;
    e.assimilated ??= [];
    ensureDefaultDesigns(data, e);
  }
  for (const f of state.fleets) {
    f.tactic ??= 'balanced';
    const owner = state.empires.find((e) => e.id === f.ownerId);
    for (const s of f.ships) s.designId ??= owner?.designs.find((d) => d.hullId === s.hullId)?.id ?? `dsg_${f.ownerId}_${s.hullId}`;
  }
  for (const s of state.galaxy.systems) s.siege ??= null;
  ensurePirateEmpire(state, data);
  refreshHeroMarket(state, data, new Rng(`${state.settings.seed}:heroes:${state.turn}`));
  state.version = SAVE_VERSION;
  return state;
}

/** Deep clone through JSON, which is also a check that the state is serialisable. */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
