/**
 * Simulateur de progression : joue une partie entière « en accéléré » avec un
 * modèle simple du joueur, pour régler les prix sans y passer 10 heures.
 *
 * Modèle :
 * - le joueur balaie la pièce ouverte qui rapporte le plus ;
 * - il ramasse au plus `capacité` grains par seconde (dépend du balai, des pelles…),
 *   et jamais plus que ce qui est au sol (stock + poussière qui retombe) ;
 * - les autres pièces se remplissent pendant ce temps (jusqu'à leur capacité) ;
 * - il économise pour la prochaine porte, mais achète en chemin les nœuds bon
 *   marché (moins de 20 % du prix de la porte), toujours le moins cher d'abord.
 */
import { ROOMS } from '../src/data/rooms';
import { TREE_NODES } from '../src/data/tree';
import { availability, cost, type TreeLevels } from '../src/economy/tree';
import { computeModifiers } from '../src/economy/modifiers';

export interface PacingResult {
  /** Temps (s) d'ouverture de chaque pièce. */
  doors: { id: string; t: number }[];
  /** Temps (s) où tout l'arbre (hors « bientôt ») est acheté. */
  treeDone: number;
  /** Fin de partie (tout ouvert + tout l'arbre). */
  end: number;
  purchases: number;
  /** Revenu (pièces/s) toutes les heures. */
  incomeByHour: number[];
  /** Nœuds pas finis à la fin (id → prix du prochain niveau). */
  remaining: { id: string; next: number }[];
}

/** Grains par seconde qu'un joueur humain ramasse avec le balai de départ. */
const BASE_HARVEST = 14;

export function simulate(maxHours = 40): PacingResult {
  const levels: TreeLevels = {};
  const unlocked = new Set<string>(['attic']);
  const cleaned = new Set<string>();
  const stock = new Map(ROOMS.map((r) => [r.id, (r.capacity.dust ?? 0) + (r.capacity.bunny ?? 0)]));
  const cap = new Map(ROOMS.map((r) => [r.id, (r.capacity.dust ?? 0) + (r.capacity.bunny ?? 0)]));
  let coins = 0;
  let purchases = 0;
  const doors: { id: string; t: number }[] = [];
  let treeDone = -1;
  const st = { levels, roomUnlocked: (id: string) => unlocked.has(id) };
  const nodesToBuy = TREE_NODES.filter((n) => !(n.requires && 'soon' in n.requires) && n.id !== 'broom-precise');
  let mods = computeModifiers(levels, 0);
  const incomeByHour: number[] = [];
  const finish = (end: number): PacingResult => ({
    doors, treeDone, end, purchases, incomeByHour,
    remaining: nodesToBuy.filter((n) => (levels[n.id] ?? 0) < n.maxLevel).map((n) => ({ id: n.id, next: cost(n, levels[n.id] ?? 0) })),
  });


  for (let t = 0; t < maxHours * 3600; t++) {
    // ── Récolte dans la meilleure pièce ouverte
    const pm = mods.player;
    let best: { id: string; rate: number; take: number } | null = null;
    for (const r of ROOMS) {
      if (!unlocked.has(r.id)) continue;
      const m = mods.room(r.id, r.valueMult);
      const respawn = ((r.respawn.dust ?? 0) + (r.respawn.bunny ?? 0)) * m.respawnMult;
      const harvest =
        BASE_HARVEST *
        (m.broomWidth / 74) *
        m.pushPower *
        Math.min(1.4, m.broomGrip / 0.85) *
        (1 + 0.6 * (m.panScale - 1)) *
        (1 + (m.panPull - 120) / 400) *
        (m.panMagnet ? 1.3 : 1) *
        (1 + 0.5 * (pm.walkMult - 1)) *
        (1 + 0.3 * pm.marchBonus);
      const take = Math.min(harvest, stock.get(r.id)! + respawn);
      const dust = r.respawn.dust ?? 1;
      const bunny = r.respawn.bunny ?? 0;
      const perGrain = ((dust + bunny * m.bunnyValue + dust * m.starChance * 100 * m.starValue) / (dust + bunny)) * m.valueMultiplier * (1 + m.scoopBonus * 0.5);
      const rate = take * perGrain;
      if (!best || rate > best.rate) best = { id: r.id, rate, take };
    }
    for (const r of ROOMS) {
      if (!unlocked.has(r.id)) continue;
      const m = mods.room(r.id, r.valueMult);
      const respawn = ((r.respawn.dust ?? 0) + (r.respawn.bunny ?? 0)) * m.respawnMult;
      let s = stock.get(r.id)! + respawn;
      if (best && r.id === best.id) s -= best.take;
      s = Math.max(0, Math.min(cap.get(r.id)!, s));
      stock.set(r.id, s);
      // Pièce « impeccable » la première fois : bonus.
      if (!cleaned.has(r.id) && s < cap.get(r.id)! * 0.05) {
        cleaned.add(r.id);
        coins += Math.max(250, r.price * 0.5) * mods.cleanBonusMult(r.id);
        mods = computeModifiers(levels, cleaned.size);
      }
    }
    coins += best ? best.rate : 0;
    if (t % 3600 === 0) incomeByHour.push(best ? best.rate : 0);

    // ── Achats
    const nextDoor = ROOMS.find((r) => !unlocked.has(r.id));
    if (nextDoor && coins >= nextDoor.price) {
      coins -= nextDoor.price;
      unlocked.add(nextDoor.id);
      stock.set(nextDoor.id, cap.get(nextDoor.id)!);
      doors.push({ id: nextDoor.id, t });
    }
    const limit = nextDoor ? nextDoor.price * 0.2 : Infinity;
    for (let k = 0; k < 30; k++) {
      let pick: { id: string; c: number } | null = null;
      for (const n of nodesToBuy) {
        if (!availability(n, st).ok) continue;
        const c = cost(n, levels[n.id] ?? 0);
        if (c <= coins && c <= limit && (!pick || c < pick.c)) pick = { id: n.id, c };
      }
      if (!pick) break;
      coins -= pick.c;
      levels[pick.id] = (levels[pick.id] ?? 0) + 1;
      purchases++;
      mods = computeModifiers(levels, cleaned.size);
    }
    if (treeDone < 0 && nodesToBuy.every((n) => (levels[n.id] ?? 0) >= n.maxLevel)) treeDone = t;
    if (!nextDoor && treeDone >= 0) return finish(t);
  }
  return finish(maxHours * 3600);
}

export function formatHours(s: number): string {
  if (s < 0) return 'jamais';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
