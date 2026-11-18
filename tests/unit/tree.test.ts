import { describe, expect, it } from 'vitest';
import { NODE_BY_ID, TREE_NODES } from '../../src/data/tree';
import { availability, canRefund, cost, costForN, maxAffordable, niceRound, refundFork, sparksFor } from '../../src/economy/tree';
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

  it('les outils demandent la pièce où apparaît leur saleté', () => {
    const lv = { 'broom-wide-1': 1, 'broom-push-1': 5 };
    expect(availability(node('tool-duster'), st(lv)).ok).toBe(false);
    expect(availability(node('tool-duster'), st(lv, ['attic', 'gallery'])).ok).toBe(true);
  });

  it('les conditions de pièce sont respectées', () => {
    const lv = { 'broom-wide-1': 1, 'broom-push-1': 1 };
    expect(availability(node('broom-reach-1'), st(lv)).ok).toBe(false);
    expect(availability(node('broom-reach-1'), st(lv, ['attic', 'gallery'])).ok).toBe(true);
    // Plus aucun nœud « bientôt » : tout est jouable.
    expect(TREE_NODES.some((n) => n.requires && 'soon' in n.requires)).toBe(false);
    expect(availability(node('plume-feet'), st({ 'plume-speed-1': 5, 'plume-speed-2': 5, 'plume-speed-3': 5 })).ok).toBe(true);
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
    // 2 niveaux de Courants d'air : la poussière revient (×1), +10 %.
    expect(g.respawnMult).toBeCloseTo(1.1);
    // Sans Courants d'air, la poussière ne revient pas.
    expect(m.room('attic', 1).respawnMult).toBe(0);
    expect(computeModifiers({ 'airflow:attic-1': 1 }, 0).room('attic', 1).respawnMult).toBeCloseTo(1);
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

describe('remboursement', () => {
  it('rend exactement le prix du dernier niveau acheté', () => {
    const n = node('broom-wide-1');
    const r = canRefund(n, { 'broom-wide-1': 3 });
    expect(r.ok && r.amount).toBe(cost(n, 2));
  });
  it('rien à rembourser sur un nœud pas acheté', () => {
    const r = canRefund(node('broom-wide-1'), {});
    expect(r.ok ? 'ok' : r.reason).toBe('empty');
  });
  it('bloqué si un nœud acheté plus loin en dépend', () => {
    // Poils durs I demande Brosse large I à 1 niveau au moins.
    const blocked = canRefund(node('broom-wide-1'), { 'broom-wide-1': 1, 'broom-grip-1': 2 });
    expect(blocked.ok ? 'ok' : blocked.reason).toBe('needed');
    // Avec 2 niveaux, on peut en rendre un (il en reste 1).
    expect(canRefund(node('broom-wide-1'), { 'broom-wide-1': 2, 'broom-grip-1': 2 }).ok).toBe(true);
    // Un grand nœud demande son parent au max : impossible de baisser le parent.
    const giant = canRefund(node('broom-wide-3'), { 'broom-wide-1': 5, 'broom-wide-2': 5, 'broom-wide-3': 5, 'broom-giant': 1 });
    expect(giant.ok ? 'ok' : giant.reason).toBe('needed');
  });
});

describe('Grand Ménage', () => {
  it('les Étincelles suivent la racine cubique des pièces gagnées (en millions)', () => {
    expect(sparksFor(0)).toBe(0);
    expect(sparksFor(999_999)).toBe(0);
    expect(sparksFor(1e9)).toBe(10);
    expect(sparksFor(1e12)).toBe(100);
    expect(sparksFor(1e12, 1.3)).toBe(130);
  });
  it('chaque Étincelle gardée donne +1 % de valeur', () => {
    const m = computeModifiers({}, 0, 50);
    expect(m.room('attic', 1).valueMultiplier).toBeCloseTo(1.5);
  });
  it("l'anneau doré se paie en Étincelles et donne ses effets", () => {
    const ring = TREE_NODES.filter((n) => n.branch === 'gold');
    expect(ring.length).toBe(8);
    expect(ring.every((n) => n.currency === 'sparks')).toBe(true);
    const m = computeModifiers({ 'gold-start': 2, 'gold-rooms': 3, 'gold-helpers': 1 }, 0);
    expect(m.prestige.startCoins).toBe(10000);
    expect(m.prestige.keepRooms).toBe(3);
    expect(m.prestige.keepHelpers).toBe(true);
  });
  it('la sauvegarde garde les Étincelles', () => {
    const d = migrate({ sparks: 42, prestiges: 2, runCoins: 1e9 });
    expect([d.sparks, d.prestiges, d.runCoins]).toEqual([42, 2, 1e9]);
  });
});
