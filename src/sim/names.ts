// Kid names (D-057, docs/GUI_MVP.md §18.2): one rule for the sim, the save and the Name
// page. A name is normalized (NFC, ends trimmed, inner runs of spaces collapsed to one),
// then must be 1 to `maxLength` extended grapheme clusters of letters, combining marks,
// decimal digits, inner spaces, apostrophes (straight or curly) and hyphens, with at
// least one letter or digit, no invisible (default-ignorable) character, and never
// starting with a combining mark.

export type NameCheck =
  | { ok: true; name: string; length: number }
  | { ok: false; name: string; length: number; reason: 'empty' | 'chars' | 'long' };

/** Grapheme clusters, as the platform segments them (Unicode's extended clusters). */
export function graphemes(s: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  return graphemesFallback(s);
}

// --- the fallback (WebViews without Intl.Segmenter) -------------------------------------
// Tables from ICU 78 (Unicode 17), restricted to what a name allows: letters, marks, digits.

type Range = number | [number, number];
const set = (ranges: readonly Range[]): Set<number> => {
  const s = new Set<number>();
  for (const r of ranges) for (let c = typeof r === 'number' ? r : r[0]; c <= (typeof r === 'number' ? r : r[1]); c++) s.add(c);
  return s;
};

/** Prepend letters (GB9b): they join what follows. Malayalam dot reph and others. */
const PREPEND = set([0x0d4e, [0x111c2, 0x111c3], 0x113d1, 0x1193f, 0x11941, [0x11a84, 0x11a89], 0x11d46, 0x11f02]);
/**
 * Marks whose Grapheme_Cluster_Break is Other: they start a cluster of their own rather than
 * extending one (Myanmar, Tai Tham, Tai Viet and Ahom vowel signs and tone marks; Codex review).
 */
const NOT_EXTENDING = set([[0x102b, 0x102c], 0x1038, [0x1062, 0x1064], [0x1067, 0x106d], 0x1083, [0x1087, 0x108c], 0x108f, [0x109a, 0x109c], 0x1a61, [0x1a63, 0x1a64], 0xaa7b, 0xaa7d, [0x11720, 0x11721]]);
/** Letters that attach to what comes before (spacing marks and extenders that aren't marks). */
const ATTACH = set([0x0e33, 0x0eb3, [0xff9e, 0xff9f]]);
/** Indic Conjunct Break linkers (viramas) and consonants (GB9c). */
const LINKER = set([0x094d, 0x09cd, 0x0acd, 0x0b4d, 0x0c4d, 0x0d4d, 0x1039, 0x17d2, 0x1a60, 0x1b44, 0x1bab, 0xa9c0, 0xaaf6, 0x10a3f, 0x11133, 0x113d0, 0x1193e, 0x11a47, 0x11a99, 0x11f42]);
const CONSONANT = set([
  [0x915, 0x939], [0x958, 0x95f], [0x978, 0x97f], [0x995, 0x9a8], [0x9aa, 0x9b0], 0x9b2, [0x9b6, 0x9b9], [0x9dc, 0x9dd], 0x9df, [0x9f0, 0x9f1],
  [0xa95, 0xaa8], [0xaaa, 0xab0], [0xab2, 0xab3], [0xab5, 0xab9], 0xaf9, [0xb15, 0xb28], [0xb2a, 0xb30], [0xb32, 0xb33], [0xb35, 0xb39], [0xb5c, 0xb5d], 0xb5f, 0xb71,
  [0xc15, 0xc28], [0xc2a, 0xc39], [0xc58, 0xc5a], [0xd15, 0xd3a], [0x1000, 0x102a], 0x103f, [0x1050, 0x1055], [0x105a, 0x105d], 0x1061, [0x1065, 0x1066],
  [0x106e, 0x1070], [0x1075, 0x1081], 0x108e, [0x1780, 0x17b3], [0x1a20, 0x1a54], [0x1b0b, 0x1b0c], [0x1b13, 0x1b33], [0x1b45, 0x1b4c], [0x1b83, 0x1ba0],
  [0x1bae, 0x1baf], [0x1bbb, 0x1bbd], [0xa989, 0xa98b], [0xa98f, 0xa9b2], [0xa9e0, 0xa9e4], [0xa9e7, 0xa9ef], [0xa9fa, 0xa9fe], [0xaa60, 0xaa6f], [0xaa71, 0xaa73],
  0xaa7a, [0xaa7e, 0xaa7f], [0xaae0, 0xaaea], [0xabc0, 0xabda], 0x10a00, [0x10a10, 0x10a13], [0x10a15, 0x10a17], [0x10a19, 0x10a35], [0x11103, 0x11126], 0x11144,
  0x11147, [0x11380, 0x11389], 0x1138b, 0x1138e, [0x11390, 0x113b5], [0x11900, 0x11906], 0x11909, [0x1190c, 0x11913], [0x11915, 0x11916], [0x11918, 0x1192f],
  0x11a00, [0x11a0b, 0x11a32], 0x11a50, [0x11a5c, 0x11a83], [0x11f04, 0x11f10], [0x11f12, 0x11f33],
]);

type Kind = 'prepend' | 'extend' | 'linker' | 'consonant' | 'L' | 'V' | 'T' | 'LV' | 'LVT' | 'other';

function kindOf(c: number, ch: string): Kind {
  if (LINKER.has(c)) return 'linker';
  if (NOT_EXTENDING.has(c)) return 'other';
  if (ATTACH.has(c) || /\p{M}/u.test(ch)) return 'extend';
  if (PREPEND.has(c)) return 'prepend';
  if (CONSONANT.has(c)) return 'consonant';
  if ((c >= 0x1100 && c <= 0x115f) || (c >= 0xa960 && c <= 0xa97c)) return 'L';
  if ((c >= 0x1160 && c <= 0x11a7) || (c >= 0xd7b0 && c <= 0xd7c6)) return 'V';
  if ((c >= 0x11a8 && c <= 0x11ff) || (c >= 0xd7cb && c <= 0xd7fb)) return 'T';
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 === 0 ? 'LV' : 'LVT';
  return 'other';
}

/**
 * Extended grapheme clusters without `Intl.Segmenter`, for the characters a name allows:
 * a Prepend joins what follows (GB9b); marks and attaching letters join what precedes
 * (GB9, GB9a); Hangul jamo and syllables join as syllables (GB6-8); and a consonant joins
 * across a linker (GB9c), so "नमस्ते" is three clusters, as the platform counts it (Codex
 * review, FEED-NAME).
 */
export function graphemesFallback(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let prev: Kind | null = null;
  // GB9c: a consonant, then marks with at least one linker, then a consonant joins.
  let conjunct: 'none' | 'consonant' | 'linked' = 'none';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const k = kindOf(c, ch);
    const join =
      cur !== '' &&
      (prev === 'prepend' ||
        k === 'extend' ||
        k === 'linker' ||
        (prev === 'L' && (k === 'L' || k === 'V' || k === 'LV' || k === 'LVT')) ||
        ((prev === 'LV' || prev === 'V') && (k === 'V' || k === 'T')) ||
        ((prev === 'LVT' || prev === 'T') && k === 'T') ||
        (k === 'consonant' && conjunct === 'linked'));
    if (!join) {
      if (cur) out.push(cur);
      cur = '';
      conjunct = 'none';
    }
    cur += ch;
    if (k === 'consonant') conjunct = 'consonant';
    else if (k === 'linker') conjunct = conjunct === 'none' ? 'none' : 'linked';
    // Only nonspacing and enclosing marks carry a conjunct on (InCB=Extend); a spacing
    // mark, or a letter that attaches, ends it.
    else if (!(k === 'extend' && /[\p{Mn}\p{Me}]/u.test(ch))) conjunct = 'none';
    prev = k;
  }
  if (cur) out.push(cur);
  return out;
}

/** NFC, trimmed, with every run of spaces made one. */
export function normalizeName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
}

const ALLOWED = /^[\p{L}\p{M}\p{Nd} '’-]+$/u;

/** The characters alone: allowed ones, no invisibles, a letter or digit, no leading mark. */
function charsOk(name: string): boolean {
  return ALLOWED.test(name) && !/\p{Default_Ignorable_Code_Point}/u.test(name) && /[\p{L}\p{Nd}]/u.test(name) && !/^\p{M}/u.test(name);
}

export function checkName(raw: string, maxLength: number): NameCheck {
  const name = normalizeName(raw);
  const length = graphemes(name).length;
  if (!name) return { ok: false, name, length, reason: 'empty' };
  // Only the allowed characters (no emoji, controls, invisibles, markup or line breaks),
  // at least one letter or digit, and no mark standing on its own at the start.
  if (!charsOk(name)) return { ok: false, name, length, reason: 'chars' };
  // The save's cap too, so a name accepted here is always one a save accepts (Codex review).
  if (length > maxLength || [...name].length > maxLength * CODE_POINTS_PER_CLUSTER) return { ok: false, name, length, reason: 'long' };
  return { ok: true, name, length };
}

/** At most this many code points per allowed cluster, on average: generous, and the same cap for naming and saves. */
const CODE_POINTS_PER_CLUSTER = 8;

/**
 * A stored name, as a save may hold it (§18.2): normalized and of allowed characters. Its
 * length was checked when it was given; here only a generous cap in code points, so how a
 * platform counts clusters never makes a good save unreadable (Codex review, FEED-NAME).
 */
export function storedNameOk(name: string, maxLength: number): boolean {
  return name !== '' && normalizeName(name) === name && charsOk(name) && [...name].length <= maxLength * CODE_POINTS_PER_CLUSTER;
}
