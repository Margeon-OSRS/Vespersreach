import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { processEvents } from '../events';
import { defaultSettings, newGame } from '../game';
import { ASSIMILATE_AT, assimilateMinor, minorEmpires, minorRelation, sendEnvoys } from '../minors';
import { availableLaws, empireEffects, MAX_LAWS, passLaw, processPolitics } from '../politics';
import { currentStep, objectiveProgress, processQuests } from '../quests';
import { Rng } from '../rng';
import { deserialize, migrateState, serialize } from '../save';
import { getSystem, ownedSystems, playerEmpire } from '../state';
import { endTurn } from '../turn';
import type { GameSettings } from '../types';
import { checkVictory, economicTarget, scoreOf, WONDER_ID } from '../victory';

const data = loadData();
const settings = (over: Partial<GameSettings> = {}): GameSettings => ({ ...defaultSettings(), seed: 'civic-seed', size: 'medium', opponents: 2, ...over });

describe('senate and laws', () => {
  it('passes laws with influence, applies effects and repeals when broke', () => {
    const st = newGame(settings({ playerFaction: 'ferron' }), data);
    const p = playerEmpire(st);
    expect(p.senate.ruling).toBeDefined();
    p.influence = 200;
    const laws = availableLaws(data, p);
    expect(laws.length).toBeGreaterThan(0);
    expect(passLaw(data, p, laws[0].id)).toBeNull();
    expect(p.senate.laws).toContain(laws[0].id);
    expect(empireEffects(data, p).length).toBeGreaterThan(1);
    for (const l of availableLaws(data, p)) passLaw(data, p, l.id);
    expect(p.senate.laws.length).toBeLessThanOrEqual(MAX_LAWS);
    p.influence = 0;
    const notes: Array<{ text: string }> = [];
    processPolitics(st, data, p, notes as never);
    expect(notes.some((n) => /repealed/.test(n.text))).toBe(true);
  });
  it('holds elections on schedule', () => {
    const st = newGame(settings(), data);
    const p = playerEmpire(st);
    const first = p.senate.nextElection;
    for (let i = 0; i < first; i++) endTurn(st, data);
    expect(p.senate.nextElection).toBe(first + 20);
    const total = Object.values(p.senate.support).reduce((a, b) => a + b, 0);
    expect(Math.round(total)).toBe(100);
  });
});

describe('events and quests', () => {
  it('starts and expires events', () => {
    const st = newGame(settings(), data);
    const p = playerEmpire(st);
    st.turn = 30;
    const notes: Array<{ text: string }> = [];
    let guard = 0;
    while (!p.activeEvents.length && guard++ < 200) processEvents(st, data, p, new Rng('ev' + guard), notes as never);
    expect(p.activeEvents).toHaveLength(1);
    expect(empireEffects(data, p).length).toBeGreaterThan(1);
    st.turn = p.activeEvents[0].until;
    processEvents(st, data, p, new Rng('never'), notes as never);
    expect(p.activeEvents).toHaveLength(0);
  });
  it('advances the faction quest chain and pays rewards', () => {
    const st = newGame(settings({ playerFaction: 'mercator' }), data);
    const p = playerEmpire(st);
    const step = currentStep(data, p)!;
    expect(step.objective.kind).toBe('dust');
    expect(objectiveProgress(st, data, p, step).done).toBe(false);
    p.dust = 400;
    const influence = p.influence;
    processQuests(st, data, p, []);
    expect(p.quest.step).toBe(1);
    expect(p.influence).toBe(influence + 30);
  });
});

describe('minor factions and victory', () => {
  it('places minors, courts them with envoys and assimilates them', () => {
    const st = newGame(settings(), data);
    const minors = minorEmpires(st);
    expect(minors.length).toBeGreaterThan(0);
    const minor = minors[0];
    const home = getSystem(st, minor.homeSystemId);
    expect(home.ownerId).toBe(minor.id);
    expect(home.planets[0].pop).toBeGreaterThan(0);
    const p = playerEmpire(st);
    p.influence = 500;
    while (minorRelation(st, minor.id, p.id) < ASSIMILATE_AT) expect(sendEnvoys(st, p.id, minor.id)).toBeNull();
    expect(assimilateMinor(st, p.id, minor.id)).toBeNull();
    expect(home.ownerId).toBe(p.id);
    expect(p.assimilated).toContain(minor.factionId);
    expect(empireEffects(data, p).length).toBeGreaterThan(1);
    expect(minor.eliminated).toBe(true);
  });
  it('detects every victory kind', () => {
    const st = newGame(settings(), data);
    const p = playerEmpire(st);
    expect(checkVictory(st, data)).toBeNull();
    p.dust = economicTarget(st);
    expect(checkVictory(st, data)?.kind).toBe('economic');
    p.dust = 0;
    getSystem(st, p.homeSystemId).improvements.push(WONDER_ID);
    expect(checkVictory(st, data)?.kind).toBe('wonder');
    getSystem(st, p.homeSystemId).improvements.pop();
    p.techs = data.techs.map((t) => t.id);
    expect(checkVictory(st, data)?.kind).toBe('science');
    p.techs = [];
    for (const e of st.empires) if (!e.isPlayer && !e.isPirate && !e.isMinor) e.eliminated = true;
    expect(checkVictory(st, data)?.kind).toBe('conquest');
    for (const e of st.empires) e.eliminated = false;
    for (const e of st.empires) if (!e.isPirate && !e.isMinor) for (const s of ownedSystems(st, e.id)) s.ownerId = p.id;
    expect(checkVictory(st, data)?.kind).toBe('supremacy');
    const st2 = newGame(settings({ turnLimit: 3 }), data);
    for (let i = 0; i < 3; i++) endTurn(st2, data);
    expect(st2.victory?.kind).toBe('score');
    expect(scoreOf(st2, data, playerEmpire(st2))).toBeGreaterThan(0);
  });
  it('migrates version 3 saves', () => {
    const st = newGame(settings(), data);
    const file = JSON.parse(serialize(st));
    file.version = 3;
    delete file.state.minorRelations; delete file.state.victory;
    for (const e of file.state.empires) { delete e.senate; delete e.activeEvents; delete e.quest; delete e.stats; delete e.assimilated; }
    const loaded = migrateState(deserialize(JSON.stringify(file)), data);
    expect(loaded.empires[0].senate.ruling).toBeDefined();
    endTurn(loaded, data);
    expect(loaded.turn).toBe(2);
  });
});
