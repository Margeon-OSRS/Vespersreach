/**
 * Deterministic pseudo-random number generation (mulberry32).
 * Every piece of game randomness flows through an Rng so a seed reproduces a galaxy exactly.
 */

/** FNV-1a 32-bit hash of a string, used to turn text seeds into integers. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private s: number;

  constructor(seed: number | string) {
    this.s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  /** Current internal state, for serialisation. */
  get state(): number {
    return this.s;
  }

  static fromState(state: number): Rng {
    const r = new Rng(1);
    r.s = state >>> 0;
    return r;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    this.s = t;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Pick an item proportionally to its weight. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weightOf(item));
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= Math.max(0, weightOf(item));
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  /** In-place Fisher-Yates shuffle; returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Approximate normal sample via the sum of three uniforms. */
  gaussian(mean = 0, sd = 1): number {
    const u = this.next() + this.next() + this.next();
    return mean + (u - 1.5) * sd * 1.41421356;
  }

  /** Derive an independent stream for a named sub-system. */
  fork(label: string): Rng {
    return new Rng(hashString(label + ':' + this.next().toString(36)));
  }
}
