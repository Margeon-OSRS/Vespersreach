import { index } from '@engine/data';
import { assignHero, availableSkills, HERO_UPKEEP, learnSkill, RECRUIT_INFLUENCE, recruitHero, roleAllows, skillPoints, xpThreshold } from '@engine/heroes';
import { ownedSystems } from '@engine/state';
import type { App } from './app';
import { esc } from './dom';

export function renderHeroes(app: App): string {
  const st = app.state!, player = app.player, idx = index(app.data);
  let body = `<div class="row" style="align-items:flex-start;gap:24px"><div style="flex:3"><h3>Your heroes <span class="muted">(${HERO_UPKEEP} Dust upkeep each)</span></h3>`;
  if (!player.heroes.length) body += '<div class="muted">No heroes yet. Recruit one from the academy on the right.</div>';
  for (const hero of player.heroes) {
    const def = idx.hero[hero.defId];
    const need = xpThreshold(hero.level);
    const points = skillPoints(app.data, hero);
    const where = hero.assignment?.kind === 'governor' ? `Governor of ${esc(st.galaxy.systems.find((s) => s.id === (hero.assignment as { systemId: string }).systemId)?.name ?? '?')}`
      : hero.assignment?.kind === 'admiral' ? `Admiral of ${esc(st.fleets.find((f) => f.id === (hero.assignment as { fleetId: string }).fleetId)?.name ?? '?')}` : 'Unassigned';
    body += `<div class="card"><div class="row spread"><span><strong>${esc(def.name)}</strong> <span class="muted">${esc(def.title)} · level ${hero.level} · ${where}</span></span><span class="muted">${hero.xp}/${need} xp</span></div><div class="bar"><i style="width:${Math.min(100, (hero.xp / need) * 100)}%"></i></div>
      <div class="muted" style="margin:4px 0">${hero.skills.map((s) => `<span class="tag" title="${esc(idx.heroSkill[s]?.description ?? '')}">${esc(idx.heroSkill[s]?.name ?? s)}</span>`).join('')}</div>`;
    if (points > 0) body += `<div><strong class="warn">${points} skill point${points === 1 ? '' : 's'}:</strong> ${availableSkills(app.data, hero).map((s) => `<button class="small" data-action="hero-learn" data-id="${hero.id}" data-skill="${s.id}" title="${esc(s.description)}">${esc(s.name)} <span class="muted">T${s.tier}</span></button>`).join(' ')}</div>`;
    body += '<div class="toolbar">';
    if (roleAllows(def, 'governor')) {
      const sys = ownedSystems(st, player.id).filter((s) => !player.heroes.some((h) => h.id !== hero.id && h.assignment?.kind === 'governor' && h.assignment.systemId === s.id));
      body += `<select data-hero="${hero.id}" class="hero-system"><option value="">Govern…</option>${sys.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button class="small" data-action="hero-govern" data-id="${hero.id}">Assign governor</button>`;
    }
    if (roleAllows(def, 'admiral')) {
      const fleets = st.fleets.filter((f) => f.ownerId === player.id && !player.heroes.some((h) => h.id !== hero.id && h.assignment?.kind === 'admiral' && h.assignment.fleetId === f.id));
      body += `<select data-hero="${hero.id}" class="hero-fleet"><option value="">Command…</option>${fleets.map((f) => `<option value="${f.id}">${esc(f.name)} (${f.ships.length})</option>`).join('')}</select><button class="small" data-action="hero-admiral" data-id="${hero.id}">Assign admiral</button>`;
    }
    if (hero.assignment) body += `<button class="small" data-action="hero-unassign" data-id="${hero.id}">Relieve</button>`;
    body += `</div><p class="muted" style="margin:4px 0 0">${esc(def.blurb)}</p></div>`;
  }
  body += `</div><div style="flex:2"><h3>Academy</h3><div class="muted" style="margin-bottom:6px">Recruiting costs the listed Dust plus ${RECRUIT_INFLUENCE} influence. The roster changes every 15 turns.</div>`;
  for (const id of st.heroMarket) {
    const def = idx.hero[id];
    if (!def) continue;
    body += `<div class="card"><div class="row spread"><span><strong>${esc(def.name)}</strong> <span class="muted">${esc(def.title)} · ${def.role}${def.faction ? ` · ${esc(idx.faction[def.faction]?.demonym ?? def.faction)}` : ''}</span></span><button class="small primary" data-action="hero-recruit" data-id="${id}" ${player.dust < def.cost ? 'disabled' : ''}>Recruit ${def.cost}◈</button></div><div class="muted">${def.innate.map((s) => esc(idx.heroSkill[s]?.name ?? s)).join(', ')}</div><p class="muted" style="margin:4px 0 0">${esc(def.blurb)}</p></div>`;
  }
  return body + '</div></div>';
}

export function heroesAction(app: App, action: string, el: HTMLElement): boolean {
  const st = app.state; if (!st) return false;
  const id = el.dataset.id ?? '', me = st.playerEmpireId;
  const pick = (cls: string) => (document.querySelector(`select.${cls}[data-hero="${id}"]`) as HTMLSelectElement | null)?.value ?? '';
  let msg: string | null;
  switch (action) {
    case 'hero-recruit': msg = recruitHero(st, app.data, me, id) ?? 'Recruited.'; break;
    case 'hero-learn': msg = learnSkill(app.data, app.player, id, el.dataset.skill ?? ''); break;
    case 'hero-govern': { const s = pick('hero-system'); msg = s ? assignHero(st, app.data, me, id, { kind: 'governor', systemId: s }) : 'Pick a system first.'; break; }
    case 'hero-admiral': { const f = pick('hero-fleet'); msg = f ? assignHero(st, app.data, me, id, { kind: 'admiral', fleetId: f }) : 'Pick a fleet first.'; break; }
    case 'hero-unassign': msg = assignHero(st, app.data, me, id, null); break;
    default: return false;
  }
  if (msg) app.toast(msg);
  app.render();
  return true;
}
