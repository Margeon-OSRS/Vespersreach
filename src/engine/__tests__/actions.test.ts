import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { canColonise, colonise, orderFleetMove, uprootSystem } from '../fleetActions';
import { defaultSettings, newGame } from '../game';
import { neighbours, shortestPath } from '../graph';
import { deserialize, serialize } from '../save';
import { fleetsAt, getSystem, ownedSystems, playerEmpire } from '../state';
import { endTurn } from '../turn';
import type { GameSettings } from '../types';

const data = loadData();
const settings = (over: Partial<GameSettings> = {}): GameSettings => ({ ...defaultSettings(), seed: 'test-seed', ...over });
const tierOf = (type: string) => data.planetTypes.find((t) => t.id === type)!.tier;

describe('movement and colonisation', () => {
  it('moves a settler along lanes and founds an outpost that becomes a colony', () => {
    let st = newGame(settings({ size: 'medium' }), data);
    let target = neighbours(st.galaxy.lanes, playerEmpire(st).homeSystemId).map((id) => getSystem(st, id)).find((s) => s.planets.some((p) => tierOf(p.type) === 0));
    for (let n = 0; !target && n < 5; n++) {
      st = newGame(settings({ size: 'medium', seed: `retry-${n}` }), data);
      target = neighbours(st.galaxy.lanes, playerEmpire(st).homeSystemId).map((id) => getSystem(st, id)).find((s) => s.planets.some((p) => tierOf(p.type) === 0));
    }
    expect(target).toBeDefined();
    const player = playerEmpire(st);
    const home = getSystem(st, player.homeSystemId);
    const fleet = fleetsAt(st, home.id, player.id).find((f) => f.ships.some((s) => s.hullId === 'settler'))!;
    expect(orderFleetMove(st, fleet.id, target!.id)).toBeNull();
    expect(fleet.path).toEqual(shortestPath(st.galaxy.lanes, home.id, target!.id));
    for (let i = 0; i < 10 && fleet.systemId !== target!.id; i++) endTurn(st, data);
    expect(fleet.systemId).toBe(target!.id);
    expect(player.exploredSystems).toContain(target!.id);
    const planet = target!.planets.find((p) => tierOf(p.type) === 0)!;
    expect(canColonise(st, data, player.id, target!.id, planet.id).ok).toBe(true);
    expect(colonise(st, data, player.id, target!.id, planet.id)).toBeNull();
    expect(target!.ownerId).toBe(player.id);
    expect(planet.status).toBe('outpost');
    const stillHasSettler = st.fleets.some((f) => f.ownerId === player.id && f.ships.some((s) => s.hullId === 'settler'));
    expect(stillHasSettler).toBe(false);
    for (let i = 0; i < 7; i++) endTurn(st, data);
    expect(planet.status).toBe('colony');
    expect(ownedSystems(st, player.id)).toHaveLength(2);
  });

  it('refuses to colonise planets above the unlocked tier', () => {
    const st = newGame(settings(), data);
    const player = playerEmpire(st);
    const home = getSystem(st, player.homeSystemId);
    home.planets[1].type = 'lava';
    home.planets[1].status = 'none';
    const check = canColonise(st, data, player.id, home.id, home.planets[1].id);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/tier/);
  });

  it('lets nomads uproot and resettle with an ark', () => {
    const st = newGame(settings({ playerFaction: 'keth' }), data);
    const player = playerEmpire(st);
    const home = getSystem(st, player.homeSystemId);
    expect(uprootSystem(st, data, home.id)).toBeNull();
    expect(home.ownerId).toBeNull();
    const arks = fleetsAt(st, home.id, player.id).flatMap((f) => f.ships).filter((s) => s.hullId === 'keth_ark');
    expect(arks).toHaveLength(2);
    expect(arks.some((s) => s.cargoPop === 3)).toBe(true);
    expect(colonise(st, data, player.id, home.id, home.planets[0].id)).toBeNull();
    expect(home.planets[0].status).toBe('colony');
    expect(home.ownerId).toBe(player.id);
    expect(home.improvements).toContain('capital_seat');
  });
});

describe('save and load', () => {
  it('round-trips through JSON and keeps simulating identically', () => {
    const st = newGame(settings(), data);
    for (let i = 0; i < 5; i++) endTurn(st, data);
    const copy = deserialize(serialize(st));
    expect(JSON.stringify(copy)).toEqual(JSON.stringify(st));
    endTurn(st, data);
    endTurn(copy, data);
    expect(JSON.stringify(copy)).toEqual(JSON.stringify(st));
    expect(() => deserialize('{"app":"x"}')).toThrow();
    expect(() => deserialize('not json')).toThrow(/JSON/);
  });

  it('survives fifty turns for every faction without errors', () => {
    for (const f of data.factions) {
      const st = newGame(settings({ playerFaction: f.id, opponents: 2 }), data);
      for (let i = 0; i < 50; i++) endTurn(st, data);
      expect(st.turn).toBe(51);
      expect(playerEmpire(st).dust).toBeGreaterThan(-500);
    }
  });
});
