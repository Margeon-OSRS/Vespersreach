import { loadData } from '@engine/data';
import { orderFleetMove } from '@engine/fleetActions';
import { defaultSettings, newGame } from '@engine/game';
import { migrateState } from '@engine/save';
import { endTurn } from '@engine/turn';
import type { Empire, GameData, GameSettings, GameState } from '@engine/types';
import { buildPanelAction } from './buildPanel';
import { bindActions, esc, isTypingTarget } from './dom';
import { GalaxyMap } from './map';
import { menuAction } from './menu';
import { renderPanel } from './panels';
import { renderScreen, screenAction } from './screens';
import { saveToSlot } from './storage';
import { renderTopbar } from './topbar';

export type Screen = 'none' | 'empire' | 'research' | 'designer' | 'diplomacy' | 'heroes' | 'senate' | 'menu' | 'newgame' | 'battle' | 'victory';

const KEY_SCREENS: Record<string, Screen> = { e: 'empire', r: 'research', d: 'designer', p: 'diplomacy', h: 'heroes', s: 'senate' };

export class App {
  data: GameData = loadData();
  state: GameState | null = null;
  selectedSystemId: string | null = null;
  selectedFleetId: string | null = null;
  hoverSystemId: string | null = null;
  screen: Screen = 'newgame';
  moveMode = false;
  pendingSettings: GameSettings = defaultSettings();
  selectedShipIds: string[] = [];
  viewBattleId: string | null = null;
  private victoryShown = false;
  designer: { hullId: string; name: string; modules: string[] } = { hullId: '', name: '', modules: [] };
  map: GalaxyMap;
  private els: Record<'topbar' | 'panel' | 'notes' | 'overlay' | 'toast' | 'map', HTMLElement>;
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = '<div id="topbar"></div><div id="main"><div id="map"></div><div id="panel"></div><div id="notes"></div><div id="overlay"></div><div id="toast"></div></div>';
    const q = (id: string) => root.querySelector<HTMLElement>('#' + id)!;
    this.els = { topbar: q('topbar'), panel: q('panel'), notes: q('notes'), overlay: q('overlay'), toast: q('toast'), map: q('map') };
    this.map = new GalaxyMap(this, this.els.map);
    bindActions(root, (action, el) => this.handleAction(action, el));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  start(initial: GameState | null): void {
    if (initial) this.loadState(initial); else this.render();
  }

  get player(): Empire { return this.state!.empires.find((e) => e.id === this.state!.playerEmpireId)!; }
  isKnown(id: string): boolean { return !!this.state && this.player.knownSystems.includes(id); }
  isExplored(id: string): boolean { return !!this.state && this.player.exploredSystems.includes(id); }

  newGame(settings: GameSettings): void {
    this.pendingSettings = settings;
    this.loadState(newGame(settings, this.data));
    saveToSlot('autosave', this.state!);
  }

  loadState(state: GameState): void {
    this.state = migrateState(state, this.data);
    this.victoryShown = !!this.state.victory;
    this.selectedFleetId = null; this.moveMode = false; this.screen = 'none';
    this.selectedSystemId = this.player.homeSystemId || null;
    this.map.centerOn(this.player.homeSystemId, 1);
    this.render();
  }

  selectSystem(id: string | null, center = false): void {
    this.selectedSystemId = id; this.selectedFleetId = null; this.moveMode = false; this.selectedShipIds = [];
    if (id && center) this.map.centerOn(id);
    this.render();
  }

  selectFleet(id: string | null): void {
    this.selectedFleetId = id; this.moveMode = false; this.selectedShipIds = [];
    this.render();
  }

  setScreen(s: Screen): void { this.screen = s; this.render(); }

  onSystemClick(id: string): void {
    if (this.moveMode && this.selectedFleetId) { this.sendFleet(id); return; }
    this.selectSystem(id);
  }
  onSystemRightClick(id: string): void { if (this.selectedFleetId) this.sendFleet(id); }
  onFleetClick(id: string): void { this.selectFleet(id); }
  onEmptyClick(): void { if (this.moveMode) { this.moveMode = false; this.render(); } }

  private sendFleet(targetId: string): void {
    const err = orderFleetMove(this.state!, this.selectedFleetId!, targetId);
    if (err) this.toast(err);
    this.moveMode = false;
    this.render();
  }

  endTurn(): void {
    if (!this.state || this.screen !== 'none') return;
    endTurn(this.state, this.data);
    if (this.selectedFleetId && !this.state.fleets.some((f) => f.id === this.selectedFleetId)) this.selectedFleetId = null;
    saveToSlot('autosave', this.state);
    if (this.state.victory && !this.victoryShown) { this.victoryShown = true; this.setScreen('victory'); return; }
    this.render();
  }

  nextIdleFleet(): void {
    if (!this.state) return;
    const idle = this.state.fleets.filter((f) => f.ownerId === this.state!.playerEmpireId && f.systemId && !f.path.length);
    if (!idle.length) { this.toast('No idle fleets.'); return; }
    const i = idle.findIndex((f) => f.id === this.selectedFleetId);
    const next = idle[(i + 1) % idle.length];
    this.selectedSystemId = next.systemId; this.selectedFleetId = next.id; this.moveMode = false;
    this.map.centerOn(next.systemId!);
    this.render();
  }

  toast(msg: string): void {
    this.els.toast.textContent = msg;
    this.els.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.els.toast.classList.remove('show'), 2600);
  }

  render(): void {
    this.els.topbar.innerHTML = renderTopbar(this);
    this.els.panel.innerHTML = this.screen === 'none' ? renderPanel(this) : '';
    this.els.notes.innerHTML = this.state ? this.state.notifications.map((n) => `<div class="note ${n.kind}" data-action="note" data-system="${n.systemId ?? ''}" data-fleet="${n.fleetId ?? ''}" data-battle="${n.battleId ?? ''}">${esc(n.text)}</div>`).join('') : '';
    this.els.overlay.innerHTML = renderScreen(this);
    this.els.map.classList.toggle('move', this.moveMode);
    this.map.requestDraw();
  }

  private handleAction(action: string, el: HTMLElement): void {
    if (action === 'end-turn') { this.endTurn(); return; }
    if (action.startsWith('screen:')) { this.setScreen(action.slice(7) as Screen); return; }
    if (action === 'note' && el.dataset.battle) { this.viewBattleId = el.dataset.battle; this.setScreen('battle'); return; }
    if (action === 'note') {
      if (el.dataset.fleet && this.state?.fleets.some((f) => f.id === el.dataset.fleet)) { this.selectedSystemId = el.dataset.system || null; this.selectFleet(el.dataset.fleet); }
      else if (el.dataset.system) this.selectSystem(el.dataset.system, true);
      return;
    }
    if (screenAction(this, action, el) || menuAction(this, action, el)) return;
    if (this.state && buildPanelAction(this, action, el)) return;
  }

  private onKey(e: KeyboardEvent): void {
    if (isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (this.screen !== 'none' && (this.state || this.screen !== 'newgame')) this.setScreen('none');
      else if (this.moveMode) { this.moveMode = false; this.render(); }
      else if (this.state) this.setScreen('menu');
      return;
    }
    if (!this.state) return;
    if (e.key === 'Enter') { e.preventDefault(); this.endTurn(); return; }
    if (this.screen !== 'none') return;
    if (KEY_SCREENS[k]) this.setScreen(KEY_SCREENS[k]);
    else if (e.key === 'Home') this.selectSystem(this.player.homeSystemId, true);
    else if (k === 'f') this.map.fitAll();
    else if (k === 'n') this.nextIdleFleet();
  }
}
