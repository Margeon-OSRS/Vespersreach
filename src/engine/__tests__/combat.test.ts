import { describe, expect, it } from 'vitest';
import { queueShip } from '../build';
import { resolveBattle } from '../combat';
import { loadData } from '../data';
import { autoFit, createDesign, designStats, validateDesign } from '../designs';
import { designFor, orderFleetMove, spawnShip } from '../fleetActions';
import { commandLimit, fleetCommandPoints, mergeFleets, splitFleet } from '../fleets';
import { defaultSettings, newGame } from '../game';
import { grantTech, processResearch, setResearch } from '../research';
import { deserialize, migrateState, serialize } from '../save';
import { groundDefence, invade } from '../siege';
import { fleetsAt, getEmpire, getSystem, playerEmpire } from '../state';
import { endTurn } from '../turn';
import type { GameSettings } from '../types';
import { atWar, declareWar, makePeace } from '../war';

const data = loadData();
const settings = (over: Partial<GameSettings> = {}): GameSettings => ({ ...defaultSettings(), seed: 'war-seed', ...over });

describe('research', () => {
  it('completes techs with science, applies unlocks and continues the queue', () => {
    const st = newGame(settings(), data);
    const p = playerEmpire(st);
    expect(setResearch(data, p, 'harsh_world_habitats')).toBeNull();
    expect(setResearch(data, p, 'warship_frames')).toBeNull();
    expect(p.research.current).toBe('harsh_world_habitats');
    expect(p.research.queue).toEqual(['warship_frames']);
    expect(setResearch(data, p, 'capital_hulls')).toMatch(/Prerequisites/);
    const notes: Array<{ text: string }> = [];
    processResearch(data, p, 100, notes as never);
    expect(p.techs).toContain('harsh_world_habitats');
    expect(p.planetTier).toBe(1);
    expect(p.research.current).toBe('warship_frames');
    expect(p.research.progress).toBe(20);
    expect(notes[0].text).toMatch(/Harsh World Habitats/);
    for (let i = 0; i < 40; i++) endTurn(st, data);
    expect(p.techs).toContain('warship_frames');
    expect(p.designs.some((d) => d.hullId === 'lance')).toBe(true);
  });
});

describe('designs and fleets', () => {
  it('validates slots and computes stats and cost', () => {
    const st = newGame(settings(), data);
    const p = playerEmpire(st);
    grantTech(data, p, 'warship_frames');
    const lance = data.hulls.find((h) => h.id === 'lance')!;
    expect(validateDesign(data, p, lance, ['railgun', 'railgun', 'railgun', 'railgun'])).toMatch(/Too many weapon/);
    expect(validateDesign(data, p, lance, ['torpedo'])).toMatch(/not researched/);
    const d = createDesign(data, p, 'Spear', 'lance', ['railgun', 'railgun', 'plating', 'deflector', 'ion_drive']);
    expect(typeof d).toBe('object');
    const s = designStats(data, d as never);
    expect(s.weapons).toHaveLength(2);
    expect(s.armour).toBe(40);
    expect(s.shield).toBe(30);
    expect(s.speed).toBe(5);
    expect(s.cost).toBe(110 + 20 + 20 + 15 + 20 + 15);
    expect(autoFit(data, p, lance).length).toBeGreaterThan(0);
    const home = getSystem(st, p.homeSystemId);
    expect(queueShip(st, data, home.id, (d as { id: string }).id)).toBeNull();
    expect(home.buildQueue[0].cost).toBe(s.cost);
  });
  it('merges and splits fleets within the command limit', () => {
    const st = newGame(settings(), data);
    const p = playerEmpire(st);
    const home = getSystem(st, p.homeSystemId);
    const start = fleetsAt(st, home.id, p.id)[0];
    const extra = splitFleet(st, start.id, [start.ships[0].id]);
    expect(typeof extra).toBe('object');
    expect(fleetsAt(st, home.id, p.id)).toHaveLength(2);
    expect(mergeFleets(st, data, start.id, (extra as { id: string }).id)).toBeNull();
    expect(start.ships).toHaveLength(2);
    grantTech(data, p, 'warship_frames');
    for (let i = 0; i < 8; i++) spawnShip(st, data, p, home, designFor(data, p, 'lance'));
    const limit = commandLimit(data, p);
    for (const f of fleetsAt(st, home.id, p.id)) expect(fleetCommandPoints(data, f)).toBeLessThanOrEqual(limit);
    expect(fleetsAt(st, home.id, p.id).length).toBeGreaterThan(1);
  });
});

function warGame() {
  const st = newGame(settings({ size: 'medium', opponents: 2, playerFaction: 'ferron' }), data);
  const p = playerEmpire(st);
  const enemy = st.empires[1];
  grantTech(data, p, 'warship_frames');
  grantTech(data, p, 'guided_munitions');
  const home = getSystem(st, p.homeSystemId);
  const warDesign = createDesign(data, p, 'Hammer', 'lance', ['railgun', 'torpedo', 'railgun', 'plating', 'flak_battery', 'ion_drive']) as { id: string };
  for (let i = 0; i < 3; i++) spawnShip(st, data, p, home, p.designs.find((d) => d.id === warDesign.id)!);
  const fleet = fleetsAt(st, home.id, p.id).find((f) => f.ships.some((s) => s.designId === warDesign.id))!;
  fleet.ships = fleet.ships.filter((s) => s.designId === warDesign.id);
  return { st, p, enemy, home, fleet };
}

describe('war, combat and sieges', () => {
  it('tracks relations and respects pacifists', () => {
    const st = newGame(settings({ playerFaction: 'solenne' }), data);
    expect(declareWar(st, data, 'emp_0', 'emp_1')).toMatch(/cannot declare war/);
    expect(declareWar(st, data, 'emp_1', 'emp_0')).toBeNull();
    expect(atWar(st, 'emp_0', 'emp_1')).toBe(true);
    expect(makePeace(st, 'emp_0', 'emp_1')).toBeNull();
    expect(atWar(st, 'emp_0', 'emp_1')).toBe(false);
  });
  it('resolves a deterministic battle with a readable report', () => {
    const { st, p, enemy, home, fleet } = warGame();
    const enemyHome = getSystem(st, enemy.homeSystemId);
    declareWar(st, data, p.id, enemy.id);
    for (const f of st.fleets.filter((f) => f.ownerId === enemy.id)) { f.systemId = home.id; f.transit = null; f.path = []; }
    void enemyHome;
    const before = JSON.stringify(st);
    const report = resolveBattle(st, data, home.id, enemy.id, p.id);
    expect(report.phases.length).toBeGreaterThan(0);
    expect(report.attacker.empireId).toBe(enemy.id);
    expect(report.attacker.damageDealt + report.defender.damageDealt).toBeGreaterThan(0);
    expect(['attacker', 'defender', 'stalemate']).toContain(report.outcome);
    expect(st.battles).toHaveLength(1);
    const again = resolveBattle(JSON.parse(before), data, home.id, enemy.id, p.id);
    expect(again.phases).toEqual(report.phases);
    expect(fleet.ships.every((s) => s.hp > 0)).toBe(true);
  });
  it('fights, besieges and invades through end turn', () => {
    const { st, p, enemy, fleet } = warGame();
    const enemyHome = getSystem(st, enemy.homeSystemId);
    declareWar(st, data, p.id, enemy.id);
    for (const f of st.fleets.filter((f) => f.ownerId === enemy.id)) { f.ships = f.ships.filter((s) => s.hullId === 'settler'); }
    st.fleets = st.fleets.filter((f) => f.ships.length);
    p.knownSystems.push(...st.galaxy.systems.map((s) => s.id));
    expect(orderFleetMove(st, fleet.id, enemyHome.id)).toBeNull();
    for (let i = 0; i < 40 && fleet.systemId !== enemyHome.id; i++) endTurn(st, data);
    expect(fleet.systemId).toBe(enemyHome.id);
    for (let i = 0; i < 10 && enemyHome.siege?.by !== p.id; i++) endTurn(st, data);
    endTurn(st, data);
    expect(enemyHome.siege?.by).toBe(p.id);
    expect(invade(st, data, fleet.id)).toBeTypeOf('object');
    const defence = groundDefence(st, enemyHome);
    expect(defence).toBeGreaterThan(0);
    let captured = enemyHome.ownerId === p.id;
    for (let i = 0; i < 12 && !captured; i++) { endTurn(st, data); const r = invade(st, data, fleet.id); captured = typeof r === 'object' && r.success; }
    expect(captured).toBe(true);
    expect(enemyHome.ownerId).toBe(p.id);
    expect(getEmpire(st, enemy.id).homeSystemId).toBe(enemyHome.id);
  });
  it('migrates version 1 saves', () => {
    const st = newGame(settings(), data);
    const file = JSON.parse(serialize(st));
    file.version = 1;
    delete file.state.relations; delete file.state.battles;
    for (const e of file.state.empires) { delete e.research; delete e.designs; }
    for (const f of file.state.fleets) { delete f.tactic; for (const s of f.ships) delete s.designId; }
    for (const s of file.state.galaxy.systems) delete s.siege;
    const loaded = migrateState(deserialize(JSON.stringify(file)), data);
    expect(loaded.relations).toEqual({});
    expect(loaded.empires[0].designs.length).toBeGreaterThan(0);
    expect(loaded.fleets[0].tactic).toBe('balanced');
    expect(loaded.fleets[0].ships[0].designId).toBeTruthy();
    endTurn(loaded, data);
    expect(loaded.turn).toBe(2);
  });
});
