import { readFileSync } from 'node:fs';
import { lookTable, obstaclesFrom } from '../content/artRules';
import type { KidRig, MapData } from '../content/artData';
import { content } from '../content';
import { median, simulate, type Report, type Scenario } from './balance';
import type { GameOptions } from './game';

// `npm run balance`: plays the scenarios over several seeds on the real map and content
// and prints the medians (ENGINEERING_PLAN §3). Run by scripts/balance.mjs through Vite.

const map = JSON.parse(readFileSync('art/data/map_garden_v2.json', 'utf8')) as MapData;
const rig = JSON.parse(readFileSync('art/data/kid_rig_v2.json', 'utf8')) as KidRig;
const [w, h] = map.worldSize;
const options: GameOptions = {
  bounds: { minX: 0, minY: 0, maxX: w, maxY: h },
  spawnAt: { x: map.garden.spawnOutlet[0], y: map.garden.spawnOutlet[1] },
  obstacles: obstaclesFrom(map),
  looks: lookTable(rig),
};

const HOUR = 3600;
export const scenarios: Scenario[] = [
  { name: 'active 3 h', sessions: [{ play: 3 * HOUR, away: 0 }], actionSeconds: 3 },
  // Without Send home (D-048): how soon the map clogs with kids that can't fuse.
  { name: 'active 3 h, no send home', sessions: [{ play: 3 * HOUR, away: 0 }], actionSeconds: 3, sendHome: false },
  // Ten minutes every three hours for three days (24 sessions), offline in between.
  { name: 'casual 3 days', sessions: Array.from({ length: 24 }, () => ({ play: 600, away: 3 * HOUR - 600 })), actionSeconds: 4 },
];

const fmt = (s: number | null) => {
  if (s === null) return 'never';
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 2 * HOUR) return `${Math.round(s / 60)} min`;
  return `${(s / HOUR).toFixed(1)} h`;
};
const pct = (x: number) => `${Math.round(x * 100)} %`;

export function run(seeds = 8): string {
  const lines: string[] = [];
  const tiers = [...new Set(content.kids.map((k) => k.tier))].sort();
  lines.push(`Roster ${content.kids.length} kids, ${content.recipes.length} recipes; ${seeds} seeds per scenario; times are active play.`);
  for (const sc of scenarios) {
    const reports: Report[] = [];
    for (let seed = 1; seed <= seeds; seed++) reports.push(simulate(content, options, sc, seed));
    const m = (f: (r: Report) => number | null) => fmt(median(reports.map(f)));
    lines.push('', `## ${sc.name} (one action every ${sc.actionSeconds} s)`);
    lines.push(`first recipe: ${m((r) => r.firstRecipe)}`);
    lines.push(`first of tier: ${tiers.map((t) => `T${t} ${m((r) => r.firstOfTier[t] ?? null)}`).join(', ')}`);
    lines.push(`roster found: ${(['25', '50', '75', '100'] as const).map((q) => `${q} % ${m((r) => r.discovered[q])}`).join(', ')}`);
    lines.push(
      `starvation (map < 30 % full): ${pct(median(reports.map((r) => r.starvation))!)}; stuck turns: ${pct(median(reports.map((r) => r.stuck))!)}; ` +
        `deadlocked turns: ${pct(median(reports.map((r) => r.deadlocked))!)} (worst seed ${pct(Math.max(...reports.map((r) => r.deadlocked)))})`,
    );
    const end = reports.map((r) => r.end);
    lines.push(
      `at the end: ${median(end.map((e) => e.kidsDiscovered))} kids, ${median(end.map((e) => e.recipesFound))} recipes; ` +
        `garden L${median(end.map((e) => e.levels.garden))}, capacity L${median(end.map((e) => e.levels.capacity))}, compendium L${median(end.map((e) => e.levels.compendium))}`,
    );
  }
  return lines.join('\n');
}
