import { uiData } from '../content/artData';
import type { Content } from '../content/types';
import type { GameEvent } from '../sim/game';
import type { MapScene } from '../render/scene';
import './hud.css';
// Patrick Hand (D-031), chosen by Codex, bundled locally under the SIL OFL (assets/PROVENANCE.md).
import fontUrl from '../../assets/fonts/patrick-hand/PatrickHand-Regular.ttf?url';

// ChatGPT/Codex's native GUI SVGs (ui_v2.json, ASSETS.md v2), copied by art:export.
const uiUrls = import.meta.glob('../../assets/ui/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
function ui(name: string): string {
  const hit = Object.entries(uiUrls).find(([p]) => p.endsWith(`/${name}.svg`));
  if (!hit) throw new Error(`Missing GUI art "${name}" (D-036: run npm run art:export)`);
  return hit[1];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.append(...children);
  return e;
}

function icon(name: string, label = ''): HTMLImageElement {
  const img = el('img', 'ui-icon');
  img.src = ui(name);
  img.alt = label;
  if (!label) img.setAttribute('aria-hidden', 'true');
  return img;
}

/**
 * DOM HUD drawn with ChatGPT/Codex's GUI v2 art (D-022, D-041), laid out per its
 * ui_v2.json and mock-ups. Only features that exist yet are live: population, the
 * spawn timer and discovery toasts. Currencies, instant spawn, buildings and the Dex
 * arrive with the M3 systems; their controls are shown disabled, never faked.
 */
export class Hud {
  private readonly count = el('span', 'hud-value');
  private readonly countdown = el('span', 'hud-countdown');
  private readonly bar = el('div', 'hud-bar');
  private readonly toastText = el('span', 'toast-text');
  private readonly toast = el('div', 'toast', icon('icon_discovery'), this.toastText);
  private toastTimer: number | undefined;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
  ) {
    this.applyTokens();

    const track = el('div', 'hud-track', this.bar);
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Next kid');
    const settings = this.button('icon_settings', 'Settings', 'hud-settings');
    const top = el(
      'section',
      'hud ui-surface',
      el('div', 'hud-row', el('span', 'hud-stat', icon('icon_kids', 'Kids'), this.count), settings),
      el('div', 'hud-row', el('span', 'hud-stat', icon('icon_timer'), this.countdown)),
      track,
    );
    top.setAttribute('aria-label', 'Garden status');

    const tray = el(
      'nav',
      'tray ui-surface ui-tray',
      this.trayCell('icon_garden', 'Garden'),
      this.trayCell('icon_capacity', 'Capacity'),
      this.trayCell('icon_bias', 'Bias'),
      this.trayCell('icon_compendium', 'Compendium'),
    );
    tray.setAttribute('aria-label', 'Buildings');
    const dex = this.button('icon_dex', 'Potato-Dex', 'dex-button');

    this.toast.setAttribute('role', 'status');
    document.body.append(top, this.toast, dex, tray);
    // The camera must be able to bring any kid out from under the HUD and tray.
    // The Dex button sits above the tray's right end, so it counts too (Codex review, PR #15).
    const measure = () =>
      scene.setInsets(
        top.getBoundingClientRect().bottom,
        window.innerHeight - Math.min(tray.getBoundingClientRect().top, dex.getBoundingClientRect().top),
      );
    new ResizeObserver(measure).observe(document.body);
    measure();
    this.render();
    scene.onEvent = (e) => this.onEvent(e);
    const tick = () => {
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Colours and type from ui_v2.json; surfaces as nine-slice border images (never stretched). */
  private applyTokens(): void {
    const s = document.documentElement.style;
    for (const [k, v] of Object.entries(uiData?.palette ?? {})) s.setProperty(`--ui-${k}`, v);
    s.setProperty('--ui-panel', `url("${ui('ui_panel')}")`);
    s.setProperty('--ui-tray', `url("${ui('ui_tray')}")`);
    s.setProperty('--ui-toast', `url("${ui('ui_toast')}")`);
    s.setProperty('--ui-button', `url("${ui('ui_button_normal')}")`);
    s.setProperty('--ui-button-pressed', `url("${ui('ui_button_pressed')}")`);
    s.setProperty('--ui-button-disabled', `url("${ui('ui_button_disabled')}")`);
    // The font loads under the family name Codex's token gives, from the bundled file;
    // until it is ready (or if it fails), the token's fallback stack shows.
    const type = uiData?.typography as { family: string; fallback: string } | undefined;
    if (type) {
      s.setProperty('--ui-font', `"${type.family}", ${type.fallback}`);
      const face = new FontFace(type.family, `url("${fontUrl}")`, { display: 'swap' });
      document.fonts.add(face);
      face.load().catch(() => {});
    }
  }

  /** Not built yet (M3): visibly disabled, with the reason available to screen readers. */
  private button(iconName: string, label: string, className: string): HTMLButtonElement {
    const b = el('button', `ui-button ${className}`, icon(iconName));
    b.type = 'button';
    b.disabled = true;
    b.setAttribute('aria-label', `${label} (coming soon)`);
    return b;
  }

  private trayCell(iconName: string, label: string): HTMLButtonElement {
    const b = el('button', 'tray-cell', icon(iconName), el('span', 'tray-label', label));
    b.type = 'button';
    b.disabled = true;
    b.setAttribute('aria-label', `${label} (coming soon)`);
    return b;
  }

  private render(): void {
    const g = this.scene.game;
    this.count.textContent = `${g.state.world.kids.length}/${g.capacity}`;
    const left = Math.max(0, g.interval - g.state.spawnProgress);
    const full = g.state.world.kids.length >= g.capacity;
    this.countdown.textContent = full ? 'Garden is full' : `Next kid ${formatTime(left)}`;
    this.bar.style.width = `${(g.state.spawnProgress / g.interval) * 100}%`;
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'fused' && e.firstDiscovery) {
      const name = this.content.kids.find((k) => k.id === e.child.type)?.name ?? e.child.type;
      // The toast follows the discovery effect (rig: discovery onComplete).
      window.setTimeout(() => this.showToast(`New discovery: ${name}!`), this.scene.discoveryToastDelayMs);
    }
  }

  private showToast(text: string): void {
    this.toastText.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2500);
  }
}

function formatTime(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
