import { Rng } from '@engine/rng';
import type { Fleet, StarSystem } from '@engine/types';
import type { App } from './app';
import { STAR_COLOURS } from './planetArt';

interface Cam { x: number; y: number; zoom: number }
interface Pt { x: number; y: number }

export class GalaxyMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cam: Cam = { x: 800, y: 550, zoom: 0.8 };
  private drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
  private dirty = true;
  private stars: Array<[number, number, number]> = [];
  private starSeed = '';

  constructor(private app: App, private container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    this.canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.drag = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false }; });
    window.addEventListener('mousemove', (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.sx, dy = e.clientY - this.drag.sy;
        if (Math.hypot(dx, dy) > 3) this.drag.moved = true;
        this.cam.x = this.drag.cx - dx / this.cam.zoom; this.cam.y = this.drag.cy - dy / this.cam.zoom;
        this.requestDraw();
      } else if (e.target === this.canvas) {
        const id = this.systemAt(e.offsetX, e.offsetY);
        if (id !== this.app.hoverSystemId) { this.app.hoverSystemId = id; this.requestDraw(); }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.drag) return;
      const moved = this.drag.moved; this.drag = null;
      if (moved || e.button !== 0 || e.target !== this.canvas) return;
      const fleet = this.fleetAt(e.offsetX, e.offsetY);
      if (fleet) { this.app.onFleetClick(fleet.id); return; }
      const id = this.systemAt(e.offsetX, e.offsetY);
      if (id) this.app.onSystemClick(id); else this.app.onEmptyClick();
    });
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = this.systemAt(e.offsetX, e.offsetY);
      if (id) this.app.onSystemRightClick(id);
    });
    const loop = () => { if (this.dirty) { this.dirty = false; this.draw(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  requestDraw(): void { this.dirty = true; }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, this.container.clientWidth * dpr);
    this.canvas.height = Math.max(1, this.container.clientHeight * dpr);
    this.requestDraw();
  }

  private zoomAt(sx: number, sy: number, f: number): void {
    const before = this.toWorld(sx, sy);
    this.cam.zoom = Math.min(3, Math.max(0.25, this.cam.zoom * f));
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
    this.requestDraw();
  }

  private toScreen(x: number, y: number): Pt {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (x - this.cam.x) * this.cam.zoom + w / 2, y: (y - this.cam.y) * this.cam.zoom + h / 2 };
  }

  private toWorld(sx: number, sy: number): Pt {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (sx - w / 2) / this.cam.zoom + this.cam.x, y: (sy - h / 2) / this.cam.zoom + this.cam.y };
  }

  centerOn(systemId: string, zoom?: number): void {
    const s = this.app.state?.galaxy.systems.find((x) => x.id === systemId);
    if (!s) return;
    this.cam.x = s.x; this.cam.y = s.y;
    if (zoom) this.cam.zoom = zoom;
    this.requestDraw();
  }

  fitAll(): void {
    const g = this.app.state?.galaxy;
    if (!g) return;
    this.cam.x = g.width / 2; this.cam.y = g.height / 2;
    this.cam.zoom = Math.min(this.container.clientWidth / g.width, this.container.clientHeight / g.height) * 0.95;
    this.requestDraw();
  }

  private systemAt(sx: number, sy: number): string | null {
    const st = this.app.state; if (!st) return null;
    let best: string | null = null, bd = 16;
    for (const s of st.galaxy.systems) {
      if (!this.app.isKnown(s.id)) continue;
      const p = this.toScreen(s.x, s.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  }

  private fleetPos(f: Fleet, systems: StarSystem[], slot: number): Pt | null {
    if (f.transit) {
      const a = systems.find((s) => s.id === f.transit!.from), b = systems.find((s) => s.id === f.transit!.to);
      if (!a || !b) return null;
      return { x: a.x + (b.x - a.x) * f.transit.progress, y: a.y + (b.y - a.y) * f.transit.progress };
    }
    const s = systems.find((x) => x.id === f.systemId);
    if (!s) return null;
    return { x: s.x + 14 + slot * 9, y: s.y - 14 };
  }

  private visibleFleets(): Array<{ fleet: Fleet; x: number; y: number }> {
    const st = this.app.state; if (!st) return [];
    const out: Array<{ fleet: Fleet; x: number; y: number }> = [];
    const counts: Record<string, number> = {};
    for (const f of st.fleets) {
      const here = f.systemId ?? f.transit?.to ?? '';
      const visible = f.ownerId === st.playerEmpireId || this.app.isExplored(here) || (f.transit ? this.app.isExplored(f.transit.from) : false);
      if (!visible) continue;
      const k = f.systemId ?? '';
      const p = this.fleetPos(f, st.galaxy.systems, counts[k] ?? 0);
      counts[k] = (counts[k] ?? 0) + 1;
      if (p) out.push({ fleet: f, x: p.x, y: p.y });
    }
    return out;
  }

  private fleetAt(sx: number, sy: number): Fleet | null {
    for (const v of this.visibleFleets()) {
      const p = this.toScreen(v.x, v.y);
      if (Math.hypot(p.x - sx, p.y - sy) < 9) return v.fleet;
    }
    return null;
  }

  private ensureStars(seed: string): void {
    if (this.starSeed === seed) return;
    this.starSeed = seed;
    const rng = new Rng('stars:' + seed);
    this.stars = [];
    for (let i = 0; i < 700; i++) this.stars.push([rng.float(-400, 2000), rng.float(-400, 1500), rng.float(0.3, 1.4)]);
  }

  private draw(): void {
    const st = this.app.state, ctx = this.ctx, dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, w, h);
    if (!st) return;
    this.ensureStars(st.settings.seed);
    const z = this.cam.zoom;
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of this.stars) { const p = this.toScreen(x, y); ctx.globalAlpha = 0.25 + r * 0.3; ctx.fillRect(p.x, p.y, r, r); }
    ctx.globalAlpha = 1;
    const byId: Record<string, StarSystem> = {};
    for (const s of st.galaxy.systems) byId[s.id] = s;
    ctx.lineWidth = 1;
    for (const lane of st.galaxy.lanes) {
      const ka = this.app.isKnown(lane.a), kb = this.app.isKnown(lane.b);
      if (!ka && !kb) continue;
      const ea = this.app.isExplored(lane.a), eb = this.app.isExplored(lane.b);
      ctx.strokeStyle = ea || eb ? 'rgba(124,196,255,0.35)' : 'rgba(124,196,255,0.12)';
      const a = this.toScreen(byId[lane.a].x, byId[lane.a].y), b = this.toScreen(byId[lane.b].x, byId[lane.b].y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    this.drawPath(byId);
    for (const s of st.galaxy.systems) {
      if (!this.app.isKnown(s.id)) continue;
      const p = this.toScreen(s.x, s.y);
      const explored = this.app.isExplored(s.id);
      const owner = s.ownerId ? st.empires.find((e) => e.id === s.ownerId) : null;
      if (owner) {
        ctx.strokeStyle = owner.colour; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(p.x, p.y, 13 * Math.max(0.7, z), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const colour = explored ? STAR_COLOURS[s.starClass] : '#5a6478';
      const rad = (explored ? 6 : 4) * Math.max(0.6, Math.sqrt(z));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 3);
      g.addColorStop(0, colour); g.addColorStop(0.3, colour + '88'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
      if (s.id === this.app.selectedSystemId || s.id === this.app.hoverSystemId) {
        ctx.strokeStyle = s.id === this.app.selectedSystemId ? '#ffffff' : 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 18 * Math.max(0.7, z), 0, Math.PI * 2); ctx.stroke();
      }
      if (z > 0.55 || s.id === this.app.selectedSystemId) {
        ctx.fillStyle = explored ? '#dfe6f5' : '#8f9cb8'; ctx.font = `${Math.round(11 + 2 * z)}px system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(explored ? s.name : '?', p.x, p.y + 20 * Math.max(0.7, z) + 8);
      }
    }
    for (const v of this.visibleFleets()) {
      const p = this.toScreen(v.x, v.y);
      const owner = st.empires.find((e) => e.id === v.fleet.ownerId);
      ctx.fillStyle = owner?.colour ?? '#fff';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + 5, p.y + 5); ctx.lineTo(p.x - 5, p.y + 5); ctx.closePath(); ctx.fill();
      if (v.fleet.id === this.app.selectedFleetId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  private drawPath(byId: Record<string, StarSystem>): void {
    const st = this.app.state!, ctx = this.ctx;
    const fleet = st.fleets.find((f) => f.id === this.app.selectedFleetId);
    if (!fleet || (!fleet.path.length && !fleet.transit)) return;
    const pts: Pt[] = [];
    const v = this.visibleFleets().find((x) => x.fleet.id === fleet.id);
    if (v) pts.push(this.toScreen(v.x, v.y));
    for (const id of fleet.path) { const s = byId[id]; if (s) pts.push(this.toScreen(s.x, s.y)); }
    ctx.strokeStyle = '#7cc4ff'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.setLineDash([]);
  }
}
