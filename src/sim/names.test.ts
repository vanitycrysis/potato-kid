import { describe, expect, it } from 'vitest';
import { checkName, graphemes, graphemesFallback, normalizeName } from './names';

describe('kid names (D-057, GUI_MVP §18.2)', () => {
  it('normalizes: NFC, ends trimmed, inner runs of spaces made one', () => {
    expect(normalizeName('  Sir   Spud  ')).toBe('Sir Spud');
    // "e" + combining acute becomes one precomposed "é".
    expect(normalizeName('Amélie')).toBe('Amélie');
  });

  it('accepts letters, marks, digits, inner spaces, apostrophes and hyphens', () => {
    for (const ok of ['Spud', 'Mr Tater 2', "O'Brien", 'O’Brien', 'Jean-Luc', 'Zoë', 'Ποτάτο', 'じゃがいも', '٣']) expect(checkName(ok, 24), ok).toMatchObject({ ok: true });
  });

  it('refuses emoji, controls, invisibles, markup, line breaks and punctuation alone', () => {
    for (const bad of ['Spud 🥔', 'a\u0007b', 'a​b', 'a‮b', '<b>', 'a\nb', '---', "''", '́a', 'Spud!']) {
      expect(checkName(bad, 24), JSON.stringify(bad)).toMatchObject({ ok: false, reason: 'chars' });
    }
  });

  it('treats whitespace alone as empty', () => {
    expect(checkName('   ', 24)).toMatchObject({ ok: false, reason: 'empty', name: '' });
  });

  it('counts grapheme clusters, not UTF-16 units: 24 is the limit', () => {
    // 24 "é" written as e + combining acute: 48 code units, 24 graphemes.
    const decomposed = 'é'.repeat(24);
    expect(checkName(decomposed, 24)).toMatchObject({ ok: true, length: 24 });
    expect(checkName(decomposed + 'x', 24)).toMatchObject({ ok: false, reason: 'long', length: 25 });
    // Devanagari clusters: several code points each.
    expect(graphemes('नमस्ते').length).toBeLessThan('नमस्ते'.length);
  });
});

describe('grapheme clusters without Intl.Segmenter (Codex review, FEED-NAME)', () => {
  it('counts Indic conjuncts as one cluster, as the platform does', () => {
    expect(graphemesFallback('नमस्ते')).toEqual(['न', 'म', 'स्ते']);
    expect(graphemesFallback('नमस्ते'.repeat(8))).toHaveLength(24);
    expect(graphemesFallback('ক্ষমা')).toEqual(['ক্ষ', 'মা']);
  });

  it('agrees with the platform on every kind of name it allows', () => {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const s of ['Sir Spud', 'Amélie', 'Zoë', "O'Brien-2", 'Ποτάτο', 'じゃがいも', 'नमस्ते', 'ক্ষমা', 'ਸ੍ਰੀ', 'கற்க', 'ಕನ್ನಡ', 'മലയാളം', 'ગુજરાતી', 'ଓଡ଼ିଆ', 'తెలుగు', 'é̂x', '٣٤']) {
      expect(graphemesFallback(s), s).toEqual([...seg.segment(s)].map((x) => x.segment));
    }
  });
});

describe('the fallback against the platform, fuzzed (Codex review round 6, FEED-NAME)', () => {
  it('agrees on prepend letters, Hangul, conjuncts in many scripts, attaching letters and marks', () => {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const pool = [
      'a', 'é', '́', '̂', '1',
      // Devanagari, Bengali, Malayalam (with its prepend dot reph), Myanmar, Khmer, Thai, Balinese.
      'क', 'स', '्', 'ा', 'े', 'अ', 'ক', '্', 'ന', '്', 'ൎ',
      'က', '္', 'ခ', 'ក', '្', 'ខ', 'ก', 'ำ', 'ᬓ', '᭄',
      // Hangul: jamo L, V, T and syllables LV, LVT.
      'ᄀ', 'ᅡ', 'ᆨ', '가', '각',
    ];
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let i = 0; i < 20000; i++) {
      let s = '';
      const len = 1 + rand(10);
      for (let j = 0; j < len; j++) s += pool[rand(pool.length)];
      expect(graphemesFallback(s), JSON.stringify(s)).toEqual([...seg.segment(s)].map((x) => x.segment));
    }
    expect(graphemesFallback('ൎന'.repeat(13))).toHaveLength(13);
  });

  it('refuses invisible characters, alone or after a letter', () => {
    for (const bad of ['ㅤ', 'aㅤb', 'a͏', 'aᅟ', 'Spud⁠']) expect(checkName(bad, 24), JSON.stringify(bad)).toMatchObject({ ok: false, reason: 'chars' });
  });
});
