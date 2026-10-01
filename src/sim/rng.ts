/**
 * Seeded PRNG (mulberry32). The whole state is a single uint32, so it
 * serialises into the save file and makes every simulation run reproducible.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Current state, for saving. */
  readonly state: number;
  /** Rewinds or restores to a saved state. */
  setState(state: number): void;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    get state() {
      return s;
    },
    setState(state) {
      s = state >>> 0;
    },
  };
}
