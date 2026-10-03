import { currentStep, objectiveProgress, questFor } from '@engine/quests';
import { economicTarget, majors, scoreOf, VICTORY_TITLE, WONDER_ID } from '@engine/victory';
import type { App } from './app';
import { esc, fmt } from './dom';

/** Quest, events and victory progress blocks for the Empire screen. */
export function renderEmpireExtras(app: App): string {
  const st = app.state!, player = app.player;
  let body = '<div class="row" style="align-items:flex-start;gap:20px;margin-top:14px">';
  const quest = questFor(app.data, player);
  const step = currentStep(app.data, player);
  body += '<div style="flex:1"><h3>Quest</h3>';
  if (!quest) body += '<div class="muted">No quest chain for this faction.</div>';
  else if (!step) body += `<div class="card"><strong>${esc(quest.title)}</strong><div class="good">Completed.</div></div>`;
  else {
    const p = objectiveProgress(st, app.data, player, step);
    body += `<div class="card"><div class="muted">${esc(quest.title)} · step ${player.quest.step + 1}/${quest.steps.length}</div><strong>${esc(step.title)}</strong><p class="muted" style="margin:4px 0">${esc(step.text)}</p><div>${esc(p.text)}</div><div class="bar"><i style="width:${Math.min(100, (p.value / p.target) * 100)}%"></i></div><div class="muted">Reward: ${esc(step.reward.text)}</div></div>`;
  }
  body += '</div><div style="flex:1"><h3>Events</h3>';
  if (!player.activeEvents.length) body += '<div class="muted">The galaxy is quiet.</div>';
  for (const ev of player.activeEvents) {
    const def = app.data.events.find((e) => e.id === ev.id);
    body += `<div class="card"><strong>${esc(def?.name ?? ev.id)}</strong> <span class="muted">until turn ${ev.until}</span><div class="muted">${esc(def?.description ?? '')}</div></div>`;
  }
  body += '</div><div style="flex:1"><h3>Victory</h3>';
  const score = scoreOf(st, app.data, player);
  const rows = majors(st).filter((e) => !e.eliminated).map((e) => ({ e, s: scoreOf(st, app.data, e) })).sort((a, b) => b.s - a.s);
  body += `<div class="card"><div>Score <strong>${score}</strong> · rank ${rows.findIndex((r) => r.e.id === player.id) + 1}/${rows.length}${st.settings.turnLimit ? ` · turn limit ${st.settings.turnLimit}` : ''}</div>
    <div class="muted">Economic: ${fmt(player.dust, 0)}/${economicTarget(st)} Dust</div>
    <div class="muted">Science: ${player.techs.length}/${app.data.techs.length} technologies</div>
    <div class="muted">Wonder: ${st.galaxy.systems.some((s) => s.ownerId === player.id && s.improvements.includes(WONDER_ID)) ? 'built' : 'build the Vesper Beacon (Grand Design)'}</div>
    <div class="muted">Supremacy: hold every founding capital · Conquest: eliminate every rival</div>
    ${st.victory ? `<div class="warn">${esc(VICTORY_TITLE[st.victory.kind])} achieved on turn ${st.victory.turn} by ${esc(st.empires.find((e) => e.id === st.victory!.empireId)?.name ?? '?')}.</div>` : ''}</div>`;
  body += '<table><thead><tr><th>Empire</th><th class="num">Score</th></tr></thead><tbody>' + rows.map((r) => `<tr><td><span class="faction swatch" style="background:${r.e.colour}"></span>${esc(r.e.name)}</td><td class="num">${r.s}</td></tr>`).join('') + '</tbody></table></div></div>';
  return body;
}
