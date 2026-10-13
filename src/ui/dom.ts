// Small DOM helpers shared by the HUD and sheets.

import type { KidDef } from '../content/types';

// ChatGPT/Codex's native GUI SVGs (ui_v2.json), copied by art:export.
const uiUrls = import.meta.glob('../../assets/ui/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function ui(name: string): string {
  const hit = Object.entries(uiUrls).find(([p]) => p.endsWith(`/${name}.svg`));
  if (!hit) throw new Error(`Missing GUI art "${name}" (D-036: run npm run art:export)`);
  return hit[1];
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.append(...children);
  return e;
}

export function icon(name: string, label = '', className = 'ui-icon'): HTMLImageElement {
  const img = el('img', className);
  img.src = ui(name);
  // Which art it is: Vite inlines small SVGs as data URLs, so the src doesn't say.
  img.dataset.icon = name;
  img.alt = label;
  if (!label) img.setAttribute('aria-hidden', 'true');
  return img;
}

/** What a tier is shown from: a kid's tier and kind. */
export type TierKid = Pick<KidDef, 'tier' | 'special' | 'rare'>;

/** A kid's tier as the game shows it (D-082): the Special and Rare tiers by name, else "Tier n". */
export function tierName(k: TierKid): string {
  return k.rare ? 'Rare' : k.special ? 'Special' : `Tier ${k.tier}`;
}

/** The short form, for tight spots: "Special", "Rare" or "T{n}". */
export function tierShort(k: TierKid): string {
  return k.rare || k.special ? tierName(k) : `T${k.tier}`;
}

/**
 * A tier's badge, if its art exists: tiers 1 to 5 have one; the Special and Rare tiers
 * (D-082) use theirs once drawn, and until then are plain text, never an invented glyph
 * (GUI_MVP §7, §18.1; Codex review, #93). A Special kid never shows the tier-5 badge.
 */
export function tierBadge(k: TierKid, className: string): HTMLImageElement[] {
  const name = k.rare ? 'badge_rare' : k.special ? 'badge_special' : `badge_tier_${k.tier}`;
  return Object.keys(uiUrls).some((p) => p.endsWith(`/${name}.svg`)) ? [icon(name, '', className)] : [];
}

/** Display name without the trailing " Kid" (cards); Potato Kid stays "Potato" (GUI_MVP §7). */
export function shortName(name: string): string {
  return name.replace(/ Kid$/, '');
}
