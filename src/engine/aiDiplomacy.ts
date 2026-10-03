import { aiProfile, type Note } from './ai';
import { index } from './data';
import { aiAccepts, attitude, empireStrength, proposeTreaty, relationOf } from './diplomacy';
import { fleetIsArmed } from './fleets';
import { assignHero, recruitHero, roleAllows } from './heroes';
import type { Rng } from './rng';
import { getEmpire, ownedSystems } from './state';
import type { Empire, GameData, GameState } from './types';
import { declareWar, knownEmpires, makePeace } from './war';

export function runAiDiplomacy(state: GameState, data: GameData, empire: Empire, rng: Rng, note: Note): void {
  const idx = index(data);
  const profile = aiProfile(state);
  const pacifist = !!idx.faction[empire.factionId].modifiers.pacifist;
  for (const otherId of knownEmpires(state, empire.id)) {
    const other = getEmpire(state, otherId);
    const rel = relationOf(state, empire.id, otherId);
    const att = attitude(state, data, empire.id, otherId).value;
    if (rel.status === 'war') {
      if (state.turn - rel.sinceTurn > 8 && aiAccepts(state, data, empire, otherId, 'peace') && rng.chance(0.5)) {
        if (other.isPlayer) proposeTreaty(state, data, empire.id, otherId, 'peace');
        else if (aiAccepts(state, data, other, empire.id, 'peace')) makePeace(state, empire.id, otherId);
      }
      continue;
    }
    const strong = empireStrength(state, data, empire.id) > empireStrength(state, data, otherId) * 1.3;
    const neighbours = ownedSystems(state, empire.id).some((s) => state.galaxy.lanes.some((l) => (l.a === s.id && state.galaxy.systems.find((x) => x.id === l.b)?.ownerId === otherId) || (l.b === s.id && state.galaxy.systems.find((x) => x.id === l.a)?.ownerId === otherId)));
    const appetite = att - (neighbours ? profile.opportunism : 0);
    if (!profile.peaceful && !pacifist && state.turn >= profile.aggressionTurn && appetite <= profile.warThreshold && rel.status !== 'alliance' && strong && rng.chance(0.3)) {
      if (!declareWar(state, data, empire.id, otherId) && other.isPlayer) note(otherId, { kind: 'diplomacy', text: `${empire.name} has declared war on you.` });
      continue;
    }
    if (att >= 20 && !rel.trade && rng.chance(0.25)) proposeTreaty(state, data, empire.id, otherId, 'trade');
    else if (att >= 35 && rel.trade && !rel.research && rng.chance(0.2)) proposeTreaty(state, data, empire.id, otherId, 'research');
    else if (att >= 50 && rel.status === 'peace' && rng.chance(0.1)) proposeTreaty(state, data, empire.id, otherId, 'alliance');
  }
}

export function runAiHeroes(state: GameState, data: GameData, empire: Empire): void {
  const idx = index(data);
  if (state.heroMarket.length && empire.heroes.length < 2 && empire.dust > 250) {
    const affordable = state.heroMarket.find((id) => idx.hero[id] && idx.hero[id].cost <= empire.dust - 150);
    if (affordable) recruitHero(state, data, empire.id, affordable);
  }
  for (const hero of empire.heroes.filter((h) => !h.assignment)) {
    const def = idx.hero[hero.defId];
    if (roleAllows(def, 'governor')) {
      const system = ownedSystems(state, empire.id)
        .filter((s) => !empire.heroes.some((h) => h.assignment?.kind === 'governor' && h.assignment.systemId === s.id))
        .sort((a, b) => b.lastOutput.industry - a.lastOutput.industry)[0];
      if (system && !assignHero(state, data, empire.id, hero.id, { kind: 'governor', systemId: system.id })) continue;
    }
    if (roleAllows(def, 'admiral')) {
      const fleet = state.fleets
        .filter((f) => f.ownerId === empire.id && fleetIsArmed(state, data, f) && !empire.heroes.some((h) => h.assignment?.kind === 'admiral' && h.assignment.fleetId === f.id))
        .sort((a, b) => b.ships.length - a.ships.length)[0];
      if (fleet) assignHero(state, data, empire.id, hero.id, { kind: 'admiral', fleetId: fleet.id });
    }
  }
}
