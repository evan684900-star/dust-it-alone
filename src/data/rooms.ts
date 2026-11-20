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
  | 'pillar' | 'armor' | 'bench' | 'longTable' | 'globe'
  | 'stove' | 'cauldron' | 'counter' | 'pew' | 'altar' | 'tree' | 'fountain'
  | 'barrel' | 'bars' | 'gear' | 'throne' | 'well' | 'workbench';
export interface Prop { kind: PropKind; rect: Rect; rot?: number }

export type RoomStyle =
  | 'attic' | 'gallery' | 'library' | 'bedroom' | 'hall'
  | 'kitchen' | 'banquet' | 'chapel' | 'courtyard' | 'cellar' | 'dungeon' | 'clocktower' | 'ramparts' | 'throne';

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

/** Plans « de base » des pièces ; le château réel est agrandi par CASTLE_SCALE (voir plus bas). */
const RAW_ROOMS: RoomDef[] = [
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
      // L'établi de Gustave : on y ouvre l'Arbre des Souvenirs.
      { kind: 'workbench', rect: { x: 720, y: 20, w: 220, h: 90 } },
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
    price: 3000,
    collectors: [pan('g-n1', 'down', 450, 0), pan('g-n2', 'down', 1850, 0), pan('g-s1', 'up', 450, 650), pan('g-s2', 'up', 1850, 650)],
    capacity: { dust: 4500, bunny: 70, star: 10, web: 24 },
    respawn: { dust: 12, bunny: 0.2, web: 0.04 },
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
    price: 90000,
    collectors: [pan('l-w', 'right', 0, 650), pan('l-e', 'left', 1300, 650)],
    capacity: { dust: 3000, bunny: 60, star: 10, crumb: 1200, soot: 500, web: 16 },
    respawn: { dust: 8, bunny: 0.2, crumb: 3, soot: 1.2, web: 0.03 },
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
    price: 4000000,
    collectors: [pan('b-w', 'right', 0, 520), pan('b-e', 'left', 1300, 520)],
    capacity: { dust: 3500, bunny: 60, star: 10, stain: 14, web: 10 },
    respawn: { dust: 10, bunny: 0.2, stain: 0.025, web: 0.02 },
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
    price: 120000000,
    collectors: [pan('h-w1', 'right', 0, 700), pan('h-w2', 'right', 0, 1700), pan('h-n', 'down', 1400, 0), pan('h-s', 'up', 1400, 2400)],
    capacity: { dust: 5000, bunny: 100, star: 16, crumb: 1200, soot: 400, rubble: 150, web: 20, stain: 12 },
    respawn: { dust: 14, bunny: 0.3, crumb: 3, soot: 1, rubble: 0.4, web: 0.03, stain: 0.02 },
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
  {
    id: 'kitchen',
    name: 'Les Cuisines',
    style: 'kitchen',
    origin: { x: -8600, z: -700 },
    floorY: -400,
    ceiling: 520,
    width: 1800,
    height: 1400,
    valueMult: 7,
    price: 3e8,
    collectors: [pan('k-s', 'up', 900, 1400), pan('k-w', 'right', 0, 1050)],
    capacity: { dust: 1500, bunny: 40, star: 8, crumb: 2500, soot: 300, stain: 14 },
    respawn: { dust: 5, bunny: 0.12, crumb: 7, soot: 0.8, stain: 0.03 },
    patches: scatter(1800, 1400, 10, 31),
    obstacles: [
      { kind: 'stove', rect: { x: 60, y: 60, w: 260, h: 120 } },
      { kind: 'stove', rect: { x: 1480, y: 60, w: 260, h: 120 } },
      { kind: 'counter', rect: { x: 650, y: 520, w: 500, h: 140 } },
      { kind: 'cauldron', rect: { x: 300, y: 700, w: 120, h: 120 } },
      { kind: 'barrel', rect: { x: 1600, y: 1150, w: 90, h: 90 } },
    ],
    light: { dir: [0.4, -0.75, 0.5], intensity: 2.6, color: 0xffc890 },
  },
  {
    id: 'banquet',
    name: 'La Salle des banquets',
    style: 'banquet',
    origin: { x: -6400, z: -2600 },
    floorY: -400,
    ceiling: 650,
    width: 2000,
    height: 1500,
    valueMult: 9,
    price: 1e9,
    collectors: [pan('bq-w', 'right', 0, 750), pan('bq-e', 'left', 2000, 750)],
    capacity: { dust: 2000, bunny: 60, star: 10, crumb: 2500, stain: 16 },
    respawn: { dust: 6, bunny: 0.18, crumb: 7, stain: 0.035 },
    patches: scatter(2000, 1500, 11, 37),
    obstacles: [
      { kind: 'longTable', rect: { x: 400, y: 640, w: 1200, h: 200 } },
      { kind: 'bench', rect: { x: 450, y: 560, w: 500, h: 60 } },
      { kind: 'bench', rect: { x: 1050, y: 560, w: 500, h: 60 } },
      { kind: 'bench', rect: { x: 450, y: 860, w: 500, h: 60 } },
      { kind: 'bench', rect: { x: 1050, y: 860, w: 500, h: 60 } },
      { kind: 'armor', rect: { x: 60, y: 60, w: 70, h: 70 } },
      { kind: 'armor', rect: { x: 1870, y: 60, w: 70, h: 70 } },
    ],
    light: { dir: [-0.3, -0.8, 0.5], intensity: 2.8, color: 0xffd8a0 },
  },
  {
    id: 'chapel',
    name: 'La Chapelle',
    style: 'chapel',
    origin: { x: -5300, z: 1300 },
    floorY: -400,
    ceiling: 800,
    width: 1200,
    height: 1600,
    valueMult: 12,
    price: 3e9,
    collectors: [pan('c-w', 'right', 0, 800), pan('c-e', 'left', 1200, 800)],
    capacity: { dust: 3000, bunny: 50, star: 40, web: 20 },
    respawn: { dust: 9, bunny: 0.15, star: 0.25, web: 0.03 },
    patches: scatter(1200, 1600, 8, 41),
    obstacles: [
      { kind: 'altar', rect: { x: 400, y: 1330, w: 400, h: 160 } },
      { kind: 'pew', rect: { x: 180, y: 500, w: 340, h: 80 } },
      { kind: 'pew', rect: { x: 680, y: 500, w: 340, h: 80 } },
      { kind: 'pew', rect: { x: 180, y: 750, w: 340, h: 80 } },
      { kind: 'pew', rect: { x: 680, y: 750, w: 340, h: 80 } },
      { kind: 'pew', rect: { x: 180, y: 1000, w: 340, h: 80 } },
      { kind: 'pew', rect: { x: 680, y: 1000, w: 340, h: 80 } },
    ],
    light: { dir: [0.2, -0.8, -0.55], intensity: 3, color: 0xe0d0ff },
  },
  {
    id: 'courtyard',
    name: 'La Cour intérieure',
    style: 'courtyard',
    origin: { x: -11000, z: -1200 },
    floorY: -400,
    ceiling: 900,
    width: 2400,
    height: 2400,
    valueMult: 16,
    price: 8e9,
    collectors: [pan('co-n', 'down', 1200, 0), pan('co-s', 'up', 1200, 2400), pan('co-w', 'right', 0, 1200)],
    capacity: { leaf: 3000, dust: 800, rubble: 80, bunny: 20, star: 10 },
    respawn: { leaf: 12, dust: 3, rubble: 0.2, bunny: 0.05 },
    patches: scatter(2400, 2400, 12, 43),
    obstacles: [
      { kind: 'tree', rect: { x: 900, y: 900, w: 300, h: 300 } },
      { kind: 'fountain', rect: { x: 1500, y: 1500, w: 260, h: 260 } },
      { kind: 'well', rect: { x: 500, y: 1700, w: 160, h: 160 } },
      { kind: 'bench', rect: { x: 1500, y: 700, w: 220, h: 70 } },
    ],
    light: { dir: [0.45, -0.75, 0.4], intensity: 4.5, color: 0xfff0d0 },
  },
  {
    id: 'cellar',
    name: 'Les Caves à vin',
    style: 'cellar',
    origin: { x: -8800, z: -3200 },
    floorY: -800,
    ceiling: 420,
    width: 1900,
    height: 1700,
    valueMult: 21,
    price: 2e10,
    collectors: [pan('ce-w', 'right', 0, 850), pan('ce-n', 'down', 950, 0)],
    capacity: { dust: 2500, bunny: 50, star: 8, rubble: 300, web: 30 },
    respawn: { dust: 7, bunny: 0.15, rubble: 0.8, web: 0.05 },
    patches: scatter(1900, 1700, 10, 47),
    obstacles: [
      { kind: 'barrel', rect: { x: 200, y: 200, w: 110, h: 110 } },
      { kind: 'barrel', rect: { x: 360, y: 200, w: 110, h: 110 } },
      { kind: 'barrel', rect: { x: 200, y: 1350, w: 110, h: 110 } },
      { kind: 'barrel', rect: { x: 1500, y: 300, w: 110, h: 110 } },
      { kind: 'barrel', rect: { x: 1500, y: 460, w: 110, h: 110 } },
      { kind: 'barrel', rect: { x: 1200, y: 1200, w: 110, h: 110 } },
      { kind: 'pillar', rect: { x: 900, y: 800, w: 100, h: 100 } },
    ],
    light: { dir: [0.3, -0.85, 0.4], intensity: 1.6, color: 0xffb070 },
  },
  {
    id: 'dungeon',
    name: 'Les Cachots',
    style: 'dungeon',
    origin: { x: -11000, z: -3200 },
    floorY: -800,
    ceiling: 400,
    width: 2200,
    height: 1500,
    valueMult: 28,
    price: 5e10,
    collectors: [pan('d-e', 'left', 2200, 400), pan('d-s', 'up', 1100, 1500)],
    capacity: { dust: 1500, bunny: 40, star: 8, soot: 1500, rubble: 250, web: 20 },
    respawn: { dust: 5, bunny: 0.1, soot: 4, rubble: 0.7, web: 0.04 },
    patches: scatter(2200, 1500, 10, 53),
    obstacles: [
      { kind: 'bars', rect: { x: 300, y: 0, w: 20, h: 500 } },
      { kind: 'bars', rect: { x: 800, y: 0, w: 20, h: 500 } },
      { kind: 'bars', rect: { x: 1300, y: 0, w: 20, h: 500 } },
      { kind: 'chest', rect: { x: 1800, y: 1250, w: 180, h: 100 } },
      { kind: 'barrel', rect: { x: 100, y: 1300, w: 100, h: 100 } },
    ],
    light: { dir: [-0.3, -0.85, 0.3], intensity: 1.2, color: 0xc0c8ff },
  },
  {
    id: 'clocktower',
    name: "La Tour de l'horloge",
    style: 'clocktower',
    origin: { x: 2400, z: 300 },
    floorY: 800,
    ceiling: 1400,
    width: 1000,
    height: 1000,
    valueMult: 37,
    price: 1.2e11,
    collectors: [pan('t-n', 'down', 500, 0), pan('t-s', 'up', 500, 1000)],
    capacity: { dust: 2500, bunny: 50, star: 12, crumb: 400, soot: 400, rubble: 120, web: 20, stain: 8 },
    respawn: { dust: 7, bunny: 0.15, crumb: 1, soot: 1, rubble: 0.3, web: 0.03, stain: 0.015 },
    patches: scatter(1000, 1000, 8, 59),
    obstacles: [
      { kind: 'gear', rect: { x: 380, y: 380, w: 240, h: 240 } },
      { kind: 'gear', rect: { x: 780, y: 120, w: 140, h: 140 } },
    ],
    light: { dir: [0.5, -0.7, 0.4], intensity: 3, color: 0xfff0d0 },
  },
  {
    id: 'ramparts',
    name: 'Le Chemin de ronde',
    style: 'ramparts',
    origin: { x: 3400, z: 500 },
    floorY: 800,
    ceiling: 900,
    width: 4000,
    height: 600,
    valueMult: 50,
    price: 2.5e11,
    collectors: [pan('r-e', 'left', 4000, 300), pan('r-n1', 'down', 1400, 0), pan('r-n2', 'down', 2800, 0)],
    capacity: { leaf: 3500, dust: 1000, rubble: 150, star: 10 },
    respawn: { leaf: 16, dust: 3, rubble: 0.4 },
    patches: scatter(4000, 600, 12, 61),
    obstacles: [],
    light: { dir: [-0.4, -0.7, 0.55], intensity: 4.5, color: 0xfff2d8 },
  },
  {
    id: 'throne',
    name: 'La Salle du trône',
    style: 'throne',
    origin: { x: -6200, z: -4400 },
    floorY: -400,
    ceiling: 1000,
    width: 1600,
    height: 1800,
    valueMult: 70,
    price: 5e11,
    collectors: [pan('th-w', 'right', 0, 900), pan('th-e', 'left', 1600, 900)],
    capacity: { dust: 3000, bunny: 70, star: 50, crumb: 300, soot: 300, rubble: 80, web: 16, stain: 10 },
    respawn: { dust: 9, bunny: 0.2, star: 0.3, crumb: 1, soot: 1, rubble: 0.2, web: 0.03, stain: 0.02 },
    patches: scatter(1600, 1800, 9, 67),
    obstacles: [
      { kind: 'throne', rect: { x: 650, y: 160, w: 300, h: 220 } },
      { kind: 'pillar', rect: { x: 300, y: 500, w: 110, h: 110 } },
      { kind: 'pillar', rect: { x: 1190, y: 500, w: 110, h: 110 } },
      { kind: 'pillar', rect: { x: 300, y: 1200, w: 110, h: 110 } },
      { kind: 'pillar', rect: { x: 1190, y: 1200, w: 110, h: 110 } },
    ],
    light: { dir: [0.2, -0.8, 0.55], intensity: 3.4, color: 0xffe0b0 },
  },
];

/** Portes du château. Les ouvertures font 140 cm (300 cm pour le grand escalier). */
const RAW_DOORS: DoorDef[] = [
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
  // Rez-de-chaussée : le Grand Hall dessert les cuisines (ouest), les banquets (nord) et la chapelle (sud).
  { id: 'kitchen', room: 'kitchen', axis: 'x', at: -6800, from: -90, to: 90, floorY: -400, height: 280 },
  { id: 'banquet', room: 'banquet', axis: 'z', at: -1100, from: -5500, to: -5300, floorY: -400, height: 320 },
  { id: 'chapel', room: 'chapel', axis: 'z', at: 1300, from: -4800, to: -4600, floorY: -400, height: 340 },
  { id: 'courtyard', room: 'courtyard', axis: 'x', at: -8600, from: -120, to: 120, floorY: -400, height: 320 },
  { id: 'throne', room: 'throne', axis: 'z', at: -2600, from: -5500, to: -5300, floorY: -400, height: 400 },
  // Sous-sol : escalier des cuisines vers les caves, puis les cachots.
  { id: 'kitchen-stair', room: null, axis: 'z', at: -700, from: -7800, to: -7600, floorY: -400, height: 250 },
  { id: 'cellar', room: 'cellar', axis: 'z', at: -1500, from: -7800, to: -7600, floorY: -800, height: 250 },
  { id: 'dungeon', room: 'dungeon', axis: 'x', at: -8800, from: -2480, to: -2320, floorY: -800, height: 240 },
  // Tours : escalier des combles vers la tour de l'horloge, puis le chemin de ronde.
  { id: 'attic-tower', room: null, axis: 'x', at: 1600, from: 700, to: 840, floorY: 400, height: 220 },
  { id: 'clocktower', room: 'clocktower', axis: 'x', at: 2400, from: 700, to: 840, floorY: 800, height: 240 },
  { id: 'ramparts', room: 'ramparts', axis: 'x', at: 3400, from: 700, to: 900, floorY: 800, height: 280 },
];

const RAW_STAIRS: StairDef[] = [
  { id: 'keep-stair', name: "L'Escalier du donjon", rect: { x: -800, y: 140, w: 800, h: 140 }, axis: 'x', yAtMin: 0, yAtMax: 400 },
  { id: 'grand-stair', name: "L'Escalier d'honneur", rect: { x: -4000, y: 25, w: 800, h: 300 }, axis: 'x', yAtMin: -400, yAtMax: 0 },
  { id: 'cellar-stair', name: "L'Escalier des caves", rect: { x: -7800, y: -1500, w: 200, h: 800 }, axis: 'z', yAtMin: -800, yAtMax: -400 },
  { id: 'tower-stair', name: "L'Escalier de la tour", rect: { x: 1600, y: 700, w: 800, h: 140 }, axis: 'x', yAtMin: 400, yAtMax: 800 },
];

// ───────────────────────────── Agrandissement du château ─────────────────────────────

/**
 * Le château entier est agrandi de ce facteur : pièces, couloirs et escaliers.
 * Les ouvertures de portes, les meubles et les pelles gardent leur taille réelle ;
 * seules leurs positions s'écartent. Ce qui touche un mur reste collé à ce mur.
 */
export const CASTLE_SCALE = 1.5;
const S = CASTLE_SCALE;
/** Plus de surface = plus de poussière (un peu moins que la surface, pour les performances). */
const DUST_SCALE = 1.45;

/** Nouvelle position d'un rectangle dans une pièce agrandie, en restant collé aux murs qu'il touche. */
function placeRect(r: Rect, W: number, H: number): Rect {
  const W2 = W * S;
  const H2 = H * S;
  const near = 90;
  let x = (r.x + r.w / 2) * S - r.w / 2;
  let y = (r.y + r.h / 2) * S - r.h / 2;
  if (r.x <= near) x = r.x;
  else if (W - (r.x + r.w) <= near) x = W2 - (W - r.x);
  if (r.y <= near) y = r.y;
  else if (H - (r.y + r.h) <= near) y = H2 - (H - r.y);
  return { x, y, w: r.w, h: r.h };
}

/** Prix des portes (multiplicateur) : réglé avec le simulateur pour garder une partie d'au moins 10 h. */
export const DOOR_PRICE_SCALE = 0.6;

function scaleRoom(r: RoomDef): RoomDef {
  const W = r.width;
  const H = r.height;
  return {
    ...r,
    price: Math.round(r.price * DOOR_PRICE_SCALE),
    origin: { x: r.origin.x * S, z: r.origin.z * S },
    width: W * S,
    height: H * S,
    collectors: r.collectors.map((c) => {
      const rect = placeRect(c.rect, W, H);
      return { ...c, rect, mouth: { x: c.mouth.x - c.rect.x + rect.x, y: c.mouth.y - c.rect.y + rect.y } };
    }),
    obstacles: r.obstacles.map((o) => ({ ...o, rect: placeRect(o.rect, W, H) })),
    patches: r.patches.map((p) => ({ x: p.x * S, y: p.y * S, spread: p.spread * S, weight: p.weight })),
    capacity: Object.fromEntries(Object.entries(r.capacity).map(([k, v]) => [k, Math.round((v ?? 0) * (k === 'star' ? 1 : DUST_SCALE))])),
    respawn: Object.fromEntries(Object.entries(r.respawn).map(([k, v]) => [k, (v ?? 0) * DUST_SCALE])),
  };
}

function scaleDoor(d: DoorDef): DoorDef {
  // Le mur s'éloigne, le centre de l'ouverture aussi ; la largeur de l'ouverture ne change pas.
  const half = (d.to - d.from) / 2;
  const center = ((d.from + d.to) / 2) * S;
  return { ...d, at: d.at * S, from: center - half, to: center + half };
}

function scaleStair(st: StairDef): StairDef {
  const { x, y, w, h } = st.rect;
  if (st.axis === 'x') {
    const cz = (y + h / 2) * S;
    return { ...st, rect: { x: x * S, y: cz - h / 2, w: w * S, h } };
  }
  const cx = (x + w / 2) * S;
  return { ...st, rect: { x: cx - w / 2, y: y * S, w, h: h * S } };
}

export const ROOMS: RoomDef[] = RAW_ROOMS.map(scaleRoom);
export const DOORS: DoorDef[] = RAW_DOORS.map(scaleDoor);
export const STAIRS: StairDef[] = RAW_STAIRS.map(scaleStair);

/** Position de départ du joueur (au milieu des combles, face à la pelle de gauche). */
export const START = { x: 800 * S, z: 450 * S, yaw: Math.PI / 2 };

export function roomById(id: string): RoomDef | undefined {
  return ROOMS.find((r) => r.id === id);
}
