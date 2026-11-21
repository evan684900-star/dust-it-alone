/**
 * Le registre de l'argent (anti-triche).
 *
 * Toutes les entrées et sorties légitimes d'argent passent par ici. Le registre garde sa
 * propre copie, brouillée (pas le même nombre que celui affiché), dans une variable du module :
 * si quelqu'un change l'argent affiché ou sauvegardé avec les outils du navigateur, le
 * registre ne correspond plus et le jeu remet la vraie valeur.
 *
 * Il plafonne aussi les gains de poussière : en une seconde, on ne peut pas gagner beaucoup
 * plus que ce que le jeu rapporte vraiment en ce moment.
 */

export type GainKind = 'dust' | 'bonus' | 'offline' | 'host' | 'test';

/** Gains de poussière autorisés en une seconde : au moins ça… */
export const MIN_CAP_PER_SECOND = 5000;
/** … ou ce multiple du meilleur gain par seconde des deux dernières minutes. */
export const CAP_FACTOR = 40;

// Brouillage : on ne garde jamais le nombre tel quel.
let k1 = 0;
let k2 = 1;
let c = 0;
let t = 0;
const hist: number[] = [];
let thisSecond = 0;
let secondStart = 0;
let flagged = 0;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function mix(): void {
  const coins = get();
  const total = getTotal();
  k1 = 1000 + Math.random() * 99000;
  k2 = 1 + Math.random() * 6;
  c = coins * k2 + k1;
  t = total * k2 - k1;
}

function get(): number {
  return (c - k1) / k2;
}
function getTotal(): number {
  return (t + k1) / k2;
}

export const ledger = {
  /** Argent en poche (selon le registre). */
  get coins(): number {
    return get();
  },
  /** Argent gagné depuis le début (selon le registre). */
  get total(): number {
    return getTotal();
  },

  /** Valeurs de départ (chargement d'une sauvegarde, argent du monde de l'hôte). */
  set(coins: number, total: number): void {
    k1 = 0;
    k2 = 1;
    c = coins;
    t = total;
    mix();
  },

  /**
   * Ajoute un gain. Les gains de poussière sont plafonnés (le surplus est ignoré).
   * Renvoie ce qui a vraiment été ajouté.
   */
  add(amount: number, kind: GainKind = 'dust'): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    let a = amount;
    if (kind === 'dust') {
      const n = now();
      if (n - secondStart >= 1000) {
        hist.push(thisSecond);
        if (hist.length > 120) hist.shift();
        thisSecond = 0;
        secondStart = n;
      }
      const best = hist.length ? Math.max(...hist) : 0;
      const cap = Math.max(MIN_CAP_PER_SECOND, best * CAP_FACTOR);
      const room = Math.max(0, cap - thisSecond);
      if (a > room) {
        a = room;
        flagged++;
      }
      thisSecond += a;
    }
    const coins = get() + a;
    const total = getTotal() + a;
    c = coins * k2 + k1;
    t = total * k2 - k1;
    if (Math.random() < 0.02) mix();
    return a;
  },

  /** Dépense (renvoie faux si on n'a pas assez). */
  spend(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    const coins = get();
    if (coins + 1e-6 < amount) return false;
    c = (coins - amount) * k2 + k1;
    return true;
  },

  /** Rembourse (l'argent revient en poche, sans compter comme un gain). */
  refund(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    c = (get() + amount) * k2 + k1;
  },

  /**
   * L'argent affiché (ou sauvegardé) correspond-il au registre ?
   * Tolérance pour les arrondis des très grands nombres.
   */
  matches(coins: number, total: number): boolean {
    const tol = (v: number) => Math.max(1, Math.abs(v) * 1e-9);
    return Math.abs(coins - get()) <= tol(coins) && Math.abs(total - getTotal()) <= tol(total);
  },

  /** Nombre de fois où un gain trop gros a été plafonné (puis remis à zéro). */
  takeFlags(): number {
    const f = flagged;
    flagged = 0;
    return f;
  },

  /** Remet l'historique des gains à zéro, en partant du meilleur gain par seconde connu (pas de fausse alerte au lancement). */
  resetHistory(knownBestPerSecond = 0): void {
    hist.length = 0;
    if (knownBestPerSecond > 0) hist.push(knownBestPerSecond);
    thisSecond = 0;
    secondStart = now();
    flagged = 0;
  },
};
