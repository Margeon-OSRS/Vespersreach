import { describe, expect, it } from 'vitest';
import { loadData } from '../data';
import { defaultSettings, newGame } from '../game';
import { techCost } from '../research';
import { ownedSystems } from '../state';
import { endTurn } from '../turn';
import type { GameSettings } from '../types';
import { majors } from '../victory';

const data = loadData();
const settings = (over: Partial<GameSettings> = {}): GameSettings => ({ ...defaultSettings(), seed: 'balance', size: 'medium', opponents: 3, ...over });

describe('balance', () => {
  it('research gets dearer with every tech known', () => {
    const st = newGame(settings(), data);
    const p = st.empires[0];
    const tech = data.techs[0];
    const base = techCost(p, tech);
    p.techs.push('x', 'y');
    expect(techCost(p, tech)).toBeGreaterThan(base);
  });
  it('normal games last: no victory before turn 80, AIs solvent and expanding', () => {
    const st = newGame(settings(), data);
    let firstVictory = 0;
    for (let i = 0; i < 120; i++) { endTurn(st, data); if (st.victory && !firstVictory) firstVictory = st.turn; }
    expect(firstVictory === 0 || firstVictory >= 80).toBe(true);
    const ais = majors(st).filter((e) => !e.isPlayer);
    expect(ais.every((e) => e.dust > -100)).toBe(true);
    expect(ais.some((e) => ownedSystems(st, e.id).length >= 4)).toBe(true);
    expect(ais.every((e) => e.techs.length < data.techs.length)).toBe(true);
    expect(ais.every((e) => e.approval >= 30)).toBe(true);
    const text = JSON.stringify(st);
    expect(text.includes('NaN')).toBe(false);
    expect(text.includes('null,null')).toBe(false);
  });
  it('hard AIs go to war within 150 turns', () => {
    const st = newGame(settings({ difficulty: 'hard', seed: 'hard-balance' }), data);
    let sawWar = false;
    for (let i = 0; i < 150 && !sawWar; i++) {
      endTurn(st, data);
      sawWar = Object.values(st.relations).some((r) => r.status === 'war');
    }
    expect(sawWar).toBe(true);
  });
});
