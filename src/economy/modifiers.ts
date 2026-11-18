import type { TreeLevels } from './tree';
import { level } from './tree';

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
  /** Valeur d'un mouton de poussière. */
  bunnyValue: number;
  /** Probabilité qu'un grain qui retombe soit de la poussière d'étoile. */
  starChance: number;
  /** Multiplicateur de poussière qui retombe. */
  respawnMult: number;
  /** Bonus de valeur quand la poussière poussée par le balai tombe droit dans une pelle. */
  scoopBonus: number;
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
 * Fonction pure : facile à tester, appliquée à chaque achat.
 */
export function computeModifiers(levels: TreeLevels, cleanedRooms: number): Modifiers {
  const L = (id: string) => level(levels, id);
  const giant = L('broom-giant') > 0;
  const precise = L('broom-precise') > 0;
  const memoryOfPlaces = L('junction-places') > 0 ? 1 + 0.05 * cleanedRooms : 1;
  const globalValue = Math.pow(1.25, L('value-1')) * Math.pow(1.3, L('value-2')) * memoryOfPlaces;

  const room = (roomId: string, roomValue: number): RoomModifiers => ({
    broomWidth: 74 + 8 * L('broom-wide-1') + 10 * L('broom-wide-2') + (giant ? 60 : 0),
    broomGrip: Math.max(0.3, 0.85 + 0.05 * L('broom-grip') - (giant ? 0.1 : 0) + (precise ? 0.3 : 0)),
    pushPower: 1 + 0.15 * L('broom-push'),
    panScale: 1 + 0.15 * (L('pan-size-1') + L('pan-size-2')),
    panPull: 120 + 30 * L('pan-pull'),
    panMagnet: L('pan-magnet') > 0,
    valueMultiplier: roomValue * globalValue * (1 + 0.1 * L(`shine:${roomId}`)),
    bunnyValue: 5 + 4 * L('bunny-fat'),
    starChance: 0.0015 + 0.001 * L('star-luck'),
    respawnMult: 1 + 0.15 * L(`airflow:${roomId}`),
    scoopBonus: L('junction-scoop') > 0 ? 0.25 : 0,
  });

  return {
    room,
    player: {
      walkMult: 1 + 0.08 * L('plume-speed'),
      sprintMult: 1 + 0.25 * L('plume-sprint'),
      reachMax: 230 + 25 * L('broom-reach'),
      marchBonus: L('junction-march') > 0 ? 0.2 : 0,
    },
    cleanBonusMult: (roomId) => (L(`echo:${roomId}`) > 0 ? 2 : 1),
  };
}
