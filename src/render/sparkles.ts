import * as THREE from 'three';

/**
 * Petites lumières (étincelles, poussières dorées, souffle de poussière) : un seul nuage de
 * points pour tout le jeu, en mode « additif » (elles brillent). Chaque étincelle a sa
 * vitesse, sa durée de vie et sa couleur ; elle s'éteint en douceur (on assombrit sa couleur).
 */
export interface SparkOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life?: number;
  color?: THREE.ColorRepresentation;
  /** Gravité (cm/s², négatif = elles montent). */
  gravity?: number;
  /** Freinage par seconde. */
  drag?: number;
  /** Taille relative (1 = normale). */
  size?: number;
  /** Petit scintillement. */
  twinkle?: boolean;
}

export class Sparkles {
  readonly points: THREE.Points;
  private readonly max: number;
  private n = 0;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private base: Float32Array;
  private life: Float32Array;
  private total: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private tw: Uint8Array;
  private sz: Float32Array;
  private time = 0;

  constructor(texture: THREE.Texture, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.total = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.tw = new Uint8Array(max);
    this.sz = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size_k', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    // Taille par étincelle : petit ajout au matériau de points standard.
    const mat = new THREE.PointsMaterial({ size: 16, map: texture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('uniform float size;', 'uniform float size;\nattribute float size_k;')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * size_k;');
    };
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  get count(): number {
    return this.n;
  }

  spawn(o: SparkOptions): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos.set([o.x, o.y, o.z], i * 3);
    this.vel.set([o.vx ?? 0, o.vy ?? 0, o.vz ?? 0], i * 3);
    const c = new THREE.Color(o.color ?? 0xffd86a);
    this.base.set([c.r, c.g, c.b], i * 3);
    this.life[i] = this.total[i] = o.life ?? 1.5;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0.8;
    this.tw[i] = o.twinkle ? 1 : 0;
    this.sz[i] = o.size ?? 1;
  }

  /** Une gerbe d'étincelles dans toutes les directions. */
  burst(x: number, y: number, z: number, n: number, o: Partial<SparkOptions> & { speed?: number } = {}): void {
    const sp = o.speed ?? 320;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const s = sp * (0.35 + Math.random() * 0.65);
      this.spawn({ life: 0.8 + Math.random() * 0.9, gravity: 260, drag: 2.2, twinkle: true, ...o, x, y, z, vx: Math.cos(a) * r * s, vy: Math.abs(u) * s * 0.9 + 60, vz: Math.sin(a) * r * s });
    }
  }

  update(dt: number): void {
    this.time += dt;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      // On compacte : les vivantes restent au début du tableau.
      if (k !== i) {
        this.pos.copyWithin(k * 3, i * 3, i * 3 + 3);
        this.vel.copyWithin(k * 3, i * 3, i * 3 + 3);
        this.base.copyWithin(k * 3, i * 3, i * 3 + 3);
        this.life[k] = this.life[i];
        this.total[k] = this.total[i];
        this.grav[k] = this.grav[i];
        this.drag[k] = this.drag[i];
        this.tw[k] = this.tw[i];
        this.sz[k] = this.sz[i];
      }
      const d = Math.exp(-this.drag[k] * dt);
      const p = k * 3;
      this.vel[p] *= d;
      this.vel[p + 1] = this.vel[p + 1] * d - this.grav[k] * dt;
      this.vel[p + 2] *= d;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
      // Apparition rapide, extinction douce, scintillement.
      const t = this.life[k] / this.total[k];
      let a = Math.min(1, (1 - t) * 8) * Math.min(1, t * 2.5);
      if (this.tw[k]) a *= 0.65 + 0.35 * Math.sin(this.time * 18 + k * 1.7);
      this.col[p] = this.base[p] * a;
      this.col[p + 1] = this.base[p + 1] * a;
      this.col[p + 2] = this.base[p + 2] * a;
      this.size[k] = this.sz[k] * (0.6 + 0.4 * t + (1 - t) * 0.2);
      k++;
    }
    this.n = k;
    const g = this.points.geometry;
    g.setDrawRange(0, k);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size_k as THREE.BufferAttribute).needsUpdate = true;
  }
}
