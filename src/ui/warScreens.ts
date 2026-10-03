import { index } from '@engine/data';
import type { BattleReport, BattleSide } from '@engine/types';
import type { App } from './app';
import { esc } from './dom';

function sideBlock(s: BattleSide, label: string, tacticName: string): string {
  return `<div class="card" style="flex:1"><h4>${label}</h4><strong>${esc(s.empireName)}</strong><div class="muted">${s.fleetNames.map(esc).join(', ')}</div><div>Tactic: ${esc(tacticName)}</div><div>Ships ${s.shipsBefore} → ${s.shipsAfter} · Hull ${s.hpBefore} → ${s.hpAfter}</div><div>Damage dealt: ${s.damageDealt}</div>${s.lost.length ? `<div class="bad">Lost: ${s.lost.map(esc).join(', ')}</div>` : ''}</div>`;
}

export function renderBattle(app: App): string {
  const st = app.state!, idx = index(app.data);
  const b: BattleReport | undefined = st.battles.find((x) => x.id === app.viewBattleId);
  if (!b) return '<p class="muted">That report is no longer available.</p>';
  const winner = b.outcome === 'stalemate' ? 'The battle ended undecided; it resumes next turn if both fleets remain.' : `${esc(b.outcome === 'attacker' ? b.attacker.empireName : b.defender.empireName)} won the battle.`;
  let body = `<p>Turn ${b.turn} at <strong>${esc(b.systemName)}</strong>. ${winner}</p><div class="row" style="align-items:stretch">${sideBlock(b.attacker, 'Attacker', idx.tactic[b.attacker.tactic]?.name ?? b.attacker.tactic)}${sideBlock(b.defender, 'Defender', idx.tactic[b.defender.tactic]?.name ?? b.defender.tactic)}</div>`;
  for (const p of b.phases) body += `<h4 style="margin-top:10px">Phase ${p.phase}: ${esc(p.name)}</h4><ul style="margin:4px 0">${p.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  return body + `<div class="toolbar"><button data-action="goto-system" data-id="${b.systemId}">View system</button></div>`;
}

export function renderBattleList(app: App): string {
  const st = app.state!;
  if (!st.battles.length) return '<p class="muted">No battles have been fought yet.</p>';
  let body = '';
  for (const b of [...st.battles].reverse()) body += `<div class="row spread" style="padding:3px 0;border-bottom:1px solid var(--line)"><span>Turn ${b.turn} · ${esc(b.systemName)} · ${esc(b.attacker.empireName)} vs ${esc(b.defender.empireName)} · ${b.outcome === 'stalemate' ? 'undecided' : `${esc(b.outcome === 'attacker' ? b.attacker.empireName : b.defender.empireName)} won`}</span><button class="small" data-action="view-battle" data-id="${b.id}">Report</button></div>`;
  return body;
}

export function warAction(app: App, action: string, el: HTMLElement): boolean {
  if (action === 'view-battle') { app.viewBattleId = el.dataset.id ?? null; app.setScreen('battle'); return true; }
  if (action === 'battle-list') { app.viewBattleId = null; app.setScreen('battle'); return true; }
  return false;
}
