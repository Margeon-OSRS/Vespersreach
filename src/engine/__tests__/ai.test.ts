import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { adjustMemory, attitude, proposeTreaty, relationOf, respondOffer, treatyBonus, warScoreFor } from '../diplomacy';
import { defaultSettings, newGame } from '../game';
import { assignHero, learnSkill, processHeroes, recruitHero, skillPoints } from '../heroes';
import { PIRATE_ID } from '../pirates';
import { deserialize, migrateState, serialize } from '../save';
import { getEmpire, getSystem, ownedSystems, playerEmpire } from '../state';
import { endTurn } from '../turn';
import type { GameSettings } from '../types';
import { atWar, declareWar } from '../war';

const data = loadData();
const settings = (over: Partial<GameSettings> = {}): GameSettings => ({ ...defaultSettings(), seed: 'ai-seed', size: 'medium', opponents: 3, ...over });

describe('AI empires', () => {
  it('expand, research and arm themselves over time', () => {
    const st = newGame(settings(), data);
    for (let i = 0; i < 70; i++) endTurn(st, data);
    const ais = st.empires.filter((e) => !e.isPlayer && !e.isPirate && !e.isMinor);
    expect(ais.some((e) => ownedSystems(st, e.id).length >= 2)).toBe(true);
    expect(ais.every((e) => e.techs.length >= 2)).toBe(true);
    const warships = (id: string) => st.fleets.filter((f) => f.ownerId === id).flatMap((f) => f.ships).filter((s) => (data.hulls.find((h) => h.id === s.hullId)?.slots.weapon ?? 0) > 0).length;
    expect(ais.some((e) => warships(e.id) >= 3)).toBe(true);
    expect(ais.every((e) => e.dust > -200)).toBe(true);
  });
  it('is deterministic with AI and pirates active', () => {
    const a = newGame(settings(), data), b = newGame(settings(), data);
    for (let i = 0; i < 25; i++) { endTurn(a, data); endTurn(b, data); }
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
  it('spawns pirates that raid or fight', () => {
    const st = newGame(settings({ difficulty: 'hard' }), data);
    for (let i = 0; i < 30; i++) endTurn(st, data);
    const pirates = getEmpire(st, PIRATE_ID);
    expect(pirates.isPirate).toBe(true);
    expect(st.fleets.some((f) => f.ownerId === PIRATE_ID) || st.battles.some((b) => b.attacker.empireId === PIRATE_ID || b.defender.empireId === PIRATE_ID)).toBe(true);
    expect(atWar(st, PIRATE_ID, st.playerEmpireId)).toBe(true);
  });
});

describe('diplomacy', () => {
  it('computes attitudes with reasons and remembers deeds', () => {
    const st = newGame(settings({ playerFaction: 'ferron' }), data);
    const ai = st.empires[1];
    const before = attitude(st, data, ai.id, st.playerEmpireId).value;
    declareWar(st, data, st.playerEmpireId, ai.id);
    const during = attitude(st, data, ai.id, st.playerEmpireId);
    expect(during.value).toBeLessThan(before - 30);
    expect(during.reasons.some((r) => r.label === 'At war')).toBe(true);
    expect(during.reasons.some((r) => r.label === 'Warmonger')).toBe(true);
  });
  it('accepts and refuses proposals by attitude, and tracks war score', () => {
    const st = newGame(settings({ playerFaction: 'mercator' }), data);
    const p = playerEmpire(st), ai = st.empires[1];
    p.influence = 500;
    adjustMemory(st, ai.id, p.id, -60);
    expect(proposeTreaty(st, data, p.id, ai.id, 'trade').accepted).toBe(false);
    adjustMemory(st, ai.id, p.id, 100);
    expect(proposeTreaty(st, data, p.id, ai.id, 'trade').accepted).toBe(true);
    expect(relationOf(st, p.id, ai.id).trade).toBe(true);
    expect(treatyBonus(st, p).dust).toBeGreaterThan(0);
    expect(proposeTreaty(st, data, p.id, ai.id, 'trade').message).toMatch(/already/);
    declareWar(st, data, ai.id, p.id);
    expect(relationOf(st, p.id, ai.id).trade).toBe(false);
    expect(warScoreFor(st, p.id, ai.id)).toBe(0);
    const offer = proposeTreaty(st, data, ai.id, p.id, 'peace');
    expect(offer.accepted).toBeNull();
    expect(st.offers).toHaveLength(1);
    expect(respondOffer(st, st.offers[0].id, true)).toBeNull();
    expect(atWar(st, p.id, ai.id)).toBe(false);
  });
});

describe('heroes', () => {
  it('recruits, assigns, levels and learns skills', () => {
    const st = newGame(settings(), data);
    const p = playerEmpire(st);
    p.dust = 1000; p.influence = 100;
    const defId = st.heroMarket[0];
    expect(recruitHero(st, data, p.id, defId)).toBeNull();
    const hero = p.heroes[0];
    const def = data.heroes.find((h) => h.id === defId)!;
    const home = getSystem(st, p.homeSystemId);
    if (def.role !== 'admiral') {
      expect(assignHero(st, data, p.id, hero.id, { kind: 'governor', systemId: home.id })).toBeNull();
    } else {
      expect(assignHero(st, data, p.id, hero.id, { kind: 'admiral', fleetId: st.fleets.find((f) => f.ownerId === p.id)!.id })).toBeNull();
    }
    hero.xp = 200;
    processHeroes(st, data, p, []);
    expect(hero.level).toBeGreaterThan(1);
    expect(skillPoints(data, hero)).toBeGreaterThan(0);
    const skill = data.heroSkills.find((s) => !hero.skills.includes(s.id) && !s.requires && (def.role === 'both' || s.tree === def.role))!;
    expect(learnSkill(data, p, hero.id, skill.id)).toBeNull();
    expect(hero.skills).toContain(skill.id);
  });
  it('migrates version 2 saves to version 3', () => {
    const st = newGame(settings(), data);
    const file = JSON.parse(serialize(st));
    file.version = 2;
    file.state.relations = { 'emp_0|emp_1': 'war' };
    delete file.state.attitudes; delete file.state.offers; delete file.state.heroMarket;
    file.state.empires = file.state.empires.filter((e: { isPirate: boolean }) => !e.isPirate);
    for (const e of file.state.empires) { delete e.heroes; delete e.isPirate; delete e.warDeclarations; }
    const loaded = migrateState(deserialize(JSON.stringify(file)), data);
    expect(relationOf(loaded, 'emp_0', 'emp_1').status).toBe('war');
    expect(loaded.empires.some((e) => e.isPirate)).toBe(true);
    expect(loaded.heroMarket.length).toBeGreaterThan(0);
    endTurn(loaded, data);
    expect(loaded.turn).toBe(2);
  });
});
