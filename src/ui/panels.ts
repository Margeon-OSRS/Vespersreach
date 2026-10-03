import { index } from '@engine/data';
import { approvalLabel, OUTPOST_TURNS, systemReport } from '@engine/economy';
import { canColonise } from '@engine/fleetActions';
import { governorOf } from '@engine/heroes';
import { planetName } from '@engine/names';
import { fleetsAt } from '@engine/state';
import type { Planet, StarSystem } from '@engine/types';
import { RESOURCE_KEYS } from '@engine/types';
import type { App } from './app';
import { renderBuild } from './buildPanel';
import { renderMinorSection } from './minorPanel';
import { esc, fmt, fmtSigned } from './dom';
import { renderFleetPanel } from './fleetPanel';
import { planetImage } from './planetArt';

export function renderPanel(app: App): string {
  const st = app.state;
  if (!st) return '';
  if (app.selectedFleetId) {
    const fleet = st.fleets.find((f) => f.id === app.selectedFleetId);
    if (fleet) return renderFleetPanel(app, fleet);
  }
  const system = st.galaxy.systems.find((s) => s.id === app.selectedSystemId);
  return system ? renderSystemPanel(app, system) : '';
}

function planetCard(app: App, system: StarSystem, planet: Planet, i: number): string {
  const idx = index(app.data);
  const def = idx.planetType[planet.type];
  const an = planet.anomalyId ? idx.anomaly[planet.anomalyId] : null;
  const dep = planet.depositId ? idx.deposit[planet.depositId] : null;
  const yields = RESOURCE_KEYS.filter((k) => def.yieldsPerPop[k]).map((k) => `${def.yieldsPerPop[k]} ${k[0].toUpperCase()}`).join(' · ');
  const check = canColonise(app.state!, app.data, app.state!.playerEmpireId, system.id, planet.id);
  let action = '';
  if (planet.status === 'none') {
    const anyShip = fleetsAt(app.state!, system.id, app.state!.playerEmpireId).length > 0;
    if (check.ok) action = `<button class="small primary" data-action="colonise" data-planet="${planet.id}">${check.ark ? 'Settle with Ark' : 'Found outpost'}</button>`;
    else if (anyShip || check.reason.startsWith('Requires')) action = `<span class="muted" style="font-size:12px">${esc(check.reason)}</span>`;
  }
  const status = planet.status === 'colony' ? `<span class="tag colony">Colony ${planet.pop}/${planet.maxPop}</span>`
    : planet.status === 'outpost' ? `<span class="tag outpost">Outpost ${planet.outpostTurns}/${OUTPOST_TURNS} · pop ${planet.pop}</span>`
    : `<span class="tag">Uninhabited · cap ${planet.maxPop}</span>`;
  return `<div class="card planet">
    <img src="${planetImage(def, planet.id, 56)}" alt="${esc(def.name)}" title="${esc(def.description)}">
    <div>
      <div class="row spread"><strong>${esc(planetName(system.name, i))}</strong><span class="muted">${esc(def.name)} · ${planet.size}</span></div>
      <div class="yields">${yields || 'no yields'} per pop · approval ${fmtSigned(def.approval, 0)}</div>
      <div>${status}${an ? `<span class="tag anomaly" title="${esc(an.description)}">${esc(an.name)}</span>` : ''}${dep ? `<span class="tag deposit" title="${esc(dep.description)}">${esc(dep.name)}</span>` : ''}</div>
      <div style="margin-top:4px">${action}</div>
    </div></div>`;
}

function renderSystemPanel(app: App, system: StarSystem): string {
  const st = app.state!;
  const idx = index(app.data);
  const owner = system.ownerId ? st.empires.find((e) => e.id === system.ownerId) : null;
  const explored = app.isExplored(system.id);
  let html = `<div class="row spread"><h2>${esc(explored ? system.name : 'Unknown system')}</h2><button class="small" data-action="deselect">✕</button></div>`;
  html += `<div class="muted">${explored ? `${system.starClass} star · ${system.planets.length} planet${system.planets.length === 1 ? '' : 's'}` : 'Send a ship here to chart it.'}${owner ? ` · <span style="color:${owner.colour}">${esc(owner.name)}</span>` : ''}</div>`;
  const fleets = st.fleets.filter((f) => f.systemId === system.id && (f.ownerId === st.playerEmpireId || explored));
  if (fleets.length) {
    html += '<h4 style="margin-top:10px">Fleets in orbit</h4>';
    for (const f of fleets) {
      const e = st.empires.find((x) => x.id === f.ownerId);
      html += `<div class="row spread"><span><span style="color:${e?.colour}">■</span> ${esc(f.name)} <span class="muted">(${f.ships.length} ship${f.ships.length === 1 ? '' : 's'})</span></span><button class="small" data-action="select-fleet" data-id="${f.id}">Select</button></div>`;
    }
  }
  if (!explored) return html;
  const mine = system.ownerId === st.playerEmpireId;
  const report = mine ? systemReport(st, app.data, system) : null;
  if (report) {
    html += `<h4 style="margin-top:10px">Output per turn</h4><div class="fidsi">${RESOURCE_KEYS.map((k) => `<div class="${k}"><span>${k}</span>${fmt(report.output[k])}</div>`).join('')}</div>`;
    const pct = Math.max(0, Math.min(100, (system.growthStock / report.growthThreshold) * 100));
    html += `<div class="row spread" style="margin-top:6px"><span>Approval <strong>${report.approval}</strong> <span class="muted">${approvalLabel(report.approval)}</span></span><span>Food ${fmtSigned(report.foodNet)} <span class="muted">(growth ${fmtSigned(report.growthPerTurn)}/${report.growthThreshold})</span></span></div>`;
    html += `<div class="bar food"><i style="width:${pct}%"></i></div>`;
    const governor = governorOf(st, system);
    if (governor) html += `<div class="muted">Governor: ${esc(idx.hero[governor.defId]?.name ?? '?')} (level ${governor.level})</div>`;
    if (system.improvements.length) html += `<div style="margin-top:6px">${system.improvements.map((id) => `<span class="tag" title="${esc(idx.improvement[id]?.description ?? '')}">${esc(idx.improvement[id]?.name ?? id)}</span>`).join('')}</div>`;
  }
  html += '<h4 style="margin-top:10px">Planets</h4>' + system.planets.map((p, i) => planetCard(app, system, p, i)).join('');
  if (mine) html += renderBuild(app, system);
  else html += renderMinorSection(app, system);
  return html;
}
