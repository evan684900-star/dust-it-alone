import { TREE_NODES, type StatKey } from '../data/tree';
import type { TreeLevels } from './tree';

/** Effets de l'arbre sur une pièce (appliqués à sa simulation). */
export interface RoomModifiers {
  broomWidth: number;
  broomGrip: number;
  /** Force de poussée de la brosse. */
  pushPower: number;
  /** Multiplicateur de taille des pelles. */
  panScale: number;
  /** Rayon d'aspiration douce autour des pelles (cm). */
  panPull: number;
  /** Les pelles attirent doucement la poussière de toute la pièce. */
  panMagnet: boolean;
  /** Multiplicateur de valeur (inclut la valeur propre de la pièce). */
  valueMultiplier: number;
  bunnyValue: number;
  starChance: number;
  /** Multiplicateur de valeur des étoiles. */
  starValue: number;
  respawnMult: number;
  /** Bonus de valeur quand la poussière poussée par le balai tombe droit dans une pelle. */
  scoopBonus: number;
  /** Puissance des outils (1 = de base). */
  duster: number;
  sponge: number;
  blower: number;
  vacuumCap: number;
}

export interface PlayerModifiers {
  walkMult: number;
  sprintMult: number;
  reachMax: number;
  /** Bonus de poussée en avançant (Marche du balayeur). */
  marchBonus: number;
}

export interface Modifiers {
  room: (roomId: string, roomValue: number) => RoomModifiers;
  player: PlayerModifiers;
  /** Multiplicateur du bonus « pièce impeccable » pour une pièce. */
  cleanBonusMult: (roomId: string) => number;
}

/**
 * Transforme les niveaux de l'Arbre des Souvenirs en effets de jeu.
 * Chaque nœud décrit ses effets (`stats`) : on additionne (`add`) ou on
 * multiplie (`mul`) selon le niveau acheté. Fonction pure, facile à tester.
 */
export function computeModifiers(levels: TreeLevels, cleanedRooms: number): Modifiers {
  const add: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  const roomAdd = new Map<string, Partial<Record<StatKey, number>>>();
  for (const n of TREE_NODES) {
    const l = levels[n.id] ?? 0;
    if (l <= 0) continue;
    for (const s of n.stats) {
      if (s.room) {
        const ra = roomAdd.get(s.room) ?? {};
        ra[s.key] = (ra[s.key] ?? 0) + s.per * l;
        roomAdd.set(s.room, ra);
      } else if (s.mode === 'add') add[s.key] = (add[s.key] ?? 0) + s.per * l;
      else mul[s.key] = (mul[s.key] ?? 1) * Math.pow(s.per, l);
    }
  }
  const A = (k: StatKey) => add[k] ?? 0;
  const M = (k: StatKey) => mul[k] ?? 1;
  const places = 1 + A('places') * cleanedRooms;
  const globalValue = M('value') * places;

  const room = (roomId: string, roomValue: number): RoomModifiers => {
    const r = roomAdd.get(roomId) ?? {};
    return {
      broomWidth: 74 + A('broomWidth'),
      broomGrip: Math.max(0.3, 0.85 + A('broomGrip')),
      pushPower: 1 + A('pushPower'),
      panScale: 1 + A('panScale'),
      panPull: 120 + A('panPull'),
      panMagnet: A('magnet') > 0,
      valueMultiplier: roomValue * globalValue * (1 + (r.roomValue ?? 0)),
      bunnyValue: 5 + A('bunnyValue'),
      starChance: 0.0015 + A('starChance'),
      starValue: M('starValue'),
      respawnMult: 1 + (r.respawn ?? 0),
      scoopBonus: A('scoop'),
      duster: 1 + A('duster'),
      sponge: 1 + A('sponge'),
      blower: 1 + A('blower'),
      vacuumCap: 300 + A('vacuumCap'),
    };
  };

  return {
    room,
    player: {
      walkMult: 1 + A('walk'),
      sprintMult: 1 + A('sprint'),
      reachMax: 230 + A('reach'),
      marchBonus: A('march'),
    },
    cleanBonusMult: (roomId) => ((roomAdd.get(roomId)?.echo ?? 0) > 0 ? 2 : 1),
  };
}
