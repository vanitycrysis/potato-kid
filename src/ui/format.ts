// Number and time display (docs/GUI_MVP.md §3 "Number display"; engineering owns the
// algorithm, the rules are Codex's). Currency counters abbreviate; prices never do.

const UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
];

/** `value / factor` to one decimal, truncated (never rounded up), trailing .0 dropped. */
function oneDecimal(value: number, factor: number): string {
  // Integer tenths first: 4.6 * 10 is 45.999… in floating point, but 4600 * 10 / 1000 is 46.
  const tenths = Math.floor((value * 10) / factor);
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

/**
 * A balance for the HUD counters: whole units (floored); exact below 1,000; then k/M/B/T
 * truncated to one decimal; scientific from 10^15 (999.99 → 999, 1,299.99 → 1.2k,
 * 999,999 → 999.9k, 1,000,000 → 1M, 1.23e15 → 1.2e15).
 */
export function formatCount(value: number): string {
  const v = Math.floor(Math.max(0, value));
  if (v < 1000) return String(v);
  if (v >= 1e15) {
    const exp = Math.floor(Math.log10(v));
    return `${oneDecimal(v, 10 ** exp)}e${exp}`;
  }
  for (const [factor, unit] of UNITS) if (v >= factor) return `${oneDecimal(v, factor)}${unit}`;
  return String(v);
}

/** An exact whole number with thousands separators (prices, accessible labels). */
export function formatExact(value: number): string {
  return Math.floor(Math.max(0, value)).toLocaleString('en-US');
}

/** A countdown as mm:ss, rounded up (the HUD's "Next kid 00:08"). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** A duration, floored to whole seconds: `2 h 14 m`, `4 m 02 s`, `12 s`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} m`;
  if (m > 0) return `${m} m ${String(s % 60).padStart(2, '0')} s`;
  return `${s} s`;
}

/** A Garden interval: to the nearest 0.1 s under a minute (`12.0 s`), else as a duration (`18 m 03 s`). */
export function formatInterval(seconds: number): string {
  const tenths = Math.round(seconds * 10) / 10;
  return tenths < 60 ? `${tenths.toFixed(1)} s` : formatDuration(Math.round(seconds));
}

/** A per-second rate: whole numbers plain, otherwise to one decimal (`0.5`, `2`, `1.5`). */
export function formatRate(value: number): string {
  const tenths = Math.round(value * 10) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}
