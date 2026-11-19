import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * PROTOTYPE « graphismes réalistes » (activé avec ?style=real).
 * Textures de bois photo-réalistes générées par le code, couleurs naturelles,
 * moutons de poussière sans yeux, grain de film et vignettage.
 */
export const REALISTIC = typeof location !== 'undefined' && new URLSearchParams(location.search).get('style') === 'real';

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
export function naturalize(root: THREE.Object3D): void {
  const done = new Set<THREE.Material>();
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
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
