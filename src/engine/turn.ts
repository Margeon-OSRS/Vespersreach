import { runAi } from './ai';
import { resolveBattle } from './combat';
import { decayAttitudes, expireOffers, treatyBonus } from './diplomacy';
import { processEvents } from './events';
import { processHeroes, refreshHeroMarket } from './heroes';
import { decayMinorRelations } from './minors';
import { processPolitics } from './politics';
import { processQuests } from './quests';
import { checkVictory, VICTORY_TITLE } from './victory';
import { ensurePirateEmpire, runPirates, spawnPirates } from './pirates';
import { Rng } from './rng';
import { index } from './data';
import { getDesign } from './designs';
import { empireReport, OUTPOST_TURNS, systemReport, type SystemReport } from './economy';
import { exploreSystem, fleetHasRole, spawnShip } from './fleetActions';
import { fleetIsArmed, fleetSpeed, repairFleet, shipStats } from './fleets';
import { laneLength } from './graph';
import { processResearch } from './research';
import { updateSiege } from './siege';
import { getEmpire, ownedSystems } from './state';
import type { Empire, Fleet, GameData, GameState, Notification, StarSystem } from './types';
import { atWar } from './war';

type Note = (empireId: string, n: Omit<Notification, 'turn'>) => void;

function moveFleet(state: GameState, data: GameData, fleet: Fleet, note: Note, arrived: Set<string>): void {
  if (!fleet.path.length && !fleet.transit) return;
  let mp = fleetSpeed(state, data, fleet);
  if (mp <= 0) return;
  const empire = getEmpire(state, fleet.ownerId);
  const lanes = state.galaxy.lanes;
  const deep = fleetHasRole(data, fleet, 'explore') || fleet.ships.some((s) => shipStats(data, empire, s).vision > 0);
  while (mp > 0) {
    if (!fleet.transit) {
      if (!fleet.path.length || !fleet.systemId) break;
      const next = fleet.path[0];
      if (!Number.isFinite(laneLength(lanes, fleet.systemId, next))) { fleet.path = []; break; }
      fleet.transit = { from: fleet.systemId, to: next, progress: 0 };
      fleet.systemId = null;
    }
    const t = fleet.transit;
    const length = laneLength(lanes, t.from, t.to);
    const remaining = (1 - t.progress) * length;
    if (mp >= remaining) {
      mp -= remaining;
      fleet.systemId = t.to;
      fleet.transit = null;
      arrived.add(fleet.id);
      if (fleet.path[0] === t.to) fleet.path.shift();
      const sysName = state.galaxy.systems.find((s) => s.id === t.to)?.name ?? t.to;
      if (exploreSystem(state, empire, t.to, deep)) {
        note(empire.id, { kind: 'explore', text: `${fleet.name} charted ${sysName}.`, systemId: t.to, fleetId: fleet.id });
      }
      if (!fleet.path.length) note(empire.id, { kind: 'fleet', text: `${fleet.name} arrived at ${sysName}.`, systemId: t.to, fleetId: fleet.id });
      const hostile = state.fleets.some((f) => f.systemId === t.to && f.id !== fleet.id && atWar(state, f.ownerId, fleet.ownerId));
      if (hostile) { fleet.path = []; break; }
    } else {
      t.progress += mp / length;
      mp = 0;
    }
  }
}

function processGrowth(system: StarSystem, r: SystemReport, note: Note): void {
  system.growthStock += r.growthPerTurn;
  const threshold = r.growthThreshold;
  if (system.growthStock >= threshold) {
    const target = system.planets
      .filter((p) => p.status === 'colony' && p.pop < p.maxPop)
      .sort((a, b) => b.maxPop - b.pop - (a.maxPop - a.pop))[0];
    if (target) {
      target.pop += 1;
      system.growthStock -= threshold;
      note(system.ownerId!, { kind: 'growth', text: `Population grew in ${system.name} (now ${r.pop + 1}).`, systemId: system.id });
    } else {
      system.growthStock = threshold;
    }
  } else if (system.growthStock <= -threshold) {
    const victim = system.planets.filter((p) => p.status !== 'none' && p.pop > 1).sort((a, b) => b.pop - a.pop)[0];
    if (victim) {
      victim.pop -= 1;
      note(system.ownerId!, { kind: 'warning', text: `Famine in ${system.name}: population fell.`, systemId: system.id });
    }
    system.growthStock = 0;
  }
}

/** Spends industry on the queue; returns unspent industry. Sieged systems cannot complete items. */
function processBuilds(state: GameState, data: GameData, empire: Empire, system: StarSystem, industry: number, note: Note): number {
  const idx = index(data);
  let ind = industry;
  if (system.siege) return ind;
  while (system.buildQueue.length && ind > 0) {
    const item = system.buildQueue[0];
    const need = item.cost - item.progress;
    if (ind >= need) {
      ind -= need;
      system.buildQueue.shift();
      if (item.kind === 'improvement') {
        if (!system.improvements.includes(item.defId)) system.improvements.push(item.defId);
        empire.stats.improvementsBuilt += 1;
        note(empire.id, { kind: 'build', text: `${idx.improvement[item.defId]?.name ?? item.defId} completed in ${system.name}.`, systemId: system.id });
      } else {
        const design = getDesign(empire, item.defId);
        if (design) {
          const hull = idx.hull[design.hullId];
          const fleet = spawnShip(state, data, empire, system, design, hull?.cargoPop ?? 0);
          empire.stats.shipsBuilt += 1;
          note(empire.id, { kind: 'build', text: `${design.name} launched at ${system.name}.`, systemId: system.id, fleetId: fleet.id });
        }
      }
    } else {
      item.progress += ind;
      ind = 0;
    }
  }
  return ind;
}

function processEmpire(state: GameState, data: GameData, empire: Empire, note: Note, rng: Rng): void {
  const idx = index(data);
  const mods = idx.faction[empire.factionId].modifiers;
  let dust = 0, influence = 0, science = 0, upkeep = 0;
  for (const system of ownedSystems(state, empire.id)) {
    const r = systemReport(state, data, system);
    if (!r) continue;
    system.lastOutput = r.output;
    system.lastApproval = r.approval;
    influence += r.output.influence;
    science += r.output.science;
    upkeep += r.upkeep;
    dust += r.output.dust;
    processGrowth(system, r, note);
    for (const p of system.planets) {
      if (p.status === 'outpost' && ++p.outpostTurns >= OUTPOST_TURNS) {
        p.status = 'colony';
        note(empire.id, { kind: 'colony', text: `The outpost in ${system.name} is now a colony.`, systemId: system.id });
      }
    }
    const leftover = processBuilds(state, data, empire, system, r.output.industry, note);
    dust += leftover * 0.5;
    if (mods.depletionEvery && state.turn % mods.depletionEvery === 0) {
      for (const p of system.planets) {
        if (p.status === 'none') continue;
        p.maxPop = Math.max(0, p.maxPop - 1);
        if (p.pop > p.maxPop) p.pop = p.maxPop;
        if (p.maxPop === 0) { p.status = 'none'; p.pop = 0; }
      }
      note(empire.id, { kind: 'warning', text: `${system.name} is being consumed; its worlds lose capacity.`, systemId: system.id });
      if (!system.planets.some((p) => p.status !== 'none')) { system.ownerId = null; system.buildQueue = []; system.siege = null; }
    }
  }
  const report = empireReport(state, data, empire);
  empire.dust = Math.round((empire.dust + dust - upkeep - report.shipUpkeep) * 10) / 10;
  empire.influence = Math.round((empire.influence + influence) * 10) / 10;
  const treaty = treatyBonus(state, empire);
  dust += treaty.dust;
  science += treaty.science;
  const heroNotes: Array<Omit<Notification, 'turn'>> = [];
  upkeep += processHeroes(state, data, empire, heroNotes);
  for (const n of heroNotes) note(empire.id, n);
  const researchNotes: Array<Omit<Notification, 'turn'>> = [];
  processResearch(data, empire, science, researchNotes);
  for (const n of researchNotes) note(empire.id, n);
  if (!empire.isMinor) {
    const civicNotes: Array<Omit<Notification, 'turn'>> = [];
    processPolitics(state, data, empire, civicNotes);
    processEvents(state, data, empire, rng.fork(`events:${empire.id}`), civicNotes);
    processQuests(state, data, empire, civicNotes);
    for (const n of civicNotes) note(empire.id, n);
  }
  empire.lastTotals = report.totals;
  empire.approval = report.approval;
  if (empire.dust < 0) note(empire.id, { kind: 'warning', text: 'The treasury is in debt. Approval suffers until Dust is positive.' });
  const idxHull = index(data).hull;
  const canResettle = state.fleets.some((f) => f.ownerId === empire.id && f.ships.some((s) => idxHull[s.hullId]?.roles?.some((r) => r === 'outpost' || r === 'ark')));
  if (!ownedSystems(state, empire.id).length && !canResettle) {
    empire.eliminated = true;
    for (const other of state.empires) if (other.isPlayer) note(other.id, { kind: 'diplomacy', text: `${empire.name} has fallen.` });
  }
}

/** Fights every battle between warring empires that share a system. Attackers are fleets that arrived this turn. */
function processBattles(state: GameState, data: GameData, note: Note, arrived: Set<string>): void {
  for (const system of state.galaxy.systems) {
    let guard = 0;
    while (guard++ < 6) {
      const here = state.fleets.filter((f) => f.systemId === system.id);
      const empires = [...new Set(here.map((f) => f.ownerId))];
      let pair: [string, string] | null = null;
      outer: for (const a of empires) for (const b of empires) {
        if (a !== b && atWar(state, a, b) && here.some((f) => f.ownerId === a && fleetIsArmed(state, data, f))) { pair = [a, b]; break outer; }
      }
      if (!pair) break;
      let [attacker, defender] = pair;
      const aArrived = here.some((f) => f.ownerId === attacker && arrived.has(f.id));
      const dArrived = here.some((f) => f.ownerId === defender && arrived.has(f.id));
      if (!aArrived && (dArrived || system.ownerId === attacker)) [attacker, defender] = [defender, attacker];
      const report = resolveBattle(state, data, system.id, attacker, defender);
      for (const id of [attacker, defender]) {
        const won = (report.outcome === 'attacker') === (id === attacker);
        const text = report.outcome === 'stalemate' ? `Battle at ${system.name} ended undecided.` : won ? `Victory at ${system.name}.` : `Defeat at ${system.name}.`;
        note(id, { kind: 'battle', text, systemId: system.id, battleId: report.id });
      }
      if (report.outcome === 'stalemate') break;
    }
  }
}

/** Advances the game by one turn. Mutates and returns the state. */
export function endTurn(state: GameState, data: GameData): GameState {
  const notes: Notification[] = [];
  const note: Note = (empireId, n) => { if (empireId === state.playerEmpireId) notes.push({ turn: state.turn, ...n }); };
  const rng = new Rng(`${state.settings.seed}:turn:${state.turn}`);
  ensurePirateEmpire(state, data);
  for (const empire of state.empires) runAi(state, data, empire, rng.fork(empire.id), note);
  runPirates(state, data, rng.fork('pirates'), note);
  const arrived = new Set<string>();
  for (const fleet of state.fleets) moveFleet(state, data, fleet, note, arrived);
  processBattles(state, data, note, arrived);
  const siegeNotes: Array<Omit<Notification, 'turn'> & { empireId: string }> = [];
  for (const system of state.galaxy.systems) updateSiege(state, data, system, siegeNotes);
  for (const n of siegeNotes) note(n.empireId, n);
  for (const fleet of state.fleets) repairFleet(state, data, fleet);
  for (const empire of state.empires) if (!empire.eliminated && !empire.isPirate) processEmpire(state, data, empire, note, rng);
  spawnPirates(state, data, rng.fork('spawn'), note);
  if (state.turn % 15 === 0) state.heroMarket = state.heroMarket.slice(1);
  refreshHeroMarket(state, data, rng.fork('heroes'));
  decayAttitudes(state);
  decayMinorRelations(state);
  if (!state.victory) {
    const v = checkVictory(state, data);
    if (v) { state.victory = v; const winner = getEmpire(state, v.empireId); note(state.playerEmpireId, { kind: 'victory', text: `${VICTORY_TITLE[v.kind]}: ${winner.name}${winner.isPlayer ? ' (you)' : ''}.` }); }
  }
  expireOffers(state);
  for (const o of state.offers) if (o.to === state.playerEmpireId && o.turn === state.turn) note(o.to, { kind: 'diplomacy', text: `${getEmpire(state, o.from).name} proposes a ${o.kind} treaty. Answer it on the Diplomacy screen.` });
  state.turn += 1;
  state.notifications = notes;
  return state;
}
