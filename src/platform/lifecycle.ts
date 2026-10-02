import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export interface LifecycleHooks {
  /** The app went away: settle the sim, save, stop ticking. */
  suspend(): void;
  /** The app came back at wall-clock `now` (ms): credit the absence once, restart. */
  resume(now: number): void;
}

/**
 * The one lifecycle coordinator (ENGINEERING_PLAN.md §3). Browser and native signals
 * (visibilitychange, pagehide/pageshow, Capacitor pause/resume) all funnel into one
 * `active | suspended` state, so duplicates never reach the hooks: a second resume while
 * active does nothing, which is what keeps offline time from being credited twice.
 */
export class Lifecycle {
  private stateValue: 'active' | 'suspended' = 'active';

  constructor(
    private readonly hooks: LifecycleHooks,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get state(): 'active' | 'suspended' {
    return this.stateValue;
  }

  suspend(): void {
    if (this.stateValue === 'suspended') return;
    this.stateValue = 'suspended';
    this.hooks.suspend();
  }

  resume(): void {
    if (this.stateValue === 'active') return;
    this.stateValue = 'active';
    this.hooks.resume(this.now());
  }

  /**
   * Listens to every platform signal, and adopts the current state: the app may have been
   * hidden while boot was still loading, before any listener existed. Without this, that
   * absence would never be credited (Codex review, PR #31).
   */
  attach(doc: Pick<Document, 'hidden' | 'addEventListener'> = document, win: Pick<Window, 'addEventListener'> = window): void {
    doc.addEventListener('visibilitychange', () => (doc.hidden ? this.suspend() : this.resume()));
    win.addEventListener('pagehide', () => this.suspend());
    win.addEventListener('pageshow', () => {
      if (!doc.hidden) this.resume();
    });
    if (doc.hidden) this.suspend();
    if (Capacitor.isNativePlatform()) {
      void App.addListener('pause', () => this.suspend());
      void App.addListener('resume', () => this.resume());
      void App.getState().then(({ isActive }) => (isActive ? this.resume() : this.suspend()));
    }
  }
}
