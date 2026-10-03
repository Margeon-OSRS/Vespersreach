import { index } from '@engine/data';
import { approvalLabel, systemReport } from '@engine/economy';
import { ownedSystems, systemPop } from '@engine/state';
import { RESOURCE_KEYS } from '@engine/types';
import type { App } from './app';
import { designerAction, renderDesigner } from './designerScreen';
import { esc, fmt } from './dom';
import { renderMenu, renderNewGame } from './menu';
import { renderResearch, researchAction } from './researchScreen';
import { diplomacyAction, renderDiplomacy } from './diplomacyScreen';
import { heroesAction, renderHeroes } from './heroesScreen';
import { renderBattle, renderBattleList, warAction } from './warScreens';
import { renderSenate, senateAction } from './senateScreen';
import { renderEmpireExtras } from './empireExtras';
import { renderVictory } from './victoryScreen';

function shell(title: string, body: string): string {
  return `<div class="screen"><header><h2>${esc(title)}</h2><button data-action="close-screen">Close <kbd>Esc</kbd></button></header>${body}</div>`;
}

function empireScreen(app: App): string {
  const st = app.state!, idx = index(app.data), player = app.player;
  const faction = idx.faction[player.factionId];
  let body = `<div class="row" style="margin-bottom:10px"><span class="faction swatch" style="background:${faction.colours.primary}"></span><strong>${esc(faction.name)}</strong><span class="muted">${esc(faction.affinity.name)}: ${esc(faction.affinity.description)}</span></div>`;
  body += '<table><thead><tr><th>System</th><th class="num">Pop</th>' + RESOURCE_KEYS.map((k) => `<th class="num">${k}</th>`).join('') + '<th class="num">Approval</th><th>Building</th></tr></thead><tbody>';
  for (const s of ownedSystems(st, player.id)) {
    const r = systemReport(st, app.data, s);
    if (!r) continue;
    const head = s.buildQueue[0];
    const building = head ? (head.kind === 'ship' ? player.designs.find((d) => d.id === head.defId)?.name : idx.improvement[head.defId]?.name) : '—';
    body += `<tr class="link" data-action="goto-system" data-id="${s.id}"><td>${esc(s.name)}${s.id === player.homeSystemId ? ' ★' : ''}${s.siege ? ' <span class="bad">besieged</span>' : ''}</td><td class="num">${systemPop(s)}</td>`
      + RESOURCE_KEYS.map((k) => `<td class="num">${fmt(r.output[k])}</td>`).join('')
      + `<td class="num">${r.approval} <span class="muted">${approvalLabel(r.approval)}</span></td><td>${esc(building ?? '—')}</td></tr>`;
  }
  body += '</tbody></table>';
  body += '<h3 style="margin-top:14px">Traits</h3><ul>' + faction.traits.map((t) => `<li><strong>${esc(t.name)}</strong> <span class="muted">${esc(t.description)}</span></li>`).join('') + '</ul>';
  body += `<p class="muted">${esc(faction.blurb)}</p>`;
  body += renderEmpireExtras(app);
  return shell('Empire', body);
}


export function renderScreen(app: App): string {
  if (app.screen === 'newgame') return `<div class="screen">${renderNewGame(app)}</div>`;
  if (app.screen === 'menu') return shell('Menu', renderMenu(app));
  if (!app.state) return '';
  switch (app.screen) {
    case 'none': return '';
    case 'empire': return empireScreen(app);
    case 'research': return shell('Research', renderResearch(app));
    case 'designer': return shell('Ship Designer', renderDesigner(app));
    case 'diplomacy': return shell('Diplomacy', renderDiplomacy(app) + '<div class="toolbar" style="margin-top:12px"><button data-action="battle-list">Battle reports</button></div>');
    case 'battle': return shell(app.viewBattleId ? 'Battle Report' : 'Battle Reports', app.viewBattleId ? renderBattle(app) : renderBattleList(app));
    case 'heroes': return shell('Heroes', renderHeroes(app));
    case 'senate': return shell('Senate', renderSenate(app));
    case 'victory': return shell('Game Over', renderVictory(app));
  }
}

export function screenAction(app: App, action: string, el: HTMLElement): boolean {
  if (action === 'close-screen') { app.setScreen('none'); return true; }
  if (action === 'goto-system') { app.setScreen('none'); app.selectSystem(el.dataset.id ?? null, true); return true; }
  if (!app.state) return false;
  return researchAction(app, action, el) || designerAction(app, action, el) || warAction(app, action, el) || diplomacyAction(app, action, el) || heroesAction(app, action, el) || senateAction(app, action, el);
}
