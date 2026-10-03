import { index } from '@engine/data';
import { attitude, cancelTreaty, empireStrength, giftDust, GIFT_AMOUNT, proposeTreaty, relationOf, respondOffer, TREATY_COST, TRIBUTE_AMOUNT, warScoreFor } from '@engine/diplomacy';
import type { TreatyKind } from '@engine/types';
import { declareWar, knownEmpires } from '@engine/war';
import type { App } from './app';
import { esc, fmtSigned } from './dom';

const KIND_LABEL: Record<TreatyKind, string> = { peace: 'Peace', trade: 'Trade treaty', research: 'Research treaty', alliance: 'Alliance', tribute: `Tribute (${TRIBUTE_AMOUNT} Dust)` };

export function renderDiplomacy(app: App): string {
  const st = app.state!, player = app.player, idx = index(app.data);
  const pacifist = !!idx.faction[player.factionId].modifiers.pacifist;
  const known = knownEmpires(st, player.id);
  let body = `<div class="muted" style="margin-bottom:8px">Influence ${Math.round(player.influence)} · proposals cost influence (peace ${TREATY_COST.peace}, trade ${TREATY_COST.trade}, research ${TREATY_COST.research}, alliance ${TREATY_COST.alliance}) · gifts cost ${GIFT_AMOUNT} Dust.</div>`;
  const offers = st.offers.filter((o) => o.to === player.id);
  if (offers.length) {
    body += '<h3>Offers awaiting your answer</h3>';
    for (const o of offers) body += `<div class="card row spread"><span><strong>${esc(st.empires.find((e) => e.id === o.from)?.name ?? o.from)}</strong> proposes: ${KIND_LABEL[o.kind]} <span class="muted">(turn ${o.turn})</span></span><span><button class="small primary" data-action="offer-accept" data-id="${o.id}">Accept</button> <button class="small" data-action="offer-decline" data-id="${o.id}">Decline</button></span></div>`;
  }
  if (!known.length) body += '<div class="card">You have not met another empire yet. Explore until you find their systems.</div>';
  for (const id of known) {
    const e = st.empires.find((x) => x.id === id)!;
    const f = idx.faction[e.factionId];
    const rel = relationOf(st, player.id, id);
    const att = attitude(st, app.data, id, player.id);
    const systems = st.galaxy.systems.filter((s) => s.ownerId === id).length;
    const status = rel.status === 'war' ? `<span class="tag" style="color:var(--bad)">At war · score ${fmtSigned(warScoreFor(st, player.id, id), 0)}</span>` : rel.status === 'alliance' ? '<span class="tag colony">Allied</span>' : '<span class="tag">Peace</span>';
    const treaties = [rel.trade ? 'trade' : '', rel.research ? 'research' : ''].filter(Boolean);
    body += `<div class="card"><div class="row spread"><span><span class="faction swatch" style="background:${e.colour}"></span><strong>${esc(e.name)}</strong> <span class="muted">${esc(f.affinity.name)} · ${systems} system${systems === 1 ? '' : 's'} · strength ${empireStrength(st, app.data, id)} vs yours ${empireStrength(st, app.data, player.id)}</span></span>${status}</div>
      <div style="margin-top:4px">Attitude: <strong>${att.label}</strong> (${fmtSigned(att.value, 0)}) <span class="muted">${att.reasons.map((r) => `${esc(r.label)} ${fmtSigned(r.value, 0)}`).join(' · ')}</span></div>
      <div class="toolbar">`;
    if (rel.status === 'war') body += `<button class="small" data-action="treaty:peace" data-id="${id}">Propose peace</button>`;
    else {
      body += rel.trade ? `<button class="small" data-action="cancel:trade" data-id="${id}">Cancel trade</button>` : `<button class="small" data-action="treaty:trade" data-id="${id}">Propose trade</button>`;
      body += rel.research ? `<button class="small" data-action="cancel:research" data-id="${id}">Cancel research</button>` : `<button class="small" data-action="treaty:research" data-id="${id}">Propose research</button>`;
      body += rel.status === 'alliance' ? `<button class="small" data-action="cancel:alliance" data-id="${id}">Leave alliance</button>` : `<button class="small" data-action="treaty:alliance" data-id="${id}">Propose alliance</button>`;
      body += `<button class="small" data-action="treaty:tribute" data-id="${id}">Demand tribute</button>`;
      if (!pacifist) body += `<button class="small danger" data-action="declare-war" data-id="${id}">Declare war</button>`;
    }
    body += `<button class="small" data-action="gift" data-id="${id}">Gift ${GIFT_AMOUNT} Dust</button></div>${treaties.length ? `<div class="muted">Treaties: ${treaties.join(', ')}</div>` : ''}</div>`;
  }
  return body;
}

export function diplomacyAction(app: App, action: string, el: HTMLElement): boolean {
  const st = app.state; if (!st) return false;
  const id = el.dataset.id ?? '', me = st.playerEmpireId;
  const [verb, arg] = action.split(':');
  let msg: string | null;
  switch (verb) {
    case 'treaty': msg = proposeTreaty(st, app.data, me, id, arg as TreatyKind).message; break;
    case 'cancel': msg = cancelTreaty(st, me, id, arg as 'trade' | 'research' | 'alliance'); break;
    case 'declare-war': msg = declareWar(st, app.data, me, id) ?? 'War declared.'; break;
    case 'gift': msg = giftDust(st, me, id) ?? 'Gift sent.'; break;
    case 'offer-accept': msg = respondOffer(st, id, true) ?? 'Accepted.'; break;
    case 'offer-decline': msg = respondOffer(st, id, false) ?? 'Declined.'; break;
    default: return false;
  }
  if (msg) app.toast(msg);
  app.render();
  return true;
}
