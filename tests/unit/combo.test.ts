import { describe, expect, it } from 'vitest';
import { Combo } from '../../src/economy/combo';

describe('Combo', () => {
  it('commence à ×1', () => {
    expect(new Combo().multiplier).toBe(1);
  });
  it('monte quand on ramasse beaucoup, plafonne à ×3', () => {
    const c = new Combo();
    for (let i = 0; i < 10_000; i++) c.add(1);
    expect(c.multiplier).toBe(3);
  });
  it('retombe après une pause', () => {
    const c = new Combo();
    for (let i = 0; i < 400; i++) c.add(1);
    expect(c.multiplier).toBeGreaterThan(1);
    for (let i = 0; i < 600; i++) c.update(1 / 60);
    expect(c.multiplier).toBe(1);
  });
});
