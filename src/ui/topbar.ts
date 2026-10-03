import { approvalLabel, empireReport } from '@engine/economy';
import type { App, Screen } from './app';
import { esc, fmt, fmtSigned } from './dom';

const NAV: Array<[Screen, string, string]> = [
  ['empire', 'Empire', 'E'], ['research', 'Research', 'R'], ['designer', 'Designer', 'D'],
  ['diplomacy', 'Diplomacy', 'P'], ['heroes', 'Heroes', 'H'], ['senate', 'Senate', 'S'], ['menu', 'Menu', 'Esc'],
];

export function renderTopbar(app: App): string {
  const st = app.state;
  let html = '<span class="brand">VESPER REACH</span>';
  if (!st) return html;
  const player = app.player;
  const r = empireReport(st, app.data, player);
  const limit = st.settings.turnLimit ? ` / ${st.settings.turnLimit}` : '';
  html += `<span class="turn">Turn ${st.turn}${limit}</span>`;
  html += `<span class="res dust" title="Dust: currency for upkeep and rush-buying"><span class="k">Dust</span><span class="v">${fmt(player.dust, 0)}</span><span class="d">${fmtSigned(r.netDust)}</span></span>`;
  html += `<span class="res influence" title="Influence: laws and diplomacy (milestone 4)"><span class="k">Influence</span><span class="v">${fmt(player.influence, 0)}</span><span class="d">${fmtSigned(r.totals.influence)}</span></span>`;
  html += `<span class="res science" title="Science: stored research (milestone 2 spends it)"><span class="k">Science</span><span class="v">${fmt(player.science, 0)}</span><span class="d">${fmtSigned(r.totals.science)}</span></span>`;
  html += `<span class="res food" title="Total food output across all systems"><span class="k">Food</span><span class="v">${fmt(r.totals.food)}</span></span>`;
  html += `<span class="res industry" title="Total industry output"><span class="k">Industry</span><span class="v">${fmt(r.totals.industry)}</span></span>`;
  html += `<span class="res" title="Population-weighted approval"><span class="k">Approval</span><span class="v">${r.approval}</span><span class="d">${esc(approvalLabel(r.approval))}</span></span>`;
  html += `<span class="res" title="Systems · population"><span class="k">Systems</span><span class="v">${r.systems}</span><span class="d">${r.pop} pop</span></span>`;
  html += '<span class="spacer"></span><span class="nav row">';
  for (const [screen, label, key] of NAV) {
    html += `<button data-action="screen:${screen}" class="${app.screen === screen ? 'active' : ''}" title="${label} (${key})">${label}</button>`;
  }
  html += '</span><button id="endturn" data-action="end-turn" title="End turn (Enter)">End Turn ⏎</button>';
  return html;
}
