import type { DirtId } from './dirtTypes';

export interface Rect { x: number; y: number; w: number; h: number }

export interface Collector {
  id: string;
  /** Zone de ramassage. */
  rect: Rect;
  /** Point vers lequel la saleté est aspirée en douceur. */
  mouth: { x: number; y: number };
  /** Direction d'ouverture (pour le dessin). */
  facing: 'left' | 'right' | 'up' | 'down';
}

export interface DirtPatch { x: number; y: number; spread: number; weight: number }

export interface RoomDef {
  id: string;
  name: string;
  width: number;
  height: number;
  collectors: Collector[];
  /** Nombre max de particules de chaque type. */
  capacity: Partial<Record<DirtId, number>>;
  /** Particules qui réapparaissent par seconde. */
  respawn: Partial<Record<DirtId, number>>;
  /** Zones où la poussière s'accumule. */
  patches: DirtPatch[];
  /** Meubles posés au sol : la poussière et le joueur ne les traversent pas. */
  obstacles: Prop[];
}

export type PropKind = 'boxes' | 'trunk' | 'armchair' | 'crate';
export interface Prop { kind: PropKind; rect: Rect }

export const ROOMS: RoomDef[] = [
  {
    id: 'attic',
    name: 'Les Combles du donjon',
    width: 1600,
    height: 900,
    collectors: [
      { id: 'pan-left', rect: { x: 0, y: 380, w: 70, h: 140 }, mouth: { x: 20, y: 450 }, facing: 'right' },
      { id: 'pan-right', rect: { x: 1530, y: 380, w: 70, h: 140 }, mouth: { x: 1580, y: 450 }, facing: 'left' },
    ],
    capacity: { dust: 6000, bunny: 90, star: 12 },
    respawn: { dust: 14, bunny: 0.25, star: 0 },
    patches: [
      { x: 400, y: 220, spread: 170, weight: 3 },
      { x: 1150, y: 250, spread: 200, weight: 3 },
      { x: 800, y: 600, spread: 230, weight: 4 },
      { x: 300, y: 720, spread: 140, weight: 2 },
      { x: 1300, y: 700, spread: 150, weight: 2 },
      { x: 800, y: 450, spread: 700, weight: 3 },
    ],
    obstacles: [
      { kind: 'boxes', rect: { x: 70, y: 60, w: 170, h: 150 } },
      { kind: 'trunk', rect: { x: 1300, y: 50, w: 200, h: 105 } },
      { kind: 'armchair', rect: { x: 1340, y: 720, w: 160, h: 140 } },
      { kind: 'crate', rect: { x: 90, y: 730, w: 130, h: 120 } },
    ],
  },
];
