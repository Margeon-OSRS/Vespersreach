import { Rng } from '@engine/rng';
import type { PlanetTypeDef, StarClass } from '@engine/types';

const cache = new Map<string, string>();

/** Procedurally draws a planet disc for a type and seed; returns a cached data URL. */
export function planetImage(def: PlanetTypeDef, seed: string, size = 64): string {
  const key = `${def.id}|${seed}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(seed);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  const [ground, highlight, atmo] = def.palette;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const base = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  base.addColorStop(0, highlight); base.addColorStop(1, ground);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  if (def.id === 'gasGiant') {
    for (let y = -r; y < r; y += rng.float(3, 7)) {
      ctx.fillStyle = rng.chance(0.5) ? highlight : ground;
      ctx.globalAlpha = rng.float(0.25, 0.6);
      ctx.fillRect(0, cy + y, size, rng.float(2, 5));
    }
  } else if (def.id === 'asteroids') {
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 18; i++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(r * 0.25, r * 0.9);
      ctx.fillStyle = rng.chance(0.5) ? ground : highlight;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rng.float(1.5, 4), 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const blobs = def.id === 'ocean' || def.id === 'terran' ? 7 : 11;
    for (let i = 0; i < blobs; i++) {
      ctx.fillStyle = i % 2 ? highlight : ground;
      ctx.globalAlpha = rng.float(0.3, 0.7);
      const bx = cx + rng.float(-r, r), by = cy + rng.float(-r, r);
      ctx.beginPath();
      ctx.ellipse(bx, by, rng.float(r * 0.15, r * 0.5), rng.float(r * 0.1, r * 0.3), rng.float(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const shade = ctx.createRadialGradient(cx - r * 0.5, cy - r * 0.5, r * 0.2, cx, cy, r * 1.05);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(0.75, 'rgba(0,0,0,0.15)'); shade.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, size, size);
  ctx.restore();
  if (def.id !== 'asteroids' && def.id !== 'barren') {
    ctx.strokeStyle = atmo; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2); ctx.stroke();
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export const STAR_COLOURS: Record<StarClass, string> = {
  yellow: '#ffe9a8', orange: '#ffb86b', red: '#ff7b6b', white: '#f4f6ff', blue: '#9ecbff', binary: '#ffd1f2',
};
