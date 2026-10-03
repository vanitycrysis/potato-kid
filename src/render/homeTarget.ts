// The Send home drop target (D-048, docs/GUI_MVP.md §13.1, Codex's design): a fixed
// rectangle over the Garden, armed only by a continuous dwell of the raw pointer while the
// camera holds still. Pure, so its rules are unit-tested.

export type HomeState = 'hidden' | 'shown' | 'waiting' | 'ready';

export interface HomeSpec {
  /** [left, top, right, bottom] relative to the Garden's world ground point. */
  rectRelativeWorld: [number, number, number, number];
  dwellMs: number;
  minimumProjectedSidePx: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class HomeTarget {
  readonly rect: Rect;
  private since: number | null = null;
  private current: HomeState = 'hidden';

  constructor(
    garden: { x: number; y: number },
    private readonly spec: HomeSpec,
  ) {
    const [l, t, r, b] = spec.rectRelativeWorld;
    this.rect = { minX: garden.x + l, minY: garden.y + t, maxX: garden.x + r, maxY: garden.y + b };
  }

  get state(): HomeState {
    return this.current;
  }

  /** All four edges count as inside (inclusive), as the spec requires. */
  contains(p: { x: number; y: number }): boolean {
    const r = this.rect;
    return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
  }

  /**
   * One frame. `now` is foreground time in ms (it must not advance while the app is
   * hidden). `eligible`: a kid is held and the whole target is usable on screen.
   * `cameraMoved`: the view moved since the last frame, which restarts the dwell, so a
   * target that scrolls under a still finger never arms by itself.
   */
  update(now: number, eligible: boolean, point: { x: number; y: number } | null, cameraMoved: boolean): HomeState {
    if (!eligible || !point) {
      this.since = null;
      return (this.current = eligible ? 'shown' : 'hidden');
    }
    if (!this.contains(point)) {
      this.since = null;
      return (this.current = 'shown');
    }
    if (this.since === null || cameraMoved) this.since = now;
    return (this.current = now - this.since >= this.spec.dwellMs ? 'ready' : 'waiting');
  }

  /** Release check, re-evaluated at pointerup with the release point (§13.1). */
  releases(now: number, eligible: boolean, point: { x: number; y: number }): boolean {
    return eligible && this.since !== null && this.contains(point) && now - this.since >= this.spec.dwellMs;
  }

  /** Cancel, eligibility loss, lifecycle: the dwell starts over. */
  reset(): void {
    this.since = null;
    this.current = 'hidden';
  }
}
