import type { SettingsStore } from '../save/settings';
import type { GameEvent } from '../sim/game';
import { cueFor, SpawnLimiter, type Cue } from './cues';

// The audio runtime (ART_AUDIO_PLAN audio section). Codex's cues and the 72 s music loop
// are decoded into Web Audio buffers. The music loops on a buffer source, which is
// sample-accurate: a looping media element (what we had first) seeks back at its end and
// left a gap on the owner's device, and the WebView could pause it with nothing to start
// it again (gate 4). The decoded loop holds ~28 MB of PCM at 48 kHz; that is the price of
// a seamless loop. Nothing plays until the first gesture (browsers and WebViews require
// one); a failure stays silent.

const urls = import.meta.glob<string>('../../assets/audio/*.{ogg,m4a}', { query: '?url', import: 'default', eager: true });

const CUES: Cue[] = ['sfx_ui_tap', 'sfx_pick_up', 'sfx_place', 'sfx_spawn', 'sfx_fusion', 'sfx_discovery', 'sfx_upgrade', 'sfx_spend', 'sfx_plant'];

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
  private readonly musicUrl: string | undefined;
  private musicGain: GainNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicNode: AudioBufferSourceNode | null = null;
  /** Where in the loop the music is (seconds) when musicStartedAt was taken. */
  private musicOffset = 0;
  /** The context time the current music node started at. */
  private musicStartedAt = 0;
  private readonly limiter = new SpawnLimiter();
  private readonly ext = pickExt();
  private unlocked = false;
  private hidden = false;
  /** Sources still sounding: stopped, not frozen, when the app hides. */
  private readonly active = new Set<AudioBufferSourceNode>();
  /** The cues played, most recent last (tests). */
  readonly played: Cue[] = [];

  constructor(private readonly settings: SettingsStore) {
    this.musicUrl = this.url('music_garden');
    settings.onChange(() => this.apply());
    // A gesture unlocks audio, and it is the first moment music may start. Only the
    // *ending* of a touch grants user activation (pointerup/touchend), not pointerdown;
    // every gesture retries, since one without activation (e.g. Escape) can leave a
    // resume pending forever. The context's own state change marks it unlocked (Codex
    // review, PR #53). After that, a gesture wakes a context the system suspended while
    // the game was in front (a call, another app taking audio focus), which nothing else
    // would restart (gate 4: the music sometimes stopped).
    const events = ['pointerup', 'touchend', 'keydown', 'click'] as const;
    const gesture = () => (this.unlocked ? this.wake() : this.tryUnlock());
    for (const ev of events) window.addEventListener(ev, gesture, true);
    // A tap on a GUI button (not the world) gets the soft UI cue, unless its action has
    // its own success sound (data-cue="success"), which then plays alone.
    document.addEventListener('click', (e) => {
      const button = (e.target as Element | null)?.closest?.('button');
      if (button && (button as HTMLElement).dataset.cue !== 'success') this.play('sfx_ui_tap');
    });
  }

  /** Test hook: what the runtime is doing. */
  get state(): {
    unlocked: boolean;
    musicPlaying: boolean;
    /** The playing loop: its length and where in it the music is now (seconds). */
    music: { loop: boolean; seconds: number; sampleRate: number; at: number } | null;
    lastCue: Cue | null;
    played: Cue[];
    active: number;
  } {
    const node = this.musicNode;
    return {
      unlocked: this.unlocked,
      musicPlaying: !!node && !this.hidden && this.ctx?.state === 'running',
      music: node?.buffer
        ? { loop: node.loop, seconds: node.buffer.duration, sampleRate: node.buffer.sampleRate, at: this.musicPosition() }
        : null,
      lastCue: this.played[this.played.length - 1] ?? null,
      played: [...this.played],
      active: this.active.size,
    };
  }

  /** A kid press resolved (the scene's gesture): a drag picks up, a tap is a UI tap. */
  gesture(kind: 'drag' | 'tap'): void {
    this.play(kind === 'drag' ? 'sfx_pick_up' : 'sfx_ui_tap');
  }

  /** A sim step: its one cue (see cueFor). */
  onStep(events: GameEvent[]): void {
    const cue = cueFor(events);
    if (cue) this.play(cue);
  }

  /**
   * The app is hidden: effects stop (they don't resume later); the music pauses with the
   * suspended context and carries on from the same sample when it resumes.
   */
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
        this.musicGain = this.ctx.createGain();
        this.musicGain.connect(this.ctx.destination);
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

  /** Tests: the system suspends the context while the game is in front (a call). */
  debugInterrupt(): void {
    void this.ctx?.suspend().catch(() => {});
  }

  /** A gesture while unlocked: resume a context the system suspended under us. */
  private wake(): void {
    if (this.hidden || !this.ctx || this.ctx.state === 'running') return;
    void this.ctx.resume().catch(() => {});
  }

  /** The context runs: unlocked for good; the cues and then the music load. */
  private onRunning(): void {
    if (this.unlocked || this.ctx?.state !== 'running') return;
    this.unlocked = true;
    this.apply();
    void Promise.all(
      CUES.map(async (cue) => {
        const buffer = await this.load(this.url(cue));
        if (buffer) this.buffers.set(cue, buffer);
      }),
    ).then(async () => {
      // The music after the cues: it is the big decode, and the cues are what a tap hears.
      this.musicBuffer = await this.load(this.musicUrl);
      this.apply();
    });
  }

  /** Fetches and decodes one file; null (silence) if anything fails. */
  private async load(url: string | undefined): Promise<AudioBuffer | null> {
    if (!url || !this.ctx) return null;
    try {
      const data = await (await fetch(url)).arrayBuffer();
      return await this.ctx.decodeAudioData(data);
    } catch {
      return null;
    }
  }

  /** Settings → volumes and music state (On/Off, Music %, Sound effects %). */
  private apply(): void {
    const s = this.settings.value;
    if (this.sfx) this.sfx.gain.value = s.audio ? s.sfx / 100 : 0;
    if (this.musicGain) this.musicGain.gain.value = Math.min(1, Math.max(0, s.music / 100));
    const want = this.unlocked && !this.hidden && s.audio && s.music > 0;
    if (want && !this.musicNode) this.startMusic();
    else if (!want && this.musicNode) this.stopMusic();
  }

  /** Starts the loop where it last stopped. */
  private startMusic(): void {
    if (!this.ctx || !this.musicGain || !this.musicBuffer) return;
    try {
      const node = this.ctx.createBufferSource();
      node.buffer = this.musicBuffer;
      node.loop = true;
      node.connect(this.musicGain);
      node.start(0, this.musicOffset);
      this.musicStartedAt = this.ctx.currentTime;
      this.musicNode = node;
    } catch {
      // Audio is optional.
    }
  }

  /** Where in the loop the music is (seconds). Context time stands still while suspended. */
  private musicPosition(): number {
    const length = this.musicBuffer?.duration ?? 0;
    if (!this.ctx || !this.musicNode || length <= 0) return this.musicOffset;
    return (this.musicOffset + this.ctx.currentTime - this.musicStartedAt) % length;
  }

  /** Stops the loop, remembering where it was. */
  private stopMusic(): void {
    const node = this.musicNode;
    if (!node) return;
    this.musicOffset = this.musicPosition();
    try {
      node.stop();
    } catch {
      // already stopped
    }
    node.disconnect();
    this.musicNode = null;
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
