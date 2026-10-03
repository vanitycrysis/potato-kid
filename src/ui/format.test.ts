import { describe, expect, it } from 'vitest';
import { formatClock, formatCount, formatDuration, formatExact, formatInterval, formatRate } from './format';

describe('number display (GUI_MVP §3)', () => {
  it('counters truncate, never round up', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999.99)).toBe('999');
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(1299.99)).toBe('1.2k');
    expect(formatCount(999_999)).toBe('999.9k');
    expect(formatCount(1_000_000)).toBe('1M');
    expect(formatCount(2_350_000_000)).toBe('2.3B');
    expect(formatCount(7.99e12)).toBe('7.9T');
    expect(formatCount(1.23e15)).toBe('1.2e15');
    expect(formatCount(-5)).toBe('0');
    // Floating point would make these 4.5k / 8.1M.
    expect(formatCount(4600)).toBe('4.6k');
    expect(formatCount(8_200_000)).toBe('8.2M');
    expect(formatCount(4.6e15)).toBe('4.6e15');
  });

  it('prices are exact and grouped', () => {
    expect(formatExact(48240.9)).toBe('48,240');
    expect(formatExact(32)).toBe('32');
  });

  it('countdowns round up to mm:ss', () => {
    expect(formatClock(7.2)).toBe('00:08');
    expect(formatClock(8)).toBe('00:08');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(125)).toBe('02:05');
  });

  it('durations floor to h/m/s', () => {
    expect(formatDuration(8040.9)).toBe('2 h 14 m');
    expect(formatDuration(242)).toBe('4 m 02 s');
    expect(formatDuration(12.9)).toBe('12 s');
    expect(formatDuration(0)).toBe('0 s');
  });

  it('intervals show one decimal', () => {
    expect(formatInterval(12)).toBe('12.0 s');
    expect(formatInterval(10.2)).toBe('10.2 s');
    expect(formatInterval(12 * 0.85 * 0.85)).toBe('8.7 s');
  });

  it('rates show whole numbers plainly, else one decimal', () => {
    expect(formatRate(0.5)).toBe('0.5');
    expect(formatRate(1)).toBe('1');
    expect(formatRate(8)).toBe('8');
    expect(formatRate(1.25)).toBe('1.3');
  });
});
