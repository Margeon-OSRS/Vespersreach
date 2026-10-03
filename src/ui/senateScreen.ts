import { index } from '@engine/data';
import { availableLaws, ELECTION_INTERVAL, lawUpkeep, MAX_LAWS, passLaw, repealLaw, RULING_BONUS_TEXT } from '@engine/politics';
import { IDEOLOGIES } from '@engine/types';
import type { App } from './app';
import { esc, fmt } from './dom';

const PARTY_BLURB: Record<string, string> = {
  industrialist: 'Factories, shipyards and full employment.', mercantile: 'Trade, markets and low taxes.',
  scientific: 'Research, universities and curiosity.', pacifist: 'Peace, festivals and open borders.', militarist: 'Fleets, discipline and readiness.',
};

export function renderSenate(app: App): string {
  const st = app.state!, player = app.player, idx = index(app.data);
  const s = player.senate;
  let body = `<div class="card row spread"><span>Ruling party: <strong style="text-transform:capitalize">${s.ruling}</strong> <span class="muted">(${RULING_BONUS_TEXT[s.ruling]})</span></span><span class="muted">Next election: turn ${s.nextElection} (every ${ELECTION_INTERVAL} turns) · influence ${fmt(player.influence, 0)} · law upkeep ${lawUpkeep(app.data, player)}/turn</span></div>`;
  body += '<h3>Senate support</h3>';
  for (const p of IDEOLOGIES) {
    body += `<div class="row spread" style="margin:2px 0"><span style="width:120px;text-transform:capitalize">${p}${p === s.ruling ? ' ★' : ''}</span><div class="bar" style="flex:1;height:10px;margin:0 10px"><i style="width:${s.support[p]}%"></i></div><span class="muted" style="width:140px">${fmt(s.support[p], 1)}% · ${PARTY_BLURB[p]}</span></div>`;
  }
  body += `<h3 style="margin-top:14px">Active laws (${s.laws.length}/${MAX_LAWS})</h3>`;
  if (!s.laws.length) body += '<div class="muted">No laws in force.</div>';
  for (const id of s.laws) {
    const law = idx.law[id];
    body += `<div class="card row spread"><span><strong>${esc(law?.name ?? id)}</strong> <span class="tag" style="text-transform:capitalize">${law?.ideology ?? ''}</span><br><span class="muted">${esc(law?.description ?? '')} Upkeep ${law?.upkeep ?? 0} influence/turn.</span></span><button class="small danger" data-action="law-repeal" data-id="${id}">Repeal</button></div>`;
  }
  body += '<h3 style="margin-top:14px">Proposals</h3><p class="muted">A party must rule or hold at least 15% support to pass its laws. Laws of a party that collapses below 8% are repealed at the next election.</p>';
  const avail = availableLaws(app.data, player);
  if (!avail.length) body += '<div class="muted">Nothing can be proposed right now.</div>';
  for (const law of avail) {
    body += `<div class="card row spread"><span><strong>${esc(law.name)}</strong> <span class="tag" style="text-transform:capitalize">${law.ideology}</span><br><span class="muted">${esc(law.description)} Costs ${law.cost} influence, upkeep ${law.upkeep}/turn.</span></span><button class="small primary" data-action="law-pass" data-id="${law.id}" ${player.influence < law.cost || s.laws.length >= MAX_LAWS ? 'disabled' : ''}>Pass</button></div>`;
  }
  const locked = app.data.laws.filter((l) => !avail.some((a) => a.id === l.id) && !s.laws.includes(l.id));
  if (locked.length) body += `<div class="muted" style="margin-top:8px">Unavailable: ${locked.map((l) => `${esc(l.name)} (${l.requires ? `needs ${esc(idx.tech[l.requires]?.name ?? l.requires)}` : `${l.ideology} too weak`})`).join(' · ')}</div>`;
  void st;
  return body;
}

export function senateAction(app: App, action: string, el: HTMLElement): boolean {
  const id = el.dataset.id ?? '';
  if (action === 'law-pass') { const err = passLaw(app.data, app.player, id); app.toast(err ?? 'The law passes.'); app.render(); return true; }
  if (action === 'law-repeal') { repealLaw(app.player, id); app.render(); return true; }
  return false;
}
