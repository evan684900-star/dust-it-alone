import { DIRT_ORDER, DIRT_TYPES, type DirtId } from '../data/dirtTypes';
import type { Rect, RoomDef } from '../data/rooms';
import { createRng, type Rng } from '../core/rng';
import { Combo } from '../economy/combo';
import { ParticlePool } from './particles';

export interface BroomInput {
  /** Le curseur est dans la zone de jeu. */
  active: boolean;
  x: number;
  y: number;
  /** Clic maintenu : balayage plus puissant. */
  pressed: boolean;
}

export interface CollectEvent {
  collector: number;
  type: DirtId;
  coins: number;
  x: number;
  y: number;
}

export interface BroomStats {
  radius: number;
  /** 0 → 1 : à quel point les particules prennent la vitesse du balai. */
  grip: number;
}

export interface Modifiers {
  valueMultiplier: number;
  /** Rayon d'aspiration douce autour des pelles. */
  collectorPull: number;
}

const FRICTION: Record<DirtId, number> = { dust: 5.5, bunny: 3.2, star: 4.5 };
const STAR_CHANCE = 0.0015;
const MAX_BROOM_SPEED = 2600;

export class RoomSim {
  readonly room: RoomDef;
  readonly pool: ParticlePool;
  readonly combo = new Combo();
  readonly rng: Rng;
  broom: BroomStats = { radius: 58, grip: 0.5 };
  mods: Modifiers = { valueMultiplier: 1, collectorPull: 120 };

  /** Infos sur le balai pour le rendu et le son. */
  broomVel = { x: 0, y: 0 };
  broomPushed = 0;

  private prev = { x: 0, y: 0, has: false };
  private respawnAcc: Record<DirtId, number> = { dust: 0, bunny: 0, star: 0 };
  private events: CollectEvent[] = [];
  private readonly maxDirt: number;
  private readonly patchTotal: number;

  constructor(room: RoomDef, seed = Date.now() & 0xffff) {
    this.room = room;
    this.rng = createRng(seed);
    this.pool = new ParticlePool(room.capacity);
    this.maxDirt = DIRT_ORDER.reduce((s, id) => s + (room.capacity[id] ?? 0) * DIRT_TYPES[id].dirtWeight, 0);
    this.patchTotal = room.patches.reduce((s, p) => s + p.weight, 0);
  }

  /** Remplit la pièce (début de partie, ou retour après une absence). */
  fill(ratio = 1): void {
    for (const id of ['dust', 'bunny'] as DirtId[]) {
      const target = Math.floor((this.room.capacity[id] ?? 0) * ratio);
      while (this.pool.aliveCount[id] < target && this.spawnRandom(id)) { /* remplissage */ }
    }
    for (let k = 0; k < 3; k++) this.spawnRandom('star');
    // Les particules du remplissage initial sont déjà « posées » (pas d'animation d'apparition).
    for (let i = 0; i < this.pool.cap; i++) if (this.pool.alive[i]) this.pool.age[i] = 10;
  }

  /** Propreté de la pièce, de 0 à 1. */
  get cleanliness(): number {
    return this.maxDirt === 0 ? 1 : 1 - this.pool.weightedDirt() / this.maxDirt;
  }

  drainEvents(): CollectEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(dt: number, input: BroomInput): void {
    this.applyBroom(dt, input);
    this.integrate(dt);
    this.respawn(dt);
    this.combo.update(dt);
  }

  // ───────────────────────────── Balai ─────────────────────────────

  private applyBroom(dt: number, input: BroomInput): void {
    this.broomPushed = 0;
    if (!input.active) {
      this.prev.has = false;
      this.broomVel.x *= 0.8;
      this.broomVel.y *= 0.8;
      return;
    }
    const x0 = this.prev.has ? this.prev.x : input.x;
    const y0 = this.prev.has ? this.prev.y : input.y;
    const x1 = input.x;
    const y1 = input.y;
    this.prev.x = x1;
    this.prev.y = y1;
    this.prev.has = true;

    // Vitesse du balai lissée (évite les à-coups de la souris).
    let mvx = (x1 - x0) / dt;
    let mvy = (y1 - y0) / dt;
    const ms = Math.hypot(mvx, mvy);
    if (ms > MAX_BROOM_SPEED) {
      mvx *= MAX_BROOM_SPEED / ms;
      mvy *= MAX_BROOM_SPEED / ms;
    }
    this.broomVel.x += (mvx - this.broomVel.x) * 0.55;
    this.broomVel.y += (mvy - this.broomVel.y) * 0.55;
    const bvx = this.broomVel.x;
    const bvy = this.broomVel.y;
    const speed = Math.hypot(bvx, bvy);

    const power = input.pressed ? 1.5 : 1;
    const R = this.broom.radius * (input.pressed ? 1.12 : 1);
    const minX = Math.min(x0, x1) - R;
    const maxX = Math.max(x0, x1) + R;
    const minY = Math.min(y0, y1) - R;
    const maxY = Math.max(y0, y1) + R;
    const segX = x1 - x0;
    const segY = y1 - y0;
    const segLen2 = segX * segX + segY * segY;

    const { x, y, vx, vy, alive, type } = this.pool;
    const rng = this.rng;
    let pushed = 0;
    for (let i = 0; i < this.pool.cap; i++) {
      if (!alive[i]) continue;
      const px = x[i];
      const py = y[i];
      if (px < minX || px > maxX || py < minY || py > maxY) continue;
      // Distance au segment parcouru par le balai pendant ce pas (évite de « traverser » la poussière).
      let t = segLen2 > 0 ? ((px - x0) * segX + (py - y0) * segY) / segLen2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = x0 + segX * t;
      const cy = y0 + segY * t;
      const dx = px - cx;
      const dy = py - cy;
      const d = Math.hypot(dx, dy);
      if (d >= R) continue;
      let f = 1 - d / R;
      f = f * f * (3 - 2 * f);
      const mass = DIRT_TYPES[DIRT_ORDER[type[i]]].mass;
      const nx = d > 0.001 ? dx / d : rng.range(-1, 1);
      const ny = d > 0.001 ? dy / d : rng.range(-1, 1);

      if (speed > 40) {
        // Les particules prennent la vitesse du balai, avec un léger éventail sur les côtés.
        const k = Math.min(1, (this.broom.grip * power * (0.35 + 0.65 * f)) / mass);
        const tx = bvx * 1.08 + nx * speed * 0.18 + rng.range(-40, 40);
        const ty = bvy * 1.08 + ny * speed * 0.18 + rng.range(-40, 40);
        vx[i] += (tx - vx[i]) * k;
        vy[i] += (ty - vy[i]) * k;
        pushed++;
      } else if (input.pressed) {
        // Balai immobile + clic : petite bouffée qui écarte la poussière.
        const puff = (380 * f) / mass;
        vx[i] += nx * puff * dt * 8;
        vy[i] += ny * puff * dt * 8;
        pushed++;
      }
    }
    this.broomPushed = pushed;
  }

  // ───────────────────────────── Physique ─────────────────────────────

  private integrate(dt: number): void {
    const { x, y, vx, vy, rot, age, alive, type } = this.pool;
    const W = this.room.width;
    const H = this.room.height;
    const collectors = this.room.collectors;
    const pull = this.mods.collectorPull;
    const pull2 = pull * pull;

    for (let i = 0; i < this.pool.cap; i++) {
      if (!alive[i]) continue;
      age[i] += dt;
      let pvx = vx[i];
      let pvy = vy[i];
      if (pvx * pvx + pvy * pvy < 4) {
        vx[i] = 0;
        vy[i] = 0;
        continue; // particule au repos : on ne la simule pas
      }
      const id = DIRT_ORDER[type[i]];
      const def = DIRT_TYPES[id];

      // Aspiration douce vers la bouche des pelles : plus indulgent pour le joueur.
      for (let c = 0; c < collectors.length; c++) {
        const m = collectors[c].mouth;
        const dx = m.x - x[i];
        const dy = m.y - y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 < pull2) {
          const d = Math.sqrt(d2) || 1;
          const a = 1400 * (1 - d / pull);
          pvx += (dx / d) * a * dt;
          pvy += (dy / d) * a * dt;
        }
      }

      const damp = Math.exp(-FRICTION[id] * dt);
      pvx *= damp;
      pvy *= damp;
      let px = x[i] + pvx * dt;
      let py = y[i] + pvy * dt;
      const spd = Math.hypot(pvx, pvy);
      rot[i] += (id === 'bunny' ? spd * 0.012 : spd * 0.004) * dt * (pvx >= 0 ? 1 : -1) * 6;

      // Ramassage ?
      let collected = -1;
      for (let c = 0; c < collectors.length; c++) {
        if (inside(collectors[c].rect, px, py)) {
          collected = c;
          break;
        }
      }
      if (collected >= 0) {
        this.collect(i, collected, id, px, py);
        continue;
      }

      // Rebond sur les murs.
      const r = def.radius;
      if (px < r) { px = r; pvx = -pvx * 0.35; }
      else if (px > W - r) { px = W - r; pvx = -pvx * 0.35; }
      if (py < r) { py = r; pvy = -pvy * 0.35; }
      else if (py > H - r) { py = H - r; pvy = -pvy * 0.35; }

      x[i] = px;
      y[i] = py;
      vx[i] = pvx;
      vy[i] = pvy;
    }
  }

  private collect(i: number, collector: number, id: DirtId, px: number, py: number): void {
    const def = DIRT_TYPES[id];
    this.combo.add(def.value);
    const coins = def.value * this.combo.multiplier * this.mods.valueMultiplier;
    this.pool.kill(i);
    this.events.push({ collector, type: id, coins, x: px, y: py });
  }

  // ───────────────────────────── Réapparition ─────────────────────────────

  private respawn(dt: number): void {
    for (const id of DIRT_ORDER) {
      const rate = this.room.respawn[id] ?? 0;
      if (rate <= 0) continue;
      this.respawnAcc[id] += rate * dt;
      while (this.respawnAcc[id] >= 1) {
        this.respawnAcc[id] -= 1;
        // De temps en temps, un grain doré à la place d'un grain normal ✨
        if (id === 'dust' && this.rng.next() < STAR_CHANCE && this.spawnRandom('star')) continue;
        this.spawnRandom(id);
      }
    }
  }

  private spawnRandom(id: DirtId): boolean {
    if (!this.pool.canSpawn(id)) return false;
    const r = DIRT_TYPES[id].radius;
    for (let attempt = 0; attempt < 8; attempt++) {
      const p = this.pickPatch();
      const px = p.x + this.rng.gauss() * p.spread * 0.5;
      const py = p.y + this.rng.gauss() * p.spread * 0.5;
      if (px < r + 4 || py < r + 4 || px > this.room.width - r - 4 || py > this.room.height - r - 4) continue;
      if (this.room.collectors.some((c) => inside(grow(c.rect, 60), px, py))) continue;
      this.pool.spawn(id, px, py, this.rng.range(0, Math.PI * 2));
      return true;
    }
    return false;
  }

  private pickPatch() {
    let roll = this.rng.next() * this.patchTotal;
    for (const p of this.room.patches) {
      roll -= p.weight;
      if (roll <= 0) return p;
    }
    return this.room.patches[this.room.patches.length - 1];
  }
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function grow(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}
