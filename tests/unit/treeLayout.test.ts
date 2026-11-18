import { describe, expect, it } from 'vitest';
import { BRANCHES, TREE_NODES } from '../../src/data/tree';

/** Même calcul de position que l'écran de l'arbre. */
function pos(n: (typeof TREE_NODES)[number]) {
  const a = ((n.angle ?? BRANCHES[n.branch].angle) * Math.PI) / 180;
  const side = (n.side ?? 0) * 95;
  return { x: Math.sin(a) * n.depth * 150 + Math.cos(a) * side, y: -Math.cos(a) * n.depth * 150 + Math.sin(a) * side };
}

describe("disposition de l'arbre", () => {
  it('chaque nœud (hors jonctions) reste dans le secteur de sa branche', () => {
    for (const n of TREE_NODES) {
      if (n.kind === 'junction' || n.branch === 'helpers') continue;
      const p = pos(n);
      // Angle du nœud vu depuis la racine, comparé à l'angle de sa branche.
      const ang = (Math.atan2(p.x, -p.y) * 180) / Math.PI;
      let diff = Math.abs(((ang - BRANCHES[n.branch].angle + 540) % 360) - 180);
      expect(diff, `${n.id} : ${diff.toFixed(0)}°`).toBeLessThan(36);
    }
  });

  it('deux nœuds ne se superposent jamais', () => {
    const ps = TREE_NODES.map((n) => ({ id: n.id, ...pos(n) }));
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
        expect(d, `${ps[i].id} / ${ps[j].id}`).toBeGreaterThan(60);
      }
  });
});
