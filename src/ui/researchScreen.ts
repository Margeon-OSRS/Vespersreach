import { index } from '@engine/data';
import { empireReport } from '@engine/economy';
import { cancelResearch, setResearch, techAvailable, turnsToComplete } from '@engine/research';
import type { TechDef, TechQuadrant } from '@engine/types';
import type { App } from './app';
import { esc, fmt } from './dom';

const QUADRANTS: Array<[TechQuadrant, string]> = [['economy', 'Economy & Trade'], ['science', 'Science & Exploration'], ['military', 'Military'], ['empire', 'Empire & Development']];

function unlockText(t: TechDef): string {
  return [...(t.unlocks.improvements ?? []), ...(t.unlocks.hulls ?? []), ...(t.unlocks.modules ?? []), ...(t.unlocks.laws ?? []), ...(t.unlocks.planetTier ? [`planet tier ${t.unlocks.planetTier}`] : [])].join(', ') || '—';
}

export function renderResearch(app: App): string {
  const st = app.state!, player = app.player, idx = index(app.data);
  const science = empireReport(st, app.data, player).totals.science;
  const r = player.research;
  const cur = r.current ? idx.tech[r.current] : null;
  const turns = turnsToComplete(app.data, player, science);
  let body = `<div class="row spread card"><span>${cur ? `Researching <strong>${esc(cur.name)}</strong>: ${fmt(r.progress, 0)}/${cur.cost} <span class="muted">(${turns === Infinity ? '∞' : turns} turn${turns === 1 ? '' : 's'})</span>` : '<span class="warn">No research selected. Science is being stockpiled.</span>'}</span><span class="muted">${fmt(science)} science/turn · ${fmt(player.science, 0)} stored</span></div>`;
  if (r.queue.length) body += `<div class="muted" style="margin-bottom:8px">Queue: ${r.queue.map((id, i) => `${i + 1}. ${esc(idx.tech[id]?.name ?? id)}`).join(' · ')}</div>`;
  body += '<div class="tech-grid">';
  for (const [q, label] of QUADRANTS) {
    body += `<div><h3>${label}</h3>`;
    for (const t of app.data.techs.filter((x) => x.quadrant === q).sort((a, b) => a.era - b.era || a.cost - b.cost)) {
      const done = player.techs.includes(t.id);
      const active = r.current === t.id, queued = r.queue.includes(t.id);
      const avail = techAvailable(player, t) || t.prerequisites.every((p) => player.techs.includes(p) || r.current === p || r.queue.includes(p));
      const cls = done ? 'done' : active ? 'active' : queued ? 'queued' : avail ? 'available' : 'locked';
      const action = done ? '' : active || queued ? `<button class="small" data-action="research-cancel" data-id="${t.id}">Cancel</button>` : avail ? `<button class="small primary" data-action="research-set" data-id="${t.id}">${r.current ? 'Queue' : 'Research'}</button>` : '';
      body += `<div class="tech ${cls}"><div class="row spread"><strong>${esc(t.name)}</strong><span class="era">Era ${t.era} · ${t.cost}</span></div><div class="muted">${esc(t.description)}</div><div class="muted">Unlocks: ${esc(unlockText(t))}</div>${t.prerequisites.length ? `<div class="muted">Needs: ${t.prerequisites.map((p) => esc(idx.tech[p]?.name ?? p)).join(', ')}</div>` : ''}<div style="margin-top:4px">${action}${done ? '<span class="tag colony">Researched</span>' : ''}</div></div>`;
    }
    body += '</div>';
  }
  return body + '</div>';
}

export function researchAction(app: App, action: string, el: HTMLElement): boolean {
  const player = app.player, id = el.dataset.id ?? '';
  if (action === 'research-set') { const err = setResearch(app.data, player, id); if (err) app.toast(err); app.render(); return true; }
  if (action === 'research-cancel') { cancelResearch(player, id); app.render(); return true; }
  return false;
}
