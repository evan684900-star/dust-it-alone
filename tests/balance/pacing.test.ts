import { describe, expect, it } from 'vitest';
import { formatHours, simulate } from '../../tools/pacing';

describe('équilibrage (simulateur de progression)', () => {
  it('une partie complète dure au moins 10 heures', () => {
    const r = simulate();
    const lines = [
      ...r.doors.map((d) => `  porte ${d.id.padEnd(8)} ${formatHours(d.t)}`),
      `  arbre complet    ${formatHours(r.treeDone)}`,
      `  fin              ${formatHours(r.end)}  (${r.purchases} achats)`,
    ];
    lines.push('  revenu/h : ' + r.incomeByHour.map((v) => Math.round(v)).join(' · '));
    lines.push('  restants : ' + r.remaining.sort((a, b) => a.next - b.next).slice(0, 12).map((x) => `${x.id}=${x.next.toExponential(1)}`).join(' '));
    console.log('\n' + lines.join('\n'));
    expect(r.doors.length).toBe(13);
    expect(r.end).toBeGreaterThanOrEqual(10 * 3600);
    expect(r.end).toBeLessThanOrEqual(22 * 3600);
  });
});
