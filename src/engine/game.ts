import { index } from './data';
import { ensureDefaultDesigns } from './designs';
import { makeEmpire } from './empireFactory';
import { designFor, exploreSystem, spawnShip } from './fleetActions';
import { chooseHomeSystems, generateGalaxy, prepareHomeSystem } from './galaxy';
import { refreshHeroMarket } from './heroes';
import { placeMinors } from './minors';
import { ensurePirateEmpire } from './pirates';
import { grantTech } from './research';
import { Rng } from './rng';
import type { Difficulty, GameData, GameSettings, GameState } from './types';
import { SAVE_VERSION } from './types';

export function defaultSettings(): GameSettings {
  return {
    seed: 'vesper', size: 'small', shape: 'spiral', density: 'normal',
    playerFaction: 'solenne', opponents: 3, difficulty: 'normal', turnLimit: 200,
  };
}

export function randomSeed(): string {
  const words = ['amber', 'cobalt', 'drift', 'ember', 'fathom', 'gale', 'hollow', 'iris', 'jet', 'kelp', 'lumen', 'moth', 'nadir', 'opal', 'pike', 'quill', 'rook', 'sable', 'tide', 'umber', 'verge', 'wren', 'yarrow', 'zinc'];
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `${words[Math.floor(Math.random() * words.length)]}-${words[Math.floor(Math.random() * words.length)]}-${n}`;
}

/** Starting technologies and home guard sizes for AI empires by difficulty. */
const AI_START: Record<Difficulty, { techs: string[]; guards: number; dust: number }> = {
  easy: { techs: [], guards: 1, dust: 0 },
  normal: { techs: ['warship_frames'], guards: 2, dust: 50 },
  hard: { techs: ['warship_frames', 'guided_munitions'], guards: 3, dust: 150 },
};

export function newGame(settings: GameSettings, data: GameData): GameState {
  const idx = index(data);
  if (!idx.faction[settings.playerFaction]) throw new Error(`Unknown faction ${settings.playerFaction}`);
  const rng = new Rng(settings.seed);
  const galaxy = generateGalaxy(settings, data, rng);
  const state: GameState = {
    version: SAVE_VERSION, settings: { ...settings }, turn: 1, galaxy,
    empires: [], fleets: [], playerEmpireId: 'emp_0', nextId: 1, notifications: [], relations: {}, battles: [],
    attitudes: {}, offers: [], heroMarket: [], minorRelations: {}, victory: null,
  };
  const playable = data.factions.filter((f) => f.playable !== false);
  const count = Math.max(1, Math.min(settings.opponents + 1, playable.length, galaxy.systems.length));
  const homes = chooseHomeSystems(galaxy, count, rng.fork('homes'));
  const others = rng.fork('factions').shuffle(playable.filter((f) => f.id !== settings.playerFaction)).slice(0, count - 1);
  const lineup = [idx.faction[settings.playerFaction], ...others];
  const ai = AI_START[settings.difficulty] ?? AI_START.normal;
  lineup.forEach((faction, i) => {
    const home = galaxy.systems.find((s) => s.id === homes[i])!;
    prepareHomeSystem(home, faction, data, rng.fork(`home:${i}`));
    const isPlayer = i === 0;
    const empire = makeEmpire(`emp_${i}`, faction, data, { isPlayer, homeSystemId: home.id, dust: faction.startingDust + (isPlayer ? 0 : ai.dust) });
    home.ownerId = empire.id;
    state.empires.push(empire);
    exploreSystem(state, empire, home.id);
    if (!isPlayer) for (const t of ai.techs) grantTech(data, empire, t);
    ensureDefaultDesigns(data, empire);
    const unique = idx.hull[faction.uniqueHull];
    const explorerHull = unique.class === 'explorer' && !unique.requires ? unique.id : 'pathfinder';
    const settlerHull = faction.modifiers.cannotOutpost ? faction.uniqueHull : 'settler';
    spawnShip(state, data, empire, home, designFor(data, empire, explorerHull));
    spawnShip(state, data, empire, home, designFor(data, empire, settlerHull), idx.hull[settlerHull].cargoPop ?? 0);
    if (!isPlayer && empire.techs.includes('warship_frames')) {
      for (let g = 0; g < ai.guards; g++) spawnShip(state, data, empire, home, designFor(data, empire, 'lance'));
    }
  });
  placeMinors(state, data, rng.fork('minors'));
  ensurePirateEmpire(state, data);
  refreshHeroMarket(state, data, rng.fork('heroes'));
  const player = state.empires[0];
  const home = galaxy.systems.find((s) => s.id === player.homeSystemId)!;
  state.notifications = [
    { turn: 1, kind: 'info', text: `Welcome, ${lineup[0].demonym}. Your capital is ${home.name}. Explore the lanes, settle new worlds, pick a research goal (R) and end the turn with Enter.`, systemId: home.id },
  ];
  return state;
}
