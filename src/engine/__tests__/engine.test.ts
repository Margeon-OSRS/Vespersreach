import { describe, expect, it } from 'vitest';
import { availableImprovements, queueImprovement, queueShip, rushBuy } from '../build';
import { loadData, validateData } from '../data';
import { empireReport, systemReport } from '../economy';
import { defaultSettings, newGame } from '../game';
import { isConnected, neighbours } from '../graph';
import { Rng } from '../rng';
import { fleetsAt, getSystem, playerEmpire, systemPop } from '../state';
import { endTurn } from '../turn';
import type { GameSettings } from '../types';

const data = loadData();
const settings = (over: Partial<GameSettings> = {}): GameSettings => ({ ...defaultSettings(), seed: 'test-seed', ...over });

describe('data', () => {
  it('cross-references cleanly', () => {
    expect(validateData(data)).toEqual([]);
    expect(data.factions.filter((f) => f.playable !== false)).toHaveLength(6);
    expect(data.planetTypes).toHaveLength(11);
  });
});

describe('rng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = new Rng('alpha'), b = new Rng('alpha'), c = new Rng('beta');
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
    for (let i = 0; i < 1000; i++) { const n = a.int(2, 5); expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(5); }
  });
});

describe('galaxy generation', () => {
  it('reproduces exactly from a seed', () => {
    const a = newGame(settings(), data), b = newGame(settings(), data);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(JSON.stringify(newGame(settings({ seed: 'other' }), data))).not.toEqual(JSON.stringify(a));
  });
  it.each(['spiral', 'disc', 'ring', 'clusters'] as const)('builds a connected %s galaxy with valid systems', (shape) => {
    const st = newGame(settings({ shape, size: 'medium', opponents: 4 }), data);
    expect(st.galaxy.systems).toHaveLength(42);
    expect(isConnected(st.galaxy.lanes, st.galaxy.systems.map((s) => s.id))).toBe(true);
    for (const s of st.galaxy.systems) {
      expect(s.planets.length).toBeGreaterThanOrEqual(1);
      expect(s.planets.length).toBeLessThanOrEqual(6);
      expect(neighbours(st.galaxy.lanes, s.id).length).toBeGreaterThan(0);
    }
    expect(new Set(st.galaxy.systems.map((s) => s.name)).size).toBe(42);
    expect(st.empires.filter((e) => !e.isPirate && !e.isMinor)).toHaveLength(5);
    expect(new Set(st.empires.filter((e) => !e.isPirate && !e.isMinor).map((e) => e.homeSystemId)).size).toBe(5);
  });
  it('gives every empire a populated home and two starting ships', () => {
    const st = newGame(settings({ opponents: 5 }), data);
    for (const e of st.empires.filter((x) => !x.isPirate && !x.isMinor)) {
      const home = getSystem(st, e.homeSystemId);
      expect(home.ownerId).toBe(e.id);
      expect(systemPop(home)).toBe(3);
      expect(home.improvements).toContain('capital_seat');
      const ships = fleetsAt(st, home.id, e.id).flatMap((f) => f.ships).length;
      if (e.isPlayer) expect(ships).toBe(2); else expect(ships).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('economy and turns', () => {
  it('produces output, grows population and finishes builds', () => {
    const st = newGame(settings({ playerFaction: 'mercator' }), data);
    const player = playerEmpire(st);
    const home = getSystem(st, player.homeSystemId);
    const r = systemReport(st, data, home)!;
    expect(r.output.food).toBeGreaterThan(3);
    expect(r.output.industry).toBeGreaterThan(0);
    expect(r.foodNet).toBeGreaterThan(0);
    expect(availableImprovements(st, data, home).map((i) => i.id)).toContain('hydroponic_terraces');
    expect(queueImprovement(st, data, home.id, 'hydroponic_terraces')).toBeNull();
    const dustBefore = player.dust;
    for (let i = 0; i < 30; i++) endTurn(st, data);
    expect(st.turn).toBe(31);
    expect(home.improvements).toContain('hydroponic_terraces');
    expect(systemPop(home)).toBeGreaterThan(3);
    expect(player.dust).toBeGreaterThan(dustBefore);
    expect(player.science).toBeGreaterThan(0);
    expect(empireReport(st, data, player).approval).toBeGreaterThan(0);
  });
  it('rush-buys with Dust', () => {
    const st = newGame(settings(), data);
    const home = getSystem(st, playerEmpire(st).homeSystemId);
    const design = playerEmpire(st).designs.find((d) => d.hullId === 'pathfinder')!;
    expect(queueShip(st, data, home.id, design.id)).toBeNull();
    const item = home.buildQueue[0];
    playerEmpire(st).dust = 500;
    expect(rushBuy(st, home.id, item.id)).toBeNull();
    const ships = st.fleets.filter((f) => f.ownerId === st.playerEmpireId).flatMap((f) => f.ships).length;
    endTurn(st, data);
    expect(st.fleets.filter((f) => f.ownerId === st.playerEmpireId).flatMap((f) => f.ships).length).toBe(ships + 1);
  });
});
