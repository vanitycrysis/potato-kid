import { readFileSync } from 'node:fs';
import { ambientFrom, lookTable, obstaclesFrom } from '../content/artRules';
import type { KidRig, MapData } from '../content/artData';
import { content } from '../content';
import { median, simulate, type Report, type Scenario } from './balance';
import type { GameOptions } from './game';

// `npm run balance`: plays the scenarios over several seeds on the real map and content
// and prints the medians (ENGINEERING_PLAN §3). Run by scripts/balance.mjs through Vite,
// one process per seed and scenario.

const map = JSON.parse(readFileSync('art/data/map_garden_v2.json', 'utf8')) as MapData;
const rig = JSON.parse(readFileSync('art/data/kid_rig_v2.json', 'utf8')) as KidRig;
const [w, h] = map.worldSize;
const options: GameOptions = {
  bounds: { minX: 0, minY: 0, maxX: w, maxY: h },
  spawnAt: { x: map.garden.spawnOutlet[0], y: map.garden.spawnOutlet[1] },
  obstacles: obstaclesFrom(map),
  looks: lookTable(rig),
  // The shipped rests (look, wave, sit, sleep), as main.ts sets up (Codex review, PR #45).
  ambient: ambientFrom(rig, content.balance.wander.ambientChance),
};

const HOUR = 3600;
const DAY = 24 * HOUR;
export const scenarios: Scenario[] = [
  // The tutorial and the first upgrades, played without a break (D-052).
  { name: 'first hour', sessions: [{ play: HOUR, away: 0 }], actionSeconds: 3 },
  // Ten minutes every three hours for two weeks (112 sessions), offline in between.
  { name: 'casual 14 days', sessions: Array.from({ length: 112 }, () => ({ play: 600, away: 3 * HOUR - 600 })), actionSeconds: 4 },
  // One 30-minute evening session a day for two weeks: the long absences hit the 8 h cap.
  { name: 'daily 30 min, 14 days', sessions: Array.from({ length: 14 }, () => ({ play: 1800, away: DAY - 1800 })), actionSeconds: 4 },
];

/** The days whose income the report shows: only days the scenario reaches (Codex review, PR #68). */
export function incomeDays(sc: Scenario): number[] {
  const span = sc.sessions.reduce((t, s) => t + s.play + s.away, 0);
  return [1, 3, 7, 14].filter((d) => d * DAY <= span);
}

/**
 * The content to simulate: the shipped content, with `PK_BALANCE` (JSON) merged over its
 * balance one level deep, to try tunings side by side without editing balance.json.
 */
function tuned(): typeof content {
  const raw = process.env.PK_BALANCE;
  if (!raw) return content;
  const c = structuredClone(content);
  // PK_SPECIALS=n adds n stand-in special kids (tier 5, in no recipe) for planting to sprout.
  const n = Number(process.env.PK_SPECIALS ?? 0);
  for (let i = 1; i <= n; i++) c.kids.push({ id: `special_${i}`, tier: 5, name: `Special ${i}`, special: true });
  const patch = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  const b = c.balance as unknown as Record<string, Record<string, unknown>>;
  for (const [k, v] of Object.entries(patch)) b[k] = { ...b[k], ...v };
  return c;
}

/** One scenario on one seed (a child process of scripts/balance.mjs). */
export function runOne(scenario: number, seed: number): Report {
  return simulate(tuned(), options, scenarios[scenario]!, seed);
}

const fmt = (s: number | null) => {
  if (s === null) return 'never';
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 2 * HOUR) return `${Math.round(s / 60)} min`;
  if (s < 2 * DAY) return `${(s / HOUR).toFixed(1)} h`;
  return `day ${(s / DAY).toFixed(1)}`;
};
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** The printed report: per scenario, the medians over its seeds. */
export function summarize(reports: Report[][], seeds: number): string {
  const lines: string[] = [];
  const tiers = [...new Set(content.kids.map((k) => k.tier))].sort();
  const sp = content.balance.spawn;
  lines.push(`Roster ${content.kids.length} kids, ${content.recipes.length} recipes; ${seeds} seeds per scenario.`);
  if (process.env.PK_BALANCE) lines.push(`Balance overrides: ${process.env.PK_BALANCE}`);
  lines.push(`Garden: ${sp.tutorialSpawns} tutorial spawns every ${fmt(sp.tutorialIntervalSeconds)}, then ${fmt(sp.intervalSeconds)} at L1.`);
  scenarios.forEach((sc, i) => {
    const rs = reports[i]!;
    const m = (f: (r: Report) => number | null) => fmt(median(rs.map(f)));
    const play = rs[0]!.end.playSeconds;
    lines.push('', `## ${sc.name} (one action every ${sc.actionSeconds} s; ${fmt(play)} of play)`);
    lines.push(`tutorial over: ${m((r) => r.tutorialDone)} (wall clock)`);
    lines.push(`first recipe: ${m((r) => r.firstRecipe)}; first of tier (play): ${tiers.map((t) => `T${t} ${m((r) => r.firstOfTier[t] ?? null)}`).join(', ')}`);
    lines.push(`roster found (play): ${(['25', '50', '75', '100'] as const).map((q) => `${q} % ${m((r) => r.discovered[q])}`).join(', ')}`);
    lines.push(`roster found (wall clock): ${(['25', '50', '75', '100'] as const).map((q) => `${q} % ${m((r) => r.discoveredClock[q])}`).join(', ')}`);
    for (const b of ['garden', 'capacity'] as const) {
      const at = (lv: number, k: 'play' | 'clock') => m((r) => r.levelAt[b][lv]?.[k] ?? null);
      lines.push(`${b} level reached (play / wall clock): ${[2, 3, 5, 10].map((lv) => `L${lv} ${at(lv, 'play')} / ${at(lv, 'clock')}`).join(', ')}`);
    }
    const days = incomeDays(sc);
    const incomeAt = (t: number) => median(rs.map((r) => [...r.income].reverse().find((x) => x.clock <= t)?.perSecond ?? null));
    const rate = (v: number | null) => (v === null ? '?' : v < 10 ? v.toFixed(2) : String(Math.round(v)));
    lines.push(`income, Materials/s: end of first session ${rate(median(rs.map((r) => r.income[0]?.perSecond ?? null)))}${days.map((d) => `, day ${d} ${rate(incomeAt(d * DAY))}`).join('')}`);
    const plotsLine = [2, 3, 4].map((n) => `${n} plots ${m((r) => r.plotsAt[n]?.clock ?? null)}`).join(', ');
    lines.push(`plots (wall clock): ${plotsLine}; planted ${median(rs.map((r) => r.planted))}, sprouted ${median(rs.map((r) => r.sprouted))}`);
    lines.push(
      `starvation (map < 30 % full): ${pct(median(rs.map((r) => r.starvation))!)}; stuck turns: ${pct(median(rs.map((r) => r.stuck))!)}; ` +
        `deadlocked turns: ${pct(median(rs.map((r) => r.deadlocked))!)} (worst seed ${pct(Math.max(...rs.map((r) => r.deadlocked)))})`,
    );
    const end = rs.map((r) => r.end);
    lines.push(
      `at the end: ${median(end.map((e) => e.kidsDiscovered))} kids, ${median(end.map((e) => e.recipesFound))} recipes; ` +
        `garden L${median(end.map((e) => e.levels.garden))}, capacity L${median(end.map((e) => e.levels.capacity))}, compendium L${median(end.map((e) => e.levels.compendium))}; ` +
        `${Math.round(median(end.map((e) => e.materials))!)} Materials, ${median(end.map((e) => e.potatokens))} Potatokens; ` +
        `${median(end.map((e) => e.specialsOnMap))} specials on the map`,
    );
  });
  return lines.join('\n');
}
