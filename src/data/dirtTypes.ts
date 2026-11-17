export type DirtId = 'dust' | 'bunny' | 'star';

export interface DirtType {
  id: DirtId;
  name: string;
  /** Valeur de base en pièces. */
  value: number;
  /** Plus c'est lourd, moins le balai le pousse. */
  mass: number;
  /** Rayon visuel/physique en unités du monde. */
  radius: number;
  /** Poids dans le calcul du % de propreté. */
  dirtWeight: number;
}

export const DIRT_TYPES: Record<DirtId, DirtType> = {
  dust: { id: 'dust', name: 'Poussière', value: 1, mass: 1, radius: 4, dirtWeight: 1 },
  bunny: { id: 'bunny', name: 'Mouton', value: 5, mass: 2.6, radius: 13, dirtWeight: 4 },
  star: { id: 'star', name: "Poussière d'étoile", value: 100, mass: 0.8, radius: 7, dirtWeight: 0 },
};

export const DIRT_ORDER: DirtId[] = ['dust', 'bunny', 'star'];
