import { availableHulls } from '@engine/build';
import { index } from '@engine/data';
import { availableModules, createDesign, deleteDesign, designStats, validateDesign } from '@engine/designs';
import { shipUpkeepFor } from '@engine/economy';
import type { ModuleSlot } from '@engine/types';
import type { App } from './app';
import { esc } from './dom';

const SLOTS: ModuleSlot[] = ['weapon', 'defence', 'support'];

export function renderDesigner(app: App): string {
  const player = app.player, idx = index(app.data), d = app.designer;
  const hulls = availableHulls(app.data, player);
  if (!hulls.some((h) => h.id === d.hullId)) d.hullId = hulls[0]?.id ?? '';
  const hull = idx.hull[d.hullId];
  let body = '<div class="row" style="align-items:flex-start;gap:24px"><div style="flex:1"><h3>Hull</h3><div class="toolbar">';
  for (const h of hulls) body += `<button class="small ${h.id === d.hullId ? 'primary' : ''}" data-action="design-hull" data-id="${h.id}" title="${esc(h.description)}">${esc(h.name)} <span class="muted">${h.class}</span></button>`;
  body += '</div>';
  if (hull) {
    const stats = designStats(app.data, { id: '', name: '', hullId: hull.id, modules: d.modules });
    const err = validateDesign(app.data, player, hull, d.modules);
    body += `<div class="muted">${esc(hull.description)} · ${hull.hp} hp · speed ${hull.speed} · ${hull.commandPoints} CP · ${hull.troops ?? 0} troops</div>`;
    body += `<label style="display:block;margin:10px 0">Design name <input id="design-name" value="${esc(d.name || hull.name)}" style="width:260px"></label>`;
    for (const slot of SLOTS) {
      const used = d.modules.filter((m) => idx.module[m]?.slot === slot);
      body += `<h4>${slot} slots ${used.length}/${hull.slots[slot]}</h4><div class="toolbar">`;
      d.modules.forEach((m, i) => { if (idx.module[m]?.slot === slot) body += `<button class="small" data-action="design-remove" data-index="${i}" title="Remove">${esc(idx.module[m].name)} ✕</button>`; });
      if (used.length < hull.slots[slot]) for (const m of availableModules(app.data, player, slot)) body += `<button class="small" data-action="design-add" data-id="${m.id}" title="${esc(m.description)}">+ ${esc(m.name)} <span class="muted">${m.cost}</span></button>`;
      body += '</div>';
    }
    body += `<div class="card" style="margin-top:10px"><strong>Stats</strong> · cost ${stats.cost} ⚒ · upkeep ${shipUpkeepFor(stats.cost)} ◈/turn · ${stats.hp} hp · shields ${stats.shield} · armour ${stats.armour} · flak ${Math.round(stats.flak * 100)}% · speed ${stats.speed} · repair ${Math.round(stats.repair * 100)}%/turn<br>Weapons: ${stats.weapons.length ? stats.weapons.map((w) => `${esc(w.name)} (${w.damage} dmg, ${Math.round(w.accuracy * 100)}%)`).join(', ') : 'none'}</div>`;
    body += `<div class="toolbar">${err ? `<span class="bad">${esc(err)}</span>` : '<button class="primary" data-action="design-save">Save as new design</button>'}<button data-action="design-new">Clear</button></div>`;
  }
  body += '</div><div style="flex:1"><h3>Designs</h3>';
  for (const design of player.designs) {
    const s = designStats(app.data, design);
    body += `<div class="card row spread"><span><strong>${esc(design.name)}</strong> <span class="muted">${esc(idx.hull[design.hullId]?.name ?? design.hullId)} · ${s.cost}⚒ · ${s.weapons.length}⚔ ${s.hp}hp · ${design.modules.map((m) => esc(idx.module[m]?.name ?? m)).join(', ') || 'empty'}</span></span><span><button class="small" data-action="design-load" data-id="${design.id}">Copy</button> <button class="small danger" data-action="design-delete" data-id="${design.id}" ${player.designs.length <= 1 ? 'disabled' : ''}>Delete</button></span></div>`;
  }
  return body + '<p class="muted">Kinetics ignore shields but are blunted by armour; lasers are absorbed by shields; missiles hit hardest at long range and can be shot down by flak. Modules unlock through research.</p></div></div>';
}

export function designerAction(app: App, action: string, el: HTMLElement): boolean {
  const player = app.player, d = app.designer, id = el.dataset.id ?? '';
  const readName = () => { d.name = (document.getElementById('design-name') as HTMLInputElement | null)?.value ?? d.name; };
  switch (action) {
    case 'design-hull': readName(); d.hullId = id; d.modules = []; app.render(); return true;
    case 'design-add': readName(); d.modules.push(id); app.render(); return true;
    case 'design-remove': readName(); d.modules.splice(Number(el.dataset.index), 1); app.render(); return true;
    case 'design-new': d.name = ''; d.modules = []; app.render(); return true;
    case 'design-load': { const src = player.designs.find((x) => x.id === id); if (src) { d.hullId = src.hullId; d.modules = [...src.modules]; d.name = `${src.name} II`; } app.render(); return true; }
    case 'design-delete': deleteDesign(player, id); app.render(); return true;
    case 'design-save': { readName(); const r = createDesign(app.data, player, d.name, d.hullId, d.modules); if (typeof r === 'string') app.toast(r); else { app.toast(`Saved ${r.name}.`); d.name = ''; d.modules = []; } app.render(); return true; }
    default: return false;
  }
}
