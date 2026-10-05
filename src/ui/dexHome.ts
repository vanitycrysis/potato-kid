import { kidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import { el } from './dom';
import { rareMark } from './plotRoute';
import { portrait } from './portrait';

// A kid's live copies in its Dex detail (D-061, docs/GUI_MVP.md §15.6, §18.1, Codex's design):
// one row per copy on the map, wherever it is, each opening that kid's own card, where Feed,
// Name and planting live. The route for anyone who can't drag or reach a kid on screen.

export interface HomeSection {
  root: HTMLElement;
  update(): void;
  /** Focus a copy's row (coming back from its card). False if it has gone. */
  focusKid(kidId: number): boolean;
  dispose(): void;
}

export function homeSection(type: KidId, content: Content, scene: MapScene, openCard: (kidId: number) => void): HomeSection {
  const typeName = content.kids.find((k) => k.id === type)?.name ?? type;
  const heading = el('h3', 'sheet-section dex-home-heading');
  heading.tabIndex = -1;
  const helper = el('p', 'sheet-helper');
  const rows = el('div', 'dex-home-rows');
  const root = el('section', 'dex-home', heading, helper, rows);

  const live = () => scene.game.state.world.kids.filter((k) => k.type === type);
  // Ordinals: by kid id when the detail opens, newcomers appended; a copy keeps its number
  // while the detail stays open (§13.4). Ids are never shown.
  const ordinals = new Map<number, number>();
  let next = 1;
  for (const k of [...live()].sort((a, b) => a.id - b.id)) ordinals.set(k.id, next++);
  const rowFor = new Map<number, { row: HTMLButtonElement; set(name: string | undefined): void }>();

  const makeRow = (kidId: number) => {
    const kid = live().find((k) => k.id === kidId)!;
    const ordinal = ordinals.get(kidId)!;
    const rare = rareMark(kid.variant);
    const title = el('span', 'dex-home-row-name');
    const sub = el('span', 'sheet-helper');
    const row = el(
      'button',
      'ui-button dex-home-row',
      portrait(kidRig!, type, 48, kid.look, kid.variant ? { variant: kid.variant, miniScale: content.balance.planting.miniScale } : undefined),
      el('span', 'dex-home-row-text', title, sub),
    );
    row.type = 'button';
    row.addEventListener('click', () => openCard(kidId));
    let shown: string | undefined | null = null;
    // A named copy leads with its name; type and number still tell copies apart (§18.2).
    const set = (name: string | undefined) => {
      if (name === shown) return;
      shown = name;
      title.textContent = name ?? `Kid ${ordinal}${rare ? ` · ${rare}` : ''}`;
      sub.textContent = name ? `${typeName} · Kid ${ordinal}${rare ? ` · ${rare}` : ''}` : 'Open its card';
      row.setAttribute('aria-label', `${name ? `${name}, ` : ''}${typeName}, kid ${ordinal} on your map${rare ? `, ${rare}` : ''}`);
    };
    set(kid.name);
    return { row, set };
  };

  // Null until first drawn: no copies at all is a key ('') worth drawing too.
  let shown: string | null = null;
  const update = () => {
    const kids = live();
    const ids = kids.map((k) => k.id);
    for (const id of ids) if (!ordinals.has(id)) ordinals.set(id, next++);
    const key = ids.join(',');
    if (key !== shown) {
      shown = key;
      heading.textContent = `On your map · ${ids.length}`;
      helper.textContent = ids.length ? 'Open a kid’s card to feed, name or plant it.' : 'None on your map.';
      for (const [id, r] of rowFor) {
        if (ids.includes(id)) continue;
        // Focus on a row that leaves goes to the section heading, never the page (Codex
        // review, PR #54).
        if (r.row.contains(document.activeElement)) heading.focus({ preventScroll: true });
        r.row.remove();
        rowFor.delete(id);
      }
      // Rows in ordinal order; existing rows stay put, so focus is kept.
      for (const id of [...ids].sort((a, b) => ordinals.get(a)! - ordinals.get(b)!)) {
        if (rowFor.has(id)) continue;
        const r = makeRow(id);
        rowFor.set(id, r);
        rows.append(r.row);
      }
    }
    // A name given or cleared shows at once.
    for (const k of kids) rowFor.get(k.id)?.set(k.name);
  };

  return {
    root,
    update,
    focusKid: (kidId) => {
      update();
      const r = rowFor.get(kidId);
      (r?.row ?? heading).focus();
      r?.row.scrollIntoView({ block: 'nearest' });
      return !!r;
    },
    dispose: () => {},
  };
}
