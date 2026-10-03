import { availableDesigns, availableImprovements, canBuildShips, moveQueueItem, queueImprovement, queueShip, removeQueueItem, rushBuy, rushCost } from '@engine/build';
import { index } from '@engine/data';
import { designStats } from '@engine/designs';
import { shipCost, systemReport } from '@engine/economy';
import { colonise, uprootSystem } from '@engine/fleetActions';
import type { StarSystem } from '@engine/types';
import type { App } from './app';
import { esc, fmt } from './dom';
import { fleetPanelAction } from './fleetPanel';
import { minorAction } from './minorPanel';

export function renderBuild(app: App, system: StarSystem): string {
  const st = app.state!, idx = index(app.data), player = app.player;
  const report = systemReport(st, app.data, system);
  const ind = report?.output.industry ?? 0;
  let html = '<h4 style="margin-top:10px">Build queue</h4>';
  if (system.siege) html += '<div class="bad">Under siege: construction is halted.</div>';
  if (!system.buildQueue.length) html += '<div class="muted">Nothing queued. Spare industry is converted to Dust at half value.</div>';
  system.buildQueue.forEach((b, i) => {
    const name = b.kind === 'ship' ? player.designs.find((d) => d.id === b.defId)?.name : idx.improvement[b.defId]?.name;
    const turns = ind > 0 ? Math.ceil((b.cost - b.progress) / ind) : '∞';
    html += `<div class="queue-item"><span class="name">${esc(name ?? b.defId)} <span class="muted">${fmt(b.progress, 0)}/${b.cost} · ${turns}t</span><div class="bar industry"><i style="width:${(b.progress / b.cost) * 100}%"></i></div></span>
      <button class="small" data-action="rush-build" data-id="${b.id}" title="Pay Dust to finish next turn" ${player.dust < rushCost(b) ? 'disabled' : ''}>${rushCost(b)}◈</button>
      <button class="small" data-action="queue-up" data-id="${b.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="small danger" data-action="remove-build" data-id="${b.id}">✕</button></div>`;
  });
  html += '<h4 style="margin-top:10px">Improvements</h4><div class="build-list">';
  for (const def of availableImprovements(st, app.data, system)) {
    html += `<button data-action="queue-improvement" data-id="${def.id}" title="${esc(def.description)}"><span>${esc(def.name)}</span><span class="cost">${def.cost}⚒ ${def.upkeep ? `· ${def.upkeep}◈/t` : ''}</span></button>`;
  }
  html += '</div><h4 style="margin-top:10px">Ships <span class="muted" style="text-transform:none;letter-spacing:0">(edit in the Designer, D)</span></h4><div class="build-list">';
  if (!canBuildShips(system)) html += '<div class="muted">Ships require a full colony.</div>';
  else for (const design of availableDesigns(app.data, player)) {
    const hull = idx.hull[design.hullId];
    const stats = designStats(app.data, design);
    html += `<button data-action="queue-ship" data-id="${design.id}" title="${esc(hull?.description ?? '')}"><span>${esc(design.name)} <span class="muted">${hull?.class ?? ''} · ${stats.weapons.length}⚔ ${stats.hp}hp</span></span><span class="cost">${shipCost(app.data, player, system, stats.cost)}⚒</span></button>`;
  }
  html += '</div>';
  if (idx.faction[player.factionId].modifiers.instantColony) html += '<div class="toolbar"><button class="danger" data-action="uproot" title="Load every citizen into an Ark and abandon this system">Uproot system</button></div>';
  return html;
}

/** Handles clicks inside the side panel. Returns false when the action is not a panel action. */
export function buildPanelAction(app: App, action: string, el: HTMLElement): boolean {
  const st = app.state; if (!st) return false;
  if (fleetPanelAction(app, action, el) || minorAction(app, action, el)) return true;
  const sysId = app.selectedSystemId ?? '';
  const id = el.dataset.id ?? '';
  let err: string | null = null;
  switch (action) {
    case 'deselect': app.selectSystem(null); return true;
    case 'select-fleet': app.selectFleet(id); return true;
    case 'colonise': err = colonise(st, app.data, st.playerEmpireId, sysId, el.dataset.planet ?? ''); if (!err) app.toast('Settlers have landed.'); break;
    case 'queue-improvement': err = queueImprovement(st, app.data, sysId, id); break;
    case 'queue-ship': err = queueShip(st, app.data, sysId, id); break;
    case 'remove-build': removeQueueItem(st, sysId, id); break;
    case 'queue-up': moveQueueItem(st, sysId, id, -1); break;
    case 'rush-build': err = rushBuy(st, sysId, id); break;
    case 'uproot': err = uprootSystem(st, app.data, sysId); if (!err) app.toast('The Ark is loaded. Choose a new home.'); break;
    default: return false;
  }
  if (err) app.toast(err);
  app.render();
  return true;
}
