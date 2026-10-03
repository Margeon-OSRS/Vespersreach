import type { Rng } from './rng';

const ONSETS = ['', 'k', 'v', 'th', 'r', 'n', 'm', 's', 'z', 'l', 'd', 'tr', 'kr', 'ph', 'sh', 'kh', 'br', 'g', 'h', 'x'];
const NUCLEI = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou', 'ei', 'y', 'au', 'eo'];
const CODAS = ['', '', 'n', 'r', 's', 'l', 'th', 'x', 'm', 'nd', 'rk', 'sh', 'ss', 'nt', 'q'];
const SUFFIXES = ['', '', '', ' Prime', ' Major', ' Minor', ' Reach', ' Drift', ' Verge', ' Hollow', ' Gate', ' Spur'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Sigma', 'Tau', 'Omega'];

function syllable(rng: Rng): string {
  return rng.pick(ONSETS) + rng.pick(NUCLEI) + rng.pick(CODAS);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Generates a unique star name. Keeps a set of used names to avoid repeats. */
export function makeStarNamer(rng: Rng): () => string {
  const used = new Set<string>();
  return () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const count = rng.int(2, 3);
      let word = '';
      for (let i = 0; i < count; i++) word += syllable(rng);
      word = capitalise(word.replace(/(.)\1\1/g, '$1$1'));
      if (word.length < 4 || word.length > 11) continue;
      const name = rng.chance(0.12) ? `${rng.pick(GREEK)} ${word}` : word + rng.pick(SUFFIXES);
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    const fallback = `Star ${used.size + 1}`;
    used.add(fallback);
    return fallback;
  };
}

const SHIP_WORDS = ['Resolve', 'Candour', 'Ember', 'Lantern', 'Hearth', 'Meridian', 'Quiet', 'Tempest', 'Vigil', 'Harrow',
  'Solace', 'Kestrel', 'Ardent', 'Cinder', 'Gale', 'Verity', 'Tern', 'Heron', 'Fathom', 'Sable', 'Aurora', 'Pennant',
  'Cairn', 'Dawn', 'Lodestar', 'Ridgeway', 'Sojourn', 'Thistle', 'Wayfarer', 'Zenith'];

export function shipName(rng: Rng, prefix: string): string {
  return `${prefix} ${rng.pick(SHIP_WORDS)}`;
}

export function planetName(systemName: string, index: number): string {
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  return `${systemName.replace(/ (Prime|Major|Minor|Reach|Drift|Verge|Hollow|Gate|Spur)$/, '')} ${roman[index] ?? index + 1}`;
}
