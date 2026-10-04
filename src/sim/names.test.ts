import { describe, expect, it } from 'vitest';
import { checkName, graphemes, normalizeName } from './names';

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
