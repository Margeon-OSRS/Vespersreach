import type { Lane } from './types';

export interface LaneGraph {
  /** systemId -> list of { to, length } */
  adjacency: Record<string, Array<{ to: string; length: number }>>;
}

const cache = new WeakMap<Lane[], LaneGraph>();

export function laneGraph(lanes: Lane[]): LaneGraph {
  let g = cache.get(lanes);
  if (g) return g;
  const adjacency: LaneGraph['adjacency'] = {};
  for (const lane of lanes) {
    (adjacency[lane.a] ??= []).push({ to: lane.b, length: lane.length });
    (adjacency[lane.b] ??= []).push({ to: lane.a, length: lane.length });
  }
  g = { adjacency };
  cache.set(lanes, g);
  return g;
}

export function neighbours(lanes: Lane[], systemId: string): string[] {
  return (laneGraph(lanes).adjacency[systemId] ?? []).map((e) => e.to);
}

export function laneLength(lanes: Lane[], a: string, b: string): number {
  const e = (laneGraph(lanes).adjacency[a] ?? []).find((x) => x.to === b);
  return e ? e.length : Infinity;
}

/**
 * Dijkstra shortest path by lane length.
 * Returns the systems to visit after `from`, ending with `to`; empty if unreachable or from === to.
 */
export function shortestPath(lanes: Lane[], from: string, to: string, allowed?: (id: string) => boolean): string[] {
  if (from === to) return [];
  const { adjacency } = laneGraph(lanes);
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const open: string[] = [from];
  const done = new Set<string>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    for (const e of adjacency[cur] ?? []) {
      if (e.to !== to && allowed && !allowed(e.to)) continue;
      const nd = dist[cur] + e.length;
      if (nd < (dist[e.to] ?? Infinity)) {
        dist[e.to] = nd;
        prev[e.to] = cur;
        if (!done.has(e.to)) open.push(e.to);
      }
    }
  }
  if (dist[to] === undefined) return [];
  const path: string[] = [];
  for (let cur = to; cur !== from; cur = prev[cur]) path.push(cur);
  return path.reverse();
}

/** Hop distances from a source to every reachable system (breadth-first). */
export function hopDistances(lanes: Lane[], from: string): Record<string, number> {
  const { adjacency } = laneGraph(lanes);
  const dist: Record<string, number> = { [from]: 0 };
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const e of adjacency[cur] ?? []) {
      if (dist[e.to] === undefined) {
        dist[e.to] = dist[cur] + 1;
        queue.push(e.to);
      }
    }
  }
  return dist;
}

export function isConnected(lanes: Lane[], systemIds: string[]): boolean {
  if (systemIds.length === 0) return true;
  const d = hopDistances(lanes, systemIds[0]);
  return systemIds.every((id) => d[id] !== undefined);
}
