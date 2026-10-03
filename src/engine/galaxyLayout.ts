import type { Rng } from './rng';
import type { GalaxyDensity, GalaxyShape, GalaxySize } from './types';

export interface Point { x: number; y: number }
export interface IndexLane { a: number; b: number; length: number }

export const SIZE_COUNTS: Record<GalaxySize, number> = { tiny: 18, small: 28, medium: 42, large: 60, huge: 84 };

/** Sample one candidate position (normalised radius/angle mapped into the ellipse). */
function sample(rng: Rng, shape: GalaxyShape, w: number, h: number, clusters: Point[]): Point {
  const cx = w / 2, cy = h / 2, ax = (w / 2) * 0.92, ay = (h / 2) * 0.92;
  const polar = (r: number, t: number): Point => ({ x: cx + Math.cos(t) * r * ax, y: cy + Math.sin(t) * r * ay });
  switch (shape) {
    case 'disc':
      return polar(Math.pow(rng.next(), 0.6), rng.next() * Math.PI * 2);
    case 'ring':
      return polar(0.62 + rng.next() * 0.33 + rng.gaussian(0, 0.03), rng.next() * Math.PI * 2);
    case 'clusters': {
      const c = rng.pick(clusters);
      return { x: c.x + rng.gaussian(0, 0.12) * ax, y: c.y + rng.gaussian(0, 0.12) * ay };
    }
    case 'spiral':
    default: {
      const arms = 2;
      const arm = rng.int(0, arms - 1);
      const t = Math.pow(rng.next(), 0.8);
      const r = 0.12 + 0.86 * t;
      const angle = (arm * Math.PI * 2) / arms + t * Math.PI * 1.9 + rng.gaussian(0, 0.09 + 0.18 * (1 - t));
      return polar(r, angle);
    }
  }
}

/** Place `count` stars with a minimum separation, following the requested shape. */
export function placeStars(rng: Rng, count: number, shape: GalaxyShape, w: number, h: number): Point[] {
  const clusterCount = 3 + Math.floor(count / 25);
  const clusters: Point[] = [];
  for (let i = 0; i < clusterCount; i++) {
    const t = (i / clusterCount) * Math.PI * 2 + rng.float(-0.4, 0.4);
    const r = rng.float(0.3, 0.75);
    clusters.push({ x: w / 2 + Math.cos(t) * r * (w / 2) * 0.9, y: h / 2 + Math.sin(t) * r * (h / 2) * 0.9 });
  }
  let minDist = Math.sqrt((w * h) / count) * 0.52;
  const points: Point[] = [];
  let failures = 0;
  while (points.length < count) {
    const p = sample(rng, shape, w, h, clusters);
    if (p.x < 30 || p.y < 30 || p.x > w - 30 || p.y > h - 30) continue;
    const ok = points.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minDist);
    if (ok) {
      points.push({ x: Math.round(p.x), y: Math.round(p.y) });
      failures = 0;
    } else if (++failures > 60) {
      minDist *= 0.92;
      failures = 0;
    }
  }
  return points;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** True when segments p1-p2 and p3-p4 properly intersect (shared endpoints do not count). */
export function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Minimum spanning tree plus a density-dependent number of short, non-crossing extra lanes. */
export function buildLanes(points: Point[], rng: Rng, density: GalaxyDensity): IndexLane[] {
  const n = points.length;
  const pairs: IndexLane[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) pairs.push({ a, b, length: Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) });
  }
  pairs.sort((p, q) => p.length - q.length);
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const lanes: IndexLane[] = [];
  const degree = new Array<number>(n).fill(0);
  const add = (p: IndexLane) => { lanes.push(p); degree[p.a]++; degree[p.b]++; };
  for (const p of pairs) {
    const ra = find(p.a), rb = find(p.b);
    if (ra !== rb) { parent[ra] = rb; add(p); }
  }
  const extraPerNode = { sparse: 0.45, normal: 0.9, dense: 1.5 }[density];
  const target = Math.round(n * extraPerNode);
  const sorted = lanes.map((l) => l.length).sort((x, y) => x - y);
  const maxLen = sorted[Math.floor(sorted.length / 2)] * 2.3;
  let added = 0;
  const has = new Set(lanes.map((l) => `${l.a}-${l.b}`));
  for (const p of pairs) {
    if (added >= target) break;
    if (has.has(`${p.a}-${p.b}`) || p.length > maxLen) continue;
    if (degree[p.a] >= 5 || degree[p.b] >= 5) continue;
    const crosses = lanes.some((l) => segmentsCross(points[p.a], points[p.b], points[l.a], points[l.b]));
    if (crosses) continue;
    if (!rng.chance(0.8)) continue;
    add(p);
    has.add(`${p.a}-${p.b}`);
    added++;
  }
  return lanes;
}
