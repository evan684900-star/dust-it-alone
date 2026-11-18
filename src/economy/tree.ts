import { NODE_BY_ID, type TreeNode } from '../data/tree';

/** Niveaux achetés (id du nœud → niveau). */
export type TreeLevels = Record<string, number>;

export interface TreeState {
  levels: TreeLevels;
  /** La pièce est-elle ouverte ? */
  roomUnlocked: (id: string) => boolean;
}

/** Arrondi « lisible » à 2 chiffres significatifs (183,7 → 180). */
export function niceRound(v: number): number {
  if (v < 100) return Math.max(1, Math.round(v));
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}

export function level(levels: TreeLevels, id: string): number {
  return levels[id] ?? 0;
}

/** Prix du prochain niveau (à partir du niveau `lvl`). */
export function cost(node: TreeNode, lvl: number): number {
  return niceRound(node.base * Math.pow(node.growth, lvl));
}

/** Prix total de `n` niveaux à partir du niveau `lvl`. */
export function costForN(node: TreeNode, lvl: number, n: number): number {
  let total = 0;
  for (let k = 0; k < n; k++) total += cost(node, lvl + k);
  return total;
}

/** Combien de niveaux peut-on se payer avec `coins` (dans la limite du niveau max) ? */
export function maxAffordable(node: TreeNode, lvl: number, coins: number): number {
  let n = 0;
  let total = 0;
  while (lvl + n < node.maxLevel) {
    const c = cost(node, lvl + n);
    if (total + c > coins) break;
    total += c;
    n++;
  }
  return n;
}

export type Availability =
  | { ok: true }
  | { ok: false; reason: 'max' | 'parents' | 'room' | 'soon' | 'fork'; detail?: string };

/** Le nœud peut-il recevoir un niveau de plus (sans tenir compte du prix) ? */
export function availability(node: TreeNode, st: TreeState): Availability {
  const lvl = level(st.levels, node.id);
  if (lvl >= node.maxLevel) return { ok: false, reason: 'max' };
  if (node.requires && 'soon' in node.requires) return { ok: false, reason: 'soon' };
  for (const pid of node.parents) {
    const p = NODE_BY_ID.get(pid);
    if (!p) continue;
    const pl = level(st.levels, pid);
    // Un grand nœud demande que son parent soit au max ; les autres, au moins 1 niveau.
    const need = node.kind === 'big' ? p.maxLevel : 1;
    if (pl < need) return { ok: false, reason: 'parents', detail: p.name };
  }
  if (node.requires && 'room' in node.requires && !st.roomUnlocked(node.requires.room)) {
    return { ok: false, reason: 'room', detail: node.requires.room };
  }
  if (node.fork) {
    const other = [...NODE_BY_ID.values()].find((n) => n.fork === node.fork && n.id !== node.id && level(st.levels, n.id) > 0);
    if (other) return { ok: false, reason: 'fork', detail: other.name };
  }
  return { ok: true };
}

/** Le nœud est-il visible en clair (pas une silhouette) ? Visible dès que ses parents sont entamés. */
export function revealed(node: TreeNode, st: TreeState): boolean {
  if (level(st.levels, node.id) > 0) return true;
  return node.parents.every((pid) => level(st.levels, pid) > 0);
}

/**
 * Fourche : on change d'avis gratuitement. Le nœud choisi avant est remboursé,
 * puis on peut acheter l'autre.
 */
export function refundFork(node: TreeNode, levels: TreeLevels): { refund: number; removed: string | null } {
  if (!node.fork) return { refund: 0, removed: null };
  for (const n of NODE_BY_ID.values()) {
    if (n.fork === node.fork && n.id !== node.id && level(levels, n.id) > 0) {
      const refund = costForN(n, 0, level(levels, n.id));
      delete levels[n.id];
      return { refund, removed: n.id };
    }
  }
  return { refund: 0, removed: null };
}

export type RefundCheck = { ok: true; amount: number } | { ok: false; reason: 'empty' | 'needed'; detail?: string };

/**
 * Peut-on rembourser un niveau de ce nœud ? On récupère exactement le prix payé
 * pour ce niveau. Interdit si un nœud déjà acheté plus loin dépend de ce niveau
 * (un nœud demande son parent à 1 niveau au moins, un grand nœud le demande au max).
 */
export function canRefund(node: TreeNode, levels: TreeLevels): RefundCheck {
  const lvl = level(levels, node.id);
  if (lvl <= 0) return { ok: false, reason: 'empty' };
  const after = lvl - 1;
  for (const child of NODE_BY_ID.values()) {
    if (!child.parents.includes(node.id) || level(levels, child.id) <= 0) continue;
    const need = child.kind === 'big' ? node.maxLevel : 1;
    if (after < need) return { ok: false, reason: 'needed', detail: child.name };
  }
  return { ok: true, amount: cost(node, after) };
}

/** Étincelles gagnées au Grand Ménage : racine cubique des pièces gagnées depuis le dernier (en millions). */
export function sparksFor(runCoins: number, gainMult = 1): number {
  return Math.floor(Math.cbrt(Math.max(0, runCoins) / 1e6) * gainMult);
}
