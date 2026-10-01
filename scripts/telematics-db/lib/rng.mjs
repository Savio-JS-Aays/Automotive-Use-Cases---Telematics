// Seeded, forkable PRNG so every run with the same --seed produces identical data.
// fork(label) derives an independent stream (e.g. per vehicle), so adding or reordering
// vehicles does not reshuffle everyone else's history.

function hashString(str, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed) {
  let state = seed >>> 0;

  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = (mean = 0, sd = 1) => {
    const u = Math.max(next(), 1e-12);
    const v = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  return {
    next,
    normal,
    uniform: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(entries) {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, w] of entries) {
        r -= w;
        if (r <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    poisson(lambda) {
      if (lambda <= 0) return 0;
      if (lambda > 30) return Math.max(0, Math.round(normal(lambda, Math.sqrt(lambda))));
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > limit);
      return k - 1;
    },
    weibull: (eta, beta) => eta * Math.pow(-Math.log(1 - next()), 1 / beta),
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork: (label) => createRng(hashString(String(label), seed)),
  };
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const round = (v, digits = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
