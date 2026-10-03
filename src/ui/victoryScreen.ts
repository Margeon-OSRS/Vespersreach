import { majors, scoreOf, VICTORY_TEXT, VICTORY_TITLE } from '@engine/victory';
import type { App } from './app';
import { esc } from './dom';

export function renderVictory(app: App): string {
  const st = app.state!;
  const v = st.victory;
  if (!v) return '<p class="muted">The game is still undecided.</p>';
  const winner = st.empires.find((e) => e.id === v.empireId)!;
  const mine = winner.id === st.playerEmpireId;
  const rows = majors(st).map((e) => ({ e, s: scoreOf(st, app.data, e) })).sort((a, b) => b.s - a.s);
  let body = `<div class="card" style="text-align:center;padding:18px"><h2 style="color:${mine ? 'var(--accent-2)' : 'var(--bad)'}">${mine ? 'Victory' : 'Defeat'}</h2><p><strong>${esc(winner.name)}</strong> achieved a <strong>${esc(VICTORY_TITLE[v.kind])}</strong> on turn ${v.turn}.</p><p class="muted">${esc(VICTORY_TEXT[v.kind])}</p></div>`;
  body += '<table><thead><tr><th>Empire</th><th class="num">Score</th><th>Status</th></tr></thead><tbody>' + rows.map((r) => `<tr><td><span class="faction swatch" style="background:${r.e.colour}"></span>${esc(r.e.name)}${r.e.isPlayer ? ' (you)' : ''}</td><td class="num">${r.s}</td><td class="muted">${r.e.eliminated ? 'eliminated' : r.e.id === winner.id ? 'winner' : 'survived'}</td></tr>`).join('') + '</tbody></table>';
  body += '<div class="toolbar" style="margin-top:12px"><button class="primary" data-action="close-screen">Continue playing</button><button data-action="screen:newgame">New game</button></div>';
  return body;
}
