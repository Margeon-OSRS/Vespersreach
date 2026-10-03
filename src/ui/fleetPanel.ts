import { index } from '@engine/data';
import { canColonise, colonise, orderFleetMove } from '@engine/fleetActions';
import { commandLimit, fleetCommandPoints, fleetSpeed, fleetTroops, mergeFleets, setTactic, shipStats, splitFleet } from '@engine/fleets';
import { admiralOf } from '@engine/heroes';
import { planetName } from '@engine/names';
import { groundDefence, invade } from '@engine/siege';
import type { Fleet } from '@engine/types';
import { atWar } from '@engine/war';
import type { App } from './app';
import { esc } from './dom';

export function renderFleetPanel(app: App, fleet: Fleet): string {
  const st = app.state!, idx = index(app.data);
  const owner = st.empires.find((e) => e.id === fleet.ownerId)!;
  const mine = fleet.ownerId === st.playerEmpireId;
  const here = fleet.systemId ? st.galaxy.systems.find((s) => s.id === fleet.systemId) : null;
  const where = fleet.transit
    ? `In transit to ${esc(st.galaxy.systems.find((s) => s.id === fleet.transit!.to)?.name ?? '?')} (${Math.round(fleet.transit.progress * 100)}%)`
    : `Orbiting ${esc(here?.name ?? '?')}`;
  const dest = fleet.path.length ? st.galaxy.systems.find((s) => s.id === fleet.path[fleet.path.length - 1])?.name : null;
  const cp = fleetCommandPoints(app.data, fleet), limit = commandLimit(app.data, owner);
  let html = `<div class="row spread"><h2 style="color:${owner.colour}">${esc(fleet.name)}</h2><button class="small" data-action="deselect">✕</button></div>`;
  html += `<div class="muted">${esc(owner.name)} · ${where} · speed ${fleetSpeed(st, app.data, fleet)} · ${cp}/${limit} CP · ${fleetTroops(st, app.data, fleet)} troops</div>`;
  const admiral = admiralOf(st, fleet);
  if (admiral) html += `<div>Admiral: <strong>${esc(idx.hero[admiral.defId]?.name ?? '?')}</strong> <span class="muted">level ${admiral.level}</span></div>`;
  if (dest) html += `<div>Destination: <strong>${esc(dest)}</strong> <span class="muted">(${fleet.path.length} jump${fleet.path.length === 1 ? '' : 's'})</span></div>`;
  html += `<h4 style="margin-top:10px">Ships${mine ? ' <span class="muted" style="text-transform:none;letter-spacing:0">(click to select for a split)</span>' : ''}</h4>`;
  for (const ship of fleet.ships) {
    const s = shipStats(app.data, owner, ship);
    const design = owner.designs.find((d) => d.id === ship.designId);
    const sel = app.selectedShipIds.includes(ship.id);
    html += `<div class="card row spread ship ${sel ? 'selected' : ''}" ${mine ? `data-action="toggle-ship" data-id="${ship.id}"` : ''}><span><strong>${esc(ship.name)}</strong> <span class="muted">${esc(design?.name ?? ship.hullId)} · ${s.weapons.length}⚔ ${s.shield}🛡 ${s.armour}▣</span></span><span class="${ship.hp < s.hp * 0.5 ? 'bad' : 'muted'}">${ship.hp}/${s.hp} hp${ship.cargoPop ? ` · ${ship.cargoPop} pop` : ''}</span></div>`;
  }
  if (!mine) return html;
  html += `<div class="toolbar"><button class="${app.moveMode ? 'primary' : ''}" data-action="move-mode">${app.moveMode ? 'Click a destination…' : 'Move to…'}</button>`;
  if (fleet.path.length) html += '<button data-action="cancel-orders">Hold position</button>';
  if (here) html += `<button data-action="goto-system" data-id="${here.id}">View system</button>`;
  if (app.selectedShipIds.length && fleet.systemId) html += '<button data-action="split-fleet">Split off selected</button>';
  html += '</div>';
  html += '<h4>Tactic card</h4><div class="toolbar">' + app.data.tactics.map((t) => `<button class="small ${fleet.tactic === t.id ? 'primary' : ''}" data-action="tactic:${t.id}" title="${esc(t.description)}">${esc(t.name)}</button>`).join('') + '</div>';
  html += `<div class="muted" style="font-size:12px">${esc(idx.tactic[fleet.tactic]?.description ?? '')}</div>`;
  if (here) {
    const others = st.fleets.filter((f) => f.ownerId === fleet.ownerId && f.systemId === here.id && f.id !== fleet.id);
    if (others.length) html += '<h4 style="margin-top:10px">Merge</h4><div class="toolbar">' + others.map((f) => `<button class="small" data-action="merge-into" data-id="${f.id}">Absorb ${esc(f.name)} (${fleetCommandPoints(app.data, f)} CP)</button>`).join('') + '</div>';
    if (here.ownerId && here.ownerId !== fleet.ownerId && atWar(st, fleet.ownerId, here.ownerId)) {
      const besieged = here.siege?.by === fleet.ownerId;
      html += `<h4 style="margin-top:10px">Invasion</h4><div class="muted" style="font-size:12px">Ground defence ${groundDefence(st, here)} · your troops ${fleetTroops(st, app.data, fleet)} · ${besieged ? `siege turn ${here.siege!.turns}` : 'not yet besieged'}</div><div class="toolbar"><button class="danger" data-action="invade" ${besieged ? '' : 'disabled'}>Invade ${esc(here.name)}</button></div>`;
    }
    const options = here.planets.map((p, i) => ({ p, i, check: canColonise(st, app.data, st.playerEmpireId, here.id, p.id) })).filter((o) => o.check.ok);
    if (options.length) {
      html += '<h4 style="margin-top:10px">Settle</h4>';
      for (const o of options) html += `<button style="width:100%;margin-bottom:4px" data-action="fleet-colonise" data-planet="${o.p.id}">${o.check.ark ? 'Settle' : 'Found outpost on'} ${esc(planetName(here.name, o.i))} <span class="muted">(${esc(idx.planetType[o.p.type].name)})</span></button>`;
    }
  }
  html += '<div class="muted" style="font-size:12px;margin-top:8px">Tip: right-click any known system to send the selected fleet there.</div>';
  return html;
}

export function fleetPanelAction(app: App, action: string, el: HTMLElement): boolean {
  const st = app.state; if (!st) return false;
  const fleet = st.fleets.find((f) => f.id === app.selectedFleetId);
  const id = el.dataset.id ?? '';
  if (action.startsWith('tactic:') && fleet) { setTactic(st, app.data, fleet.id, action.slice(7)); app.render(); return true; }
  switch (action) {
    case 'move-mode': app.moveMode = !app.moveMode; app.render(); return true;
    case 'cancel-orders': if (fleet) orderFleetMove(st, fleet.id, fleet.transit ? fleet.transit.to : fleet.systemId ?? ''); app.render(); return true;
    case 'goto-system': app.selectSystem(id, true); return true;
    case 'toggle-ship': app.selectedShipIds = app.selectedShipIds.includes(id) ? app.selectedShipIds.filter((x) => x !== id) : [...app.selectedShipIds, id]; app.render(); return true;
    case 'split-fleet': { if (!fleet) return true; const r = splitFleet(st, fleet.id, app.selectedShipIds); if (typeof r === 'string') app.toast(r); else { app.selectedShipIds = []; app.selectFleet(r.id); } return true; }
    case 'merge-into': { if (!fleet) return true; const err = mergeFleets(st, app.data, fleet.id, id); if (err) app.toast(err); app.render(); return true; }
    case 'invade': { if (!fleet) return true; const r = invade(st, app.data, fleet.id); if (typeof r === 'string') app.toast(r); else { app.toast(r.success ? 'The system is ours.' : 'The landing was repulsed.'); if (r.success) app.selectSystem(fleet.systemId); } app.render(); return true; }
    case 'fleet-colonise': {
      if (!fleet?.systemId) return true;
      const err = colonise(st, app.data, st.playerEmpireId, fleet.systemId, el.dataset.planet ?? '');
      if (err) app.toast(err); else { app.toast('Settlers have landed.'); app.selectSystem(fleet.systemId); }
      app.render(); return true;
    }
    default: return false;
  }
}
