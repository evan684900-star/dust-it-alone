import * as THREE from 'three';
import { fabric, mat, metal, solid } from './materials';
import { roundedBox } from './geometry';
import { REALISTIC, realify } from './realistic';

/**
 * Décorations murales : chaque pièce reçoit des objets selon son style (écus et épées,
 * tapisseries, casseroles, chaînes, engrenages, tonneaux, bougies, livres…).
 * Tout est construit dans un repère « mur » : x le long du mur, y vers le haut,
 * +z vers l'intérieur de la pièce. Les objets ne gênent pas le balai (ils sont accrochés en hauteur).
 */

export type DecorKind = 'shield' | 'tapestry' | 'painting' | 'pots' | 'shelf' | 'chains' | 'gears' | 'wine' | 'candles' | 'antlers' | 'books' | 'mirror' | 'ivy' | 'lantern' | 'grate';

/** Ce qu'on accroche aux murs de chaque style de pièce (dans l'ordre, en boucle). */
export const DECOR_BY_STYLE: Record<string, DecorKind[]> = {
  gallery: ['shield', 'painting'],
  library: ['books', 'painting', 'books', 'candles'],
  bedroom: ['tapestry', 'mirror', 'painting'],
  hall: ['shield', 'antlers', 'tapestry'],
  kitchen: ['pots', 'shelf', 'pots'],
  banquet: ['tapestry', 'antlers', 'shield'],
  chapel: ['candles', 'tapestry'],
  courtyard: ['ivy', 'lantern', 'ivy'],
  cellar: ['wine', 'shelf', 'wine'],
  dungeon: ['chains', 'grate', 'chains'],
  clocktower: ['gears', 'painting', 'gears'],
  throne: ['tapestry', 'shield'],
};

/** Hauteur (cm) du centre de l'objet. */
export function decorHeight(kind: DecorKind, ceiling: number): number {
  const base = Math.min(ceiling * 0.42, 270);
  if (kind === 'tapestry') return Math.min(ceiling - 220, 330);
  if (kind === 'ivy') return 150;
  if (kind === 'wine') return 95;
  if (kind === 'grate') return Math.min(ceiling - 90, 300);
  if (kind === 'gears') return Math.min(ceiling * 0.5, 340);
  return Math.max(185, base);
}

const rand = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

const cache = new Map<string, THREE.Material>();
const once = <T extends THREE.Material>(key: string, make: () => T): T => (cache.get(key) as T) ?? (cache.set(key, make()), cache.get(key) as T);

function tex(c: HTMLCanvasElement, kind: 'fabric' | 'paint' | null): THREE.Texture {
  const t = new THREE.CanvasTexture(REALISTIC && kind ? realify(c, kind) : c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────────────────────── Dessins (toiles) ─────────────────────────────

const TAPESTRY_COLORS = [['#6a1a2a', '#d8b860'], ['#1a3a6a', '#e0c070'], ['#1a4a3a', '#d8b860'], ['#4a1a5a', '#e8c86a']];

/** Une tapisserie : bordure dorée et un motif (château, arbre, mouton, soleil et lune). */
function drawTapestry(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const [bg, gold] = TAPESTRY_COLORS[seed % TAPESTRY_COLORS.length];
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 256);
  // Trame du tissu.
  g.globalAlpha = 0.12;
  for (let y = 0; y < 256; y += 3) {
    g.fillStyle = y % 6 ? '#000' : '#fff';
    g.fillRect(0, y, 128, 1);
  }
  g.globalAlpha = 1;
  g.strokeStyle = gold;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 112, 240);
  g.lineWidth = 2;
  g.strokeRect(16, 16, 96, 224);
  // Petits losanges sur la bordure.
  g.fillStyle = gold;
  for (let y = 30; y < 240; y += 24) {
    for (const x of [12, 116]) {
      g.beginPath();
      g.moveTo(x, y - 4);
      g.lineTo(x + 3, y);
      g.lineTo(x, y + 4);
      g.lineTo(x - 3, y);
      g.fill();
    }
  }
  const motif = seed % 4;
  g.fillStyle = gold;
  g.strokeStyle = gold;
  g.lineWidth = 3;
  if (motif === 0) {
    // Le château.
    g.fillRect(34, 120, 60, 70);
    g.fillRect(26, 96, 18, 94);
    g.fillRect(84, 96, 18, 94);
    for (const x of [26, 36, 84, 94]) g.fillRect(x, 88, 8, 10);
    g.fillRect(56, 86, 16, 34);
    g.beginPath();
    g.moveTo(54, 86);
    g.lineTo(64, 64);
    g.lineTo(74, 86);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(64, 175, 10, Math.PI, 0);
    g.fillRect(54, 175, 20, 15);
    g.fill();
  } else if (motif === 1) {
    // L'arbre (comme l'Arbre des Souvenirs).
    g.fillRect(60, 140, 8, 60);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      g.beginPath();
      g.arc(64 + Math.cos(a) * 24, 110 + Math.sin(a) * 20, 14, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(36, 198, 56, 6);
  } else if (motif === 2) {
    // Un mouton tout rond (le doudou d'Élise).
    for (const [x, y, r] of [[50, 128, 16], [66, 120, 18], [82, 128, 16], [58, 142, 16], [76, 142, 16]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(44, 128, 9, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = gold;
    g.fillRect(54, 156, 5, 16);
    g.fillRect(74, 156, 5, 16);
  } else {
    // Le soleil et la lune.
    g.beginPath();
    g.arc(64, 96, 20, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 24, 96 + Math.sin(a) * 24);
      g.lineTo(64 + Math.cos(a) * 34, 96 + Math.sin(a) * 34);
      g.stroke();
    }
    g.beginPath();
    g.arc(64, 170, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(74, 164, 20, 0, Math.PI * 2);
    g.fill();
  }
  // Franges en bas.
  g.fillStyle = gold;
  for (let x = 10; x < 120; x += 6) g.fillRect(x, 246, 3, 10);
  return c;
}

/** Petit tableau : un paysage (collines, ciel, château au loin). */
function drawLandscape(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  const r = rand(seed * 77 + 5);
  const skies = [['#7ab8e8', '#f8e0b0'], ['#e8906a', '#f8d890'], ['#5a6ab0', '#e8b8c8']];
  const [top, bottom] = skies[seed % skies.length];
  const sky = g.createLinearGradient(0, 0, 0, 60);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 96);
  const greens = ['#4a7a3a', '#5a8a44', '#3a6a30'];
  for (let k = 0; k < 3; k++) {
    g.fillStyle = greens[k];
    g.beginPath();
    g.moveTo(0, 96);
    const base = 50 + k * 14;
    for (let x = 0; x <= 128; x += 8) g.lineTo(x, base + Math.sin(x * 0.05 + r() * 6) * 8);
    g.lineTo(128, 96);
    g.fill();
  }
  // Un château minuscule sur la colline.
  g.fillStyle = '#6a5a6a';
  const cx = 30 + r() * 60;
  g.fillRect(cx, 42, 16, 12);
  g.fillRect(cx - 4, 36, 6, 18);
  g.fillRect(cx + 14, 36, 6, 18);
  g.fillStyle = '#fff6c0';
  g.beginPath();
  g.arc(100 - (seed % 3) * 30, 18, 7, 0, Math.PI * 2);
  g.fill();
  return c;
}

// ───────────────────────────── Objets ─────────────────────────────

function shield(seed: number): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-34, 40);
  s.lineTo(34, 40);
  s.lineTo(34, 5);
  s.quadraticCurveTo(30, -35, 0, -52);
  s.quadraticCurveTo(-30, -35, -34, 5);
  s.closePath();
  const colors = [0x8a1a2a, 0x1a3a7a, 0x1a5a3a, 0x5a1a6a];
  const body = solid(new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2 }), mat(colors[seed % colors.length], { roughness: 0.5 }));
  body.position.z = 10;
  // Bande dorée en diagonale et bosse centrale.
  const gold = metal(0xd8b860, 0.35);
  const band = solid(new THREE.BoxGeometry(14, 100, 3), gold);
  band.rotation.z = 0.7 * (seed % 2 ? 1 : -1);
  band.position.z = 17.5;
  const boss = solid(new THREE.SphereGeometry(9, 12, 8), gold);
  boss.scale.z = 0.5;
  boss.position.set(0, 0, 19);
  // Deux épées croisées derrière.
  const steel = metal(0xc8ccd4, 0.25);
  const hilt = mat(0x5a3220, { roughness: 0.6 });
  for (const side of [-1, 1]) {
    const sword = new THREE.Group();
    const blade = solid(new THREE.BoxGeometry(6, 120, 2), steel);
    blade.position.y = 30;
    const guard = solid(new THREE.BoxGeometry(30, 5, 5), gold);
    guard.position.y = -32;
    const grip = solid(new THREE.CylinderGeometry(2.5, 2.5, 20, 6), hilt);
    grip.position.y = -45;
    const pommel = solid(new THREE.SphereGeometry(4, 8, 6), gold);
    pommel.position.y = -57;
    sword.add(blade, guard, grip, pommel);
    sword.rotation.z = side * 0.75;
    sword.position.z = 4;
    g.add(sword);
  }
  g.add(body, band, boss);
  return g;
}

function tapestry(seed: number, ceiling: number): THREE.Group {
  const g = new THREE.Group();
  const h = Math.min(320, ceiling - 260);
  const w = h / 2;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 6), fabric(0xffffff, { map: tex(drawTapestry(seed), 'fabric'), sheen: 0.5, side: THREE.DoubleSide }));
  // Petites ondulations du tissu.
  const p = cloth.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 0.05 + seed) * 2.5);
  cloth.geometry.computeVertexNormals();
  cloth.position.z = 5;
  cloth.receiveShadow = true;
  const rod = solid(new THREE.CylinderGeometry(3, 3, w + 30, 8).rotateZ(Math.PI / 2), metal(0xc9a24a, 0.35));
  rod.position.set(0, h / 2 + 4, 8);
  const knobs = [-1, 1].map((sx) => {
    const k = solid(new THREE.SphereGeometry(5, 8, 6), metal(0xc9a24a, 0.35));
    k.position.set(sx * (w / 2 + 15), h / 2 + 4, 8);
    return k;
  });
  g.add(cloth, rod, ...knobs);
  return g;
}

function painting(seed: number): THREE.Group {
  const g = new THREE.Group();
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(100, 75), mat(0xffffff, { map: tex(drawLandscape(seed), 'paint'), roughness: 0.6 }));
  pic.position.z = 5;
  const wood = seed % 2 ? metal(0xc9a24a, 0.35) : mat(0x5a3220, { roughness: 0.55 });
  for (const [w, h, x, y] of [[120, 11, 0, 43], [120, 11, 0, -43], [11, 97, -55, 0], [11, 97, 55, 0]] as const) {
    const b = solid(roundedBox(w, h, 8, 3), wood);
    b.position.set(x, y, 5);
    g.add(b);
  }
  g.add(pic);
  return g;
}

function pots(seed: number): THREE.Group {
  const g = new THREE.Group();
  const copper = metal(0xc8784a, 0.3);
  const iron = metal(0x3a3632, 0.5);
  const bar = solid(new THREE.CylinderGeometry(2.5, 2.5, 200, 8).rotateZ(Math.PI / 2), iron);
  bar.position.set(0, 50, 14);
  g.add(bar);
  for (const sx of [-1, 1]) {
    const hook = solid(roundedBox(6, 20, 14, 2), iron);
    hook.position.set(sx * 95, 50, 7);
    g.add(hook);
  }
  const r = rand(seed + 3);
  for (let k = 0; k < 5; k++) {
    const x = -80 + k * 40;
    const hang = 14 + r() * 26;
    const chain = solid(new THREE.CylinderGeometry(0.8, 0.8, hang, 4), iron);
    chain.position.set(x, 50 - hang / 2, 14);
    g.add(chain);
    const big = 10 + r() * 9;
    if (k % 2) {
      // Une poêle.
      const pan = solid(new THREE.CylinderGeometry(big, big * 0.85, 5, 16).rotateX(Math.PI / 2), copper);
      pan.position.set(x, 50 - hang - big, 16);
      const handle = solid(new THREE.CylinderGeometry(1.8, 1.8, big * 1.4, 6), mat(0x5a3220));
      handle.position.set(x, 50 - hang - big * 0.15, 16);
      g.add(pan, handle);
    } else {
      // Une casserole.
      const pot = solid(new THREE.CylinderGeometry(big * 0.9, big * 0.75, big * 1.2, 14, 1, true), copper);
      pot.position.set(x, 50 - hang - big * 0.7, 18);
      const bottom = solid(new THREE.CircleGeometry(big * 0.75, 14).rotateX(Math.PI / 2), copper);
      bottom.position.set(x, 50 - hang - big * 1.3, 18);
      g.add(pot, bottom);
    }
  }
  return g;
}

function shelf(seed: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x6a4028, { roughness: 0.7 });
  const r = rand(seed + 11);
  for (const y of [-25, 25]) {
    const board = solid(roundedBox(170, 6, 28, 2), wood);
    board.position.set(0, y, 14);
    g.add(board);
    for (const sx of [-1, 1]) {
      const bracket = solid(new THREE.BoxGeometry(5, 18, 22), wood);
      bracket.position.set(sx * 70, y - 12, 11);
      g.add(bracket);
    }
    // Pots, bocaux et bouteilles.
    const colors = [0xd8c8a0, 0x7a9a6a, 0xb86a4a, 0x6a8ab0, 0xe8d8b8];
    for (let x = -70; x < 70; x += 16 + r() * 10) {
      const h = 14 + r() * 18;
      const jar = solid(new THREE.CylinderGeometry(5 + r() * 3, 6 + r() * 3, h, 10), mat(colors[Math.floor(r() * colors.length)], { roughness: 0.45 }));
      jar.position.set(x, y + 3 + h / 2, 16);
      g.add(jar);
      if (r() < 0.5) {
        const lid = solid(new THREE.CylinderGeometry(4, 4, 4, 8), mat(0x6a4028));
        lid.position.set(x, y + 5 + h, 16);
        g.add(lid);
      }
    }
  }
  return g;
}

function chains(seed: number): THREE.Group {
  const g = new THREE.Group();
  const iron = metal(0x4a4640, 0.6);
  const plate = solid(roundedBox(26, 26, 6, 3), iron);
  plate.position.set(0, 60, 3);
  g.add(plate);
  const ring = solid(new THREE.TorusGeometry(9, 2.2, 6, 14), iron);
  ring.position.set(0, 50, 9);
  g.add(ring);
  // Deux chaînes qui pendent, avec leurs menottes.
  for (const sx of [-1, 1]) {
    const n = 7 + ((seed + (sx > 0 ? 1 : 0)) % 3);
    for (let k = 0; k < n; k++) {
      const link = solid(new THREE.TorusGeometry(4.5, 1.3, 5, 10), iron);
      link.scale.y = 1.5;
      link.rotation.y = k % 2 ? Math.PI / 2 : 0;
      link.position.set(sx * (5 + k * 3.2), 40 - k * 11, 10);
      g.add(link);
    }
    const cuff = solid(new THREE.TorusGeometry(8, 2.6, 6, 14).rotateX(Math.PI / 2), iron);
    cuff.position.set(sx * (5 + n * 3.2), 36 - n * 11, 12);
    g.add(cuff);
  }
  return g;
}

function gear(r: number, teeth: number, material: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  for (let k = 0; k < teeth * 2; k++) {
    const a0 = (k / (teeth * 2)) * Math.PI * 2;
    const a1 = ((k + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 ? r : r * 1.14;
    if (k === 0) s.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    else s.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    s.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.25, 0, Math.PI * 2, true);
  s.holes.push(hole);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const w = new THREE.Path();
    w.absarc(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * 0.18, 0, Math.PI * 2, true);
    s.holes.push(w);
  }
  return solid(new THREE.ExtrudeGeometry(s, { depth: 6, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 1, curveSegments: 6 }), material);
}

function gears(seed: number): THREE.Group {
  const g = new THREE.Group();
  const bronze = metal(0xb8864a, 0.35);
  const dark = metal(0x6a5a4a, 0.45);
  const a = gear(70, 16, bronze);
  a.position.set(-40, 10, 4);
  const b = gear(42, 11, dark);
  b.position.set(68, 46, 8);
  b.rotation.z = 0.15 + seed;
  const c = gear(28, 8, bronze);
  c.position.set(52, -48, 12);
  g.add(a, b, c);
  for (const m of [a, b, c]) {
    const axle = solid(new THREE.CylinderGeometry(6, 6, 18, 10).rotateX(Math.PI / 2), dark);
    axle.position.set(m.position.x, m.position.y, m.position.z + 6);
    g.add(axle);
  }
  return g;
}

function wine(seed: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x7a4a2a, { roughness: 0.7 });
  const hoop = metal(0x3a3632, 0.5);
  const r = rand(seed + 21);
  // Une pile de tonneaux couchés, vus par le fond, dans un casier.
  for (const [x, y] of [[-48, -30], [0, -30], [48, -30], [-24, 12], [24, 12]]) {
    const barrel = solid(new THREE.CylinderGeometry(22, 22, 40, 16).rotateX(Math.PI / 2), wood);
    barrel.position.set(x, y, 22);
    const ring = solid(new THREE.TorusGeometry(21, 2, 6, 18), hoop);
    ring.position.set(x, y, 42);
    const tap = solid(new THREE.CylinderGeometry(2, 2, 8, 6).rotateX(Math.PI / 2), mat(0x8a6a3a));
    tap.position.set(x, y - 10, 44);
    g.add(barrel, ring);
    if (r() < 0.6) g.add(tap);
  }
  const rack = solid(roundedBox(150, 8, 46, 2), mat(0x5a3220, { roughness: 0.7 }));
  rack.position.set(0, -56, 23);
  g.add(rack);
  return g;
}

function candles(seed: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x5a3220, { roughness: 0.65 });
  const board = solid(roundedBox(150, 7, 26, 2), wood);
  board.position.set(0, -10, 13);
  g.add(board);
  const wax = mat(0xf4ecd8, { roughness: 0.5 });
  const flameMat = once('candle-flame', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(3.2) }));
  const r = rand(seed + 31);
  for (let x = -60; x <= 60; x += 15) {
    const h = 10 + r() * 22;
    const c = solid(new THREE.CylinderGeometry(3, 3.3, h, 8), wax);
    c.position.set(x, -6 + h / 2, 14 + (r() - 0.5) * 8);
    const f = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 6), flameMat);
    f.position.set(c.position.x, -6 + h + 5, c.position.z);
    g.add(c, f);
  }
  return g;
}

function antlers(seed: number): THREE.Group {
  void seed;
  const g = new THREE.Group();
  const wood = mat(0x5a3220, { roughness: 0.6 });
  const plaque = solid(new THREE.CylinderGeometry(24, 24, 6, 6).rotateX(Math.PI / 2), wood);
  plaque.position.z = 3;
  const skull = solid(new THREE.SphereGeometry(11, 10, 8), mat(0xe8dcc0, { roughness: 0.7 }));
  skull.scale.set(1, 1.3, 0.9);
  skull.position.set(0, -2, 12);
  g.add(plaque, skull);
  const bone = mat(0xd8c8a8, { roughness: 0.7 });
  for (const sx of [-1, 1]) {
    const main = solid(new THREE.CylinderGeometry(2, 3.2, 70, 6).translate(0, 35, 0), bone);
    main.position.set(sx * 8, 8, 12);
    main.rotation.z = -sx * 0.6;
    g.add(main);
    for (const [t, len, ang] of [[0.35, 26, 0.6], [0.6, 22, 0.4], [0.85, 18, 0.2]] as const) {
      const tine = solid(new THREE.CylinderGeometry(1.2, 2, len, 5).translate(0, len / 2, 0), bone);
      const ax = sx * 8 + Math.sin(sx * 0.6) * 70 * t;
      const ay = 8 + Math.cos(0.6) * 70 * t;
      tine.position.set(ax, ay, 12);
      tine.rotation.z = sx * ang;
      g.add(tine);
    }
  }
  return g;
}

function books(seed: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x5a3422, { roughness: 0.65 });
  const r = rand(seed + 41);
  const colors = [0x8a2a2a, 0x2a4a7a, 0x2a6a4a, 0x7a5a2a, 0x5a2a6a, 0xa8823a];
  for (const y of [-40, 10, 60]) {
    const board = solid(roundedBox(180, 6, 30, 2), wood);
    board.position.set(0, y, 15);
    g.add(board);
    let x = -84;
    while (x < 82) {
      const w = 5 + r() * 6;
      const h = 26 + r() * 16;
      if (r() < 0.12) {
        x += 10;
        continue;
      }
      const book = solid(new THREE.BoxGeometry(w, h, 22), mat(colors[Math.floor(r() * colors.length)], { roughness: 0.6 }));
      book.position.set(x + w / 2, y + 3 + h / 2, 15);
      book.rotation.z = r() < 0.1 ? 0.25 : 0;
      g.add(book);
      x += w + 0.8;
    }
  }
  for (const sx of [-1, 1]) {
    const side = solid(roundedBox(6, 130, 30, 2), wood);
    side.position.set(sx * 92, 12, 15);
    g.add(side);
  }
  return g;
}

function mirror(): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CircleGeometry(40, 32), metal(0xdfe8f0, 0.08));
  glass.scale.y = 1.35;
  glass.position.z = 5;
  const frame = solid(new THREE.TorusGeometry(42, 5, 8, 32), metal(0xc9a24a, 0.3));
  frame.scale.y = 1.35;
  frame.position.z = 6;
  g.add(glass, frame);
  return g;
}

function ivy(seed: number): THREE.Group {
  const g = new THREE.Group();
  const leafMats = [0x3a7a3a, 0x4a8a3a, 0x2f6a34].map((c) => mat(c, { roughness: 0.75, side: THREE.DoubleSide }));
  const geo = new THREE.CircleGeometry(9, 5);
  const r = rand(seed + 51);
  // Une plante grimpante : des tiges qui montent en serpentant, couvertes de feuilles.
  for (let s = 0; s < 4; s++) {
    let x = (r() - 0.5) * 160;
    let y = -150;
    for (let k = 0; k < 26; k++) {
      x += (r() - 0.5) * 18;
      y += 10 + r() * 6;
      const leaf = new THREE.Mesh(geo, leafMats[Math.floor(r() * 3)]);
      leaf.position.set(x + (r() - 0.5) * 16, y, 3 + r() * 6);
      leaf.rotation.set((r() - 0.5) * 0.8, (r() - 0.5) * 0.8, r() * Math.PI);
      leaf.scale.setScalar(0.7 + r() * 0.7);
      g.add(leaf);
    }
  }
  return g;
}

function lantern(): THREE.Group {
  const g = new THREE.Group();
  const iron = metal(0x2a2622, 0.5);
  const arm = solid(new THREE.BoxGeometry(4, 4, 34), iron);
  arm.position.set(0, 30, 17);
  const cage = solid(new THREE.CylinderGeometry(9, 12, 26, 6, 1, true), iron);
  cage.position.set(0, 8, 34);
  const roof = solid(new THREE.ConeGeometry(13, 12, 6), iron);
  roof.position.set(0, 27, 34);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 20, 6), once('lantern-glow', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(2.2) })));
  glow.position.set(0, 8, 34);
  g.add(arm, cage, roof, glow);
  return g;
}

function grate(): THREE.Group {
  const g = new THREE.Group();
  // Un soupirail : un trou sombre et des barreaux.
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), mat(0x0e0c10, { roughness: 1 }));
  hole.position.z = 1;
  const glowSky = new THREE.Mesh(new THREE.PlaneGeometry(80, 12), new THREE.MeshBasicMaterial({ color: 0x4a5a7a }));
  glowSky.position.set(0, 16, 1.5);
  const iron = metal(0x3a3632, 0.55);
  g.add(hole, glowSky);
  for (let x = -36; x <= 36; x += 12) {
    const bar = solid(new THREE.CylinderGeometry(2, 2, 54, 6), iron);
    bar.position.set(x, 0, 4);
    g.add(bar);
  }
  const frame = solid(roundedBox(100, 8, 10, 2), mat(0x6a6058));
  frame.position.set(0, -28, 5);
  g.add(frame);
  return g;
}

/** Fabrique un objet décoratif. */
export function buildDecor(kind: DecorKind, seed: number, ceiling: number): THREE.Group {
  switch (kind) {
    case 'shield': return shield(seed);
    case 'tapestry': return tapestry(seed, ceiling);
    case 'painting': return painting(seed);
    case 'pots': return pots(seed);
    case 'shelf': return shelf(seed);
    case 'chains': return chains(seed);
    case 'gears': return gears(seed);
    case 'wine': return wine(seed);
    case 'candles': return candles(seed);
    case 'antlers': return antlers(seed);
    case 'books': return books(seed);
    case 'mirror': return mirror();
    case 'ivy': return ivy(seed);
    case 'lantern': return lantern();
    case 'grate': return grate();
  }
}

/** Largeur occupée sur le mur (pour ne pas chevaucher portes et fenêtres). */
export function decorWidth(kind: DecorKind): number {
  return kind === 'books' || kind === 'pots' || kind === 'shelf' ? 200 : kind === 'gears' ? 230 : kind === 'ivy' ? 200 : kind === 'wine' ? 160 : kind === 'tapestry' ? 180 : 140;
}
