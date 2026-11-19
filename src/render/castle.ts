import * as THREE from 'three';
import type { DoorDef, RoomDef, StairDef } from '../data/rooms';
import { fabric, mat, metal, solid } from './materials';
import { roundedBox } from './geometry';
import { REALISTIC, naturalWood, realGrass, realStone, realWood, realify, type SurfaceTextures } from './realistic';
import { blobShadow, drawCarpet, drawFlagstones, drawGrass, drawPlanks, drawPortrait, drawStoneWall, softDot } from './canvasTextures';

function canvasTex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Mode réaliste : cartes de relief et de rugosité qui accompagnent chaque texture. */
const SURF = new Map<THREE.Texture, SurfaceTextures>();
function surf(t: SurfaceTextures): THREE.Texture {
  SURF.set(t.color, t);
  return t.color;
}

/** Paramètres de matériau pour une texture : relief et rugosité réalistes si on les a. */
function texParams(map: THREE.Texture, bumpScale: number, roughness: number): THREE.MeshStandardMaterialParameters {
  const s = SURF.get(map);
  if (s) return { map, bumpMap: s.bump, bumpScale: bumpScale * 1.4, roughnessMap: s.rough, roughness: 1 };
  return { map, bumpMap: map, bumpScale, roughness };
}

/** Textures partagées (créées une seule fois). */
const T = {
  _stone: null as THREE.Texture | null,
  _darkStone: null as THREE.Texture | null,
  _flag: null as THREE.Texture | null,
  _grass: null as THREE.Texture | null,
  _shadow: null as THREE.Texture | null,
  _soft: null as THREE.Texture | null,
  woods: new Map<string, THREE.Texture>(),
  get stone() {
    return (this._stone ??= REALISTIC
      ? surf(realStone({ base: [164, 154, 138], mortar: [118, 110, 100], rows: 5, perRow: 2.6, joint: 2.5, vary: 0.16, seed: 3 }))
      : canvasTex(drawStoneWall(512, 512), true));
  },
  get darkStone() {
    return (this._darkStone ??= REALISTIC
      ? surf(realStone({ base: [112, 104, 94], mortar: [70, 64, 58], rows: 5, perRow: 2.4, joint: 2.5, damp: 0.8, vary: 0.2, seed: 9 }))
      : canvasTex(drawStoneWall(512, 512, { tones: ['#7d7268', '#71665c', '#887c70', '#6a5f56'], mortar: '#3f3630', seed: 9 }), true));
  },
  get flag() {
    return (this._flag ??= REALISTIC
      ? surf(realStone({ base: [146, 138, 126], mortar: [88, 82, 74], rows: 3, perRow: 2.2, floor: true, joint: 2, vary: 0.16, seed: 15 }))
      : canvasTex(drawFlagstones(512, 512), true));
  },
  get grass() { return (this._grass ??= REALISTIC ? surf(realGrass(512)) : canvasTex(drawGrass(512), true)); },
  get shadow() { return (this._shadow ??= canvasTex(blobShadow())); },
  get soft() { return (this._soft ??= canvasTex(softDot())); },
  planks(key: string, woods: string[]) {
    let t = this.woods.get(key);
    if (!t) {
      if (REALISTIC) {
        // Vrai parquet : planches de 20 cm, veinées, un peu usées.
        const s = realWood(600, 600, { base: naturalWood(woods[0]), plank: 20, px: 0.85, grime: 0.45, seed: key.length * 7 });
        for (const x of [s.color, s.bump, s.rough]) x.wrapS = x.wrapT = THREE.RepeatWrapping;
        t = surf(s);
      } else t = canvasTex(drawPlanks(600, 600, { px: 1, woods, grain: 'rgba(60,30,15,0.35)', ink: '#2e1a12' }), true);
      this.woods.set(key, t);
    }
    return t;
  },
};
/** Taille (cm) couverte par une répétition de texture. */
const STONE_TILE = 320;

/** Plan dont les coordonnées de texture suivent le monde (pas d'étirement). */
function tiledPlane(w: number, h: number, tile: number, u0 = 0, v0 = 0): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * w) / tile, (v0 + uv.getY(i) * h) / tile);
  return g;
}

export interface RoomShell {
  group: THREE.Group;
  /** Effets d'ambiance (rayons, grains de lumière) à couper en qualité minimale. */
  ambience: THREE.Object3D[];
  /** Positions (locales) des flammes : les lumières dynamiques s'y placent. */
  torches: THREE.Vector3[];
  flames: THREE.Object3D[];
  motes?: { points: THREE.Points; seeds: Float32Array };
}

type Side = 'n' | 's' | 'w' | 'e';
interface Opening { from: number; to: number; height: number }

/** Ouvertures (portes) d'un mur de la pièce, en coordonnée locale le long du mur. */
function openingsFor(def: RoomDef, doors: DoorDef[], side: Side): Opening[] {
  const { origin: o, width: W, height: H } = def;
  const out: Opening[] = [];
  for (const d of doors) {
    if (Math.abs(d.floorY - def.floorY) > 1) continue;
    if ((side === 'w' || side === 'e') && d.axis === 'x' && d.at === (side === 'w' ? o.x : o.x + W) && d.from >= o.z - 1 && d.to <= o.z + H + 1)
      out.push({ from: d.from - o.z, to: d.to - o.z, height: d.height });
    if ((side === 'n' || side === 's') && d.axis === 'z' && d.at === (side === 'n' ? o.z : o.z + H) && d.from >= o.x - 1 && d.to <= o.x + W + 1)
      out.push({ from: d.from - o.x, to: d.to - o.x, height: d.height });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Longueur d'un mur et placement de son repère (u le long du mur, v vers le haut, face vers l'intérieur). */
function wallFrame(def: RoomDef, side: Side) {
  const { width: W, height: H } = def;
  switch (side) {
    case 'n': return { len: W, place: (o: THREE.Object3D, u: number, v: number, d = 0) => { o.position.set(u, v, d); } };
    case 's': return { len: W, place: (o: THREE.Object3D, u: number, v: number, d = 0) => { o.position.set(W - u, v, H - d); o.rotation.y = Math.PI; } };
    case 'w': return { len: H, place: (o: THREE.Object3D, u: number, v: number, d = 0) => { o.position.set(d, v, H - u); o.rotation.y = Math.PI / 2; } };
    case 'e': return { len: H, place: (o: THREE.Object3D, u: number, v: number, d = 0) => { o.position.set(W - d, v, u); o.rotation.y = -Math.PI / 2; } };
  }
}

/** Convertit une position « le long du mur » dans le sens de wallFrame (w et s sont parcourus à l'envers). */
function toWallU(def: RoomDef, side: Side, along: number): number {
  return side === 's' ? def.width - along : side === 'w' ? def.height - along : along;
}

interface StyleDef {
  /** Bois du parquet, ou un sol spécial. */
  floor: string[] | 'flag' | 'grass' | 'darkFlag';
  floorTint?: number;
  wainscot: boolean;
  /** Mur qui porte les fenêtres (null = pas de fenêtres). */
  windows: Side | null;
  windowColors?: number[];
  wallTex: 'stone' | 'darkStone';
  /** En plein air : pas de plafond, on voit le ciel. */
  outdoor?: boolean;
  /** Murs bas (parapet avec créneaux), sauf sur ces côtés. */
  parapet?: { height: number; fullSides: Side[] };
  torches?: boolean;
  torchHeight?: number;
  rug?: [string, string, string];
  chandeliers?: number;
  banners?: Side[];
  portraits?: Side;
}

const STAINED = [0xff6a6a, 0x6aa8ff, 0xffd86a, 0x8aff8a, 0xd08aff];

const STYLE: Record<Exclude<RoomDef['style'], 'attic'>, StyleDef> = {
  gallery: { floor: ['#b8743c', '#a8652f', '#c4824a'], wainscot: true, windows: 'n', wallTex: 'stone', rug: ['#8a1a2a', '#c9a24a', '#5a0a1a'], portraits: 's' },
  library: { floor: ['#7a4a2a', '#6a3f22', '#86563a'], wainscot: true, windows: 'n', wallTex: 'stone', rug: ['#1a4a3a', '#c9a24a', '#0a2a20'], chandeliers: 1 },
  bedroom: { floor: ['#9a5a3a', '#8a4e30', '#a8684a'], wainscot: true, windows: 's', wallTex: 'stone', rug: ['#5a1a4a', '#d8b860', '#3a0a2a'], portraits: 'w' },
  hall: { floor: 'flag', wainscot: false, windows: 'w', wallTex: 'darkStone', rug: ['#7a1a1a', '#d8b860', '#4a0a0a'], chandeliers: 2, banners: ['n', 's'], torchHeight: 300 },
  kitchen: { floor: 'flag', floorTint: 0xd8c0a0, wainscot: false, windows: 's', wallTex: 'stone', torchHeight: 230 },
  banquet: { floor: ['#8a5030', '#7a4428', '#965c3a'], wainscot: true, windows: 'n', wallTex: 'stone', rug: ['#1a3a7a', '#d8b860', '#0a1a4a'], chandeliers: 2, banners: ['w', 'e'] },
  chapel: { floor: 'flag', floorTint: 0xe8e0f0, wainscot: false, windows: 'w', windowColors: STAINED, wallTex: 'stone', rug: ['#5a1a6a', '#d8b860', '#3a0a4a'], torchHeight: 260 },
  courtyard: { floor: 'grass', wainscot: false, windows: null, wallTex: 'stone', outdoor: true, torchHeight: 280 },
  cellar: { floor: 'darkFlag', wainscot: false, windows: null, wallTex: 'darkStone', torchHeight: 220 },
  dungeon: { floor: 'darkFlag', floorTint: 0x9a9aa8, wainscot: false, windows: null, wallTex: 'darkStone', torchHeight: 220 },
  clocktower: { floor: ['#6a4a3a', '#5e4032', '#765442'], wainscot: false, windows: 'e', wallTex: 'stone', torchHeight: 260 },
  ramparts: { floor: 'flag', wainscot: false, windows: null, wallTex: 'stone', outdoor: true, parapet: { height: 130, fullSides: ['w'] }, torches: false },
  throne: { floor: 'flag', floorTint: 0xf0e0d0, wainscot: false, windows: 'n', windowColors: STAINED, wallTex: 'stone', rug: ['#8a1a1a', '#e8c860', '#5a0a0a'], chandeliers: 2, banners: ['w', 'e'], torchHeight: 320 },
};

/** Construit une pièce du château (coordonnées locales, à placer à l'origine de la pièce). */
export function buildRoomShell(def: RoomDef, doors: DoorDef[]): RoomShell {
  if (def.style === 'attic') return buildAttic(def, doors);
  const st = STYLE[def.style];
  const g = new THREE.Group();
  const { width: W, height: H, ceiling: C } = def;
  const torches: THREE.Vector3[] = [];
  const flames: THREE.Object3D[] = [];

  // Sol.
  const wood = Array.isArray(st.floor);
  const floorTex = Array.isArray(st.floor) ? T.planks(def.style, st.floor) : st.floor === 'grass' ? T.grass : T.flag;
  const floorTile = wood ? 600 : st.floor === 'grass' ? 400 : 300;
  const floorColor = st.floor === 'darkFlag' ? (st.floorTint ?? 0x8a8078) : (st.floorTint ?? 0xffffff);
  const floor = new THREE.Mesh(tiledPlane(W, H, floorTile), mat(floorColor, texParams(floorTex, 1.5, wood ? 0.55 : 0.85)));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, H / 2);
  floor.receiveShadow = true;
  g.add(floor);

  // Murs de pierre, avec leurs ouvertures de portes.
  const wallTex = st.wallTex === 'stone' ? T.stone : T.darkStone;
  // Visible des deux côtés : depuis les escaliers, on voit le dos des murs (au-dessus des portes).
  const wallMat = mat(0xffffff, { ...texParams(wallTex, 3, 0.9), side: THREE.DoubleSide });
  const wainMat = mat(0xffffff, texParams(T.planks('wainscot', ['#6a3a22', '#5e321c', '#74422a']), 1, 0.6));
  const frameMat = mat(0x5a3220, { roughness: 0.6 });
  for (const side of ['n', 's', 'w', 'e'] as Side[]) {
    const { len, place } = wallFrame(def, side);
    const ops = openingsFor(def, doors, side).map((o) => ({ ...o, from: toWallU(def, side, o.from), to: toWallU(def, side, o.to) }))
      .map((o) => ({ ...o, from: Math.min(o.from, o.to), to: Math.max(o.from, o.to) }))
      .sort((a, b) => a.from - b.from);
    let u = 0;
    const segs: [number, number][] = [];
    for (const o of ops) {
      if (o.from > u) segs.push([u, o.from]);
      // Linteau au-dessus de la porte.
      const lintel = new THREE.Mesh(tiledPlane(o.to - o.from, C - o.height, STONE_TILE, o.from, o.height), wallMat);
      place(lintel, (o.from + o.to) / 2, (o.height + C) / 2);
      lintel.receiveShadow = true;
      g.add(lintel);
      // Encadrement en bois massif.
      for (const x of [o.from - 8, o.to + 8]) {
        const jamb = solid(roundedBox(16, o.height + 16, 34, 3), frameMat);
        place(jamb, x, (o.height + 16) / 2, 0);
        g.add(jamb);
      }
      const head = solid(roundedBox(o.to - o.from + 32, 18, 34, 3), frameMat);
      place(head, (o.from + o.to) / 2, o.height + 9, 0);
      g.add(head);
      u = o.to;
    }
    if (u < len) segs.push([u, len]);
    const wallH = st.parapet && !st.parapet.fullSides.includes(side) ? st.parapet.height : C;
    for (const [a, b] of segs) {
      const wall = new THREE.Mesh(tiledPlane(b - a, wallH, STONE_TILE, a, 0), wallMat);
      place(wall, (a + b) / 2, wallH / 2);
      if (wallH < C) {
        // Créneaux sur le parapet, et le dos du mur (on le voit depuis l'intérieur du chemin de ronde).
        const merlon = mat(0xb8a894, { roughness: 0.9 });
        for (let m = a + 40; m < b - 40; m += 160) {
          const blk = solid(roundedBox(80, 60, 40, 4), merlon);
          place(blk, m + 40, wallH + 30, -10);
          g.add(blk);
        }
        const top = solid(roundedBox(b - a, 14, 50, 3), merlon);
        place(top, (a + b) / 2, wallH + 2, -15);
        g.add(top);
      }
      wall.receiveShadow = true;
      g.add(wall);
      if (st.wainscot) {
        const wain = new THREE.Mesh(tiledPlane(b - a, 110, 600, a, 0), wainMat);
        place(wain, (a + b) / 2, 55, 1.5);
        g.add(wain);
        const rail = solid(roundedBox(b - a, 8, 6, 2), frameMat);
        place(rail, (a + b) / 2, 112, 3);
        rail.castShadow = false;
        g.add(rail);
      }
    }

    // Fenêtres hautes sur le mur « extérieur ».
    if (side === st.windows) {
      const tall = C >= 700;
      const sill = def.style === 'library' ? 340 : tall ? 300 : 170;
      const wh = Math.min(C - sill - 40, tall ? 420 : 230);
      const step = tall ? 600 : 450;
      let k = 0;
      for (let wu = step / 2; wu < len - 100; wu += step) {
        if (ops.some((o) => wu > o.from - 160 && wu < o.to + 160)) continue;
        addWindow(g, place, wu, sill, 110, wh, st.windowColors ? st.windowColors[k++ % st.windowColors.length] : undefined);
      }
    }

    // Torches régulièrement espacées (pas devant les portes ni les fenêtres).
    const tStep = len > 3000 ? 700 : 520;
    for (let tu = tStep / 2 + (side === st.windows ? tStep / 2 : 0); st.torches !== false && wallH >= C && tu < len - 120; tu += tStep) {
      if (ops.some((o) => tu > o.from - 120 && tu < o.to + 120)) continue;
      const th = st.torchHeight ?? 215;
      const t = addTorch(g, place, tu, th);
      torches.push(t.light);
      flames.push(t.flame);
    }

    // Portraits de famille dans la galerie (mur sud) et la chambre (mur ouest).
    if (st.portraits === side) {
      let k = def.style === 'gallery' ? 0 : 5;
      for (let pu = 260; pu < len - 200; pu += 330) {
        if (ops.some((o) => pu > o.from - 170 && pu < o.to + 170)) continue;
        addPortrait(g, place, pu, 215, k++);
      }
    }
    // Bannières dans le Grand Hall.
    if (st.banners?.includes(side)) {
      const colors = [0x8a1a2a, 0x1a3a7a, 0x8a1a2a, 0x1a3a7a];
      let k = 0;
      for (let bu = 450; bu < len - 300; bu += 650) {
        addBanner(g, place, bu, C - 120, colors[k++ % colors.length]);
      }
    }
  }

  // Plafond et poutres (pas en plein air).
  if (!st.outdoor) {
  const ceilTex = T.planks('ceiling', ['#9a6a48', '#8a5c3c', '#a87856']);
  const ceil = new THREE.Mesh(tiledPlane(W, H, 600), mat(0xffffff, texParams(ceilTex, 1, 0.9)));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, C, H / 2);
  g.add(ceil);
  const beamMat = mat(0x5a3020, { roughness: 0.75 });
  const across = W >= H;
  const span = across ? H : W;
  const run = across ? W : H;
  for (let b = 175; b < run; b += 350) {
    const beam = solid(roundedBox(across ? 30 : span, 34, across ? span : 30, 5), beamMat);
    beam.position.set(across ? b : W / 2, C - 17, across ? H / 2 : b);
    beam.castShadow = false;
    g.add(beam);
  }
  }

  // Tapis.
  if (st.rug) {
    const [m, bo, ac] = st.rug;
    if (def.style === 'gallery') addRug(g, W / 2, H / 2, W - 360, 170, m, bo, ac);
    else if (W > 2 * H || H > 2 * W) addRug(g, W / 2, H / 2, W > H ? W - 400 : 260, W > H ? 260 : H - 400, m, bo, ac);
    else addRug(g, W / 2, H / 2, Math.min(900, W * 0.55), Math.min(H - 400, H * 0.6), m, bo, ac);
  }

  // Lustres.
  const n = st.chandeliers ?? 0;
  for (let k = 0; k < n; k++) {
    const along = n === 1 ? 0.5 : 0.3 + (0.4 * k) / (n - 1);
    const [cx, cz] = W >= H ? [W * along, H / 2] : [W / 2, H * along];
    flames.push(...addChandelier(g, cx, C - (C > 700 ? 260 : 160), cz, torches));
  }

  // Horloge géante sur le mur nord de la tour.
  if (def.style === 'clocktower') addClockFace(g, W / 2, C * 0.62);

  // Ombres douces sous les meubles.
  for (const p of def.obstacles) addShadowBlob(g, p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h / 2, Math.max(p.rect.w, p.rect.h) * 0.85);

  return { group: g, ambience: [], torches, flames };
}

type Place = (o: THREE.Object3D, u: number, v: number, d?: number) => void;

function addWindow(g: THREE.Group, place: Place, u: number, sill: number, w: number, h: number, color?: number): void {
  const shape = new THREE.Shape();
  const r = w / 2;
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h - r);
  shape.absarc(0, h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color ?? 0xdde8ff).multiplyScalar(color ? 1.4 : 1.8) }));
  place(glass, u, sill, 1);
  g.add(glass);
  // Meneaux et encadrement en pierre.
  const stone = mat(0xc8b8a0, { roughness: 0.85 });
  const frame = solid(new THREE.TorusGeometry(r + 6, 7, 8, 24, Math.PI), stone);
  place(frame, u, sill + h - r, 3);
  g.add(frame);
  for (const sx of [-r - 6, r + 6]) {
    const side = solid(roundedBox(14, h - r, 12, 3), stone);
    place(side, u + sx, sill + (h - r) / 2, 3);
    g.add(side);
  }
  const sillBox = solid(roundedBox(w + 30, 12, 24, 3), stone);
  place(sillBox, u, sill - 6, 8);
  g.add(sillBox);
  const lead = metal(0x333333, 0.6);
  const vbar = new THREE.Mesh(new THREE.BoxGeometry(4, h - 10, 3), lead);
  place(vbar, u, sill + (h - 10) / 2, 2);
  g.add(vbar);
  for (let k = 1; k < 4; k++) {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(w - 4, 3, 3), lead);
    place(hb, u, sill + (k * (h - r)) / 4, 2);
    g.add(hb);
  }
}

function addTorch(g: THREE.Group, place: Place, u: number, h: number): { light: THREE.Vector3; flame: THREE.Object3D } {
  const iron = metal(0x2a2622, 0.55);
  const plate = solid(roundedBox(14, 30, 4, 2), iron);
  place(plate, u, h - 30, 2);
  const arm = solid(new THREE.CylinderGeometry(2.5, 2.5, 30, 8).rotateX(Math.PI / 2 - 0.5), iron);
  place(arm, u, h - 22, 14);
  const cup = solid(new THREE.CylinderGeometry(9, 5, 14, 10), iron);
  place(cup, u, h - 8, 24);
  const wood = solid(new THREE.CylinderGeometry(4, 3, 22, 8), mat(0x5a3220));
  place(wood, u, h - 12, 24);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(7, 22, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(3.5) }));
  place(flame, u, h + 10, 24);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0xffb060, transparent: true, opacity: REALISTIC ? 0.3 : 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(90, 90, 1);
  place(glow, u, h + 8, 26);
  g.add(plate, arm, cup, wood, flame, glow);
  const light = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  place(dummy, u, h + 14, 60);
  light.copy(dummy.position);
  return { light, flame };
}

function addPortrait(g: THREE.Group, place: Place, u: number, h: number, seed: number): void {
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(96, 128), mat(0xffffff, { map: canvasTex(REALISTIC ? realify(drawPortrait(seed), 'paint') : drawPortrait(seed)), roughness: 0.55 }));
  place(pic, u, h, 4);
  const gold = metal(0xc9a24a, 0.35);
  const frame = new THREE.Group();
  for (const [w, hh, x, y] of [[124, 14, 0, 71], [124, 14, 0, -71], [14, 156, -55, 0], [14, 156, 55, 0]] as const) {
    const b = solid(roundedBox(w, hh, 10, 3), gold);
    b.position.set(x, y, 0);
    frame.add(b);
  }
  place(frame, u, h, 4);
  g.add(pic, frame);
}

function addBanner(g: THREE.Group, place: Place, u: number, top: number, color: number): void {
  const len = 360;
  const shape = new THREE.Shape();
  shape.moveTo(-55, 0);
  shape.lineTo(55, 0);
  shape.lineTo(55, -len);
  shape.lineTo(0, -len + 40);
  shape.lineTo(-55, -len);
  shape.closePath();
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), fabric(color, { side: THREE.DoubleSide }));
  place(cloth, u, top, 6);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(26, 20), metal(0xd8b860, 0.4));
  place(emblem, u, top - 120, 7);
  const rod = solid(new THREE.CylinderGeometry(3, 3, 140, 8).rotateZ(Math.PI / 2), metal(0xc9a24a, 0.35));
  place(rod, u, top, 10);
  g.add(cloth, emblem, rod);
}

function addRug(g: THREE.Group, x: number, z: number, w: number, h: number, main: string, border: string, accent: string): void {
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fabric(0xffffff, { map: canvasTex(REALISTIC ? realify(drawCarpet(512, Math.round((512 * h) / w), main, border, accent), 'fabric') : drawCarpet(512, Math.round((512 * h) / w), main, border, accent)), sheen: 0.4 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(x, 0.8, z);
  rug.receiveShadow = true;
  g.add(rug);
}

function addChandelier(g: THREE.Group, x: number, y: number, z: number, torches: THREE.Vector3[]): THREE.Object3D[] {
  const gold = metal(0xc9a24a, 0.35);
  const ring = solid(new THREE.TorusGeometry(70, 5, 8, 32).rotateX(Math.PI / 2), gold);
  ring.position.set(x, y, z);
  const chain = solid(new THREE.CylinderGeometry(2, 2, 200, 6), gold);
  chain.position.set(x, y + 100, z);
  g.add(ring, chain);
  const flames: THREE.Object3D[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const cx = x + Math.cos(a) * 70;
    const cz = z + Math.sin(a) * 70;
    const candle = solid(new THREE.CylinderGeometry(3, 3, 18, 8), mat(0xf4ecd8));
    candle.position.set(cx, y + 12, cz);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(3.5, 11, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(3.5) }));
    flame.position.set(cx, y + 27, cz);
    g.add(candle, flame);
    flames.push(flame);
  }
  torches.push(new THREE.Vector3(x, y - 20, z));
  return flames;
}

/** Grand cadran d'horloge (avec des aiguilles qui indiquent… minuit moins cinq). */
function addClockFace(g: THREE.Group, x: number, y: number): void {
  const face = new THREE.Mesh(new THREE.CircleGeometry(170, 48), mat(0xf4ecdc, { roughness: 0.6 }));
  face.position.set(x, y, 4);
  const ring = solid(new THREE.TorusGeometry(175, 14, 12, 48), metal(0xc9a24a, 0.35));
  ring.position.set(x, y, 6);
  g.add(face, ring);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(8, 26, 4), metal(0x2a2622, 0.5));
    tick.position.set(x + Math.sin(a) * 145, y + Math.cos(a) * 145, 8);
    tick.rotation.z = -a;
    g.add(tick);
  }
  for (const [len, ang] of [[120, -0.1], [85, 0]] as const) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(10, len, 4).translate(0, len / 2, 0), metal(0x2a2622, 0.5));
    hand.position.set(x, y, 10);
    hand.rotation.z = ang;
    g.add(hand);
  }
}

function addShadowBlob(g: THREE.Group, x: number, z: number, size: number): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: T.shadow, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.6, z);
  g.add(m);
}

// ───────────────────────────── Les combles ─────────────────────────────

export const KNEE = 140;
export const RIDGE = 520;

function buildAttic(def: RoomDef, doors: DoorDef[]): RoomShell {
  const { width: W, height: H } = def;
  const g = new THREE.Group();
  const ambience: THREE.Object3D[] = [];
  const torches: THREE.Vector3[] = [];

  // Prototype réaliste : vrai vieux plancher (veinage, nœuds, crasse) au lieu des planches dessinées.
  const realMat = (w: number, h: number, o: Parameters<typeof realWood>[2], extra: THREE.MeshStandardMaterialParameters = {}) => {
    const t = realWood(w, h, o);
    return mat(0xffffff, { map: t.color, bumpMap: t.bump, bumpScale: 1.6, roughnessMap: t.rough, roughness: 1, ...extra });
  };
  const floorCanvas = REALISTIC ? null : drawPlanks(W, H, { px: 1.6, woods: ['#b8743c', '#a8652f', '#c4824a'], grain: 'rgba(90,45,20,0.35)', ink: '#3a2018' });
  const floorMat = floorCanvas
    ? mat(0xffffff, { map: canvasTex(floorCanvas), bumpMap: new THREE.CanvasTexture(floorCanvas), bumpScale: 2.5, roughness: 0.62 })
    : realMat(W, H, { base: [158, 116, 80], plank: 22, px: 0.75, grime: 0.75, seed: 3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, H / 2);
  g.add(floor);

  const wallTex = REALISTIC ? null : canvasTex(drawPlanks(W, KNEE, { px: 1, plank: 46, woods: ['#7a4a86', '#6b3d7a', '#83528f'], grain: 'rgba(43,26,46,0.3)' }));
  const wallMat = wallTex ? mat(0xffffff, { map: wallTex, bumpMap: wallTex, bumpScale: 1.5, roughness: 0.8 }) : realMat(W, KNEE, { base: [118, 98, 80], plank: 16, px: 0.9, grime: 0.6, seed: 5 });
  for (const z of [0, H]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, KNEE), wallMat);
    wall.receiveShadow = true;
    wall.position.set(W / 2, KNEE / 2, z);
    wall.rotation.y = z === 0 ? 0 : Math.PI;
    g.add(wall);
    const base = solid(roundedBox(W, 14, 8, 3), mat(0x4a2a3a, { roughness: 0.5 }));
    base.position.set(W / 2, 7, z === 0 ? 4 : H - 4);
    g.add(base);
  }

  const slope = Math.hypot(H / 2, RIDGE - KNEE);
  const roofAngle = Math.atan2(RIDGE - KNEE, H / 2);
  const roofTex = REALISTIC ? null : canvasTex(drawPlanks(W, slope, { px: 0.8, plank: 60, woods: ['#7a5038', '#6a4430', '#86583e'], grain: 'rgba(20,10,20,0.35)', nails: false }));
  const roofMat = roofTex
    ? mat(0xd8c8c0, { map: roofTex, bumpMap: roofTex, bumpScale: 2, roughness: 0.85, side: THREE.DoubleSide })
    : realMat(W, slope, { base: [92, 72, 56], plank: 20, px: 0.55, grime: 0.8, seed: 9 }, { side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, slope), roofMat);
    roof.receiveShadow = true;
    roof.position.set(W / 2, (KNEE + RIDGE) / 2, H / 2 + (side * H) / 4);
    roof.rotation.x = side < 0 ? Math.PI / 2 - roofAngle : -(Math.PI / 2 - roofAngle);
    g.add(roof);
  }

  // Pignons, avec l'ouverture de la porte vers l'escalier.
  const gableTex = REALISTIC ? null : canvasTex(drawPlanks(H, RIDGE, { px: 0.9, plank: 55, woods: ['#7a4a86', '#6b3d7a', '#83528f'], grain: 'rgba(43,26,46,0.3)', vertical: true }));
  const gableMat = gableTex
    ? mat(0xffffff, { map: gableTex, bumpMap: gableTex, bumpScale: 1.5, roughness: 0.8, side: THREE.DoubleSide })
    : realMat(H, RIDGE, { base: [112, 92, 76], plank: 18, px: 0.8, grime: 0.65, vertical: true, seed: 13 }, { side: THREE.DoubleSide });
  const frameMat = mat(0x5a3220, { roughness: 0.6 });
  for (const [x, side] of [[0, 'w'], [W, 'e']] as const) {
    const ops = openingsFor(def, doors, side);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (const o of ops) {
      shape.lineTo(o.from, 0);
      shape.lineTo(o.from, o.height);
      shape.lineTo(o.to, o.height);
      shape.lineTo(o.to, 0);
    }
    shape.lineTo(H, 0);
    shape.lineTo(H, KNEE);
    shape.lineTo(H / 2, RIDGE);
    shape.lineTo(0, KNEE);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / H, pos.getY(i) / RIDGE);
    const gable = new THREE.Mesh(geo, gableMat);
    gable.receiveShadow = true;
    gable.rotation.y = -Math.PI / 2;
    gable.position.set(x, 0, 0);
    g.add(gable);
    for (const o of ops) {
      for (const z of [o.from - 8, o.to + 8]) {
        const jamb = solid(roundedBox(30, o.height + 16, 16, 3), frameMat);
        jamb.position.set(x, (o.height + 16) / 2, z);
        g.add(jamb);
      }
      const head = solid(roundedBox(30, 18, o.to - o.from + 32, 3), frameMat);
      head.position.set(x, o.height + 9, (o.from + o.to) / 2);
      g.add(head);
    }
  }

  const beamMat = mat(0x6e3a1f, { roughness: 0.75 });
  const ridge = solid(roundedBox(W, 30, 34, 6), beamMat);
  ridge.position.set(W / 2, RIDGE - 22, H / 2);
  g.add(ridge);
  for (let x = 130; x < W; x += 270) {
    for (const side of [-1, 1]) {
      const rafter = solid(roundedBox(22, 26, slope, 5), beamMat);
      rafter.position.set(x, (KNEE + RIDGE) / 2 - 16, H / 2 + (side * H) / 4);
      rafter.rotation.x = side * roofAngle;
      g.add(rafter);
    }
    const tie = solid(roundedBox(20, 22, H * 0.62, 5), beamMat);
    tie.position.set(x, 380, H / 2);
    g.add(tie);
  }

  // Lucarne ronde.
  const winY = 360;
  const frame = solid(new THREE.TorusGeometry(62, 11, 16, 48), metal(0xc9a24a, 0.4));
  frame.rotation.y = Math.PI / 2;
  frame.position.set(W - 4, winY, H / 2);
  g.add(frame);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4c8).multiplyScalar(1.6) }));
  glass.rotation.y = -Math.PI / 2;
  glass.position.set(W - 2, winY, H / 2);
  g.add(glass);
  for (const rot of [0, Math.PI / 2]) {
    const bar = solid(roundedBox(6, 120, 8, 2), metal(0xc9a24a, 0.4));
    bar.rotation.x = rot;
    bar.position.set(W - 6, winY, H / 2);
    g.add(bar);
  }

  // Rayon de lumière, flaque de lumière et grains qui flottent.
  const beamTarget = new THREE.Vector3(W - 560, 0, H / 2 + 80);
  const beamStart = new THREE.Vector3(W - 4, winY, H / 2);
  const beamLen = beamStart.distanceTo(beamTarget);
  for (const [rTop, rBot, op] of (REALISTIC ? [[60, 170, 0.06], [45, 120, 0.055], [30, 80, 0.05]] : [[55, 150, 0.045], [40, 110, 0.04]]) as [number, number, number][]) {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, beamLen, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.position.copy(beamStart).lerp(beamTarget, 0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamTarget.clone().sub(beamStart).normalize());
    g.add(cone);
    ambience.push(cone);
  }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ map: T.soft, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(320, 200, 1);
  pool.position.set(beamTarget.x, 1, beamTarget.z);
  g.add(pool);

  const n = REALISTIC ? 420 : 160;
  const pos = new Float32Array(n * 3);
  const seeds = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = beamStart.clone().lerp(beamTarget, Math.random());
    seeds[i * 3] = p.x + (Math.random() - 0.5) * 160;
    seeds[i * 3 + 1] = Math.max(15, p.y + (Math.random() - 0.5) * 120);
    seeds[i * 3 + 2] = p.z + (Math.random() - 0.5) * 160;
    pos.set([seeds[i * 3], seeds[i * 3 + 1], seeds[i * 3 + 2]], i * 3);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(mg, new THREE.PointsMaterial({ size: 7, map: T.soft, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(points);
  ambience.push(points);

  for (const p of def.obstacles) addShadowBlob(g, p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h / 2, Math.max(p.rect.w, p.rect.h) * 0.75);
  return { group: g, ambience, torches, flames: [], motes: { points, seeds } };
}

// ───────────────────────────── Escaliers ─────────────────────────────

/** Escalier droit en pierre, fermé par des murs et un plafond en pente (coordonnées monde). */
export function buildStair(s: StairDef): { group: THREE.Group; torches: THREE.Vector3[]; flames: THREE.Object3D[] } {
  const g = new THREE.Group();
  const { x, y: z, w, h } = s.rect;
  const len = s.axis === 'x' ? w : h;
  const width = s.axis === 'x' ? h : w;
  const rise = s.yAtMax - s.yAtMin;
  const steps = Math.max(4, Math.round(Math.abs(rise) / 18));
  const stepLen = len / steps;
  const stoneMat = REALISTIC ? mat(0xd8d0c4, texParams(T.flag, 1.5, 0.85)) : mat(0xb0a08c, { roughness: 0.85 });
  const torches: THREE.Vector3[] = [];
  const flames: THREE.Object3D[] = [];

  // Repère local : axe de montée = +u, largeur = v.
  const local = new THREE.Group();
  for (let k = 0; k < steps; k++) {
    const top = s.yAtMin + (rise * (k + 1)) / steps;
    const bottom = s.yAtMin - 40;
    const hgt = top - bottom;
    const step = solid(roundedBox(stepLen + 2, hgt, width, 3), stoneMat);
    step.position.set(k * stepLen + stepLen / 2, bottom + hgt / 2, width / 2);
    local.add(step);
  }
  // Murs latéraux et plafond en pente : de vrais parallélogrammes, coupés pile au début
  // et à la fin de l'escalier (ils ne dépassent plus dans les pièces).
  const ceilH = 300;
  const y0 = s.yAtMin;
  const y1 = s.yAtMax;
  const quad = (p: number[][], uv: number[][]) => {
    const g = new THREE.BufferGeometry();
    const pos = [p[0], p[1], p[2], p[0], p[2], p[3]].flat();
    const uvs = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]].flat();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  };
  const sideMat = mat(0xffffff, { ...texParams(T.stone, 3, 0.9), side: THREE.DoubleSide });
  for (const z of [0, width]) {
    const bottom = -40;
    const corners = [[0, y0 + bottom, z], [len, y1 + bottom, z], [len, y1 + ceilH, z], [0, y0 + ceilH, z]];
    // Texture « au monde » : u = distance le long de l'escalier, v = hauteur.
    const uv = corners.map(([u, v]) => [u / STONE_TILE, v / STONE_TILE]);
    const wall = new THREE.Mesh(quad(corners, uv), sideMat);
    wall.receiveShadow = true;
    local.add(wall);
  }
  const ceilCorners = [[0, y0 + ceilH, 0], [len, y1 + ceilH, 0], [len, y1 + ceilH, width], [0, y0 + ceilH, width]];
  const ceil = new THREE.Mesh(
    quad(ceilCorners, ceilCorners.map(([u, , w]) => [u / 600, w / 600])),
    mat(0xffffff, { ...texParams(T.planks('ceiling', ['#9a6a48', '#8a5c3c', '#a87856']), 1, 0.9), side: THREE.DoubleSide }),
  );
  local.add(ceil);
  // Une torche à mi-hauteur de chaque côté.
  for (const [u, side] of [[len * 0.3, 0], [len * 0.7, width]] as const) {
    const placeOnStair: Place = (o, uu, v, d = 0) => {
      const floorAt = s.yAtMin + (rise * uu) / len;
      o.position.set(uu, floorAt + v, side === 0 ? d : width - d);
      o.rotation.y = side === 0 ? 0 : Math.PI;
    };
    const t = addTorch(local, placeOnStair, u, 200);
    torches.push(t.light);
    flames.push(t.flame);
  }

  if (s.axis === 'x') {
    local.position.set(x, 0, z);
  } else {
    local.rotation.y = -Math.PI / 2;
    local.position.set(x, 0, z);
  }
  g.add(local);
  g.updateMatrixWorld(true);
  for (const t of torches) t.applyMatrix4(local.matrixWorld);
  return { group: g, torches, flames };
}

// ───────────────────────────── Portes ─────────────────────────────

export interface DoorView {
  def: DoorDef;
  group: THREE.Group;
  pivot: THREE.Group;
  lock: THREE.Object3D;
  /** Mur au-dessus de la porte tant qu'elle est fermée (la pièce derrière n'est pas encore dessinée). */
  lintel: THREE.Object3D;
  /** 0 = fermée, 1 = grande ouverte. */
  open: number;
  target: number;
}

/** Porte en bois massif ferrée, avec un cadenas doré tant qu'elle est verrouillée. */
export function buildDoor(d: DoorDef): DoorView {
  const g = new THREE.Group();
  const width = d.to - d.from;
  const pivot = new THREE.Group();
  const leaf = new THREE.Group();
  const wood = mat(0x6a3a1e, { roughness: 0.6 });
  const iron = metal(0x2a2622, 0.5);
  // Planches verticales.
  const boards = Math.max(3, Math.round(width / 35));
  for (let k = 0; k < boards; k++) {
    const bw = width / boards;
    const b = solid(roundedBox(bw - 1, d.height - 4, 8, 2), wood);
    b.position.set(k * bw + bw / 2, d.height / 2, 0);
    leaf.add(b);
  }
  for (const hy of [d.height * 0.2, d.height * 0.75]) {
    const band = solid(roundedBox(width - 6, 10, 10, 2), iron);
    band.position.set(width / 2, hy, 0);
    leaf.add(band);
  }
  const ring = solid(new THREE.TorusGeometry(7, 1.8, 8, 16), iron);
  ring.position.set(width - 22, d.height * 0.48, 7);
  leaf.add(ring);
  pivot.add(leaf);

  const lock = new THREE.Group();
  const body = solid(roundedBox(22, 20, 10, 4), metal(0xe0b040, 0.25));
  const shackle = solid(new THREE.TorusGeometry(8, 2.5, 8, 16, Math.PI), metal(0xd8d8d8, 0.3));
  shackle.position.y = 10;
  lock.add(body, shackle);
  lock.position.set(width / 2, d.height * 0.5, 9);
  pivot.add(lock);
  const lock2 = lock.clone();
  lock2.position.z = -9;
  lock2.rotation.y = Math.PI;
  pivot.add(lock2);

  g.add(pivot);
  // Tant que la porte est verrouillée, la pièce derrière n'existe pas encore : sans ce
  // morceau de mur, on verrait le ciel au-dessus de la porte (depuis les escaliers surtout).
  const lintel = new THREE.Mesh(tiledPlane(width + 60, 280, STONE_TILE), mat(0xffffff, { ...texParams(T.stone, 3, 0.9), side: THREE.DoubleSide }));
  lintel.position.set(width / 2, d.height + 140, 0);
  lintel.receiveShadow = true;
  g.add(lintel);
  if (d.axis === 'x') {
    g.rotation.y = -Math.PI / 2;
    g.position.set(d.at, d.floorY, d.from);
  } else {
    g.position.set(d.from, d.floorY, d.at);
  }
  return { def: d, group: g, pivot, lock, lintel, open: 0, target: 0 };
}

