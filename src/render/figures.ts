import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Les personnages des échos du passé et de la fin : le Roi, la Reine, Gustave et son balai,
 * Rose la cuisinière, Anselme et son livre, le médecin, Élise (enfant ou adulte), Lou… et Mouton.
 *
 * Chaque personnage est un petit groupe articulé (corps, tête, bras qui peuvent bouger) :
 * - en « fantôme » : une lumière dorée transparente, plus vive sur les bords (effet de souvenir) ;
 * - en « vrai » (la fin) : des couleurs de tissu, de peau et de cheveux.
 */

export type Role =
  | 'roi' | 'reine' | 'gustave' | 'rose' | 'anselme' | 'medecin'
  | 'elise' | 'eliseAdult' | 'lou' | 'mouton';

export interface Figure {
  role: Role;
  root: THREE.Group;
  /** Partie qui se balance / sautille (tout sauf l'ombre). */
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Object3D;
  /** Matériaux fantômes (pour régler la lueur et l'apparition). */
  ghosts: THREE.ShaderMaterial[];
  /** Matériaux « vrais » (pour le fondu d'apparition). */
  solids: THREE.Material[];
  /** Hauteur du personnage (cm). */
  height: number;
  /** Tient quelque chose dans la main droite (il fait ses gestes de la main gauche). */
  hasProp: boolean;
}

interface Look {
  child: boolean;
  /** Robe longue (évasée) ou manteau droit. */
  dress: boolean;
  cloth: number;
  cloth2: number;
  skin: number;
  hair: number;
  longHair: boolean;
  pigtails: boolean;
  beard: boolean;
  hat: 'crown' | 'chef' | 'cap' | 'none';
  prop: 'broom' | 'book' | 'bag' | 'spoon' | 'none';
  cape: boolean;
  apron: boolean;
}

const LOOKS: Record<Exclude<Role, 'mouton'>, Look> = {
  roi: { child: false, dress: false, cloth: 0x7a2a3a, cloth2: 0xe8c45a, skin: 0xe8b894, hair: 0x6a4a32, longHair: false, pigtails: false, beard: true, hat: 'crown', prop: 'none', cape: true, apron: false },
  reine: { child: false, dress: true, cloth: 0x3a5a9a, cloth2: 0xe8c45a, skin: 0xf0c8a4, hair: 0xb8823a, longHair: true, pigtails: false, beard: false, hat: 'crown', prop: 'none', cape: false, apron: false },
  gustave: { child: false, dress: false, cloth: 0x5a6a4a, cloth2: 0xd8ccb0, skin: 0xd8a47e, hair: 0xb0aaa4, longHair: false, pigtails: false, beard: true, hat: 'cap', prop: 'broom', cape: false, apron: true },
  rose: { child: false, dress: true, cloth: 0xb85a4a, cloth2: 0xf4efe6, skin: 0xe8b08a, hair: 0x5a3a2a, longHair: false, pigtails: false, beard: false, hat: 'chef', prop: 'spoon', cape: false, apron: true },
  anselme: { child: false, dress: true, cloth: 0x4a3a6a, cloth2: 0xc8a85a, skin: 0xe0b490, hair: 0xd8d4cc, longHair: false, pigtails: false, beard: true, hat: 'none', prop: 'book', cape: false, apron: false },
  medecin: { child: false, dress: false, cloth: 0x2a2a34, cloth2: 0xf0f0f0, skin: 0xe8bc98, hair: 0x3a2a22, longHair: false, pigtails: false, beard: false, hat: 'none', prop: 'bag', cape: false, apron: false },
  elise: { child: true, dress: true, cloth: 0xe88aa8, cloth2: 0xffffff, skin: 0xf4cca8, hair: 0x8a5a2e, longHair: false, pigtails: true, beard: false, hat: 'none', prop: 'none', cape: false, apron: false },
  eliseAdult: { child: false, dress: true, cloth: 0x4a7aa8, cloth2: 0xf0e6d4, skin: 0xf0c8a4, hair: 0x8a5a2e, longHair: true, pigtails: false, beard: false, hat: 'none', prop: 'none', cape: false, apron: false },
  lou: { child: true, dress: true, cloth: 0xf2c440, cloth2: 0xffffff, skin: 0xf4cca8, hair: 0xc8642e, longHair: false, pigtails: false, beard: false, hat: 'none', prop: 'none', cape: false, apron: false },
};

// ───────────────────────────── Matériau « souvenir » ─────────────────────────────

const GHOST_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vY = (modelMatrix * vec4(position, 1.0)).y;
    gl_Position = projectionMatrix * mv;
  }
`;
const GHOST_FRAG = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float glow;
  uniform float time;
  uniform float floorY;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    // Bords lumineux (comme un contre-jour), centre presque transparent.
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    // Fines bandes de lumière qui montent doucement : ça « vibre » comme un souvenir.
    float scan = 0.82 + 0.18 * sin(vY * 0.22 - time * 2.6);
    // Les pieds se fondent dans le sol.
    float feet = smoothstep(floorY, floorY + 35.0, vY);
    float a = opacity * (0.28 + 0.9 * rim) * feet * (0.85 + 0.3 * glow);
    gl_FragColor = vec4(color * (0.45 + 1.7 * rim) * scan * (0.8 + 0.7 * glow), a);
  }
`;

export function ghostMaterial(floorY: number, color = 0xffd890): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: 0 },
      glow: { value: 0 },
      time: { value: 0 },
      floorY: { value: floorY },
    },
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// ───────────────────────────── Formes ─────────────────────────────

/** Profil d'un vêtement (tour du corps) : [hauteur, rayon] du bas vers le cou. */
function clothes(look: Look): THREE.BufferGeometry {
  const pts: [number, number][] = look.dress
    ? [[0, 0], [0, 30], [8, 29], [40, 23], [80, 16], [96, 12.5], [110, 14], [124, 16.5], [136, 15.5], [143, 10], [148, 5], [149, 0]]
    : [[0, 0], [0, 19], [10, 19.5], [50, 17.5], [88, 15], [98, 14.5], [112, 15.5], [126, 17], [137, 16], [144, 10], [149, 5], [150, 0]];
  return new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(r, y)), 18);
}

function arm(len: number, r: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len, 4, 8).translate(0, -len / 2 - r * 0.4, 0);
}

export function crown(r: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(r, r * 0.92, 5, 16, 1, true)];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(new THREE.ConeGeometry(2.4, 7, 6).translate(Math.cos(a) * r, 6, Math.sin(a) * r));
    parts.push(new THREE.SphereGeometry(1.4, 6, 4).translate(Math.cos(a) * r, 10, Math.sin(a) * r));
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

/** Fabrique un personnage. Les pieds sont à y = 0, il regarde vers −Z. */
export function buildFigure(role: Role, style: 'ghost' | 'real', floorY = 0, plushGeo?: THREE.BufferGeometry): Figure {
  const ghosts: THREE.ShaderMaterial[] = [];
  const solids: THREE.Material[] = [];
  const material = (color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.Material => {
    if (style === 'ghost') {
      const g = ghostMaterial(floorY);
      ghosts.push(g);
      return g;
    }
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, transparent: true, opacity: 0, ...extra });
    solids.push(m);
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, color: number, extra?: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.Mesh(geo, material(color, extra));
    m.castShadow = style === 'real';
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armL = new THREE.Group();
  const armR = new THREE.Group();

  if (role === 'mouton') {
    // Le doudou : un petit mouton tout rond, avec une tête, deux oreilles et quatre pattes.
    const fluff = mesh(plushGeo ?? new THREE.IcosahedronGeometry(1, 2), 0xf4efe6, { roughness: 1 });
    fluff.scale.set(17, 14, 20);
    fluff.position.y = 18;
    const head = mesh(new THREE.SphereGeometry(8, 14, 10), 0x4a3a44);
    head.scale.set(1, 1.05, 1.2);
    head.position.set(0, 22, -19);
    for (const sx of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(4, 8, 6), 0x4a3a44);
      ear.scale.set(1.4, 0.5, 0.8);
      ear.position.set(sx * 9, 26, -17);
      body.add(ear);
      for (const sz of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(2.6, 2.6, 8, 8), 0x4a3a44);
        leg.position.set(sx * 8, 4, sz * 9);
        body.add(leg);
      }
    }
    body.add(fluff, head);
    for (const sx of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(1.6, 8, 6), 0xffffff, { roughness: 0.2 });
      eye.position.set(sx * 3.6, 24, -27.5);
      body.add(eye);
    }
    body.scale.setScalar(1.45);
    return { role, root, body, armL, armR, head, ghosts, solids, height: 34, hasProp: false };
  }

  const look = LOOKS[role];
  const s = look.child ? 0.62 : 1;
  const headR = look.child ? 13 : 11.5;
  const cloth = mesh(clothes(look), look.cloth);
  cloth.scale.setScalar(s);
  body.add(cloth);
  const neckY = 149 * s;

  if (look.apron) {
    const apron = mesh(new THREE.CylinderGeometry(15 * s, 21 * s, 70 * s, 14, 1, true, -1.1, 2.2).translate(0, 35 * s + 30 * s, 0), look.cloth2);
    apron.rotation.y = Math.PI;
    apron.scale.z = 1.08;
    body.add(apron);
  }
  if (look.cape) {
    const cape = mesh(new THREE.CylinderGeometry(17, 30, 140, 16, 1, true, -1.25, 2.5).translate(0, 72, 0), 0x9a1a2a);
    cape.scale.set(1.08, 1, 1.12);
    body.add(cape);
    // Col d'hermine.
    const collar = mesh(new THREE.TorusGeometry(15, 4.5, 8, 18).rotateX(Math.PI / 2).translate(0, 140, 0), 0xf4f0e8);
    body.add(collar);
  }
  // Ceinture dorée.
  if (!look.apron) body.add(mesh(new THREE.TorusGeometry((look.dress ? 13 : 15.2) * s, 1.6 * s, 6, 18).rotateX(Math.PI / 2).translate(0, 97 * s, 0), look.cloth2));

  const head = new THREE.Group();
  head.position.y = neckY + headR * 0.95;
  body.add(head);
  const face = mesh(new THREE.SphereGeometry(headR, 18, 14), look.skin);
  face.scale.set(0.95, 1.05, 1);
  head.add(face);
  const nose = mesh(new THREE.SphereGeometry(headR * 0.16, 8, 6), look.skin);
  nose.position.set(0, -1, -headR * 0.98);
  head.add(nose);
  // Yeux (et un peu de rose aux joues).
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(headR * 0.13, 8, 6), 0x2b1a2e, { roughness: 0.2 });
    eye.position.set(sx * headR * 0.36, headR * 0.12, -headR * 0.9);
    head.add(eye);
    if (style === 'real') {
      const cheek = mesh(new THREE.SphereGeometry(headR * 0.18, 8, 6), 0xf09a9a);
      cheek.scale.set(1, 0.6, 0.3);
      cheek.position.set(sx * headR * 0.55, -headR * 0.25, -headR * 0.8);
      head.add(cheek);
    }
  }
  // Cheveux : une calotte (plus une longue chevelure ou des couettes).
  const cap = mesh(new THREE.SphereGeometry(headR * 1.07, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), look.hair);
  cap.rotation.x = 0.35;
  cap.position.set(0, 1, 1.5);
  head.add(cap);
  if (look.longHair) {
    const back = mesh(new THREE.CylinderGeometry(headR * 0.95, headR * 1.2, headR * 3.2, 14, 1, true, Math.PI * 0.25, Math.PI * 1.5).translate(0, -headR * 1.2, 0), look.hair);
    back.rotation.y = Math.PI * 0.25 + Math.PI / 2;
    head.add(back);
  }
  if (look.pigtails) {
    for (const sx of [-1, 1]) {
      const tail = mesh(new THREE.SphereGeometry(headR * 0.42, 10, 8), look.hair);
      tail.scale.set(0.8, 1.4, 0.8);
      tail.position.set(sx * headR * 1.08, -headR * 0.35, headR * 0.25);
      head.add(tail);
      const bow = mesh(new THREE.TorusGeometry(headR * 0.22, headR * 0.09, 6, 10), 0xd8323a);
      bow.position.set(sx * headR * 1.0, headR * 0.15, headR * 0.2);
      bow.rotation.y = Math.PI / 2;
      head.add(bow);
    }
  }
  if (look.beard) {
    const beard = mesh(new THREE.SphereGeometry(headR * 0.62, 12, 8), look.hair);
    beard.scale.set(1.05, 1.05, 0.7);
    beard.position.set(0, -headR * 0.62, -headR * 0.55);
    head.add(beard);
  }
  if (look.hat === 'crown') {
    const c = mesh(crown(headR * 0.78), 0xffd35a, { metalness: 0.8, roughness: 0.3, emissive: 0x6a4a10 });
    c.position.y = headR * 0.82;
    head.add(c);
  } else if (look.hat === 'chef') {
    const band = mesh(new THREE.CylinderGeometry(headR * 0.9, headR * 0.85, headR * 0.6, 14), 0xffffff);
    band.position.y = headR * 0.85;
    const puff = mesh(new THREE.SphereGeometry(headR * 1.05, 14, 10), 0xffffff);
    puff.scale.y = 0.75;
    puff.position.y = headR * 1.45;
    head.add(band, puff);
  } else if (look.hat === 'cap') {
    const c = mesh(new THREE.SphereGeometry(headR * 1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), 0x4a5a3a);
    c.position.y = headR * 0.15;
    const visor = mesh(new THREE.CylinderGeometry(headR * 0.75, headR * 0.75, 1.5, 14, 1, false, -Math.PI / 2, Math.PI), 0x3a4a2a);
    visor.position.set(0, headR * 0.35, -headR * 0.55);
    head.add(c, visor);
  }

  // Bras (articulés à l'épaule).
  const armLen = 52 * s;
  for (const [g, sx] of [[armL, -1], [armR, 1]] as const) {
    g.position.set(sx * 16.5 * s, 137 * s, 0);
    g.rotation.z = sx * 0.12;
    const sleeve = mesh(arm(armLen, 4.6 * s), look.cape ? look.cloth : look.dress ? look.cloth : look.cloth);
    const hand = mesh(new THREE.SphereGeometry(4.2 * s, 10, 8), look.skin);
    hand.position.y = -armLen - 7 * s;
    g.add(sleeve, hand);
    body.add(g);
  }

  // Accessoires (dans la main droite).
  const handY = -armLen - 7 * s;
  if (look.prop === 'broom') {
    const stick = mesh(new THREE.CylinderGeometry(1.8, 1.8, 150, 8).translate(0, 30, 0), 0xb8692a);
    const bristles = mesh(new THREE.ConeGeometry(12, 34, 10, 1, true).translate(0, -55, 0), 0xd8b45a);
    const tool = new THREE.Group();
    tool.add(stick, bristles);
    tool.position.set(0, handY, -6);
    tool.rotation.x = 0.25;
    armR.add(tool);
  } else if (look.prop === 'book') {
    const book = mesh(new THREE.BoxGeometry(16, 22, 5), 0x7a2a2a);
    book.position.set(0, handY - 4, -8);
    book.rotation.y = 0.5;
    armR.add(book);
  } else if (look.prop === 'bag') {
    const bag = mesh(new THREE.BoxGeometry(24, 16, 12), 0x3a2418);
    bag.position.set(0, handY - 12, 0);
    armR.add(bag);
  } else if (look.prop === 'spoon') {
    const spoon = mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 6).translate(0, -8, 0), 0x9a6a3a);
    const bowl = mesh(new THREE.SphereGeometry(4, 8, 6), 0x9a6a3a);
    bowl.position.y = -30;
    const tool = new THREE.Group();
    tool.add(spoon, bowl);
    tool.position.set(0, handY, -4);
    tool.rotation.x = Math.PI;
    armR.add(tool);
  }

  return { role, root, body, armL, armR, head, ghosts, solids, height: (149 + 26) * s, hasProp: look.prop !== 'none' };
}

/** Fait disparaître / apparaître un personnage (0 = invisible, 1 = là). */
export function setFigureOpacity(f: Figure, a: number, glow = 0, time = 0): void {
  for (const g of f.ghosts) {
    g.uniforms.opacity.value = a;
    g.uniforms.glow.value = glow;
    g.uniforms.time.value = time;
  }
  for (const m of f.solids) {
    m.opacity = a;
    m.transparent = a < 0.999;
    m.depthWrite = a > 0.5;
  }
}
