import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Mode « graphismes réalistes » (Réglages → Graphismes, ou ?style=real dans l'adresse).
 * Textures photo-réalistes générées par le code (bois, pierre, dalles, herbe),
 * couleurs naturelles, moutons de poussière sans yeux, grain de film et vignettage.
 * Choisi au chargement de la page (les textures sont fabriquées une seule fois).
 */
export const REALISTIC = (() => {
  if (typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search).get('style');
  if (q === 'real') return true;
  if (q === 'cartoon') return false;
  try {
    const id = localStorage.getItem('dust-it-alone:current') || 'main';
    const raw = localStorage.getItem(id === 'main' ? 'dust-it-alone:save' : `dust-it-alone:world:${id}`);
    return raw ? JSON.parse(raw)?.settings?.realistic === true : false;
  } catch {
    return false;
  }
})();

// ───────────────────────────── Bruit ─────────────────────────────

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += amp * noise(x * f, y * f, seed + o * 17);
    f *= 2;
    amp *= 0.5;
  }
  return s;
}

/** Bruit qui se répète tous les `P` (pour des textures sans raccord visible). */
function noiseP(x: number, y: number, seed: number, P: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const m = (k: number) => ((k % P) + P) % P;
  const a = hash2(m(xi), m(yi), seed);
  const b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed);
  const d = hash2(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fbm périodique : (x, y) entre 0 et 1 couvrent exactement une période. */
function fbmP(x: number, y: number, seed: number, base: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let P = base;
  for (let o = 0; o < oct; o++) {
    s += amp * noiseP(x * P, y * P, seed + o * 17, P);
    P *= 2;
    amp *= 0.5;
  }
  return s;
}

type Rgb = [number, number, number];
export interface SurfaceTextures {
  color: THREE.Texture;
  bump: THREE.Texture;
  rough: THREE.Texture;
}

function toTextures(N: number, M: number, col: ImageData, bmp: ImageData, rgh: ImageData, repeat: boolean): SurfaceTextures {
  const make = (img: ImageData, srgb: boolean) => {
    const c = document.createElement('canvas');
    c.width = N;
    c.height = M;
    c.getContext('2d')!.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { color: make(col, true), bump: make(bmp, false), rough: make(rgh, false) };
}

export interface StoneOptions {
  base: Rgb;
  mortar: Rgb;
  /** Nombre de rangées de blocs dans la texture. */
  rows: number;
  /** Nombre moyen de blocs par rangée. */
  perRow: number;
  /** Humidité et mousse (caves, cachots). */
  damp?: number;
  /** Variation de teinte entre blocs. */
  vary?: number;
  /** Joints plus ou moins larges (en pixels). */
  joint?: number;
  seed?: number;
  size?: number;
  /** Dalles de sol : usure lisse au lieu des arêtes taillées. */
  floor?: boolean;
}

/**
 * Pierre taillée (murs) ou dalles (sol), répétable sans raccord : blocs irréguliers,
 * joints de mortier, arêtes émoussées, taches, fissures, humidité et mousse.
 */
export function realStone(o: StoneOptions): SurfaceTextures {
  const N = o.size ?? 512;
  const seed = o.seed ?? 1;
  const joint = o.joint ?? 3;
  // Rangées de hauteurs différentes (assises de pierre irrégulières), dont la somme fait N.
  const rowW: number[] = [];
  for (let r = 0; r < o.rows; r++) rowW.push(0.65 + hash2(r, 77, seed) * 0.7);
  const tot = rowW.reduce((a, b) => a + b, 0);
  const rowTop: number[] = [];
  let acc = 0;
  for (let r = 0; r < o.rows; r++) {
    rowTop.push((acc / tot) * N);
    acc += rowW[r];
  }
  rowTop.push(N);
  // Découpe de chaque rangée en blocs (la somme fait exactement N : la texture se répète).
  const cuts: number[][] = [];
  for (let r = 0; r < o.rows; r++) {
    const xs: number[] = [];
    let x = hash2(r, 99, seed) * (N / o.perRow);
    xs.push(x);
    const avg = N / o.perRow;
    while (true) {
      x += avg * (0.6 + hash2(r, xs.length, seed) * 0.8);
      if (x >= xs[0] + N - avg * 0.45) break;
      xs.push(x);
    }
    cuts.push(xs);
  }
  const col = new ImageData(N, N);
  const bmp = new ImageData(N, N);
  const rgh = new ImageData(N, N);
  const vary = o.vary ?? 0.12;
  const damp = o.damp ?? 0;
  let r = 0;
  for (let j = 0; j < N; j++) {
    while (j >= rowTop[r + 1]) r++;
    const rowH = rowTop[r + 1] - rowTop[r];
    const inRow = j - rowTop[r];
    const xs = cuts[r];
    for (let i = 0; i < N; i++) {
      // Bloc qui contient ce pixel (avec repli au bord de la texture).
      let k = xs.length - 1;
      let left = xs[k] - N;
      let right = xs[0];
      for (let q = 0; q < xs.length; q++) {
        if (i >= xs[q] && (q === xs.length - 1 || i < xs[q + 1])) {
          k = q;
          left = xs[q];
          right = q === xs.length - 1 ? xs[0] + N : xs[q + 1];
          break;
        }
      }
      if (i < xs[0]) {
        k = xs.length - 1;
        left = xs[k] - N;
        right = xs[0];
      }
      const id = r * 97 + k;
      const u = i / N;
      const v = j / N;
      // Distance au joint, un peu irrégulière.
      const wob = (fbmP(u, v, seed + 5, 16, 2) - 0.5) * 3;
      const edge = Math.min(i - left, right - i, inRow, rowH - inRow) + wob;
      const n1 = fbmP(u, v, seed + 7, 8, 5);
      const n2 = fbmP(u, v, seed + 9, 32, 3);
      const tone = 1 + (hash2(id, 1, seed) - 0.5) * 2 * vary;
      const warm = (hash2(id, 2, seed) - 0.5) * 0.08;
      let h: number;
      let c: Rgb;
      if (edge < joint) {
        // Mortier (creux, granuleux).
        const g = 0.85 + 0.3 * n2;
        c = [o.mortar[0] * g, o.mortar[1] * g, o.mortar[2] * g];
        h = 0.15 + 0.1 * n2;
      } else {
        // Pierre : arêtes arrondies (taillées) ou usées (dalles).
        const bevel = Math.min(1, (edge - joint) / (o.floor ? 10 : 6));
        const shade = (o.floor ? 0.92 : 0.8) + (o.floor ? 0.08 : 0.2) * bevel;
        let g = tone * shade * (0.82 + 0.3 * n1) * (0.94 + 0.12 * n2);
        // Fissures fines.
        if (!o.floor && hash2(id, 3, seed) < 0.2 && Math.abs(fbmP(u, v, seed + (id % 7), 12, 3) - 0.5) < 0.005) g *= 0.75;
        // Usure : quelques éclats plus clairs, taches sombres.
        g *= 0.96 + 0.08 * Math.max(0, fbmP(u, v, seed + 41, 64, 2) - 0.4);
        c = [o.base[0] * g * (1 + warm), o.base[1] * g, o.base[2] * g * (1 - warm)];
        h = 0.45 + 0.4 * bevel + 0.15 * n1;
      }
      if (damp > 0) {
        // Traînées d'humidité qui descendent et mousse dans les creux.
        const wet = Math.max(0, fbmP(u * 0.5, v * 2, seed + 21, 4, 3) - 0.45) * 2 * damp;
        c = [c[0] * (1 - 0.35 * wet), c[1] * (1 - 0.3 * wet), c[2] * (1 - 0.32 * wet)];
        const moss = Math.max(0, fbmP(u, v, seed + 33, 6, 4) - 0.58) * 3 * damp * (edge < joint + 4 ? 1.4 : 0.6);
        c = [c[0] * (1 - moss) + 62 * moss, c[1] * (1 - moss) + 78 * moss, c[2] * (1 - moss) + 40 * moss];
      }
      const p = (j * N + i) * 4;
      col.data[p] = Math.max(0, Math.min(255, c[0]));
      col.data[p + 1] = Math.max(0, Math.min(255, c[1]));
      col.data[p + 2] = Math.max(0, Math.min(255, c[2]));
      col.data[p + 3] = 255;
      bmp.data[p] = bmp.data[p + 1] = bmp.data[p + 2] = Math.max(0, Math.min(255, h * 255));
      bmp.data[p + 3] = 255;
      const rough = edge < joint ? 1 : (o.floor ? 0.55 : 0.75) + 0.25 * n1 - 0.2 * damp;
      rgh.data[p] = rgh.data[p + 1] = rgh.data[p + 2] = Math.max(0, Math.min(255, rough * 255));
      rgh.data[p + 3] = 255;
    }
  }
  return toTextures(N, N, col, bmp, rgh, true);
}

/** Herbe vue de haut, répétable : brins, touffes plus sombres, terre par endroits. */
export function realGrass(size = 512): SurfaceTextures {
  const N = size;
  const col = new ImageData(N, N);
  const bmp = new ImageData(N, N);
  const rgh = new ImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const v = j / N;
      const big = fbmP(u, v, 3, 4, 4);
      const mid = fbmP(u, v, 5, 24, 3);
      const blade = noiseP(u * 256, v * 64, 7, 256) * 0.6 + noiseP(u * 64, v * 256, 8, 256) * 0.4;
      const dirt = Math.max(0, big - 0.62) * 3;
      const g = 0.55 + 0.35 * mid + 0.35 * (blade - 0.5);
      let c: Rgb = [70 * g + 18 * big, 98 * g + 20 * big, 42 * g];
      c = [c[0] * (1 - dirt) + 104 * dirt * g, c[1] * (1 - dirt) + 86 * dirt * g, c[2] * (1 - dirt) + 62 * dirt * g];
      const p = (j * N + i) * 4;
      col.data[p] = c[0];
      col.data[p + 1] = c[1];
      col.data[p + 2] = c[2];
      col.data[p + 3] = 255;
      bmp.data[p] = bmp.data[p + 1] = bmp.data[p + 2] = Math.min(255, 255 * (0.3 + 0.6 * blade * (1 - dirt * 0.6)));
      bmp.data[p + 3] = 255;
      rgh.data[p] = rgh.data[p + 1] = rgh.data[p + 2] = 235;
      rgh.data[p + 3] = 255;
    }
  }
  return toTextures(N, N, col, bmp, rgh, true);
}

/**
 * Rend une image dessinée (tapis, tableau) plus réaliste : couleurs moins vives,
 * trame de tissu ou craquelures de vieille peinture, usure.
 */
export function realify(c: HTMLCanvasElement, kind: 'fabric' | 'paint'): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const W = c.width;
  const H = c.height;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const p = (j * W + i) * 4;
      const l = 0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2];
      const sat = kind === 'fabric' ? 0.45 : 0.6;
      let r = l + (d[p] - l) * sat;
      let gg = l + (d[p + 1] - l) * sat;
      let b = l + (d[p + 2] - l) * sat;
      let k: number;
      if (kind === 'fabric') {
        // Trame croisée + usure au milieu (là où l'on marche).
        const weave = ((i % 4) < 2 ? 0.94 : 1.04) * ((j % 4) < 2 ? 1.02 : 0.96);
        const wear = 1 + 0.12 * Math.max(0, 1 - Math.abs(j / H - 0.5) * 3) * fbm(i * 0.02, j * 0.02, 51, 3);
        k = weave * wear * (0.85 + 0.25 * fbm(i * 0.05, j * 0.05, 53, 3));
      } else {
        // Vernis jauni et craquelures.
        const crack = Math.abs(fbm(i * 0.08, j * 0.08, 61, 3) - 0.5) < 0.015 ? 0.7 : 1;
        k = crack * (0.88 + 0.16 * fbm(i * 0.03, j * 0.03, 63, 3));
        r *= 1.04;
        b *= 0.86;
      }
      d[p] = Math.min(255, r * k * 0.92);
      d[p + 1] = Math.min(255, gg * k * 0.92);
      d[p + 2] = Math.min(255, b * k * 0.92);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Désature une couleur CSS « dessin » en couleur de bois naturelle (sRGB 0–255). */
export function naturalWood(hex: string): Rgb {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * 0.45, Math.min(0.55, hsl.l * 1.05));
  const o = { r: 0, g: 0, b: 0 };
  c.getRGB(o, THREE.SRGBColorSpace);
  return [o.r * 255, o.g * 255, o.b * 255].map((x) => Math.round(x)) as Rgb;
}

// ───────────────────────────── Bois ─────────────────────────────

export interface WoodOptions {
  /** Couleur moyenne du bois (sRGB 0–255). */
  base: [number, number, number];
  /** Largeur d'une planche (cm). */
  plank?: number;
  /** Pixels par cm. */
  px?: number;
  /** Planches verticales. */
  vertical?: boolean;
  /** Saleté et usure (0 à 1). */
  grime?: number;
  seed?: number;
}

/**
 * Planches de vieux bois : veinage, nœuds, joints sombres, crasse dans les coins.
 * Renvoie la couleur, une carte de relief et une carte de rugosité.
 */
export function realWood(width: number, height: number, o: WoodOptions): { color: THREE.Texture; bump: THREE.Texture; rough: THREE.Texture } {
  const px = o.px ?? 0.8;
  const W = Math.max(16, Math.round(width * px));
  const H = Math.max(16, Math.round(height * px));
  const plank = (o.plank ?? 18) * px;
  const seed = o.seed ?? 7;
  const grime = o.grime ?? 0.5;
  const col = new ImageData(W, H);
  const bmp = new ImageData(W, H);
  const rgh = new ImageData(W, H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      // Repère des planches : u le long de la planche, v en travers.
      const u = o.vertical ? j : i;
      const vv = o.vertical ? i : j;
      const row = Math.floor(vv / plank);
      const inRow = vv - row * plank;
      // Les planches sont décalées et de longueurs différentes.
      const len = plank * (9 + hash2(row, 0, seed) * 8);
      const shift = hash2(row, 1, seed) * len;
      const col0 = Math.floor((u + shift) / len);
      const along = u + shift - col0 * len;
      const pid = row * 131 + col0;
      const tone = 0.82 + hash2(pid, 2, seed) * 0.3;
      // Veinage : lignes étirées le long de la planche, déformées par du bruit.
      const warp = fbm(u * 0.004, inRow * 0.05 + pid, seed + 3, 3) * 6;
      const ring = Math.sin((inRow / plank) * 10 + warp * 3 + hash2(pid, 3, seed) * 6);
      const fine = fbm(u * 0.08, inRow * 0.9 + pid * 3, seed + 5, 3);
      let grain = 0.72 + 0.16 * ring + 0.22 * (fine - 0.5);
      // Nœuds.
      const kx = hash2(pid, 4, seed) * len;
      const ky = plank * (0.3 + hash2(pid, 5, seed) * 0.4);
      const kd = Math.hypot((along - kx) * 0.6, inRow - ky);
      const hasKnot = hash2(pid, 6, seed) < 0.35;
      if (hasKnot && kd < plank * 0.5) {
        const k = 1 - kd / (plank * 0.5);
        grain -= 0.35 * k * k + 0.08 * Math.sin(kd * 1.8) * k;
      }
      // Joints entre planches (fins et sombres, pas des contours de dessin animé).
      const edge = Math.min(inRow, plank - inRow, along, len - along);
      const seam = edge < 1.2 ? 0.35 : edge < 2.5 ? 0.75 : 1;
      // Crasse : taches diffuses + accumulation près des joints.
      const dirt = fbm(i * 0.006, j * 0.006, seed + 11, 4);
      const g = 1 - grime * (0.35 * Math.max(0, dirt - 0.35) + (edge < 5 ? 0.12 * (1 - edge / 5) : 0));
      // Rayures claires.
      const scratch = fbm(u * 0.002, inRow * 2.5 + pid, seed + 13, 2) > 0.72 ? 1.08 : 1;
      const k = tone * grain * seam * g * scratch;
      const p = (j * W + i) * 4;
      col.data[p] = Math.min(255, o.base[0] * k);
      col.data[p + 1] = Math.min(255, o.base[1] * k);
      col.data[p + 2] = Math.min(255, o.base[2] * k);
      col.data[p + 3] = 255;
      const b = Math.max(0, Math.min(255, 255 * (0.35 + 0.4 * grain) * seam));
      bmp.data[p] = bmp.data[p + 1] = bmp.data[p + 2] = b;
      bmp.data[p + 3] = 255;
      // Plus sale = plus mat ; le bois usé brille un peu.
      const r = Math.max(0, Math.min(255, 255 * (0.62 + 0.3 * dirt - 0.1 * fine)));
      rgh.data[p] = rgh.data[p + 1] = rgh.data[p + 2] = r;
      rgh.data[p + 3] = 255;
    }
  }
  const toTex = (img: ImageData, srgb: boolean) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d')!.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { color: toTex(col, true), bump: toTex(bmp, false), rough: toTex(rgh, false) };
}

/** Pierre lisse et marbrée pour les colonnes et les statues. */
let propStone: SurfaceTextures | null = null;
export function propStoneTextures(): SurfaceTextures {
  return (propStone ??= realStone({ base: [196, 188, 176], mortar: [150, 144, 136], rows: 2, perRow: 1, joint: 1.5, vary: 0.05, floor: true, size: 256, seed: 71 }));
}

/** Une texture de bois générique qui se répète (pour les meubles). */
let propWood: ReturnType<typeof realWood> | null = null;
export function propWoodTextures(): ReturnType<typeof realWood> {
  if (!propWood) {
    propWood = realWood(256, 256, { base: [150, 112, 78], plank: 64, px: 2, grime: 0.3, seed: 21 });
    for (const t of Object.values(propWood)) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return propWood;
}

// ───────────────────────────── Poussière ─────────────────────────────

/**
 * Mouton de poussière réaliste : une touffe de fibres faite de plans croisés
 * (texture de poussière découpée), qui paraît duveteuse sous tous les angles. Rayon ≈ 1.
 */
export function realBunnyTuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let k = 0; k < 7; k++) {
    const p = new THREE.PlaneGeometry(2.5 - (k % 3) * 0.25, 2.1 - (k % 2) * 0.3);
    e.set(((k * 1.7) % 3.1) - 1.5, (k * Math.PI) / 7, ((k * 2.3) % 1.2) - 0.6);
    p.applyQuaternion(q.setFromEuler(e));
    p.scale(1.35, 0.95, 1.35);
    parts.push(p);
  }
  // Plan presque horizontal pour le dessus.
  parts.push(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2).translate(0, 0.3, 0));
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  // Normales « sphériques » : la touffe est éclairée comme une boule douce, pas comme des cartes plates.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).add(new THREE.Vector3(0, 0.3, 0)).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/**
 * Mouton de poussière réaliste : une boule de duvet gris, bosselée et un peu aplatie,
 * hérissée de fibres et de cheveux qui dépassent. Pas de transparence (pas de bords noirs) ;
 * normales « en boule » pour un éclairage doux, couleurs par sommet pour le côté feutré.
 */
export function realFuzzballGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const core = new THREE.IcosahedronGeometry(1, 2);
  const p = core.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const big = fbm(v.x * 1.8 + 3, v.y * 1.8 + v.z * 1.4, 4, 3);
    const small = hash2(Math.round(v.x * 9), Math.round(v.y * 9 + v.z * 9), 9);
    v.multiplyScalar(0.72 + 0.4 * big + 0.1 * small);
    v.y *= 0.68;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  parts.push(core.toNonIndexed());
  // Fibres : de fines mèches qui sortent de la boule, plus ou moins penchées.
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  for (let k = 0; k < 36; k++) {
    const a = hash2(k, 1, 77) * Math.PI * 2;
    const b = (hash2(k, 2, 77) - 0.3) * 1.4;
    const out = new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b) * 0.8, Math.sin(a) * Math.cos(b)).normalize();
    // Les mèches sont couchées sur la boule (comme des cheveux emmêlés), pas plantées droit.
    const tangent = new THREE.Vector3(-out.z, (hash2(k, 5, 77) - 0.5) * 0.6, out.x).normalize().multiplyScalar(hash2(k, 6, 77) > 0.5 ? 1 : -1);
    const dir = out.clone().multiplyScalar(0.9).add(tangent).normalize();
    const len = 0.3 + hash2(k, 3, 77) * 0.5;
    const f = new THREE.CylinderGeometry(0.01, 0.045, len, 3, 1, true).translate(0, len / 2, 0);
    f.rotateZ((hash2(k, 4, 77) - 0.5) * 0.6);
    f.applyQuaternion(q.setFromUnitVectors(up, dir));
    f.translate(out.x * 0.78, out.y * 0.52, out.z * 0.78);
    parts.push(f.toNonIndexed());
  }
  const g = mergeGeometries(parts.map((x) => {
    x.deleteAttribute('uv');
    x.deleteAttribute('normal');
    return x;
  }))!;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = new Float32Array(pos.count * 3);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = v.length();
    const n = v.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    nrm.set([n.x, n.y, n.z], i * 3);
    // Plus clair au bout des fibres, plus sombre dans le creux et dessous.
    const shade = Math.min(1.12, 0.62 + 0.3 * r + 0.12 * (v.y + 0.5)) * (0.9 + 0.2 * hash2(Math.round(v.x * 30), Math.round(v.z * 30 + v.y * 30), 5));
    col.set([shade, shade, shade], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Ancienne version (boule bosselée), gardée pour comparer. */
export function realBunnyGeometry(): THREE.BufferGeometry {
  const body = new THREE.IcosahedronGeometry(1, 3);
  const p = body.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // Grosses bosses + petites fibres qui dépassent.
    const big = fbm(v.x * 1.6 + 3, v.y * 1.6 + v.z * 1.3, 4, 3);
    const fuzz = hash2(Math.round(v.x * 40), Math.round(v.y * 40 + v.z * 40), 9);
    const r = 0.7 + 0.5 * big + (fuzz > 0.8 ? 0.25 * fuzz : 0);
    v.multiplyScalar(r);
    v.y *= 0.6;
    p.setXYZ(i, v.x, v.y, v.z);
    c.setRGB(0.22 + 0.1 * big, 0.21 + 0.09 * big, 0.2 + 0.08 * big);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  body.computeVertexNormals();
  return body;
}

/** Flocon de poussière posé à plat : un voile doux et fibreux (géométrie rayon 1, étalée ×2,6). */
export function realDustGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2);
}

let dustTex: THREE.Texture | null = null;
/** Texture d'un amas de poussière : voile irrégulier avec des fibres. */
export function realDustTexture(): THREE.Texture {
  if (dustTex) return dustTex;
  const N = 128;
  const img = new ImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = (i - N / 2) / (N / 2);
      const dy = (j - N / 2) / (N / 2);
      const r = Math.hypot(dx, dy);
      const n = fbm(i * 0.06, j * 0.06, 31, 4);
      const fibre = fbm(i * 0.02 + j * 0.2, j * 0.02 - i * 0.2, 41, 3);
      let a = Math.max(0, 1 - r / (0.55 + 0.45 * n));
      a = Math.min(1, (a * a * (0.55 + 0.45 * n) + (fibre > 0.66 && r < 0.95 ? 0.4 : 0)) * 1.5);
      const p = (j * N + i) * 4;
      const l = 200 + 55 * n;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = l;
      img.data[p + 3] = Math.min(255, a * 255);
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  c.getContext('2d')!.putImageData(img, 0, 0);
  dustTex = new THREE.CanvasTexture(c);
  dustTex.colorSpace = THREE.SRGBColorSpace;
  return dustTex;
}

/** Couleurs de poussière réalistes : gris beige, pas de violet. */
export const REAL_DUST_COLORS = [0xb0aaa0, 0xbdb5aa, 0xa29c93, 0xc6beb2, 0x97928a];

// ───────────────────────────── Matériaux ─────────────────────────────

/**
 * Rend les couleurs « dessin animé » plus naturelles : moins saturées, un peu plus sombres,
 * plus mates ; le bois des meubles reçoit une vraie texture.
 */
/** Coordonnées de texture « par projection » (selon la face dominante), 1 unité = `scale` cm. */
function addBoxUv(g: THREE.BufferGeometry, scale = 120): void {
  if (g.attributes.uv) return;
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    const x = pos.getX(i) / scale;
    const y = pos.getY(i) / scale;
    const z = pos.getZ(i) / scale;
    if (ay >= ax && ay >= az) uv.set([x, z], i * 2);
    else if (ax >= az) uv.set([z, y], i * 2);
    else uv.set([x, y], i * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function naturalize(root: THREE.Object3D): void {
  const done = new Set<THREE.Material>();
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Les boîtes arrondies n'ont pas de coordonnées de texture : on les projette.
    if (!mesh.geometry.attributes.uv && mats.some((m) => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(m as THREE.MeshStandardMaterial).map)) addBoxUv(mesh.geometry);
    for (const m of mats) {
      if (done.has(m)) continue;
      done.add(m);
      const sm = m as THREE.MeshStandardMaterial;
      if (!sm.isMeshStandardMaterial) continue;
      sm.color.getHSL(hsl);
      const woodish = hsl.h > 0.02 && hsl.h < 0.13 && hsl.s > 0.25 && hsl.l < 0.6 && sm.metalness < 0.5;
      sm.color.setHSL(hsl.h, hsl.s * 0.4, hsl.l * 0.9);
      if (sm.metalness < 0.5) sm.roughness = Math.min(1, sm.roughness + 0.12);
      const phys = sm as THREE.MeshPhysicalMaterial;
      if (phys.isMeshPhysicalMaterial) phys.sheen = Math.min(phys.sheen, 0.25);
      const stoneish = hsl.s < 0.3 && hsl.l > 0.28 && hsl.l < 0.85 && sm.metalness < 0.3 && !sm.transparent && !phys.isMeshPhysicalMaterial;
      if (stoneish && !woodish && !sm.map && mesh.geometry.attributes.uv && sm.emissiveIntensity === 1 && sm.emissive.getHex() === 0) {
        const t = propStoneTextures();
        sm.map = t.color;
        sm.bumpMap = t.bump;
        sm.bumpScale = 1.5;
        sm.roughnessMap = t.rough;
        sm.color.setHSL(hsl.h, hsl.s * 0.3, Math.min(0.62, hsl.l * 0.85));
        sm.needsUpdate = true;
      }
      if (woodish && !sm.map && mesh.geometry.attributes.uv) {
        const t = propWoodTextures();
        sm.map = t.color;
        sm.bumpMap = t.bump;
        sm.bumpScale = 1.2;
        sm.roughnessMap = t.rough;
        // La texture est déjà colorée : on garde juste la teinte du meuble, en plus clair.
        sm.color.setHSL(hsl.h, hsl.s * 0.25, Math.min(0.85, hsl.l * 1.9));
        sm.needsUpdate = true;
      }
    }
  });
}

// ───────────────────────────── Post-traitement ─────────────────────────────

/**
 * Nettoie l'image avant le halo lumineux : un seul pixel invalide (NaN ou infini, ça arrive
 * avec le relief sur des faces minuscules) suffit sinon à faire un énorme nuage blanc.
 */
export function sanitizePass(): ShaderPass {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        bvec4 bad = bvec4(c.r != c.r || c.r > 6e4, c.g != c.g || c.g > 6e4, c.b != c.b || c.b > 6e4, false);
        if (any(bad)) c.rgb = vec3(0.0);
        gl_FragColor = vec4(min(c.rgb, vec3(64.0)), c.a);
      }`,
  });
}

/** Grain de film + vignettage + légère courbe de contraste (en fin de chaîne). */
export function filmPass(): ShaderPass {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        // Courbe en S douce.
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
        // Vignettage.
        vec2 d = vUv - 0.5;
        c *= 1.0 - smoothstep(0.35, 0.85, length(d * vec2(1.15, 1.0))) * 0.55;
        // Grain.
        c += (rnd(vUv * 1000.0) - 0.5) * 0.035;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}
