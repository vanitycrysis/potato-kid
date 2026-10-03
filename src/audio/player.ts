import type { SettingsStore } from '../save/settings';
import type { GameEvent } from '../sim/game';
import { cueFor, SpawnLimiter, type Cue } from './cues';

// The audio runtime (ART_AUDIO_PLAN audio section). Codex's cues are short, so they are
// decoded once into Web Audio buffers. The 72 s music loop is streamed through a looping
// media element instead: decoded, it would hold ~28 MB of PCM. Nothing plays until the
// first gesture (browsers and WebViews require one); a failure stays silent.

const urls = import.meta.glob<string>('../../assets/audio/*.{ogg,m4a}', { query: '?url', import: 'default', eager: true });

const CUES: Cue[] = ['sfx_ui_tap', 'sfx_pick_up', 'sfx_place', 'sfx_spawn', 'sfx_fusion', 'sfx_discovery', 'sfx_upgrade', 'sfx_spend'];

/** Ogg Vorbis where supported (Android WebView, Chromium, Firefox), else AAC. */
function pickExt(): 'ogg' | 'm4a' {
  try {
    return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
  } catch {
    return 'm4a';
  }
}

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private readonly buffers = new Map<Cue, AudioBuffer>();
  private readonly music: HTMLAudioElement | null;
  private readonly limiter = new SpawnLimiter();
  private readonly ext = pickExt();
  private unlocked = false;
  private gesture: () => void = () => {};
  private gestureEvents: readonly string[] = [];
  private hidden = false;
  /** Sources still sounding: stopped, not frozen, when the app hides. */
  private readonly active = new Set<AudioBufferSourceNode>();
  /** The cues played, most recent last (tests). */
  readonly played: Cue[] = [];

  constructor(private readonly settings: SettingsStore) {
    const src = this.url('music_garden');
    this.music = src ? new Audio(src) : null;
    if (this.music) {
      this.music.loop = true;
      this.music.preload = 'auto';
    }
    settings.onChange(() => this.apply());
    // A gesture unlocks audio, and it is the first moment music may start. Only the
    // *ending* of a touch grants user activation (pointerup/touchend), not pointerdown;
    // every gesture retries, since one without activation (e.g. Escape) can leave a
    // resume pending forever. The context's own state change marks it unlocked (Codex
    // review, PR #53).
    const events = ['pointerup', 'touchend', 'keydown', 'click'] as const;
    this.gesture = () => this.tryUnlock();
    this.gestureEvents = events;
    for (const ev of events) window.addEventListener(ev, this.gesture, true);
    // A tap on a GUI button (not the world) gets the soft UI cue, unless its action has
    // its own success sound (data-cue="success"), which then plays alone.
    document.addEventListener('click', (e) => {
      const button = (e.target as Element | null)?.closest?.('button');
      if (button && (button as HTMLElement).dataset.cue !== 'success') this.play('sfx_ui_tap');
    });
  }

  /** Test hook: what the runtime is doing. */
  get state(): { unlocked: boolean; musicPlaying: boolean; lastCue: Cue | null; played: Cue[]; active: number } {
    return {
      unlocked: this.unlocked,
      musicPlaying: !!this.music && !this.music.paused,
      lastCue: this.played[this.played.length - 1] ?? null,
      played: [...this.played],
      active: this.active.size,
    };
  }

  /** A sim step: its one cue (see cueFor). */
  onStep(events: GameEvent[]): void {
    const cue = cueFor(events);
    if (cue) this.play(cue);
  }

  /** The app is hidden: music pauses; effects stop (they don't resume later). */
  suspend(): void {
    this.hidden = true;
    for (const node of this.active) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    // Cleared here: once the context is suspended, onended can't arrive.
    this.active.clear();
    this.music?.pause();
    void this.ctx?.suspend().catch(() => {});
  }

  /** Back in front: resume what the settings allow. */
  resume(): void {
    this.hidden = false;
    if (this.unlocked) void this.ctx?.resume().catch(() => {});
    this.apply();
  }

  private url(name: string): string | undefined {
    return Object.entries(urls).find(([p]) => p.endsWith(`/${name}.${this.ext}`))?.[1];
  }

  /** One gesture's attempt: make the context once, then ask it to run. */
  private tryUnlock(): void {
    if (this.unlocked) return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.sfx = this.ctx.createGain();
        this.sfx.connect(this.ctx.destination);
        this.ctx.addEventListener('statechange', () => this.onRunning());
      }
      void this.ctx.resume().then(
        () => this.onRunning(),
        () => {},
      );
    } catch {
      // Audio is optional: a failed unlock leaves the game silent, never broken.
    }
  }

  /** The context runs: unlocked for good; music may start and the cues load. */
  private onRunning(): void {
    if (this.unlocked || this.ctx?.state !== 'running') return;
    this.unlocked = true;
    for (const ev of this.gestureEvents) window.removeEventListener(ev, this.gesture, true);
    this.apply();
    void Promise.all(
      CUES.map(async (cue) => {
        const u = this.url(cue);
        if (!u || !this.ctx) return;
        try {
          const data = await (await fetch(u)).arrayBuffer();
          this.buffers.set(cue, await this.ctx.decodeAudioData(data));
        } catch {
          // A cue that fails to load stays silent.
        }
      }),
    );
  }

  /** Settings → volumes and music state (On/Off, Music %, Sound effects %). */
  private apply(): void {
    const s = this.settings.value;
    if (this.sfx) this.sfx.gain.value = s.audio ? s.sfx / 100 : 0;
    if (!this.music) return;
    this.music.volume = Math.min(1, Math.max(0, s.music / 100));
    const want = this.unlocked && !this.hidden && s.audio && s.music > 0;
    if (want && this.music.paused) void this.music.play().catch(() => {});
    else if (!want && !this.music.paused) this.music.pause();
  }

  private play(cue: Cue): void {
    const s = this.settings.value;
    if (!this.ctx || !this.sfx || !s.audio || s.sfx === 0 || this.hidden) return;
    const buffer = this.buffers.get(cue);
    if (!buffer || !this.limiter.allow(cue, performance.now())) return;
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.sfx);
    node.onended = () => this.active.delete(node);
    this.active.add(node);
    node.start();
    this.played.push(cue);
    if (this.played.length > 20) this.played.shift();
  }
}
