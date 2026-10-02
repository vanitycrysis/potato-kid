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
  attach(
    doc: Pick<Document, 'hidden' | 'addEventListener'> = document,
    win: Pick<Window, 'addEventListener'> = window,
    native: NativeApp | null = Capacitor.isNativePlatform() ? App : null,
  ): void {
    // Counts signals, so a slow initial state reply can't undo a newer one.
    let signals = 0;
    const on = (fn: () => void) => () => {
      signals++;
      fn();
    };
    doc.addEventListener('visibilitychange', on(() => (doc.hidden ? this.suspend() : this.resume())));
    win.addEventListener('pagehide', on(() => this.suspend()));
    win.addEventListener(
      'pageshow',
      on(() => {
        if (!doc.hidden) this.resume();
      }),
    );
    if (doc.hidden) this.suspend();
    if (native) {
      void native.addListener('pause', on(() => this.suspend()));
      void native.addListener('resume', on(() => this.resume()));
      const asked = signals;
      // A reply that arrives after any newer signal is stale: ignore it (Codex review, PR #31).
      void native.getState().then(({ isActive }) => {
        if (signals === asked) {
          if (isActive) this.resume();
          else this.suspend();
        }
      });
    }
  }
}

/** The part of Capacitor's App plugin the coordinator uses (injectable for tests). */
export interface NativeApp {
  addListener(event: 'pause' | 'resume', fn: () => void): Promise<unknown>;
  getState(): Promise<{ isActive: boolean }>;
}
