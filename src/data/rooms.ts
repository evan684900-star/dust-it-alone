import type { DirtId } from './dirtTypes';

export interface Rect { x: number; y: number; w: number; h: number }

export interface Collector {
  id: string;
  /** Zone de ramassage (coordonnées locales de la pièce). */
  rect: Rect;
  /** Point vers lequel la saleté est aspirée en douceur. */
  mouth: { x: number; y: number };
  /** Direction d'ouverture : vers où la pelle « regarde » (+x = right, +z = down). */
  facing: 'left' | 'right' | 'up' | 'down';
}

export interface DirtPatch { x: number; y: number; spread: number; weight: number }

export type PropKind =
  | 'boxes' | 'trunk' | 'armchair' | 'crate'
  | 'bookshelf' | 'readingTable' | 'bed' | 'wardrobe' | 'chest'
  | 'pillar' | 'armor' | 'bench' | 'longTable' | 'globe';
export interface Prop { kind: PropKind; rect: Rect; rot?: number }

export type RoomStyle = 'attic' | 'gallery' | 'library' | 'bedroom' | 'hall';

export interface RoomDef {
  id: string;
  name: string;
  style: RoomStyle;
  /** Position du coin (0, 0) de la pièce dans le château (cm). */
  origin: { x: number; z: number };
  /** Altitude du sol (cm). */
  floorY: number;
  /** Hauteur sous plafond (cm). */
  ceiling: number;
  width: number;
  height: number;
  /** Multiplicateur de valeur de la saleté de cette pièce. */
  valueMult: number;
  /** Prix pour ouvrir la porte de la pièce (0 = déjà ouverte). */
  price: number;
  collectors: Collector[];
  capacity: Partial<Record<DirtId, number>>;
  respawn: Partial<Record<DirtId, number>>;
  patches: DirtPatch[];
  obstacles: Prop[];
  /** Direction de la lumière principale (soleil par une fenêtre), du ciel vers le sol. */
  light: { dir: [number, number, number]; intensity: number; color: number };
}

/** Une porte entre deux zones. `axis` = 'x' si la porte est dans un mur à x constant. */
export interface DoorDef {
  id: string;
  /** Pièce que la porte ouvre (son prix s'applique). null = toujours ouverte. */
  room: string | null;
  axis: 'x' | 'z';
  /** Coordonnée du mur (monde). */
  at: number;
  /** Étendue de l'ouverture le long du mur (monde). */
  from: number;
  to: number;
  floorY: number;
  /** Hauteur de l'ouverture. */
  height: number;
}

/** Escalier droit : rampe entre deux altitudes. */
export interface StairDef {
  id: string;
  name: string;
  /** Emprise au sol (monde) : x, z = coin, w, h = taille. */
  rect: Rect;
  /** Axe de montée et altitude à chaque bout. */
  axis: 'x' | 'z';
  /** Altitude au bout « bas » de l'axe (x ou z minimal) et au bout « haut ». */
  yAtMin: number;
  yAtMax: number;
}

function pan(id: string, facing: Collector['facing'], x: number, y: number): Collector {
  // Rectangle de ramassage contre le mur, bouche décalée vers l'intérieur.
  if (facing === 'right') return { id, facing, rect: { x: 0, y: y - 70, w: 70, h: 140 }, mouth: { x: 20, y } };
  if (facing === 'left') return { id, facing, rect: { x: x - 70, y: y - 70, w: 70, h: 140 }, mouth: { x: x - 20, y } };
  if (facing === 'down') return { id, facing, rect: { x: x - 70, y: 0, w: 140, h: 70 }, mouth: { x, y: 20 } };
  return { id, facing, rect: { x: x - 70, y: y - 70, w: 140, h: 70 }, mouth: { x, y: y - 20 } };
}

/** Taches de poussière réparties dans toute la pièce. */
function scatter(w: number, h: number, n: number, seed: number): DirtPatch[] {
  const out: DirtPatch[] = [{ x: w / 2, y: h / 2, spread: Math.max(w, h) * 0.45, weight: 3 }];
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    out.push({ x: 150 + rnd() * (w - 300), y: 150 + rnd() * (h - 300), spread: 120 + rnd() * 160, weight: 1 + rnd() * 3 });
  }
  return out;
}

export const ROOMS: RoomDef[] = [
  {
    id: 'attic',
    name: 'Les Combles du donjon',
    style: 'attic',
    origin: { x: 0, z: 0 },
    floorY: 400,
    ceiling: 520,
    width: 1600,
    height: 900,
    valueMult: 1,
    price: 0,
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
      { kind: 'boxes', rect: { x: 330, y: 40, w: 170, h: 140 } },
      { kind: 'trunk', rect: { x: 1300, y: 50, w: 200, h: 105 } },
      { kind: 'armchair', rect: { x: 1340, y: 720, w: 160, h: 140 } },
      { kind: 'crate', rect: { x: 90, y: 730, w: 130, h: 120 } },
    ],
    light: { dir: [-0.62, -0.6, 0.12], intensity: 4.2, color: 0xffd59a },
  },
  {
    id: 'gallery',
    name: 'La Galerie des portraits',
    style: 'gallery',
    origin: { x: -3200, z: -150 },
    floorY: 0,
    ceiling: 420,
    width: 2400,
    height: 650,
    valueMult: 2,
    price: 300,
    collectors: [pan('g-n1', 'down', 450, 0), pan('g-n2', 'down', 1850, 0), pan('g-s1', 'up', 450, 650), pan('g-s2', 'up', 1850, 650)],
    capacity: { dust: 4500, bunny: 70, star: 10 },
    respawn: { dust: 12, bunny: 0.2 },
    patches: scatter(2400, 650, 10, 7),
    obstacles: [
      { kind: 'bench', rect: { x: 700, y: 280, w: 160, h: 70 } },
      { kind: 'bench', rect: { x: 1550, y: 280, w: 160, h: 70 } },
      { kind: 'armor', rect: { x: 60, y: 60, w: 70, h: 70 } },
      { kind: 'armor', rect: { x: 60, y: 520, w: 70, h: 70 } },
    ],
    light: { dir: [0.3, -0.7, 0.6], intensity: 3.2, color: 0xffe2b0 },
  },
  {
    id: 'library',
    name: 'La Bibliothèque',
    style: 'library',
    origin: { x: -2800, z: -1450 },
    floorY: 0,
    ceiling: 650,
    width: 1300,
    height: 1300,
    valueMult: 3,
    price: 1500,
    collectors: [pan('l-w', 'right', 0, 650), pan('l-e', 'left', 1300, 650)],
    capacity: { dust: 4500, bunny: 80, star: 10 },
    respawn: { dust: 12, bunny: 0.25 },
    patches: scatter(1300, 1300, 9, 13),
    obstacles: [
      { kind: 'bookshelf', rect: { x: 40, y: 40, w: 420, h: 70 } },
      { kind: 'bookshelf', rect: { x: 840, y: 40, w: 420, h: 70 } },
      { kind: 'bookshelf', rect: { x: 40, y: 150, w: 70, h: 330 }, rot: 1 },
      { kind: 'bookshelf', rect: { x: 40, y: 830, w: 70, h: 330 }, rot: 1 },
      { kind: 'bookshelf', rect: { x: 1190, y: 150, w: 70, h: 330 }, rot: -1 },
      { kind: 'bookshelf', rect: { x: 1190, y: 830, w: 70, h: 330 }, rot: -1 },
      { kind: 'readingTable', rect: { x: 500, y: 520, w: 300, h: 160 } },
      { kind: 'globe', rect: { x: 950, y: 980, w: 80, h: 80 } },
    ],
    light: { dir: [0.5, -0.75, 0.3], intensity: 2.6, color: 0xffd8a0 },
  },
  {
    id: 'bedroom',
    name: 'La Chambre royale',
    style: 'bedroom',
    origin: { x: -2800, z: 500 },
    floorY: 0,
    ceiling: 480,
    width: 1300,
    height: 1000,
    valueMult: 4,
    price: 4000,
    collectors: [pan('b-w', 'right', 0, 520), pan('b-e', 'left', 1300, 520)],
    capacity: { dust: 4000, bunny: 70, star: 10 },
    respawn: { dust: 11, bunny: 0.22 },
    patches: scatter(1300, 1000, 8, 21),
    obstacles: [
      { kind: 'bed', rect: { x: 480, y: 620, w: 340, h: 340 } },
      { kind: 'wardrobe', rect: { x: 60, y: 820, w: 200, h: 120 } },
      { kind: 'chest', rect: { x: 1040, y: 840, w: 180, h: 100 } },
      { kind: 'chest', rect: { x: 560, y: 470, w: 180, h: 90 } },
    ],
    light: { dir: [-0.4, -0.7, -0.5], intensity: 2.8, color: 0xffcf9a },
  },
  {
    id: 'hall',
    name: 'Le Grand Hall',
    style: 'hall',
    origin: { x: -6800, z: -1100 },
    floorY: -400,
    ceiling: 900,
    width: 2800,
    height: 2400,
    valueMult: 5,
    price: 12000,
    collectors: [pan('h-w1', 'right', 0, 700), pan('h-w2', 'right', 0, 1700), pan('h-n', 'down', 1400, 0), pan('h-s', 'up', 1400, 2400)],
    capacity: { dust: 7000, bunny: 120, star: 16 },
    respawn: { dust: 18, bunny: 0.35 },
    patches: scatter(2800, 2400, 14, 5),
    obstacles: [
      { kind: 'pillar', rect: { x: 700, y: 600, w: 110, h: 110 } },
      { kind: 'pillar', rect: { x: 700, y: 1690, w: 110, h: 110 } },
      { kind: 'pillar', rect: { x: 1990, y: 600, w: 110, h: 110 } },
      { kind: 'pillar', rect: { x: 1990, y: 1690, w: 110, h: 110 } },
      { kind: 'longTable', rect: { x: 1050, y: 1080, w: 700, h: 160 } },
      { kind: 'armor', rect: { x: 2650, y: 300, w: 70, h: 70 } },
      { kind: 'armor', rect: { x: 2650, y: 2030, w: 70, h: 70 } },
    ],
    light: { dir: [0.35, -0.8, 0.45], intensity: 3.4, color: 0xffe0b0 },
  },
];

/** Portes du château. Les ouvertures font 140 cm (300 cm pour le grand escalier). */
export const DOORS: DoorDef[] = [
  // Combles → escalier du donjon (toujours ouverte).
  { id: 'attic-stair', room: null, axis: 'x', at: 0, from: 140, to: 280, floorY: 400, height: 230 },
  // Escalier du donjon → Galerie.
  { id: 'gallery-east', room: 'gallery', axis: 'x', at: -800, from: 140, to: 280, floorY: 0, height: 240 },
  // Galerie → Bibliothèque (mur nord) et → Chambre royale (mur sud).
  { id: 'library', room: 'library', axis: 'z', at: -150, from: -2200, to: -2060, floorY: 0, height: 260 },
  { id: 'bedroom', room: 'bedroom', axis: 'z', at: 500, from: -2200, to: -2060, floorY: 0, height: 260 },
  // Galerie → Grand escalier (vers le Grand Hall).
  { id: 'grand-stair', room: 'hall', axis: 'x', at: -3200, from: 25, to: 325, floorY: 0, height: 320 },
  // Grand escalier → Grand Hall (toujours ouverte, la porte payante est en haut).
  { id: 'hall-east', room: null, axis: 'x', at: -4000, from: 25, to: 325, floorY: -400, height: 340 },
];

export const STAIRS: StairDef[] = [
  { id: 'keep-stair', name: "L'Escalier du donjon", rect: { x: -800, y: 140, w: 800, h: 140 }, axis: 'x', yAtMin: 0, yAtMax: 400 },
  { id: 'grand-stair', name: "L'Escalier d'honneur", rect: { x: -4000, y: 25, w: 800, h: 300 }, axis: 'x', yAtMin: -400, yAtMax: 0 },
];

/** Position de départ du joueur (au milieu des combles, face à la pelle de gauche). */
export const START = { x: 800, z: 450, yaw: Math.PI / 2 };

export function roomById(id: string): RoomDef | undefined {
  return ROOMS.find((r) => r.id === id);
}
