import { describe, expect, it } from 'vitest';
import { NODE_BY_ID, TREE_NODES } from '../../src/data/tree';
import { availability, cost, costForN, maxAffordable, niceRound, refundFork } from '../../src/economy/tree';
import { computeModifiers } from '../../src/economy/modifiers';
import { migrate } from '../../src/save/save';

const st = (levels: Record<string, number>, rooms: string[] = ['attic']) => ({ levels, roomUnlocked: (id: string) => rooms.includes(id) });
const node = (id: string) => NODE_BY_ID.get(id)!;

describe("l'Arbre des Souvenirs", () => {
  it('chaque parent existe et les identifiants sont uniques', () => {
    const ids = new Set<string>();
    for (const n of TREE_NODES) {
      expect(ids.has(n.id), n.id).toBe(false);
      ids.add(n.id);
      for (const p of n.parents) expect(NODE_BY_ID.has(p), `${n.id} → ${p}`).toBe(true);
    }
  });

  it('prix arrondis lisiblement et qui montent à chaque niveau', () => {
    expect(niceRound(183.7)).toBe(180);
    expect(niceRound(12345)).toBe(12000);
    const n = node('broom-wide-1');
    expect(cost(n, 0)).toBe(40);
    expect(cost(n, 1)).toBeGreaterThan(cost(n, 0));
    expect(costForN(n, 0, 2)).toBe(cost(n, 0) + cost(n, 1));
  });

  it('Max achète ce qu’on peut se payer, sans dépasser le niveau max', () => {
    const n = node('broom-wide-1');
    expect(maxAffordable(n, 0, 39)).toBe(0);
    expect(maxAffordable(n, 0, costForN(n, 0, 3))).toBe(3);
    expect(maxAffordable(n, 0, 1e12)).toBe(n.maxLevel);
  });

  it('un nœud demande son parent, un grand nœud demande son parent au max', () => {
    expect(availability(node('broom-grip-1'), st({})).ok).toBe(false);
    expect(availability(node('broom-grip-1'), st({ 'broom-wide-1': 1 })).ok).toBe(true);
    expect(availability(node('broom-giant'), st({ 'broom-wide-1': 5, 'broom-wide-2': 5, 'broom-wide-3': 4 })).ok).toBe(false);
    expect(availability(node('broom-giant'), st({ 'broom-wide-1': 5, 'broom-wide-2': 5, 'broom-wide-3': 5 })).ok).toBe(true);
  });

  it('les conditions de pièce et « bientôt » sont respectées', () => {
    const lv = { 'broom-wide-1': 1, 'broom-push-1': 1 };
    expect(availability(node('broom-reach-1'), st(lv)).ok).toBe(false);
    expect(availability(node('broom-reach-1'), st(lv, ['attic', 'gallery'])).ok).toBe(true);
    const soon = availability(node('tool-duster'), st({ 'broom-wide-1': 1, 'broom-push-1': 1, 'broom-reach-1': 3 }, ['attic', 'gallery']));
    expect(soon.ok ? 'ok' : soon.reason).toBe('soon');
  });

  it('une jonction demande les deux branches', () => {
    expect(availability(node('junction-scoop'), st({ 'broom-wide-2': 1 })).ok).toBe(false);
    expect(availability(node('junction-scoop'), st({ 'broom-wide-2': 1, 'pan-size-2': 1 })).ok).toBe(true);
  });

  it('fourche : l’autre choix est bloqué, et changer d’avis rembourse', () => {
    const lv: Record<string, number> = { 'broom-wide-1': 5, 'broom-wide-2': 5, 'broom-wide-3': 5, 'broom-giant': 1 };
    const a = availability(node('broom-precise'), st(lv));
    expect(a.ok ? 'ok' : a.reason).toBe('fork');
    const r = refundFork(node('broom-precise'), lv);
    expect(r.removed).toBe('broom-giant');
    expect(r.refund).toBe(cost(node('broom-giant'), 0));
    expect(lv['broom-giant']).toBeUndefined();
  });

  it('les effets se calculent correctement', () => {
    const m = computeModifiers({ 'broom-wide-1': 3, 'broom-wide-2': 1, 'value-1': 2, 'pan-size-1': 2, 'airflow:gallery-1': 2, 'broom-giant': 1 }, 0);
    const g = m.room('gallery', 2);
    expect(g.broomWidth).toBe(74 + 18 + 8 + 60);
    expect(g.broomGrip).toBeCloseTo(0.85 - 0.1);
    expect(g.valueMultiplier).toBeCloseTo(2 * 1.1 * 1.1);
    expect(g.panScale).toBeCloseTo(1.16);
    expect(g.respawnMult).toBeCloseTo(1.2);
    expect(m.room('attic', 1).respawnMult).toBe(1);
  });

  it('la sauvegarde ne garde que des nœuds connus et des niveaux valides', () => {
    const d = migrate({ tree: { 'broom-wide-1': 3, inconnu: 2, 'broom-grip-1': 99, 'value-1': -1 } });
    expect(d.tree).toEqual({ 'broom-wide-1': 3, 'broom-grip-1': 5 });
  });

  it('les anciennes sauvegardes de l’arbre sont converties (noms des nœuds)', () => {
    const d = migrate({ tree: { 'broom-grip': 2, 'airflow:gallery': 3, 'shine:attic': 1, 'combo-hold': 4 } });
    expect(d.tree).toEqual({ 'broom-grip-1': 2, 'airflow:gallery-1': 3, 'shine:attic-1': 1 });
  });

  it("l'arbre est gigantesque", () => {
    const levels = TREE_NODES.reduce((s, n) => s + n.maxLevel, 0);
    expect(TREE_NODES.length).toBeGreaterThanOrEqual(90);
    expect(levels).toBeGreaterThanOrEqual(350);
  });
});
