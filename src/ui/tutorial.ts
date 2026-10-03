import { ownedSystems } from '@engine/state';
import type { App } from './app';
import { esc } from './dom';

interface Step { title: string; text: string; done: (app: App) => boolean }

const STEPS: Step[] = [
  { title: 'Your capital', text: 'Click your home star on the map, or press Home, to open the system panel. Planet cards show what each world yields per citizen.', done: (a) => !!a.selectedSystemId },
  { title: 'Queue a build', text: 'In the system panel, queue an improvement or a ship. Industry pays for the first item in the queue every turn; Dust can rush it.', done: (a) => a.state!.galaxy.systems.some((s) => s.ownerId === a.state!.playerEmpireId && (s.buildQueue.length > 0 || s.improvements.length > 1)) },
  { title: 'Pick a research goal', text: 'Press R and choose a technology. Science is stockpiled until you do, and later techs unlock hulls, modules, planets and laws.', done: (a) => !!a.player.research.current || a.player.techs.length > 0 },
  { title: 'Send the scout', text: 'Click the small fleet marker beside your star, then right-click a neighbouring star to send it. Explorers reveal systems around them.', done: (a) => a.state!.fleets.some((f) => f.ownerId === a.state!.playerEmpireId && (f.path.length > 0 || !!f.transit)) || a.player.exploredSystems.length > 1 },
  { title: 'Found an outpost', text: 'Move the Settler to a system with a habitable planet (terran, ocean, jungle or arid) and click Found outpost. Outposts become colonies after six turns.', done: (a) => ownedSystems(a.state!, a.state!.playerEmpireId).length > 1 },
  { title: 'End the turn', text: 'Press Enter. Notifications appear bottom-left; click one to jump to it. If something looks unattended you will be asked to press Enter twice.', done: (a) => a.state!.turn > 1 },
  { title: 'Grow the empire', text: 'Keep approval up or output falls. Diplomacy (P) handles treaties, Heroes (H) govern and command, the Senate (S) passes laws, and the Designer (D) fits your warships. Beware Corsair raiders.', done: () => false },
];

export function renderTutorial(app: App): string {
  if (app.tutorialDone || !app.state) return '';
  while (app.tutorialStep < STEPS.length && STEPS[app.tutorialStep].done(app)) app.tutorialStep += 1;
  const step = STEPS[app.tutorialStep];
  if (!step) { app.finishTutorial(); return ''; }
  return `<div class="row spread"><h4>Tutorial ${app.tutorialStep + 1}/${STEPS.length}</h4><span><button class="small" data-action="tutorial-next">${app.tutorialStep === STEPS.length - 1 ? 'Done' : 'Skip step'}</button> <button class="small" data-action="tutorial-hide">Hide</button></span></div><strong>${esc(step.title)}</strong><p style="margin:4px 0 0">${esc(step.text)}</p>`;
}

export function tutorialAction(app: App, action: string): boolean {
  if (action === 'tutorial-next') { app.tutorialStep += 1; if (app.tutorialStep >= STEPS.length) app.finishTutorial(); app.render(); return true; }
  if (action === 'tutorial-hide') { app.finishTutorial(); app.render(); return true; }
  if (action === 'tutorial-show') { app.tutorialDone = false; app.tutorialStep = 0; try { localStorage.removeItem('vesper-reach.tutorial'); } catch { /* ignore */ } app.setScreen('none'); return true; }
  return false;
}
