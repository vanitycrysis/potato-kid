import type { BuildingId, Content } from '../content/types';
import { pairKey } from '../content/validate';
import { Game, type Command, type GameEvent, type GameOptions } from './game';
import { rectAt, touching } from './space';
import { STEP } from './world';

// The balance simulator (ENGINEERING_PLAN §3): the real sim, played by a scripted bot, to
// measure pacing. The bot plays like an attentive player who doesn't know the recipes: it
// tries pairs it hasn't tried, fuses known recipes to reach new types, buys upgrades and
// uses the Compendium and instant spawns when it runs out of things to try.

export interface Scenario {
  name: string;
  /** Whether the bot may plant kids (D-054); off measures the map clogging. */
  plant?: boolean;
  /** Whether the bot may farm (D-069): buy fields, send spare kids to them, feed from the pantry. */
  farm?: boolean;
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
  /** The same, in wall-clock seconds from the start, including time away (D-052). */
  discoveredClock: Record<'25' | '50' | '75' | '100', number | null>;
  /** When each building first reached each level: active play and wall-clock seconds. */
  levelAt: Record<BuildingId, Record<number, { play: number; clock: number }>>;
  /** When the player had each number of plots (D-054): active play and wall-clock seconds. */
  plotsAt: Record<number, { play: number; clock: number }>;
  /** Kids planted, and kids that sprouted. */
  planted: number;
  sprouted: number;
  /**
   * Farming (D-069): when each number of fields was bought, bites grown and fed, the most
   * bites the pantry held at once (the hoarding check, GUI_MVP §22.6) and kids farming at
   * the end.
   */
  farming: { fieldsAt: Record<number, { play: number; clock: number }>; grown: number; fed: number; peakPantry: number; farmers: number };
  /** Wall-clock seconds at which the tutorial's last spawn arrived (null: not reached). */
  tutorialDone: number | null;
  /**
   * Materials per second over time: at the end of each session, and again on return after
   * each absence, so kids that arrived while away count (Codex review, PR #68).
   */
  income: { clock: number; perSecond: number }[];
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
    /** Special kids on the map at the end, out of `capacity`, and special types found. */
    specialsOnMap: number;
    capacity: number;
    specialsFound: number;
    /** Rare kids on the map at the end, and rare types found (D-072). */
    raresOnMap: number;
    raresFound: number;
    recipesFound: number;
    levels: Record<BuildingId, number>;
    materials: number;
    potatokens: number;
  };
}

/** Plays `scenario` from a new game with `seed`; deterministic for a given seed. */
export function simulate(content: Content, options: GameOptions, scenario: Scenario, seed: number): Report {
  const game = new Game(content, { ...options, now: 0 }, seed);
  const plant = scenario.plant ?? true;
  const farm = scenario.farm ?? true;
  const tiers = new Map(content.kids.map((k) => [k.id, k.tier]));
  const recipes = new Map(content.recipes.map((r) => [pairKey(r.a, r.b), r.result]));
  // The roster: the recipe kids; planting-only specials and rares are counted apart.
  const specials = new Set(content.kids.filter((k) => k.special).map((k) => k.id));
  const rares = new Set(content.kids.filter((k) => k.rare).map((k) => k.id));
  const apex = new Set([...specials, ...rares]);
  const roster = content.kids.length - apex.size;
  const firstOfTier: Record<number, number | null> = {};
  for (const k of content.kids) firstOfTier[k.tier] = null;
  const discovered: Report['discovered'] = { '25': null, '50': null, '75': null, '100': null };
  const discoveredClock: Report['discoveredClock'] = { '25': null, '50': null, '75': null, '100': null };
  const levelAt = Object.fromEntries(Object.keys(game.state.buildings).map((b) => [b, {}])) as Report['levelAt'];
  let tutorialDone: number | null = null;
  const plotsAt: Report['plotsAt'] = {};
  let planted = 0;
  let sprouted = 0;
  const fieldsAt: Report['farming']['fieldsAt'] = {};
  let grown = 0;
  let fed = 0;
  let peakPantry = 0;
  const income: Report['income'] = [];
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
    const found = s.discoveredKids.filter((t) => !apex.has(t)).length;
    for (const t of s.discoveredKids) {
      if (apex.has(t)) continue;
      const tier = tiers.get(t)!;
      if (firstOfTier[tier] === null) firstOfTier[tier] = play;
    }
    for (const q of ['25', '50', '75', '100'] as const) {
      if (discovered[q] === null && found >= (roster * Number(q)) / 100) {
        discovered[q] = play;
        discoveredClock[q] = clock;
      }
    }
    for (const [b, level] of Object.entries(s.buildings) as [BuildingId, number][]) levelAt[b][level] ??= { play, clock };
    if (tutorialDone === null && s.gardenSpawns >= content.balance.spawn.tutorialSpawns) tutorialDone = clock;
    plotsAt[s.plots.length] ??= { play, clock };
    fieldsAt[s.fields.length] ??= { play, clock };
    peakPantry = Math.max(peakPantry, Object.values(s.pantry).reduce((a, n) => a + n, 0));
  };
  note();

  const bot = createBot(game, content, plant, farm);
  const decide = bot.decide;

  /** Where the sessions put the clock: summed exactly, so no step drift builds up (Codex review, PR #68). */
  let planned = 0;
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
          if (deadlocked(game, recipes, farm)) deadTurns++;
        }
      }
      const events = game.step(commands);
      for (const e of events) {
        if (e.type === 'planted') planted++;
        else if (e.type === 'spawned' && e.source === 'sprout') sprouted++;
        else if (e.type === 'harvested') grown += e.bites;
        else if (e.type === 'fed') fed++;
      }
      bot.learn(events);
      play += STEP;
      clock += STEP;
      if (game.state.world.kids.length < 0.3 * game.capacity) starvedTime += STEP;
      note();
    }
    planned += session.play;
    clock = planned;
    income.push({ clock, perSecond: game.income });
    if (session.away > 0) {
      const left = clock;
      const before = { spawns: game.state.gardenSpawns, progress: game.state.spawnProgress, interval: game.interval };
      planned += session.away;
      clock = planned;
      const away = game.reconcile(clock * 1000);
      sprouted += away.sprouted.length;
      grown += Object.values(away.food).reduce((a, n) => a + n, 0);
      // A tutorial that ends while away ends at its last spawn's arrival, not at the
      // return (Codex review, PR #68). Tutorial spawns are evenly spaced from the first due.
      const need = content.balance.spawn.tutorialSpawns - before.spawns;
      if (tutorialDone === null && need > 0 && game.state.gardenSpawns - before.spawns >= need) {
        tutorialDone = left + Math.max(0, before.interval - before.progress) + (need - 1) * content.balance.spawn.tutorialIntervalSeconds;
      }
      income.push({ clock, perSecond: game.income });
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
    discoveredClock,
    levelAt,
    tutorialDone,
    plotsAt,
    planted,
    sprouted,
    farming: { fieldsAt, grown, fed, peakPantry, farmers: s.fields.reduce((a, f) => a + f.workers.length, 0) },
    income,
    starvation: play ? starvedTime / play : 0,
    stuck: turns ? stuckTurns / turns : 0,
    deadlocked: turns ? deadTurns / turns : 0,
    end: {
      playSeconds: play,
      kidsDiscovered: s.discoveredKids.filter((t) => !apex.has(t)).length,
      specialsOnMap: s.world.kids.filter((k) => specials.has(k.type)).length,
      capacity: game.capacity,
      specialsFound: s.discoveredKids.filter((t) => specials.has(t)).length,
      raresOnMap: s.world.kids.filter((k) => rares.has(k.type)).length,
      raresFound: s.discoveredKids.filter((t) => rares.has(t)).length,
      recipesFound: s.discoveredRecipes.length,
      levels: { ...s.buildings },
      materials: s.materials,
      potatokens: s.potatokens,
    },
  };
}

/**
 * The scripted player: `decide` picks one action a turn, or null when it has nothing useful
 * to do. `tried` holds the type pairs it has seen touch (exposed for tests).
 */
export function createBot(
  game: Game,
  content: Content,
  plant = true,
  farm = true,
): { decide: () => Command[] | null; learn: (events: GameEvent[]) => void; tried: Set<string> } {
  const recipes = new Map(content.recipes.map((r) => [pairKey(r.a, r.b), r.result]));
  const tried = new Set<string>();
  // Specials and rares alike: planting-only, never bought (Codex review, PR #84).
  const specials = new Set(content.kids.filter((k) => k.special || k.rare).map((k) => k.id));
  let pending: Drop | null = null;
  /** The bot's one action this turn, or null when it has nothing useful to do. */
  const decide = (): Command[] | null => {
    const s = game.state;
    // 1. Buy: the cheaper of Garden and Capacity, the Compendium once a few kids are known.
    const buy = purchase(game, farm);
    if (buy) return [buy];
    const free = s.world.kids.filter((k) => !k.held && k.grace === 0);
    if (farm) {
      // 1b. A bought field with no food: the favourite of the most kids on the map.
      const bare = s.fields.findIndex((f) => f.food === null);
      if (bare >= 0) return [{ type: 'setFieldFood', field: bare, food: favouriteOfMost(game, content) }];
      // 1c. Food in the pantry: feed an unhappy kid on the map, its favourite first.
      const meal = feeding(game, content);
      if (meal) return [meal];
    }
    // Either kid may be the one dragged: a pair is skipped only if neither direction lands
    // touching (Codex review, PR #45).
    // A drag counts only if its landing reaches the partner; a crowded partner is skipped
    // and stays eligible, and every pair the drop really touches is now tried (Codex
    // review, PR #45).
    const attempt = (a: (typeof free)[number], b: (typeof free)[number]): Command[] | null => {
      const commands = drag(game, a.id, b);
      const contacts = dropContacts(commands);
      if (!contacts.includes(b.id)) return null;
      // What was touched is learned only from the step's outcome (see `learnFromDrop`).
      pending = {
        mover: { id: a.id, type: a.type },
        contacts: contacts.flatMap((id) => {
          const k = s.world.kids.find((x) => x.id === id);
          return k ? [{ id, type: k.type, grace: k.grace }] : [];
        }),
      };
      return commands;
    };
    // 2. Try a pair of types never tried together (the player doesn't know the recipes).
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        if (tried.has(pairKey(free[i]!.type, free[j]!.type))) continue;
        const act = attempt(free[i]!, free[j]!) ?? attempt(free[j]!, free[i]!);
        if (act) return act;
      }
    }
    // 3. Fuse a known recipe whose result isn't on the map: a new type opens new pairs.
    const onMap = new Set(s.world.kids.map((k) => k.type));
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const result = recipes.get(pairKey(free[i]!.type, free[j]!.type));
        if (!result || !s.discoveredRecipes.includes(pairKey(free[i]!.type, free[j]!.type)) || onMap.has(result)) continue;
        const act = attempt(free[i]!, free[j]!) ?? attempt(free[j]!, free[i]!);
        if (act) return act;
      }
    }
    // 3b. A full map with nothing new to try: fuse any known recipe to make room.
    const full = s.world.kids.length >= game.capacity;
    if (full) {
      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          if (!s.discoveredRecipes.includes(pairKey(free[i]!.type, free[j]!.type))) continue;
          const act = attempt(free[i]!, free[j]!) ?? attempt(free[j]!, free[i]!);
          if (act) return act;
        }
      }
    }
    // 3b'. Start a plot growing once it holds the most kids (D-061: the best odds).
    const ready = s.plots.findIndex((p) => p.seed && !p.seed.sprout && p.seed.planted.length >= content.balance.planting.maxKids);
    if (plant && ready >= 0) return [{ type: 'startGrowing', plot: ready }];
    // 3c'. Still full: a spare kid (every pairing with the other kids on the map tried) goes to
    //      farm, if a field has room and grows a food it doesn't hate; it comes back only if needed.
    if (full && farm && free.length) {
      // With each other kid: a kid can't pair with itself (Codex review, #90).
      const untried = (kid: (typeof free)[number]) => free.filter((k) => k.id !== kid.id && !tried.has(pairKey(kid.type, k.type))).length;
      const fm = content.balance.farming;
      for (const [i, f] of s.fields.entries()) {
        if (f.food === null || f.workers.length >= fm.kidsPerField) continue;
        const spare = free.find((k) => !specials.has(k.type) && untried(k) === 0 && content.personality[k.type]?.hatedFood !== f.food);
        if (spare) return [{ type: 'farm', field: i, kidIds: [spare.id] }];
      }
    }
    // 3c. Still full: plant (D-061) the kid with the fewest untried pairings on the map (a
    //     dead end, or a spare copy) into the plot that is filling, if any takes it.
    if (full && plant && free.length && game.plotForDrop() !== null) {
      const untried = (t: string) => free.filter((k) => !tried.has(pairKey(t, k.type))).length;
      // A player keeps a special kid while any other dead end can go first (a found
      // special stays in the Dex, so it's planted only as a last resort).
      const ordinary = free.filter((k) => !specials.has(k.type));
      const plantable = ordinary.length ? ordinary : free;
      const pick = plantable.reduce<(typeof free)[number] | undefined>((best, k) => (!best || untried(k.type) < untried(best.type) ? k : best), undefined);
      if (pick) return [{ type: 'plant', kidIds: [pick.id] }];
    }
    // 4. Out of ideas with room to spare: bring back a known type that pairs untried with
    //    the map (Compendium), else an instant spawn.
    if (s.world.kids.length < game.capacity) {
      if (s.buildings.compendium > 0) {
        const pick = s.discoveredKids.find((t) => !specials.has(t) && free.some((k) => !tried.has(pairKey(t, k.type))));
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
  /** After the step that applied the bot's commands: learn what its last drop tested. */
  const learn = (events: GameEvent[]) => {
    if (pending) learnFromDrop(tried, pending, events);
    pending = null;
  };
  return { decide, learn, tried };
}

/** A full map on which no two kids make a recipe, and no upgrade is affordable. */
export function deadlocked(game: Game, recipes: Map<string, string>, farm = true): boolean {
  const kids = game.state.world.kids;
  if (kids.length < game.capacity) return false;
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) if (recipes.has(pairKey(kids[i]!.type, kids[j]!.type))) return false;
  }
  // A field is an escape only when the bot may farm (Codex review, #90).
  return purchase(game, farm) === null;
}

/** A drop the bot made: who moved, and whom the landing touched (with their grace then). */
export interface Drop {
  mover: { id: number; type: string };
  contacts: { id: number; type: string; grace: number }[];
}

/**
 * What a drop really tested (Codex review, PR #45): a touched pair that fused, or one where
 * both kids came through the step and the partner was out of its newborn grace. A pair
 * interrupted by another fusion, or by grace, stays untried.
 */
export function learnFromDrop(tried: Set<string>, drop: Drop, events: GameEvent[]): void {
  const consumed = new Set<number>();
  const fusedWith = new Set<number>();
  for (const e of events) {
    if (e.type !== 'fused') continue;
    const [p, q] = e.parents;
    consumed.add(p.id).add(q.id);
    if (p.id === drop.mover.id) fusedWith.add(q.id);
    if (q.id === drop.mover.id) fusedWith.add(p.id);
  }
  for (const c of drop.contacts) {
    const tested = fusedWith.has(c.id) || (!consumed.has(drop.mover.id) && !consumed.has(c.id) && c.grace === 0);
    if (tested) tried.add(pairKey(drop.mover.type, c.type));
  }
}

/** The kids a drag's drop really touches. */
function dropContacts(commands: Command[]): number[] {
  const drop = commands.find((c) => c.type === 'drop');
  return drop?.type === 'drop' ? (drop.touching ?? []) : [];
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

/** The food the most kids on the map love (D-058), for a new field; the first food if none. */
function favouriteOfMost(game: Game, content: Content): string {
  const votes = new Map<string, number>();
  for (const k of game.state.world.kids) {
    const fav = content.personality[k.type]?.favouriteFood;
    if (fav) votes.set(fav, (votes.get(fav) ?? 0) + 1);
  }
  let best = content.balance.feeding.foods[0]!.id;
  let most = 0;
  for (const f of content.balance.feeding.foods) {
    const n = votes.get(f.id) ?? 0;
    if (n > most) {
      best = f.id;
      most = n;
    }
  }
  return best;
}

/**
 * One bite for an unhappy kid on the map (D-056): the earner with the most income first, its
 * favourite if stored, else any stored food it doesn't hate. Null if none can be fed.
 */
function feeding(game: Game, content: Content): Command | null {
  const pantry = game.state.pantry;
  const kids = game.state.world.kids.filter((k) => !k.happy).sort((a, b) => game.incomeOfKid(b) - game.incomeOfKid(a) || a.id - b.id);
  for (const k of kids) {
    const likes = content.personality[k.type];
    if (likes && (pantry[likes.favouriteFood] ?? 0) > 0) return { type: 'feed', kidId: k.id, food: likes.favouriteFood };
    const food = content.balance.feeding.foods.find((f) => (pantry[f.id] ?? 0) > 0 && f.id !== likes?.hatedFood);
    if (food) return { type: 'feed', kidId: k.id, food: food.id };
  }
  return null;
}

/**
 * The bot's shopping: Compendium once 6 kids are known, then the cheapest of Garden,
 * Capacity, the next plot and (farming) the next field.
 */
function purchase(game: Game, farm = true): Command | null {
  const s = game.state;
  const afford = (b: BuildingId) => {
    const c = game.upgradeCost(b);
    return c !== null && s.materials >= c ? c : null;
  };
  if (s.buildings.compendium === 0 && s.discoveredKids.length >= 6 && afford('compendium') !== null) return { type: 'upgrade', building: 'compendium' };
  // The cheapest affordable of Garden, Capacity and the next plot.
  const plot = game.plotUnlockCost;
  const options: { c: number; cmd: Command }[] = (['garden', 'capacity'] as const).flatMap((b) => {
    const c = afford(b);
    return c === null ? [] : [{ c, cmd: { type: 'upgrade', building: b } as Command }];
  });
  if (plot !== null && s.materials >= plot) options.push({ c: plot, cmd: { type: 'unlockPlot' } });
  const field = farm ? game.fieldUnlockCost : null;
  if (field !== null && s.materials >= field) options.push({ c: field, cmd: { type: 'unlockField' } });
  options.sort((x, y) => x.c - y.c);
  return options[0]?.cmd ?? null;
}

/** Median of the non-null values, or null if most runs never got there. */
export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length * 2 < values.length) return null;
  return v[Math.floor(v.length / 2)]!;
}

