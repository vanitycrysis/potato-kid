import type { Content } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent } from '../sim/game';
import { refusalText } from './feedback';
import { formatClock, formatExact } from './format';
import { el, icon } from './dom';

/**
 * The Garden sheet's first section (GUI_MVP §19.2): who is on the map, when the next kid
 * arrives, and Spawn now. They left the HUD so the world gets the screen (D-070). Every
 * visual decision is Codex's (D-036); this class implements it.
 */
export class Arrivals {
  readonly heading = el('h3', 'sheet-section garden-section-heading', 'Arrivals');
  readonly node: HTMLElement;
  private readonly population = el('p', 'sheet-body-text arrivals-population');
  private readonly next = el('p', 'sheet-body-text arrivals-next');
  private readonly track = el('div', 'hud-track arrivals-track');
  private readonly bar = el('div', 'hud-bar');
  private readonly spawn = el('button', 'ui-button ui-primary arrivals-spawn');
  private readonly spawnCost = el('span', 'hud-spawn-cost');
  private readonly reason = el('p', 'sheet-helper arrivals-reason');
  /** An instant spawn sent and not yet answered: one at a time. */
  private inflight = false;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly readOnly: () => boolean,
  ) {
    this.heading.id = 'garden-arrivals';
    this.heading.tabIndex = -1;
    this.track.append(this.bar);
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-label', 'Next kid');
    this.spawn.type = 'button';
    this.spawn.dataset.cue = 'success'; // the spawn cue is its sound
    this.spawn.append(el('span', 'hud-spawn-label', 'Spawn now'), el('span', 'hud-spawn-price', icon('icon_potatokens', '', 'ui-icon-18'), this.spawnCost));
    this.spawn.addEventListener('click', () => this.instantSpawn());
    this.node = el('section', 'garden-arrivals', this.heading, this.population, this.next, this.track, this.spawn, this.reason);
  }

  private state(): { ok: boolean; reason: string } {
    const g = this.scene.game;
    const cost = this.content.balance.economy.instantSpawnPotatokens;
    if (this.readOnly()) return { ok: false, reason: 'Update the game to continue.' };
    if (g.state.world.kids.length >= g.capacity) return { ok: false, reason: refusalText('full', 'instantSpawn') };
    if (g.state.potatokens < cost) return { ok: false, reason: refusalText('cost', 'instantSpawn', 'potatokens') };
    return { ok: !this.inflight, reason: '' };
  }

  private instantSpawn(): void {
    // A disabled control sends nothing; only a valid tap is dispatched, one at a time.
    if (!this.state().ok) return;
    this.inflight = true;
    this.scene.command({ type: 'instantSpawn' });
  }

  /** A step's events: an instant spawn's answer frees the button. */
  onStep(events: GameEvent[]): void {
    for (const e of events) {
      if ((e.type === 'spawned' && e.source === 'instant') || (e.type === 'rejected' && e.command === 'instantSpawn')) this.inflight = false;
    }
  }

  update(): void {
    const g = this.scene.game;
    const s = g.state;
    const onMap = s.world.kids.length;
    const full = onMap >= g.capacity;
    this.population.textContent = `${onMap} of ${g.capacity} kids on the map`;
    const clock = formatClock(Math.max(0, g.interval - s.spawnProgress));
    this.next.textContent = full ? 'Map is full. Spawning resumes when there is room.' : g.waitingForRoom ? 'Waiting for a clear spot by the Garden.' : `Next kid ${clock}`;
    this.track.hidden = full || g.waitingForRoom;
    this.bar.style.width = `${Math.min(1, s.spawnProgress / g.interval) * 100}%`;
    const cost = this.content.balance.economy.instantSpawnPotatokens;
    this.spawnCost.textContent = formatExact(cost);
    const st = this.state();
    this.spawn.setAttribute('aria-disabled', String(!st.ok));
    this.spawn.classList.toggle('is-disabled', !st.ok);
    this.spawn.setAttribute('aria-label', st.reason ? `Spawn now: ${st.reason}` : `Spawn a random Garden kid for ${formatExact(cost)} Potatokens`);
    this.reason.textContent = st.reason;
    this.reason.hidden = !st.reason;
  }
}
