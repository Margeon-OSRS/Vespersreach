import { defaultSettings, randomSeed } from '@engine/game';
import { deserialize, serialize } from '@engine/save';
import type { Difficulty, GalaxyDensity, GalaxyShape, GalaxySize, GameSettings } from '@engine/types';
import type { App } from './app';
import { download, esc, readFileText } from './dom';
import { deleteSlot, listSaves, loadFromSlot, saveToSlot, SLOTS, type Slot } from './storage';

const SHORTCUTS: Array<[string, string]> = [
  ['Enter', 'End turn'], ['E', 'Empire'], ['R', 'Research'], ['D', 'Ship designer'], ['P', 'Diplomacy'], ['H', 'Heroes'], ['S', 'Senate'],
  ['Esc', 'Menu / close'], ['Home', 'Centre on capital'], ['F', 'Fit galaxy to view'], ['N', 'Next idle fleet'], ['Right-click', 'Send selected fleet'],
];

export function renderMenu(app: App): string {
  const saves = listSaves();
  let html = '<div class="row" style="align-items:flex-start;gap:30px"><div style="flex:1"><h3>Saves</h3><table><tbody>';
  for (const slot of SLOTS) {
    const meta = saves.find((s) => s.slot === slot);
    html += `<tr><td><strong>${slot}</strong></td><td class="muted">${meta ? `${esc(meta.faction)} · turn ${meta.turn} · ${new Date(meta.savedAt).toLocaleString()}` : 'empty'}</td><td>
      ${app.state && slot !== 'autosave' ? `<button class="small" data-action="save:${slot}">Save</button>` : ''}
      ${meta ? `<button class="small" data-action="load:${slot}">Load</button><button class="small danger" data-action="delete:${slot}">Delete</button>` : ''}</td></tr>`;
  }
  html += '</tbody></table><div class="toolbar">';
  if (app.state) html += '<button data-action="export">Export JSON</button>';
  html += '<label><input type="file" id="import-file" accept="application/json" style="display:none"><button data-action="import">Import JSON</button></label>';
  html += '<button data-action="screen:newgame">New game</button>';
  if (app.state) html += '<button class="primary" data-action="close-screen">Resume</button>';
  html += '</div></div><div style="flex:1"><h3>Keyboard</h3><div class="help-grid">' + SHORTCUTS.map(([k, v]) => `<div><kbd>${k}</kbd> ${v}</div>`).join('') + '</div>';
  html += '<h3 style="margin-top:14px">How to play</h3><p class="muted">Each system produces Food, Industry, Dust, Science and Influence from its settled planets. Food above population grows your people; Industry builds the queue; Dust pays upkeep and rush-buys; Science and Influence stockpile for later milestones. Send the Settler to a system with a habitable planet and found an outpost; it becomes a colony after six turns. Keep approval up or output falls.</p></div></div>';
  return html;
}

export function renderNewGame(app: App): string {
  const s = app.pendingSettings;
  const opt = (list: string[], cur: string) => list.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v}</option>`).join('');
  let html = `<header><h2>New Game</h2>${app.state ? '<button data-action="close-screen">Cancel</button>' : ''}</header>`;
  html += `<div class="form">
    <label>Seed<span class="row"><input id="ng-seed" value="${esc(s.seed)}" style="flex:1"><button class="small" data-action="random-seed">🎲</button></span></label>
    <label>Galaxy size<select id="ng-size">${opt(['tiny', 'small', 'medium', 'large', 'huge'], s.size)}</select></label>
    <label>Shape<select id="ng-shape">${opt(['spiral', 'disc', 'ring', 'clusters'], s.shape)}</select></label>
    <label>Lane density<select id="ng-density">${opt(['sparse', 'normal', 'dense'], s.density)}</select></label>
    <label>Opponents<select id="ng-opponents">${opt(['1', '2', '3', '4', '5'], String(s.opponents))}</select></label>
    <label>Difficulty<select id="ng-difficulty">${opt(['easy', 'normal', 'hard'], s.difficulty)}</select></label>
    <label>Turn limit (0 = none)<input id="ng-turnlimit" type="number" min="0" step="50" value="${s.turnLimit}"></label>
  </div><h3>Faction</h3><div class="faction-grid">`;
  for (const f of app.data.factions.filter((x) => x.playable !== false)) {
    html += `<div class="card faction ${f.id === s.playerFaction ? 'selected' : ''}" data-action="pick-faction" data-id="${f.id}">
      <div><span class="swatch" style="background:${f.colours.primary}"></span><strong>${esc(f.name)}</strong></div>
      <p><strong>${esc(f.affinity.name)}.</strong> ${esc(f.affinity.description)}</p>
      <p>${f.traits.map((t) => esc(t.name)).join(' · ')}</p></div>`;
  }
  html += '</div><div class="toolbar" style="margin-top:14px"><button class="primary" data-action="start-game">Begin</button></div>';
  return html;
}

function readForm(app: App): GameSettings {
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  return {
    ...app.pendingSettings,
    seed: v('ng-seed').trim() || randomSeed(),
    size: v('ng-size') as GalaxySize, shape: v('ng-shape') as GalaxyShape, density: v('ng-density') as GalaxyDensity,
    opponents: Number(v('ng-opponents')) || 3, difficulty: v('ng-difficulty') as Difficulty,
    turnLimit: Math.max(0, Number(v('ng-turnlimit')) || 0),
  };
}

export function menuAction(app: App, action: string, el: HTMLElement): boolean {
  const [verb, arg] = action.split(':');
  switch (verb) {
    case 'save': if (app.state && saveToSlot(arg as Slot, app.state)) app.toast(`Saved to ${arg}.`); app.render(); return true;
    case 'load': { const s = loadFromSlot(arg as Slot); if (s) { app.loadState(s); app.toast(`Loaded ${arg}.`); } else app.toast('That slot could not be read.'); return true; }
    case 'delete': deleteSlot(arg as Slot); app.render(); return true;
    case 'export': if (app.state) download(`vesper-reach-turn-${app.state.turn}.json`, serialize(app.state)); return true;
    case 'import': {
      const input = document.getElementById('import-file') as HTMLInputElement | null;
      if (!input) return true;
      input.onchange = async () => {
        const file = input.files?.[0]; if (!file) return;
        try { app.loadState(deserialize(await readFileText(file))); app.toast('Save imported.'); } catch (e) { app.toast((e as Error).message); }
      };
      input.click(); return true;
    }
    case 'random-seed': app.pendingSettings = { ...readForm(app), seed: randomSeed() }; app.render(); return true;
    case 'pick-faction': app.pendingSettings = { ...readForm(app), playerFaction: el.dataset.id ?? defaultSettings().playerFaction }; app.render(); return true;
    case 'start-game': app.newGame(readForm(app)); return true;
    default: return false;
  }
}
