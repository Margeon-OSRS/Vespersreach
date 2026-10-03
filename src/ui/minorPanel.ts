import { index } from '@engine/data';
import { ASSIMILATE_AT, assimilateMinor, ENVOY_COST, giftMinor, MINOR_GIFT, minorRelation, sendEnvoys } from '@engine/minors';
import type { StarSystem } from '@engine/types';
import { atWar, declareWar } from '@engine/war';
import type { App } from './app';
import { esc } from './dom';

/** Goodwill, envoy and assimilation controls for a system held by a minor faction. */
export function renderMinorSection(app: App, system: StarSystem): string {
  const st = app.state!, idx = index(app.data);
  const minor = st.empires.find((e) => e.id === system.ownerId && e.isMinor);
  if (!minor) return '';
  const faction = idx.faction[minor.factionId];
  const def = idx.minor[minor.factionId];
  const rel = minorRelation(st, minor.id, st.playerEmpireId);
  const war = atWar(st, st.playerEmpireId, minor.id);
  let html = `<h4 style="margin-top:10px">Minor faction</h4><div class="card"><strong>${esc(faction.name)}</strong><p class="muted" style="margin:4px 0">${esc(faction.blurb)}</p><div>Boon on assimilation: <span class="good">${esc(def?.bonusText ?? '')}</span></div>`;
  html += `<div class="row spread" style="margin-top:6px"><span>Goodwill ${rel}/${ASSIMILATE_AT}</span>${war ? '<span class="bad">At war</span>' : ''}</div><div class="bar"><i style="width:${rel}%"></i></div><div class="toolbar">`;
  if (!war) {
    html += `<button class="small" data-action="minor-envoys" data-id="${minor.id}" title="+20 goodwill" ${app.player.influence < ENVOY_COST ? 'disabled' : ''}>Send envoys (${ENVOY_COST} influence)</button>`;
    html += `<button class="small" data-action="minor-gift" data-id="${minor.id}" title="+15 goodwill" ${app.player.dust < MINOR_GIFT ? 'disabled' : ''}>Gift ${MINOR_GIFT} Dust</button>`;
    if (rel >= ASSIMILATE_AT) html += `<button class="small primary" data-action="minor-assimilate" data-id="${minor.id}">Assimilate</button>`;
    if (!idx.faction[app.player.factionId].modifiers.pacifist) html += `<button class="small danger" data-action="minor-war" data-id="${minor.id}">Declare war</button>`;
  } else html += '<span class="muted">Besiege and invade the system to take it by force (no boon).</span>';
  return html + '</div></div>';
}

export function minorAction(app: App, action: string, el: HTMLElement): boolean {
  const st = app.state; if (!st) return false;
  const id = el.dataset.id ?? '', me = st.playerEmpireId;
  let msg: string | null;
  switch (action) {
    case 'minor-envoys': msg = sendEnvoys(st, me, id) ?? 'Envoys sent.'; break;
    case 'minor-gift': msg = giftMinor(st, me, id) ?? 'Gift sent.'; break;
    case 'minor-assimilate': msg = assimilateMinor(st, me, id) ?? 'They have joined the empire.'; break;
    case 'minor-war': msg = declareWar(st, app.data, me, id) ?? 'War declared.'; break;
    default: return false;
  }
  app.toast(msg);
  app.render();
  return true;
}
