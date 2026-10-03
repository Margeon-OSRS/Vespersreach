import { index } from './data';
import { buildLanes, placeStars, SIZE_COUNTS } from './galaxyLayout';
import { hopDistances } from './graph';
import { makeStarNamer } from './names';
import type { Rng } from './rng';
import type {
  FactionDef, GameData, GameSettings, GameState, Planet, PlanetSize, PlanetTypeDef, StarClass, StarSystem,
} from './types';
import { zeroFidsi } from './types';

export const GALAXY_WIDTH = 1600;
export const GALAXY_HEIGHT = 1100;
/** Pixels per lane unit; a lane of 120 px is 3 units long. */
export const LANE_UNIT = 40;

export const SIZE_MULT: Record<PlanetSize, number> = { tiny: 0.5, small: 0.75, medium: 1, large: 1.3, huge: 1.6 };
const SIZE_WEIGHTS: Record<PlanetSize, number> = { tiny: 1, small: 3, medium: 4, large: 3, huge: 1 };
const STAR_WEIGHTS: Record<StarClass, number> = { yellow: 5, orange: 4, red: 5, white: 2, blue: 1, binary: 1 };
/** Index is the planet count. */
const PLANET_COUNT_WEIGHTS = [0, 2, 4, 5, 4, 2, 1];

export function maxPopFor(def: PlanetTypeDef, size: PlanetSize, popBonus = 0): number {
  return Math.max(1, Math.round(def.basePop * SIZE_MULT[size]) + popBonus);
}

export function makePlanet(rng: Rng, data: GameData, systemId: string, slot: number, forcedType?: PlanetTypeDef): Planet {
  const idx = index(data);
  const type = forcedType ?? rng.weighted(data.planetTypes, (p) => p.weight);
  const size = rng.weighted(Object.keys(SIZE_WEIGHTS) as PlanetSize[], (s) => SIZE_WEIGHTS[s]);
  const anomaly = rng.chance(0.22) ? rng.weighted(data.anomalies, (a) => a.weight) : null;
  const deposit = rng.chance(0.25) ? rng.weighted(data.deposits, (d) => d.weight) : null;
  return {
    id: `${systemId}_p${slot}`,
    type: type.id,
    size,
    anomalyId: anomaly ? anomaly.id : null,
    depositId: deposit ? deposit.id : null,
    maxPop: maxPopFor(idx.planetType[type.id], size, anomaly?.popBonus ?? 0),
    pop: 0,
    status: 'none',
    outpostTurns: 0,
  };
}

export function generateGalaxy(settings: GameSettings, data: GameData, rng: Rng): GameState['galaxy'] {
  const count = SIZE_COUNTS[settings.size];
  const points = placeStars(rng.fork('layout'), count, settings.shape, GALAXY_WIDTH, GALAXY_HEIGHT);
  const indexLanes = buildLanes(points, rng.fork('lanes'), settings.density);
  const namer = makeStarNamer(rng.fork('names'));
  const prng = rng.fork('planets');
  const systems: StarSystem[] = points.map((p, i) => {
    const id = `sys_${i}`;
    const planetCount = prng.weighted([1, 2, 3, 4, 5, 6], (n) => PLANET_COUNT_WEIGHTS[n]);
    const planets: Planet[] = [];
    for (let k = 0; k < planetCount; k++) planets.push(makePlanet(prng, data, id, k));
    return {
      id, name: namer(), x: p.x, y: p.y,
      starClass: prng.weighted(Object.keys(STAR_WEIGHTS) as StarClass[], (s) => STAR_WEIGHTS[s]),
      planets, ownerId: null, improvements: [], buildQueue: [], growthStock: 0,
      lastOutput: zeroFidsi(), lastApproval: 50, siege: null,
    };
  });
  const lanes = indexLanes.map((l) => ({ a: `sys_${l.a}`, b: `sys_${l.b}`, length: Math.max(1, Math.round(l.length / LANE_UNIT)) }));
  return { width: GALAXY_WIDTH, height: GALAXY_HEIGHT, systems, lanes };
}

/** Farthest-point sampling by lane hops so empires start well apart. */
export function chooseHomeSystems(galaxy: GameState['galaxy'], count: number, rng: Rng): string[] {
  let candidates = galaxy.systems.filter((s) => s.planets.length >= 3);
  if (candidates.length < count) candidates = galaxy.systems.slice();
  const chosen: string[] = [rng.pick(candidates).id];
  const dists: Record<string, number>[] = [hopDistances(galaxy.lanes, chosen[0])];
  while (chosen.length < count) {
    let best: string | null = null;
    let bestScore = -1;
    for (const c of candidates) {
      if (chosen.includes(c.id)) continue;
      const score = Math.min(...dists.map((d) => d[c.id] ?? 0));
      if (score > bestScore) { bestScore = score; best = c.id; }
    }
    if (!best) break;
    chosen.push(best);
    dists.push(hopDistances(galaxy.lanes, best));
  }
  return chosen;
}

/** Turns a generated system into a faction home: a large homeworld with starting population. */
export function prepareHomeSystem(system: StarSystem, faction: FactionDef, data: GameData, rng: Rng): void {
  const idx = index(data);
  while (system.planets.length < 3) system.planets.push(makePlanet(rng, data, system.id, system.planets.length));
  const homeType = idx.planetType[faction.homePlanet];
  const home = system.planets[0];
  home.type = homeType.id;
  home.size = 'large';
  home.anomalyId = null;
  home.depositId = rng.chance(0.5) ? rng.weighted(data.deposits.filter((d) => d.kind === 'luxury'), (d) => d.weight).id : null;
  home.maxPop = maxPopFor(homeType, 'large') + 1;
  home.pop = 3;
  home.status = 'colony';
  home.outpostTurns = 0;
  for (const p of system.planets.slice(1)) { p.pop = 0; p.status = 'none'; }
  system.starClass = 'yellow';
  system.improvements = ['capital_seat'];
  system.buildQueue = [];
  system.growthStock = 0;
}
