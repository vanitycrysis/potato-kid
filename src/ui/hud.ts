import type { Content } from '../content/types';
import type { GameEvent } from '../sim/game';
import type { MapScene } from '../render/scene';

/**
 * Minimal DOM HUD for the first playable (D-022): population vs capacity,
 * the Garden's spawn timer, and a toast on first discovery. Currencies,
 * buildings and the Dex arrive in M3.
 */
export class Hud {
  private readonly root = document.createElement('div');
  private readonly count = document.createElement('span');
  private readonly bar = document.createElement('div');
  private readonly toast = document.createElement('div');
  private toastTimer: number | undefined;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
  ) {
    this.root.className = 'hud';
    this.count.className = 'hud-count';
    const track = document.createElement('div');
    track.className = 'hud-track';
    track.setAttribute('aria-label', 'Next spawn');
    this.bar.className = 'hud-bar';
    track.appendChild(this.bar);
    this.toast.className = 'toast';
    this.toast.setAttribute('role', 'status');
    this.root.append(this.count, track);
    document.body.append(this.root, this.toast);
    this.render();
    scene.onEvent = (e) => this.onEvent(e);
    const tick = () => {
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private render(): void {
    const g = this.scene.game;
    this.count.textContent = `${g.state.world.kids.length} / ${g.capacity} kids`;
    this.bar.style.width = `${(g.state.spawnProgress / g.interval) * 100}%`;
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'fused' && e.firstDiscovery) {
      const name = this.content.kids.find((k) => k.id === e.child.type)?.name ?? e.child.type;
      this.showToast(`New discovery: ${name}!`);
    }
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2500);
  }
}
