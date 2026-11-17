import { describe, expect, it } from 'vitest';
import { formatNumber } from '../../src/core/format';

describe('formatNumber', () => {
  it('affiche les petits nombres tels quels', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42.9)).toBe('42');
    expect(formatNumber(999)).toBe('999');
  });
  it('sépare les milliers sous 10 000', () => {
    expect(formatNumber(1234)).toBe('1 234');
  });
  it('utilise des suffixes ensuite', () => {
    expect(formatNumber(12_345)).toBe('12,3 k');
    expect(formatNumber(4_567_000)).toBe('4,56 M');
    expect(formatNumber(7.891e9)).toBe('7,89 B');
    expect(formatNumber(123_456_789_012)).toBe('123 B');
  });
  it("gère l'infini et les négatifs", () => {
    expect(formatNumber(Infinity)).toBe('∞');
    expect(formatNumber(-12_345)).toBe('-12,3 k');
  });
});
