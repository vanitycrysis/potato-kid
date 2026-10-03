import type { BuildingId, Content } from '../content/types';
import { pairKey } from '../content/validate';
import { Game, type Command, type GameOptions } from './game';
import { rectAt, touching } from './space';
import { STEP } from './world';

// The balance simulator (ENGINEERING_PLAN §3): the real sim, played by a scripted bot, to
// measure pacing. The bot plays like an attentive player who doesn't know the recipes: it
// tries pairs it hasn't tried, fuses known recipes to reach new types, buys upgrades and
// uses the Compendium and instant spawns when it runs out of things to try.

export interface Scenario {
  name: string;
  /** Whether the bot may send kids home (D-048); off measures the map clogging. */
  sendHome?: boolean;
  /** Play sessions: each is `play` seconds of active play, then `away` seconds offline. */
  sessions: { play: number; away: number }[];
  /** Seconds between the bot's actions (one drag or one purchase). */
  actionSeconds: number;
}

export interface Report {
  scenario: string;
  seed: number;
  /** Active play seconds to the first recipe discovery (null: never). */
  firstRecipe: number | null;
  /** Active play seconds to the first kid of each tier. */
  firstOfTier: Record<number, number | null>;
  /** Active play seconds until this share of the roster is discovered. */
  discovered: Record<'25' | '50' | '75' | '100', number | null>;
  /** Share of active time with the map under 30 % of capacity (starvation, the main risk). */
  starvation: number;
  /** Share of the bot's turns with nothing useful to do. */
  stuck: number;
  /**
   * Share of turns spent deadlocked: the map is full, no pair on it is a recipe, and
   * nothing can be bought to change that. No kid can leave the map any other way.
   */
  deadlocked: number;
  /** Totals at the end. */
  end: {
    playSeconds: number;
    kidsDiscovered: number;
    recipesFound: number;
    levels: Record<BuildingId, number>;
    materials: number;
    potatokens: number;
  };
}

/** Plays `scenario` from a new game with `seed`; deterministic for a given seed. */
export function simulate(content: Content, options: GameOptions, scenario: Scenario, seed: number): Report {
  const game = new Game(content, { ...options, now: 0 }, seed);
  const sendHome = scenario.sendHome ?? true;
  const tiers = new Map(content.kids.map((k) => [k.id, k.tier]));
  const recipes = new Map(content.recipes.map((r) => [pairKey(r.a, r.b), r.result]));
  const tried = new Set<string>();
  const roster = content.kids.length;
  const firstOfTier: Record<number, number | null> = {};
  for (const k of content.kids) firstOfTier[k.tier] = null;
  const discovered: Report['discovered'] = { '25': null, '50': null, '75': null, '100': null };
  let firstRecipe: number | null = null;
  let play = 0;
  let starvedTime = 0;
  let turns = 0;
  let stuckTurns = 0;
  let deadTurns = 0;
  let nextAction = 0;
  let clock = 0;

  const note = () => {
    const s = game.state;
    if (firstRecipe === null && s.discoveredRecipes.length > 0) firstRecipe = play;
    for (const t of s.discoveredKids) {
      const tier = tiers.get(t)!;
      if (firstOfTier[tier] === null) firstOfTier[tier] = play;
    }
    for (const q of ['25', '50', '75', '100'] as const) {
      if (discovered[q] === null && s.discoveredKids.length >= (roster * Number(q)) / 100) discovered[q] = play;
    }
  };
  note();

  /** The bot's one action this turn, or null when it has nothing useful to do. */
  const decide = (): Command[] | null => {
    const s = game.state;
    // 1. Buy: the cheaper of Garden and Capacity, the Compendium once a few kids are known.
    const buy = purchase(game);
    if (buy) return [buy];
    const free = s.world.kids.filter((k) => !k.held && k.grace === 0);
    // 2. Try a pair of types never tried together (the player doesn't know the recipes).
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const key = pairKey(free[i]!.type, free[j]!.type);
        if (tried.has(key)) continue;
        tried.add(key);
        return drag(game, free[i]!.id, free[j]!);
      }
    }
    // 3. Fuse a known recipe whose result isn't on the map: a new type opens new pairs.
    const onMap = new Set(s.world.kids.map((k) => k.type));
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const result = recipes.get(pairKey(free[i]!.type, free[j]!.type));
        if (result && s.discoveredRecipes.includes(pairKey(free[i]!.type, free[j]!.type)) && !onMap.has(result)) return drag(game, free[i]!.id, free[j]!);
      }
    }
    // 3b. A full map with nothing new to try: fuse any known recipe to make room.
    const full = s.world.kids.length >= game.capacity;
    if (full) {
      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          if (s.discoveredRecipes.includes(pairKey(free[i]!.type, free[j]!.type))) return drag(game, free[i]!.id, free[j]!);
        }
      }
    }
    // 3c. Still full: send home (D-048) the kid with the fewest untried pairings on the
    //     map (a dead end, or a spare copy), so the Garden can bring someone new.
    if (full && sendHome && free.length) {
      const untried = (t: string) => free.filter((k) => !tried.has(pairKey(t, k.type))).length;
      const pick = free.reduce((best, k) => (untried(k.type) < untried(best.type) ? k : best));
      return [{ type: 'sendHome', kidId: pick.id }];
    }
    // 4. Out of ideas with room to spare: bring back a known type that pairs untried with
    //    the map (Compendium), else an instant spawn.
    if (s.world.kids.length < game.capacity) {
      if (s.buildings.compendium > 0) {
        const pick = s.discoveredKids.find((t) => free.some((k) => !tried.has(pairKey(t, k.type))));
        if (pick) {
          const cost = game.respawnCost(pick);
          if (s.materials >= cost.materials) return [{ type: 'respawn', kidType: pick, pay: 'materials' }];
          if (s.potatokens >= cost.potatokens) return [{ type: 'respawn', kidType: pick, pay: 'potatokens' }];
        }
      }
      if (s.potatokens >= content.balance.economy.instantSpawnPotatokens) return [{ type: 'instantSpawn' }];
    }
    return null;
  };

  for (const session of scenario.sessions) {
    const steps = Math.round(session.play / STEP);
    for (let i = 0; i < steps; i++) {
      let commands: Command[] = [];
      if (play >= nextAction) {
        nextAction = play + scenario.actionSeconds;
        turns++;
        const act = decide();
        if (act) commands = act;
        else {
          stuckTurns++;
          if (deadlocked(game, recipes)) deadTurns++;
        }
      }
      game.step(commands);
      play += STEP;
      clock += STEP;
      if (game.state.world.kids.length < 0.3 * game.capacity) starvedTime += STEP;
      note();
    }
    if (session.away > 0) {
      clock += session.away;
      game.reconcile(clock * 1000);
      note();
    }
  }

  const s = game.state;
  return {
    scenario: scenario.name,
    seed,
    firstRecipe,
    firstOfTier,
    discovered,
    starvation: play ? starvedTime / play : 0,
    stuck: turns ? stuckTurns / turns : 0,
    deadlocked: turns ? deadTurns / turns : 0,
    end: {
      playSeconds: play,
      kidsDiscovered: s.discoveredKids.length,
      recipesFound: s.discoveredRecipes.length,
      levels: { ...s.buildings },
      materials: s.materials,
      potatokens: s.potatokens,
    },
  };
}

/** A full map on which no two kids make a recipe, and no upgrade is affordable. */
function deadlocked(game: Game, recipes: Map<string, string>): boolean {
  const kids = game.state.world.kids;
  if (kids.length < game.capacity) return false;
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) if (recipes.has(pairKey(kids[i]!.type, kids[j]!.type))) return false;
  }
  return purchase(game) === null;
}

/**
 * Pick up `kidId` and drop it against `partner`, as a player's drag does: it lands on the
 * nearest free spot, and only kids that spot really touches count as contacts, exactly as
 * the scene's drop (Codex review, PR #45). A crowded partner may not be reached.
 */
export function drag(game: Game, kidId: number, partner: { id: number; x: number; y: number }): Command[] {
  const kids = game.state.world.kids;
  const kid = kids.find((k) => k.id === kidId)!;
  const spot = game.landingSpot(kidId, partner.x, partner.y) ?? { x: kid.x, y: kid.y };
  const at = rectAt(kid.box, spot.x, spot.y);
  const contacts = kids.filter((k) => k.id !== kidId && touching(at, rectAt(k.box, k.x, k.y), game.touchSlack)).map((k) => k.id);
  return [
    { type: 'pickUp', kidId },
    { type: 'drop', kidId, x: spot.x, y: spot.y, touching: contacts },
  ];
}

/** The bot's shopping: Compendium once 6 kids are known, then the cheaper of Garden and Capacity. */
function purchase(game: Game): Command | null {
  const s = game.state;
  const afford = (b: BuildingId) => {
    const c = game.upgradeCost(b);
    return c !== null && s.materials >= c ? c : null;
  };
  if (s.buildings.compendium === 0 && s.discoveredKids.length >= 6 && afford('compendium') !== null) return { type: 'upgrade', building: 'compendium' };
  const options = (['garden', 'capacity'] as const).map((b) => ({ b, c: afford(b) })).filter((o) => o.c !== null);
  options.sort((x, y) => x.c! - y.c!);
  return options[0] ? { type: 'upgrade', building: options[0].b } : null;
}

/** Median of the non-null values, or null if most runs never got there. */
export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length * 2 < values.length) return null;
  return v[Math.floor(v.length / 2)]!;
}

