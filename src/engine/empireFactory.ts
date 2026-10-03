import { initialSenate } from './politics';
import type { Empire, FactionDef, GameData } from './types';
import { zeroFidsi } from './types';

/** A fully initialised empire record; callers override what differs (home, dust, flags). */
export function makeEmpire(id: string, faction: FactionDef, data: GameData, over: Partial<Empire> = {}): Empire {
  return {
    id, factionId: faction.id, name: faction.name, colour: faction.colours.primary, isPlayer: false, homeSystemId: '',
    dust: faction.startingDust, influence: 10, science: 0, techs: [], planetTier: 0,
    exploredSystems: [], knownSystems: [], approval: 50, lastTotals: zeroFidsi(), eliminated: false,
    research: { current: null, progress: 0, queue: [] }, designs: [], isPirate: false, heroes: [], warDeclarations: 0,
    senate: initialSenate(data, faction), activeEvents: [], quest: { step: 0, completed: false },
    stats: { battlesWon: 0, systemsCaptured: 0, improvementsBuilt: 0, shipsBuilt: 0 }, isMinor: false, assimilated: [],
    ...over,
  };
}
