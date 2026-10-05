// Kid names (D-057, docs/GUI_MVP.md §18.2): one rule for the sim, the save and the Name
// page. A name is normalized (NFC, ends trimmed, inner runs of spaces collapsed to one),
// then must be 1 to `maxLength` extended grapheme clusters of letters, combining marks,
// decimal digits, inner spaces, apostrophes (straight or curly) and hyphens, with at
// least one letter or digit and never starting with a combining mark.

export type NameCheck =
  | { ok: true; name: string; length: number }
  | { ok: false; name: string; length: number; reason: 'empty' | 'chars' | 'long' };

/** Grapheme clusters, as the platform segments them (Unicode's extended clusters). */
export function graphemes(s: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  return graphemesFallback(s);
}

/** The six Indic Conjunct Break linkers (viramas) of Unicode 15.1: Devanagari, Bengali, Gujarati, Oriya, Telugu, Malayalam. */
const LINKERS = String.fromCodePoint(0x094d, 0x09cd, 0x0acd, 0x0b4d, 0x0c4d, 0x0d4d);
const CLUSTER = new RegExp(String.raw`\P{M}(?:\p{M}|(?<=[${LINKERS}]\p{M}*)\p{L})*|\p{M}+`, 'gu');

/**
 * Extended grapheme clusters without `Intl.Segmenter`, for the characters a name allows
 * (letters, marks, digits, spaces, apostrophes, hyphens): a base, its marks (GB9, GB9a), and
 * a consonant joined across one of the six Indic Conjunct Break linkers (GB9c, Unicode 15.1),
 * so "नमस्ते" is three clusters, as the platform counts it (Codex review, FEED-NAME).
 */
export function graphemesFallback(s: string): string[] {
  return s.match(CLUSTER) ?? [];
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
