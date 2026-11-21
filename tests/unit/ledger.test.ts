import { beforeEach, describe, expect, it } from 'vitest';
import { CAP_FACTOR, MIN_CAP_PER_SECOND, ledger } from '../../src/economy/ledger';

describe('Registre de l’argent (anti-triche)', () => {
  beforeEach(() => {
    ledger.set(100, 1000);
    ledger.resetHistory();
  });

  it('suit les gains, les dépenses et les remboursements', () => {
    expect(ledger.add(50)).toBe(50);
    expect(ledger.coins).toBeCloseTo(150);
    expect(ledger.total).toBeCloseTo(1050);
    expect(ledger.spend(120)).toBe(true);
    expect(ledger.spend(1e9)).toBe(false);
    ledger.refund(20);
    expect(ledger.coins).toBeCloseTo(50);
    expect(ledger.total).toBeCloseTo(1050);
  });

  it('repère un argent affiché trafiqué', () => {
    expect(ledger.matches(100, 1000)).toBe(true);
    expect(ledger.matches(1e12, 1000)).toBe(false);
    expect(ledger.matches(100, 1e12)).toBe(false);
  });

  it('plafonne un gain de poussière impossible, pas les bonus légitimes', () => {
    const got = ledger.add(1e12, 'dust');
    expect(got).toBeLessThanOrEqual(MIN_CAP_PER_SECOND);
    expect(ledger.takeFlags()).toBe(1);
    expect(ledger.add(1e6, 'bonus')).toBe(1e6);
    expect(ledger.takeFlags()).toBe(0);
  });

  it('les très grands montants restent justes (pas de fausse alerte)', () => {
    ledger.set(3.7e15, 9.9e18);
    for (let k = 0; k < 1000; k++) ledger.add(123.456, 'bonus');
    expect(ledger.matches(3.7e15 + 123456, 9.9e18 + 123456)).toBe(true);
  });

  it('pas de fausse alerte au lancement pour un joueur avancé', () => {
    ledger.resetHistory(2e6);
    expect(ledger.add(3e6, 'dust')).toBe(3e6);
    expect(ledger.takeFlags()).toBe(0);
    expect(CAP_FACTOR).toBeGreaterThanOrEqual(20);
  });
});
