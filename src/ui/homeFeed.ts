import type { Content, KidId } from '../content/types';
import type { GameEvent, RejectReason } from '../sim/game';
import { refusalText } from './feedback';
import type { PlantingNotes } from './plantingNotes';

// The Dex's planting feed (D-061, GUI_MVP §15.6; it began as Send home's, §13.3-13.4): the
// outstanding add and the inline
// messages, owned by the Dex so they outlive any one detail (Codex review, PR #54). Pure:
// no DOM, so its timing rules are unit-tested.

/** What the feed needs from the scene. */
export interface FeedScene {
  command(cmd: { type: 'plant'; kidIds: number[]; plot: number }): void;
}

/** A refusal of an add to the plot the player chose (GUI_MVP §15.3): about that plot, not all of them. */
export function chosenPlotRefusal(reason: RejectReason): string {
  if (reason === 'plotsBusy') return 'This plot is already growing. Choose another plot.';
  if (reason === 'plotFull') return 'This plot is full. Review it to Start growing.';
  return refusalText(reason);
}

export interface Message {
  type: KidId;
  lines: () => string[];
  warn: boolean;
  first: boolean;
  /** Visible time still owed, ms. */
  ms: number;
  /** It has been on screen and readable (only then is a first explanation recorded). */
  read?: boolean;
}

/** The outcome of a send, for the section that made it. */
export interface SendResult {
  kidId: number;
  ok: boolean;
}

export class HomeFeed {
  /** One send at a time, wherever it was confirmed, until its result arrives. */
  pending: { kidId: number; type: KidId } | null = null;
  /** The Dex is open. A result arriving after it closed is consumed, with no message. */
  active = false;
  private readonly queue: Message[] = [];
  private current: Message | null = null;
  private last = performance.now();
  private listener: ((r: SendResult) => void) | null = null;

  constructor(
    private readonly scene: FeedScene,
    private readonly content: Content,
    private readonly notes: PlantingNotes,
  ) {}

  private name(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  /** The open section's hook for results (one at a time). */
  listen(fn: ((r: SendResult) => void) | null): void {
    this.listener = fn;
  }

  /** Adds one kid to the plot the player chose: never another plot (§15.6). */
  send(kidId: number, type: KidId, plot: number): void {
    if (this.pending) return;
    this.pending = { kidId, type };
    this.scene.command({ type: 'plant', kidIds: [kidId], plot });
  }

  /** A step's events: the Dex answers its own sends, open detail or not (no world card). */
  onStep(events: GameEvent[]): GameEvent[] {
    const p = this.pending;
    if (!p) return [];
    const handled: GameEvent[] = [];
    for (const e of events) {
      if (e.type === 'planted' && e.kid.id === p.kidId) {
        this.pending = null;
        handled.push(e);
        // Closed meanwhile: answered (no world card) but nothing to show, and no
        // explanation reserved for a view that's gone (Codex review, PR #54).
        if (!this.active) continue;
        const first = this.notes.claimFirst();
        const name = this.name(p.type);
        const { plot, count } = e;
        this.queue.push({
          type: p.type,
          lines: () => [this.notes.heading(name, plot), ...(first ? this.notes.firstLines() : [this.notes.later(count)])],
          warn: false,
          first,
          ms: this.notes.visibleMs(first),
        });
        this.listener?.({ kidId: p.kidId, ok: true });
      } else if (e.type === 'rejected' && e.command === 'plant') {
        this.pending = null;
        handled.push(e);
        if (!this.active) continue;
        this.warn(p.type, e.reason);
        this.listener?.({ kidId: p.kidId, ok: false });
      }
    }
    return handled;
  }

  /** A refusal shows first; what it interrupted resumes after it, time intact. */
  warn(type: KidId, reason: RejectReason = 'gone'): void {
    if (this.current) this.queue.unshift(this.current);
    this.current = null;
    this.queue.unshift({ type, lines: () => [chosenPlotRefusal(reason)], warn: true, first: false, ms: this.notes.visibleMs(false) });
  }

  /**
   * One frame for the section showing `type`: the message to draw, or null. `onScreen`:
   * it can be seen, which records a first explanation as shown. Its time counts down only
   * while on screen and not `paused` (hovered or focused); frames stop when the app hides,
   * and a long gap counts at most 250 ms (Codex review, PR #54).
   */
  tick(type: KidId, now: number, onScreen: boolean, paused: boolean): Message | null {
    const dt = Math.min(250, Math.max(0, now - this.last));
    this.last = now;
    // Another kid's message waits for its own detail.
    if (this.current && this.current.type !== type) {
      this.queue.unshift(this.current);
      this.current = null;
    }
    if (this.current) {
      if (onScreen) {
        // A first explanation is recorded when it is first seen, not when queued or drawn
        // off screen; a pause doesn't make it unseen.
        if (this.current.first && !this.current.read) this.notes.markShown();
        this.current.read = true;
        if (!paused) this.current.ms -= dt;
      }
      if (this.current.ms > 0) return this.current;
      this.current = null;
    }
    // In order (FIFO): the earliest message for this kid type. Refusals go in at the
    // front, so they show at once.
    const at = this.queue.findIndex((m) => m.type === type);
    if (at < 0) return null;
    this.current = this.queue.splice(at, 1)[0]!;
    return this.current;
  }

  /**
   * The Dex closed: messages go, and an explanation never shown is freed for a later
   * success. An outstanding send stays owned, so its result still makes no world card.
   */
  clear(): void {
    if ([...this.queue, ...(this.current ? [this.current] : [])].some((m) => m.first && !m.read)) this.notes.release();
    this.queue.length = 0;
    this.current = null;
  }
}
