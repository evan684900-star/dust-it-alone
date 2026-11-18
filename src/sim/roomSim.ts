import { DIRT_ORDER, DIRT_TYPES, type DirtId } from '../data/dirtTypes';
import type { Rect, RoomDef } from '../data/rooms';
import { createRng, type Rng } from '../core/rng';
import { ParticlePool } from './particles';
import type { RoomModifiers } from '../economy/modifiers';

export interface BroomInput {
  /** Le curseur est dans la zone de jeu. */
  active: boolean;
  x: number;
  y: number;
  /** Clic maintenu : la brosse est posée au sol et balaie. Sans clic, elle est levée et ne touche rien. */
  pressed: boolean;
  /**
   * Orientation de la brosse (le lacet du regard du joueur, en radians).
   * La brosse est perpendiculaire au regard : sa face « avant » regarde dans la même direction que lui.
   */
  yaw?: number;
  /** Bonus de poussée venant du joueur (ex. : Marche du balayeur en avançant). */
  pushBonus?: number;
}

export interface CollectEvent {
  collector: number;
  type: DirtId;
  coins: number;
  x: number;
  y: number;
}

/** La brosse est un rectangle posé au sol (pas un cercle) : largeur × épaisseur. */
export interface BroomStats {
  /** Largeur de la brosse (cm), le long des poils. */
  width: number;
  /** Épaisseur de la brosse (cm), dans le sens du balayage. */
  depth: number;
  /** 0 → 1 : à quel point les particules prennent la vitesse du balai. */
  grip: number;
}

export interface Modifiers {
  valueMultiplier: number;
  /** Rayon d'aspiration douce autour des pelles. */
  collectorPull: number;
  /** Force de poussée de la brosse (Coup de balai). */
  pushPower: number;
  bunnyValue: number;
  starChance: number;
  respawnMult: number;
  /** Bonus quand un grain poussé par le balai tombe droit dans une pelle. */
  scoopBonus: number;
  /** Les pelles attirent doucement la poussière de toute la pièce. */
  magnet: boolean;
}

const FRICTION: Record<DirtId, number> = { dust: 5.5, bunny: 3.2, star: 4.5 };
/** Un grain ramassé moins de 1,2 s après un coup de balai compte comme « poussé droit dans la pelle ». */
const SCOOP_WINDOW = 1.2;
const MAX_BROOM_SPEED = 2600;

export class RoomSim {
  readonly room: RoomDef;
  readonly pool: ParticlePool;
  readonly rng: Rng;
  broom: BroomStats = { width: 74, depth: 24, grip: 0.85 };
  mods: Modifiers = { valueMultiplier: 1, collectorPull: 120, pushPower: 1, bunnyValue: 5, starChance: 0.0015, respawnMult: 1, scoopBonus: 0, magnet: false };
  /** Pelles effectives (agrandies par l'arbre). */
  collectorRects: Rect[];
  private time = 0;
  /** Dernier instant où le balai a touché chaque grain. */
  private touched: Float32Array;
  private magnetCursor = 0;

  /** Infos sur le balai pour le rendu et le son. */
  broomVel = { x: 0, y: 0 };
  broomPushed = 0;

  private prev = { x: 0, y: 0, yaw: 0, has: false };
  /** Vitesse de rotation de la brosse (rad/s), lissée. */
  broomSpin = 0;
  /** Numéro de passage : chaque particule n'est poussée qu'une fois par pas de simulation. */
  private stamp: Uint32Array;
  private stampId = 0;
  private respawnAcc: Record<DirtId, number> = { dust: 0, bunny: 0, star: 0 };
  private events: CollectEvent[] = [];
  private readonly maxDirt: number;
  private readonly patchTotal: number;

  constructor(room: RoomDef, seed = Date.now() & 0xffff) {
    this.room = room;
    this.rng = createRng(seed);
    this.pool = new ParticlePool(room.capacity);
    this.stamp = new Uint32Array(this.pool.cap);
    this.touched = new Float32Array(this.pool.cap).fill(-99);
    this.collectorRects = room.collectors.map((c) => ({ ...c.rect }));
    this.maxDirt = DIRT_ORDER.reduce((s, id) => s + (room.capacity[id] ?? 0) * DIRT_TYPES[id].dirtWeight, 0);
    this.patchTotal = room.patches.reduce((s, p) => s + p.weight, 0);
  }

  /** Applique les effets de l'Arbre des Souvenirs à cette pièce. */
  applyModifiers(m: RoomModifiers): void {
    this.broom.width = m.broomWidth;
    this.broom.grip = m.broomGrip;
    this.mods = {
      valueMultiplier: m.valueMultiplier,
      collectorPull: m.panPull,
      pushPower: m.pushPower,
      bunnyValue: m.bunnyValue,
      starChance: m.starChance,
      respawnMult: m.respawnMult,
      scoopBonus: m.scoopBonus,
      magnet: m.panMagnet,
    };
    // Pelles agrandies autour de leur bouche, sans dépasser des murs.
    this.collectorRects = this.room.collectors.map((c) => {
      const r = c.rect;
      const s = m.panScale;
      const x0 = c.mouth.x + (r.x - c.mouth.x) * s;
      const y0 = c.mouth.y + (r.y - c.mouth.y) * s;
      const x1 = c.mouth.x + (r.x + r.w - c.mouth.x) * s;
      const y1 = c.mouth.y + (r.y + r.h - c.mouth.y) * s;
      const cx0 = Math.max(0, Math.min(x0, x1));
      const cy0 = Math.max(0, Math.min(y0, y1));
      const cx1 = Math.min(this.room.width, Math.max(x0, x1));
      const cy1 = Math.min(this.room.height, Math.max(y0, y1));
      return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
    });
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
    this.time += dt;
    this.applyBroom(dt, input);
    if (this.mods.magnet) this.applyMagnet();
    this.integrate(dt);
    this.respawn(dt);
  }

  // ───────────────────────────── Balai ─────────────────────────────

  /**
   * La brosse est un rectangle orienté (largeur × épaisseur). Entre deux pas, on
   * balaie tout le volume parcouru (déplacement ET rotation, en quelques étapes),
   * et chaque grain touché prend la vitesse du point de la brosse qui le touche :
   * - de face, la brosse pousse franchement (comme un chasse-neige) ;
   * - de côté, elle glisse et n'entraîne presque rien ;
   * - en tournant la tête, le bout de la brosse va plus vite que le centre.
   */
  private applyBroom(dt: number, input: BroomInput): void {
    this.broomPushed = 0;
    if (!input.active) {
      this.prev.has = false;
      this.broomVel.x *= 0.8;
      this.broomVel.y *= 0.8;
      this.broomSpin *= 0.8;
      return;
    }
    const yaw1 = input.yaw ?? 0;
    const x0 = this.prev.has ? this.prev.x : input.x;
    const y0 = this.prev.has ? this.prev.y : input.y;
    const yaw0 = this.prev.has ? this.prev.yaw : yaw1;
    const x1 = input.x;
    const y1 = input.y;
    let dYaw = yaw1 - yaw0;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.prev.x = x1;
    this.prev.y = y1;
    this.prev.yaw = yaw1;
    this.prev.has = true;

    // Vitesses lissées (évite les à-coups de la souris).
    let mvx = (x1 - x0) / dt;
    let mvy = (y1 - y0) / dt;
    const ms = Math.hypot(mvx, mvy);
    if (ms > MAX_BROOM_SPEED) {
      mvx *= MAX_BROOM_SPEED / ms;
      mvy *= MAX_BROOM_SPEED / ms;
    }
    this.broomVel.x += (mvx - this.broomVel.x) * 0.55;
    this.broomVel.y += (mvy - this.broomVel.y) * 0.55;
    const spin = Math.max(-30, Math.min(30, dYaw / dt));
    this.broomSpin += (spin - this.broomSpin) * 0.55;
    const bvx = this.broomVel.x;
    const bvy = this.broomVel.y;
    const w = this.broomSpin;

    // Brosse levée (pas de clic) : on suit le mouvement, mais on ne touche à rien.
    if (!input.pressed) return;
    const power = this.mods.pushPower * (1 + (input.pushBonus ?? 0));
    const hw = this.broom.width / 2;
    const hd = this.broom.depth / 2;
    // Nombre d'étapes pour couvrir tout le chemin parcouru (sinon un geste rapide « saute » la poussière).
    const travel = Math.hypot(x1 - x0, y1 - y0) + Math.abs(dYaw) * hw;
    const steps = Math.max(1, Math.min(10, Math.ceil(travel / (hd * 1.4))));
    const reach = hw + hd + 16;

    const { x, y, vx, vy, alive, type } = this.pool;
    const rng = this.rng;
    const stamp = this.stamp;
    const id = ++this.stampId;
    let pushed = 0;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      const a = yaw0 + dYaw * t;
      // Repère de la brosse dans le plan du sol (x, y = z monde) :
      // tangente = le long des poils, normale = direction du regard (l'avant).
      const tx = Math.cos(a);
      const ty = -Math.sin(a);
      const nx = -Math.sin(a);
      const ny = -Math.cos(a);
      for (let i = 0; i < this.pool.cap; i++) {
        if (!alive[i] || stamp[i] === id) continue;
        const rx = x[i] - cx;
        const ry = y[i] - cy;
        if (rx > reach || rx < -reach || ry > reach || ry < -reach) continue;
        const def = DIRT_TYPES[DIRT_ORDER[type[i]]];
        const r = def.radius;
        const lt = rx * tx + ry * ty;
        const ln = rx * nx + ry * ny;
        if (lt > hw + r * 0.5 || lt < -hw - r * 0.5 || ln > hd + r || ln < -hd - r) continue;
        stamp[i] = id;
        this.touched[i] = this.time;

        // Vitesse du point de la brosse qui touche le grain (translation + rotation).
        const px = bvx + w * ry;
        const py = bvy - w * rx;
        const vn = px * nx + py * ny;
        const vt = px * tx + py * ty;
        const moving = Math.abs(vn) > 25 || Math.abs(vt) > 60;

        if (moving) {
          // De face : poussée franche. De côté : les poils glissent (un peu d'entraînement seulement).
          const tgtX = nx * vn * 1.05 + tx * vt * 0.3 + rng.range(-30, 30);
          const tgtY = ny * vn * 1.05 + ty * vt * 0.3 + rng.range(-30, 30);
          const k = Math.min(1, (this.broom.grip * power) / def.mass);
          vx[i] += (tgtX - vx[i]) * k;
          vy[i] += (tgtY - vy[i]) * k;
          // Le grain ne reste pas « dans » la brosse : il est repoussé contre sa face avant (ou arrière).
          if (Math.abs(vn) > 25) {
            const face = (vn > 0 ? 1 : -1) * (hd + r);
            const push = (face - ln) * 0.7;
            x[i] += nx * push;
            y[i] += ny * push;
          }
          pushed++;
        } else {
          // Brosse immobile posée au sol : on « frotte » sur place, la poussière s'écarte vers l'avant.
          const f = 1 - Math.min(1, Math.abs(lt) / (hw + r));
          const puff = (300 * (0.4 + 0.6 * f)) / def.mass;
          vx[i] += (nx * puff + tx * rng.range(-60, 60)) * dt * 8;
          vy[i] += (ny * puff + ty * rng.range(-60, 60)) * dt * 8;
          pushed++;
        }
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
        if (inside(this.collectorRects[c], px, py)) {
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

      // Rebond sur les meubles.
      const obstacles = this.room.obstacles;
      for (let o = 0; o < obstacles.length; o++) {
        const b = obstacles[o].rect;
        const left = b.x - r;
        const right = b.x + b.w + r;
        const top = b.y - r;
        const bottom = b.y + b.h + r;
        if (px <= left || px >= right || py <= top || py >= bottom) continue;
        // On ressort par le côté le plus proche.
        const dl = px - left;
        const dr = right - px;
        const dt2 = py - top;
        const db = bottom - py;
        const m = Math.min(dl, dr, dt2, db);
        if (m === dl) { px = left; pvx = -Math.abs(pvx) * 0.35; }
        else if (m === dr) { px = right; pvx = Math.abs(pvx) * 0.35; }
        else if (m === dt2) { py = top; pvy = -Math.abs(pvy) * 0.35; }
        else { py = bottom; pvy = Math.abs(pvy) * 0.35; }
      }

      x[i] = px;
      y[i] = py;
      vx[i] = pvx;
      vy[i] = pvy;
    }
  }

  private collect(i: number, collector: number, id: DirtId, px: number, py: number): void {
    const def = DIRT_TYPES[id];
    const base = id === 'bunny' ? this.mods.bunnyValue : def.value;
    const scoop = this.time - this.touched[i] < SCOOP_WINDOW ? 1 + this.mods.scoopBonus : 1;
    const coins = base * this.mods.valueMultiplier * scoop;
    this.pool.kill(i);
    this.events.push({ collector, type: id, coins, x: px, y: py });
  }

  /** Pelle aimantée : à chaque pas, une partie de la poussière glisse doucement vers la pelle la plus proche. */
  private applyMagnet(): void {
    const { x, y, vx, vy, alive } = this.pool;
    const cols = this.room.collectors;
    const batch = Math.max(1, Math.floor(this.pool.cap / 40));
    for (let k = 0; k < batch; k++) {
      const i = (this.magnetCursor = (this.magnetCursor + 1) % this.pool.cap);
      if (!alive[i]) continue;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < cols.length; c++) {
        const d = Math.hypot(cols[c].mouth.x - x[i], cols[c].mouth.y - y[i]);
        if (d < bestD) { bestD = d; best = c; }
      }
      const m = cols[best].mouth;
      const d = bestD || 1;
      vx[i] += ((m.x - x[i]) / d) * 70;
      vy[i] += ((m.y - y[i]) / d) * 70;
    }
  }

  // ───────────────────────────── Réapparition ─────────────────────────────

  private respawn(dt: number): void {
    for (const id of DIRT_ORDER) {
      const rate = (this.room.respawn[id] ?? 0) * this.mods.respawnMult;
      if (rate <= 0) continue;
      this.respawnAcc[id] += rate * dt;
      while (this.respawnAcc[id] >= 1) {
        this.respawnAcc[id] -= 1;
        // De temps en temps, un grain doré à la place d'un grain normal ✨
        if (id === 'dust' && this.rng.next() < this.mods.starChance && this.spawnRandom('star')) continue;
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
      if (this.collectorRects.some((r) => inside(grow(r, 60), px, py))) continue;
      if (this.room.obstacles.some((o) => inside(grow(o.rect, r + 2), px, py))) continue;
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

export function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function grow(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}
