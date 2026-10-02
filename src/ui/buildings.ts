import { kidRig } from '../content/artData';
import type { BuildingId, Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent } from '../sim/game';
import { el, icon, shortName } from './dom';
import { refusalText } from './feedback';
import { formatExact, formatInterval } from './format';
import { portrait } from './portrait';
import type { Sheets } from './sheet';

// Garden, Capacity and Spawn bias sheets (docs/GUI_MVP.md §§4-5, Codex's design, D-036).
// Each sheet is built once and updated in place every frame, so focus is never lost; the
// command a sheet sent is kept, because refusals carry no context (GUI_MVP §9).

const SUCCESS_MS = 2000;

type Pending = { type: 'upgrade'; building: BuildingId } | { type: 'setBias'; kidType: KidId | null };

interface Controller {
  update(): void;
}

export class BuildingSheets {
  private pending: Pending | null = null;
  private success: { text: string; until: number } | null = null;
  private refusal: string | null = null;
  private controller: Controller | null = null;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly sheets: Sheets,
  ) {}

  /** Opens a building's sheet (Garden, Capacity or Bias). */
  open(building: Exclude<BuildingId, 'compendium'>, launcher: HTMLElement | null): void {
    this.pending = null;
    this.success = null;
    this.refusal = null;
    const spec = building === 'bias' ? this.biasSheet() : this.levelSheet(building);
    const sheet = this.sheets.open(
      {
        key: building,
        icon: `icon_${building}`,
        title: spec.title,
        requestedHeight: building === 'bias' ? 624 : 440,
        update: () => this.controller?.update(),
        onClose: () => (this.controller = null),
      },
      launcher,
    );
    this.controller = spec.mount(sheet.body, sheet.footer, (t) => sheet.setSubtitle(t));
    this.controller.update();
  }

  /**
   * A sim step's events: completes this sheet's pending command. Returns the refusals it
   * showed in the sheet, so world feedback doesn't repeat them.
   */
  onStep(events: GameEvent[]): GameEvent[] {
    if (!this.pending) return [];
    const p = this.pending;
    const handled: GameEvent[] = [];
    for (const e of events) {
      if (p.type === 'upgrade' && e.type === 'upgraded' && e.building === p.building) {
        this.pending = null;
        this.refusal = null;
        const name = p.building === 'garden' ? 'Garden' : p.building === 'capacity' ? 'Capacity' : 'Spawn bias';
        this.success = { text: `${name} is now level ${e.level}.`, until: performance.now() + SUCCESS_MS };
      } else if (p.type === 'setBias' && e.type === 'biasSet') {
        this.pending = null;
        this.refusal = null;
        const k = e.kidType;
        const text = k === null ? 'Bias cleared.' : this.discovered(k) ? `Bias set to ${shortName(this.name(k))}.` : 'Bias set to this seed.';
        this.success = { text, until: performance.now() + SUCCESS_MS };
      } else if (e.type === 'rejected' && e.command === p.type) {
        this.pending = null;
        this.success = null;
        this.refusal = refusalText(e.reason, e.command, p.type === 'upgrade' ? 'materials' : undefined);
        handled.push(e);
      }
    }
    return handled;
  }

  private send(cmd: Pending): void {
    // One command at a time; nothing optimistic (GUI_MVP §4).
    if (this.pending) return;
    this.pending = cmd;
    this.refusal = null;
    this.scene.command(cmd);
  }

  private get game() {
    return this.scene.game;
  }

  private name(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  private discovered(type: KidId): boolean {
    return this.game.state.discoveredKids.includes(type);
  }

  /** The inline row under the body: a success for 2 s, or the latest refusal. */
  private statusRow(): { row: HTMLElement; update(): void } {
    const text = el('span', 'sheet-status-text');
    const mark = el('span', 'sheet-status-icon');
    const row = el('div', 'sheet-status', mark, text);
    row.setAttribute('role', 'status');
    let shown = '';
    return {
      row,
      update: () => {
        const ok = this.success && this.success.until > performance.now() ? this.success.text : '';
        if (!ok) this.success = null;
        const msg = this.refusal ?? ok;
        const key = `${this.refusal ? 'r' : 'o'}${msg}`;
        if (key === shown) return;
        shown = key;
        row.hidden = !msg;
        text.textContent = msg;
        mark.replaceChildren(icon(this.refusal ? 'icon_warning' : 'icon_check', '', 'ui-icon-24'));
        // On a short sheet the row may sit below the visible body: bring it into view, or a
        // refusal (or a 2 s success) would go unseen (Codex review, PR #39).
        if (msg) row.scrollIntoView({ block: 'nearest' });
      },
    };
  }

  /** The footer action: a two-line button (label; Materials icon + exact cost). */
  private action(onClick: () => void): { button: HTMLButtonElement; set(label: string, cost: number | null, enabled: boolean, primary: boolean): void } {
    const label = el('span', 'action-label');
    const costText = el('span', '');
    const price = el('span', 'action-price', icon('icon_materials', '', 'ui-icon-18'), costText);
    const button = el('button', 'ui-button sheet-action', label, price);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') onClick();
    });
    return {
      button,
      set: (l, cost, enabled, primary) => {
        label.textContent = l;
        price.hidden = cost === null;
        costText.textContent = cost === null ? '' : formatExact(cost);
        button.setAttribute('aria-disabled', String(!enabled));
        button.classList.toggle('is-disabled', !enabled);
        button.classList.toggle('ui-primary', enabled && primary);
        button.setAttribute('aria-label', cost === null ? l : `${l}, ${formatExact(cost)} Materials`);
      },
    };
  }

  /** Garden and Capacity (GUI_MVP §4). */
  private levelSheet(building: 'garden' | 'capacity') {
    const title = building === 'garden' ? 'Garden' : 'Capacity';
    const intro =
      building === 'garden'
        ? ['Kids arrive here on their own.', 'Upgrades make the wait shorter.']
        : ['A little more room to wander.', 'Upgrades add space for more kids.'];
    return {
      title,
      mount: (body: HTMLElement, footer: HTMLElement, setSubtitle: (t: string) => void): Controller => {
        const nowValue = el('span', 'compare-value');
        const nextLabel = el('span', 'compare-label', 'Next level');
        const nextValue = el('span', 'compare-value');
        const card = el(
          'div',
          'compare ui-surface',
          el('div', 'compare-row', el('span', 'compare-label', 'Now'), nowValue),
          el('div', 'compare-row', nextLabel, nextValue),
        );
        const costText = el('span', '');
        const cost = el('div', 'sheet-cost', icon('icon_materials', '', 'ui-icon-24'), costText);
        const holding = el('p', 'sheet-body-text');
        const helper = el('p', 'sheet-helper');
        const maxed = el('div', 'sheet-cost', icon('icon_check', '', 'ui-icon-24'), 'This building is fully upgraded.');
        const status = this.statusRow();
        body.append(el('p', 'sheet-body-text sheet-intro', intro[0]!, el('br', ''), intro[1]!), card, cost, holding, helper, maxed, status.row);
        const act = this.action(() => this.send({ type: 'upgrade', building }));
        footer.append(act.button);
        return {
          update: () => {
            const g = this.game;
            const b = this.content.balance.buildings[building];
            const level = g.state.buildings[building];
            const price = g.upgradeCost(building);
            const max = price === null;
            const e = this.content.balance.economy;
            setSubtitle(`Level ${level} / ${b.maxLevel}`);
            if (building === 'garden') {
              nowValue.textContent = `Every ${formatInterval(g.interval)}`;
              nextValue.textContent = max ? '' : `Every ${formatInterval(g.interval * e.gardenIntervalFactor)}`;
            } else {
              nowValue.textContent = `${g.capacity} kids`;
              nextValue.textContent = max ? '' : `${g.capacity + e.capacityPerLevel} kids`;
            }
            nextLabel.textContent = max ? 'Maximum reached' : 'Next level';
            cost.hidden = max;
            holding.hidden = max;
            helper.hidden = max;
            maxed.hidden = !max;
            const have = g.state.materials;
            if (!max) {
              costText.textContent = `Cost: ${formatExact(price)}`;
              holding.textContent = `You have ${formatExact(have)} Materials.`;
              helper.textContent = have < price ? `Need ${formatExact(Math.ceil(price - have))} more Materials.` : 'Upgrades happen right away.';
            }
            const waiting = this.pending?.type === 'upgrade';
            if (max) act.set('Maximum level reached', null, false, false);
            else act.set(waiting ? 'Upgrading…' : `Upgrade to level ${level + 1}`, price, !waiting && have >= price, true);
            status.update();
          },
        };
      },
    };
  }

  /** Spawn bias: upgrade and seed picker in one sheet (GUI_MVP §5). */
  private biasSheet() {
    return {
      title: 'Spawn bias',
      mount: (body: HTMLElement, footer: HTMLElement, setSubtitle: (t: string) => void): Controller => {
        const nowValue = el('span', 'compare-value');
        const nextLabel = el('span', 'compare-label', 'Next level');
        const nextValue = el('span', 'compare-value');
        const card = el(
          'div',
          'compare compare-short ui-surface',
          el('div', 'compare-row', el('span', 'compare-label', 'Seed weight now'), nowValue),
          el('div', 'compare-row', nextLabel, nextValue),
        );
        const grid = el('div', 'seed-grid');
        grid.setAttribute('role', 'radiogroup');
        grid.setAttribute('aria-label', 'Choose a seed');
        // The pool in content order; never hard-coded (GUI_MVP §5).
        const pool = Object.keys(this.content.balance.spawnWeights);
        const cards = pool.map((type, i) => {
          const b = el('button', 'ui-button seed-card');
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.addEventListener('click', () => this.pick(type));
          grid.append(b);
          return { type, b, ordinal: i + 1, shownAs: '' };
        });
        const none = el('button', 'ui-button seed-none', icon('icon_none', '', 'ui-icon-24'), el('span', '', 'None · normal mix'));
        none.type = 'button';
        none.setAttribute('role', 'radio');
        none.addEventListener('click', () => this.pick(null));
        const choice = el('p', 'sheet-helper');
        const status = this.statusRow();
        body.append(card, el('p', 'sheet-helper', 'Favours one seed; other kids can still arrive.'), el('h3', 'sheet-section', 'Choose a seed'), grid, none, choice, status.row);
        const short = el('p', 'sheet-helper footer-helper');
        const act = this.action(() => this.send({ type: 'upgrade', building: 'bias' }));
        footer.append(short, act.button);
        return {
          update: () => {
            const g = this.game;
            const level = g.state.buildings.bias;
            const max = this.content.balance.buildings.bias.maxLevel;
            const per = this.content.balance.economy.biasWeightPerLevel;
            const price = g.upgradeCost('bias');
            const mult = (l: number) => `×${(1 + per * l).toFixed(1)}`;
            setSubtitle(`Level ${level} / ${max}`);
            nowValue.textContent = level === 0 ? 'Not built' : mult(level);
            nextLabel.textContent = price === null ? 'Maximum reached' : 'Next level';
            nextValue.textContent = price === null ? '' : mult(level + 1);
            const built = level > 0;
            const target = g.state.biasTarget;
            const busy = this.pending !== null;
            for (const c of cards) {
              const known = this.discovered(c.type);
              const want = known ? 'k' : 'u';
              if (c.shownAs !== want) {
                c.shownAs = want;
                // An undiscovered seed shows only the packet: no name, tier or costume.
                c.b.replaceChildren(
                  known ? portrait(kidRig!, c.type, 48) : icon('icon_unknown', '', 'ui-icon-48'),
                  el('span', 'seed-name', known ? shortName(this.name(c.type)) : 'Unknown seed'),
                  el('span', 'seed-check'),
                );
              }
              const selected = target === c.type;
              c.b.setAttribute('aria-checked', String(selected));
              c.b.classList.toggle('is-selected', selected);
              (c.b.querySelector('.seed-check') as HTMLElement).replaceChildren(...(selected ? [icon('icon_check', '', 'ui-icon-20')] : []));
              const label = known ? this.name(c.type) : `Unknown seed ${c.ordinal}`;
              c.b.setAttribute('aria-label', selected ? `${label}, selected` : label);
              const enabled = built && !busy;
              c.b.setAttribute('aria-disabled', String(!enabled));
              c.b.classList.toggle('is-disabled', !built);
            }
            none.setAttribute('aria-checked', String(target === null));
            none.classList.toggle('is-selected', target === null);
            none.setAttribute('aria-disabled', String(!built || busy));
            none.classList.toggle('is-disabled', !built);
            choice.textContent = !built
              ? 'Build Spawn bias to choose a seed.'
              : target === null
                ? 'No seed favoured. All weights are normal.'
                : this.discovered(target)
                  ? `Selected seed: ${shortName(this.name(target))}. Weight ${mult(level)}.`
                  : 'An unknown seed is favoured.';
            const have = g.state.materials;
            const waiting = this.pending?.type === 'upgrade';
            short.hidden = price === null || have >= price;
            if (price !== null && have < price) short.textContent = `Need ${formatExact(Math.ceil(price - have))} more Materials.`;
            if (price === null) act.set('Maximum level reached', null, false, false);
            else act.set(waiting ? 'Upgrading…' : level === 0 ? 'Build Spawn bias' : `Upgrade bias to level ${level + 1}`, price, !waiting && have >= price, true);
            status.update();
          },
        };
      },
    };
  }

  /** Bias choice: the UI never sends a predicted refusal (level 0) or a no-op. */
  private pick(type: KidId | null): void {
    if (this.game.state.buildings.bias < 1 || this.pending || this.game.state.biasTarget === type) return;
    this.send({ type: 'setBias', kidType: type });
  }
}
