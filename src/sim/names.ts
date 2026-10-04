// Kid names (D-057, docs/GUI_MVP.md §18.2): one rule for the sim, the save and the Name
// page. A name is normalized (NFC, ends trimmed, inner runs of spaces collapsed to one),
// then must be 1 to `maxLength` extended grapheme clusters of letters, combining marks,
// decimal digits, inner spaces, apostrophes (straight or curly) and hyphens, with at
// least one letter or digit and never starting with a combining mark.

export type NameCheck =
  | { ok: true; name: string; length: number }
  | { ok: false; name: string; length: number; reason: 'empty' | 'chars' | 'long' };

/** Grapheme clusters, as the platform segments them; code points where it can't. */
export function graphemes(s: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  // Fallback: a code point plus any combining marks after it.
  return s.match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];
}

/** NFC, trimmed, with every run of spaces made one. */
export function normalizeName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
}

const ALLOWED = /^[\p{L}\p{M}\p{Nd} '’-]+$/u;

export function checkName(raw: string, maxLength: number): NameCheck {
  const name = normalizeName(raw);
  const length = graphemes(name).length;
  if (!name) return { ok: false, name, length, reason: 'empty' };
  // Only the allowed characters (no emoji, controls, invisibles, markup or line breaks),
  // at least one letter or digit, and no mark standing on its own at the start.
  if (!ALLOWED.test(name) || !/[\p{L}\p{Nd}]/u.test(name) || /^\p{M}/u.test(name)) return { ok: false, name, length, reason: 'chars' };
  if (length > maxLength) return { ok: false, name, length, reason: 'long' };
  return { ok: true, name, length };
}
