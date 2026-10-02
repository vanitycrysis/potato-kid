import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { kidRig, trimData } from '../content/artData';

// ROSTER-SCALE texture budget (D-034: decoded textures under 32 MiB, D-046: ~500 types).
// Sizes come from the exported PNGs' own headers, so this measures what the game loads.

const MiB = 1024 * 1024;
const BUDGET = 32 * MiB;

function pngs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pngs(join(dir, e.name)) : e.name.endsWith('.png') ? [join(dir, e.name)] : [],
  );
}

/** Width and height from the PNG IHDR chunk. */
function size(file: string): [number, number] {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const files = [...pngs('assets/sprites'), ...pngs('assets/maps')];
const bytes = new Map(files.map((f) => [f.slice(f.replace(/\\/g, '/').lastIndexOf('/') + 1, -4), (([w, h]) => w * h * 4)(size(f))]));
const rig = kidRig!;
const costumeBytes = (type: string) => (rig.costumes[type]?.components ?? []).reduce((s, c) => s + (bytes.get(c.asset) ?? 0), 0);
const costumeAssets = new Set(Object.values(rig.costumes).flatMap((c) => c.components.map((x) => x.asset)));

describe('texture budget (ROSTER-SCALE)', () => {
  it('cropped exports match trim.json exactly', () => {
    for (const [name, [, , w, h]] of Object.entries(trimData ?? {})) {
      const file = files.find((f) => f.replace(/\\/g, '/').endsWith(`/${name}.png`));
      expect(file, name).toBeDefined();
      expect(size(file!), name).toEqual([w, h]);
    }
  });

  it('shared art plus the worst-case costumes at maximum capacity fit in 32 MiB', () => {
    const shared = [...bytes].filter(([n]) => !costumeAssets.has(n)).reduce((s, [, b]) => s + b, 0);
    const b = content.balance;
    const maxCapacity = b.spawn.capacity + b.economy.capacityPerLevel * (b.buildings.capacity.maxLevel - 1);
    // Every kid a different type, and the heaviest types at that: the most a full map can need.
    const worst = Object.keys(rig.costumes)
      .map(costumeBytes)
      .sort((x, y) => y - x)
      .slice(0, maxCapacity)
      .reduce((s, x) => s + x, 0);
    const total = shared + worst;
    console.info(`shared ${(shared / MiB).toFixed(2)} MiB + ${maxCapacity} heaviest costumes ${(worst / MiB).toFixed(2)} MiB = ${(total / MiB).toFixed(2)} MiB`);
    expect(total).toBeLessThan(BUDGET);
  });

  it('the average costume leaves room for the full ~500 roster to be loaded lazily', () => {
    // Not all at once: this just checks a costume stays small enough that the per-type
    // loading above, not the roster size, is what bounds memory.
    const types = Object.keys(rig.costumes);
    const mean = types.reduce((s, t) => s + costumeBytes(t), 0) / types.length;
    expect(mean).toBeLessThan(0.25 * MiB);
  });
});
