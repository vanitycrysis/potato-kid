// Small DOM helpers shared by the HUD and sheets.

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
  img.alt = label;
  if (!label) img.setAttribute('aria-hidden', 'true');
  return img;
}

/** Display name without the trailing " Kid" (cards); Potato Kid stays "Potato" (GUI_MVP §7). */
export function shortName(name: string): string {
  return name.replace(/ Kid$/, '');
}
