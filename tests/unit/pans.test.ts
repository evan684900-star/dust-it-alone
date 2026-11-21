import { describe, expect, it } from 'vitest';
import { ROOMS, panFit } from '../../src/data/rooms';

describe('grosses pelles', () => {
  it('aucune pelle n’est posée devant une porte, et toutes peuvent grandir', () => {
    for (const r of ROOMS) for (const c of r.collectors) expect(panFit(r, c), `${r.id}/${c.id}`).toBeGreaterThan(2);
  });
});
