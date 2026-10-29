import type { Recap } from '../sim/game';
import { el, icon } from './dom';
import { formatCount, formatDuration, formatExact } from './format';
import type { Sheets } from './sheet';

// The offline-return summary (docs/GUI_MVP.md §8, Codex's design, D-036). It reports what
// the catch-up already credited; dismissing it changes nothing.

/**
 * One report, shown once. `onClose` runs when the player dismisses it, by any path.
 * `newKinds`: kinds first found while away, each already shown in its own popup (§27.5).
 */
export function openOfflineSummary(sheets: Sheets, report: Recap, foods: readonly { id: string; name: string }[], onClose: (replaced: boolean) => void, newKinds = 0): void {
  const s = sheets.open({ key: 'offline', icon: 'icon_timer', title: 'Welcome back', requestedHeight: 480, onClose }, null);
  s.setSubtitle('Your garden kept growing.');

  const stat = (iconName: string, label: string, value: string, exact?: string) => {
    const text = el('span', 'stat-label', label);
    // Abbreviated Materials also show the exact floor below (GUI_MVP §8).
    if (exact) text.append(el('span', 'stat-exact', exact));
    const row = el('div', 'stat-row', icon(iconName, '', 'ui-icon-24'), text, el('span', 'stat-value', value));
    return row;
  };
  // Food the fields grew (GUI_MVP §22.6): the total, then each food, in the pantry's order.
  const grown = foods.filter((f) => (report.food[f.id] ?? 0) > 0);
  const bites = (n: number) => `${formatExact(n)} ${n === 1 ? 'bite' : 'bites'}`;
  const total = grown.reduce((a, f) => a + report.food[f.id]!, 0);
  const food = total
    ? [el('p', 'sheet-body-text offline-food', `Food grown: ${bites(total)}.`), el('div', 'stats offline-food-lines', ...grown.map((f) => stat(`icon_food_${f.id}`, f.name, `+${bites(report.food[f.id]!)}`)))]
    : [];
  const materials = formatCount(report.materials);
  const exact = formatExact(report.materials);
  s.body.append(el('h3', 'sheet-section', `Time credited: ${formatDuration(report.seconds)}`));
  s.body.append(
    el(
      'div',
      'stats',
      stat('icon_materials', 'Materials earned', `+${materials}`, materials === exact ? undefined : `(${exact} Materials)`),
      stat('icon_kids', 'Kids arrived', formatExact(report.arrived)),
      // The new kinds among them were met one by one before this summary (D-087, §27.5).
      ...(newKinds > 0 ? [stat('icon_discovery', 'New kinds', `${formatExact(newKinds)} · Shown above`)] : []),
      stat('icon_potatokens', 'Milestone Potatokens', `+${formatExact(report.potatokens)}`),
    ),
    // Planting (§27.6): plots ready for a tap (D-088), only when there are some.
    ...(report.plotsWaiting
      ? [el('p', 'sheet-body-text offline-plots', report.plotsWaiting === 1 ? '1 plot is ready to sprout.' : `${formatExact(report.plotsWaiting)} plots are ready to sprout.`)]
      : []),
    ...food,
    el('p', 'sheet-body-text', 'Kids wandered in. Recipes wait for you.'),
  );
  const done = el('button', 'ui-button ui-primary sheet-action', el('span', 'action-label', 'Back to the garden'));
  done.type = 'button';
  done.addEventListener('click', () => sheets.close());
  s.footer.append(done);
}
