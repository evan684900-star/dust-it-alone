import { DIRT_ORDER, DIRT_TYPES, type DirtId, type ToolId } from '../data/dirtTypes';
import type { Rect, RoomDef } from '../data/rooms';
import { createRng, type Rng } from '../core/rng';
import { ParticlePool } from './particles';
import type { RoomModifiers } from '../economy/modifiers';
import { HELPER_RATE, Helper, NO_HELPERS, type HelperKind, type HelperTeam } from './helpers';

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
  /** Outil en main (balai par défaut). */
  tool?: ToolId;
}

export interface CollectEvent {
  /** Pelle qui a ramassé (−1 = ramassé directement : outil, aspirateur). */
  collector: number;
  /** Ramassé par un assistant (pas de « +N » à l'écran, pour ne pas surcharger). */
  byHelper?: boolean;
  type: DirtId;
  coins: number;
  x: number;
  y: number;
  /** Multijoueur : joueur qui a poussé ou ramassé ce grain (0 = moi). */
  owner?: number;
}

/** La brosse est un rectangle posé au sol (pas un cercle) : largeur × épaisseur. */
/** Mémoire d'un balai entre deux pas (position précédente, vitesses lissées). */
export interface BroomState {
  /** Joueur qui tient ce balai (0 = moi / l'hôte ; 1 à 3 = invités en multijoueur). */
  owner?: number;
  prev: { x: number; y: number; yaw: number; has: boolean };
  vel: { x: number; y: number };
  spin: number;
  pushed: number;
}
export function newBroomState(): BroomState {
  return { prev: { x: 0, y: 0, yaw: 0, has: false }, vel: { x: 0, y: 0 }, spin: 0, pushed: 0 };
}

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
  starValue: number;
  respawnMult: number;
  /** Bonus quand un grain poussé par le balai tombe droit dans une pelle. */
  scoopBonus: number;
  /** Les pelles attirent doucement la poussière de toute la pièce. */
  magnet: boolean;
  /** Puissance des outils (1 = de base) et capacité du réservoir de l'aspirateur. */
  duster: number;
  sponge: number;
  blower: number;
  vacuumCap: number;
  handpan: number;
  whirl: number;
}

/** Grand balai-brosse : plus large, mais il « accroche » un peu moins. */
export const WIDE_BROOM = { width: 2.2, grip: 0.8 };
/** Pelle à main : un coup de pelle toutes les 0,6 s, dans un rayon de 42 cm, 35 grains au plus. */
export const HAND_PAN = { every: 0.6, radius: 42, max: 35 };
/** Balai magique : rayon d'attraction et rayon où les grains sont avalés. */
export const WHIRL = { radius: 220, swallow: 24 };

/** Un grain ramassé moins de 1,2 s après un coup de balai compte comme « poussé droit dans la pelle ». */
const SCOOP_WINDOW = 1.2;
const MAX_BROOM_SPEED = 2600;

export class RoomSim {
  readonly room: RoomDef;
  readonly pool: ParticlePool;
  readonly rng: Rng;
  broom: BroomStats = { width: 74, depth: 24, grip: 0.85 };
  mods: Modifiers = { valueMultiplier: 1, collectorPull: 120, pushPower: 1, bunnyValue: 5, starChance: 0.0015, starValue: 1, respawnMult: 1, scoopBonus: 0, magnet: false, duster: 1, sponge: 1, blower: 1, vacuumCap: 300, handpan: 1, whirl: 1 };
  /** Grains dans le réservoir de l'aspirateur. */
  vacuumLoad = 0;
  /** L'outil a touché quelque chose ce pas-ci (pour le son). */
  toolActive = 0;
  /** Pelles effectives (agrandies par l'arbre). */
  collectorRects: Rect[];
  private time = 0;
  /** Dernier instant où le balai a touché chaque grain. */
  private touched: Float32Array;
  /** Multijoueur : dernier joueur qui a touché chaque grain. */
  readonly ownerOf: Uint8Array;
  /** Joueur qui utilise l'outil en ce moment (pour attribuer les grains ramassés directement). */
  private toolOwner = 0;
  private magnetCursor = 0;

  /** État du balai du joueur (les assistants ont chacun le leur). */
  readonly player: BroomState = newBroomState();
  /** Infos sur le balai pour le rendu et le son. */
  get broomVel(): { x: number; y: number } {
    return this.player.vel;
  }
  get broomSpin(): number {
    return this.player.spin;
  }
  get broomPushed(): number {
    return this.player.pushed;
  }

  /** Numéro de passage : chaque particule n'est poussée qu'une fois par pas de simulation. */
  private stamp: Uint32Array;
  private stampId = 0;
  private respawnAcc = Object.fromEntries(DIRT_ORDER.map((d) => [d, 0])) as Record<DirtId, number>;
  private events: CollectEvent[] = [];
  private readonly maxDirt: number;
  private readonly patchTotal: number;

  constructor(room: RoomDef, seed = Date.now() & 0xffff) {
    this.room = room;
    this.rng = createRng(seed);
    this.pool = new ParticlePool(room.capacity);
    this.stamp = new Uint32Array(this.pool.cap);
    this.touched = new Float32Array(this.pool.cap).fill(-99);
    this.ownerOf = new Uint8Array(this.pool.cap);
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
      starValue: m.starValue,
      respawnMult: m.respawnMult,
      scoopBonus: m.scoopBonus,
      magnet: m.panMagnet,
      duster: m.duster,
      sponge: m.sponge,
      blower: m.blower,
      vacuumCap: m.vacuumCap,
      handpan: m.handpan,
      whirl: m.whirl,
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

  /** Remet exactement la quantité de poussière sauvegardée (positions tirées au hasard dans les zones sales). */
  fillCounts(counts: Partial<Record<DirtId, number>>): void {
    for (const id of DIRT_ORDER) {
      // Type absent de la sauvegarde (nouveau type de saleté) : la pièce le reçoit plein.
      const want = id in counts ? counts[id]! : id === 'star' ? 3 : (this.room.capacity[id] ?? 0);
      const target = Math.min(this.room.capacity[id] ?? 0, Math.max(0, Math.floor(want)));
      let guard = target * 4 + 10;
      while (this.pool.aliveCount[id] < target && guard-- > 0) this.spawnRandom(id);
    }
    for (let i = 0; i < this.pool.cap; i++) if (this.pool.alive[i]) this.pool.age[i] = 10;
  }

  /** Quantité de poussière au sol, pour la sauvegarde. */
  dirtCounts(): Record<DirtId, number> {
    return { ...this.pool.aliveCount };
  }

  /** Remplit la pièce (début de partie, ou retour après une absence). */
  fill(ratio = 1): void {
    for (const id of DIRT_ORDER.filter((d) => d !== 'star')) {
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
    this.toolActive = 0;
    const tool = input.tool ?? 'broom';
    for (const [k, v] of this.scoopTimers) this.scoopTimers.set(k, Math.max(0, v - dt));
    if (tool === 'broom') this.applyBroom(dt, input);
    else if (tool === 'widebroom') this.applyBroom(dt, input, this.player, this.broom.width * WIDE_BROOM.width, this.broom.depth, this.broom.grip * WIDE_BROOM.grip);
    else {
      this.trackTool(dt, input);
      if (input.active && input.pressed) this.applyTool(tool, dt, input);
    }
    if (this.mods.magnet) this.applyMagnet();
    if (this.wind.t > 0) this.applyWind(dt);
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
  applyBroom(dt: number, input: BroomInput, st: BroomState = this.player, width: number = this.broom.width, depth: number = this.broom.depth, grip: number = this.broom.grip): void {
    st.pushed = 0;
    if (!input.active) {
      st.prev.has = false;
      st.vel.x *= 0.8;
      st.vel.y *= 0.8;
      st.spin *= 0.8;
      return;
    }
    const yaw1 = input.yaw ?? 0;
    const x0 = st.prev.has ? st.prev.x : input.x;
    const y0 = st.prev.has ? st.prev.y : input.y;
    const yaw0 = st.prev.has ? st.prev.yaw : yaw1;
    const x1 = input.x;
    const y1 = input.y;
    let dYaw = yaw1 - yaw0;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    st.prev.x = x1;
    st.prev.y = y1;
    st.prev.yaw = yaw1;
    st.prev.has = true;

    // Vitesses lissées (évite les à-coups de la souris).
    let mvx = (x1 - x0) / dt;
    let mvy = (y1 - y0) / dt;
    const ms = Math.hypot(mvx, mvy);
    if (ms > MAX_BROOM_SPEED) {
      mvx *= MAX_BROOM_SPEED / ms;
      mvy *= MAX_BROOM_SPEED / ms;
    }
    st.vel.x += (mvx - st.vel.x) * 0.55;
    st.vel.y += (mvy - st.vel.y) * 0.55;
    const spin = Math.max(-30, Math.min(30, dYaw / dt));
    st.spin += (spin - st.spin) * 0.55;
    const bvx = st.vel.x;
    const bvy = st.vel.y;
    const w = st.spin;

    // Brosse levée (pas de clic) : on suit le mouvement, mais on ne touche à rien.
    if (!input.pressed) return;
    const power = this.mods.pushPower * (1 + (input.pushBonus ?? 0));
    const hw = width / 2;
    const hd = depth / 2;
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
        if (def.fixed) continue;
        const r = def.radius;
        const lt = rx * tx + ry * ty;
        const ln = rx * nx + ry * ny;
        if (lt > hw + r * 0.5 || lt < -hw - r * 0.5 || ln > hd + r || ln < -hd - r) continue;
        stamp[i] = id;
        this.touched[i] = this.time;
        this.ownerOf[i] = st.owner ?? 0;

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
          const k = Math.min(1, (grip * power) / def.mass);
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
    st.pushed = pushed;
  }

  // ───────────────────────────── Assistants ─────────────────────────────

  /** Assistants présents dans la pièce. */
  helpers: Helper[] = [];
  private team: HelperTeam = NO_HELPERS;
  private helperAcc = 0;
  private webAcc = 0;

  /** Met l'équipe à jour (on garde ceux qui sont déjà là, on ajoute ou retire les autres). */
  setHelpers(team: HelperTeam): void {
    this.team = team;
    const want: [HelperKind, number][] = [['moutonnet', team.moutonnet], ['plumette', team.plumette], ['roulio', team.roulio], ['biscotte', team.biscotte]];
    const next: Helper[] = [];
    for (const [kind, n] of want) {
      const have = this.helpers.filter((h) => h.kind === kind);
      for (let k = 0; k < n; k++) next.push(have[k] ?? new Helper(kind, this.room.width * (0.3 + 0.4 * this.rng.next()), this.room.height * (0.3 + 0.4 * this.rng.next())));
    }
    this.helpers = next;
  }

  /** Point de départ d'un grain libre au hasard (pour qu'un assistant aille le chercher). */
  private randomDirt(fixedOnly?: DirtId): { x: number; y: number } | null {
    const { x, y, alive, type } = this.pool;
    const range = fixedOnly ? this.pool.ranges[fixedOnly] : { start: 0, count: this.pool.cap };
    if (range.count === 0) return null;
    for (let k = 0; k < 24; k++) {
      const i = range.start + Math.floor(this.rng.next() * range.count);
      if (!alive[i]) continue;
      const def = DIRT_TYPES[DIRT_ORDER[type[i]]];
      if (!fixedOnly && def.fixed) continue;
      return { x: x[i], y: y[i] };
    }
    return null;
  }

  private nearestPan(px: number, py: number): { x: number; y: number } {
    let best = this.room.collectors[0]?.mouth ?? { x: px, y: py };
    let bd = Infinity;
    for (const c of this.room.collectors) {
      const d = Math.hypot(c.mouth.x - px, c.mouth.y - py);
      if (d < bd) { bd = d; best = c.mouth; }
    }
    return best;
  }

  /** Assistants « en vrai » (pièce proche du joueur) : ils bougent et poussent vraiment la poussière. */
  stepHelpers(dt: number): void {
    const sp = this.team.speed;
    const W = this.room.width;
    const H = this.room.height;
    for (const h of this.helpers) {
      h.phase += dt;
      switch (h.kind) {
        case 'moutonnet': {
          if (h.state === 'seek') {
            if (h.timer <= 0) {
              const t = this.randomDirt();
              if (t) { h.tx = t.x; h.ty = t.y; }
              h.timer = 6;
            }
            h.timer -= dt;
            if (h.moveToward(150 * sp, dt) < 30) {
              const p = this.nearestPan(h.x, h.y);
              h.tx = p.x; h.ty = p.y;
              h.state = 'push';
            }
          } else {
            // Il pousse la poussière devant lui jusqu'à la pelle.
            const left = h.moveToward(130 * sp, dt);
            const fx = -Math.sin(h.yaw);
            const fy = -Math.cos(h.yaw);
            this.applyBroom(dt, { active: true, pressed: true, x: h.x + fx * 26, y: h.y + fy * 26, yaw: h.yaw }, h.broom, 56, 22, 0.8);
            if (left < 110) { h.state = 'seek'; h.timer = 0; h.broom.prev.has = false; }
          }
          break;
        }
        case 'plumette': {
          if (h.timer <= 0) {
            const t = this.randomDirt('web') ?? { x: W * this.rng.next(), y: H * this.rng.next() };
            h.tx = t.x; h.ty = t.y;
            h.timer = 8;
          }
          h.timer -= dt;
          if (h.moveToward(170 * sp, dt) < 40) this.dustWebsAround(h.x, h.y, dt * 0.7 * sp);
          break;
        }
        case 'roulio': {
          if (h.timer <= 0 || Math.hypot(h.tx - h.x, h.ty - h.y) < 20) {
            const t = this.randomDirt() ?? { x: W * this.rng.next(), y: H * this.rng.next() };
            h.tx = t.x; h.ty = t.y;
            h.timer = 7;
          }
          h.timer -= dt;
          h.moveToward(120 * sp, dt);
          this.vacuumAround(h.x, h.y, 42, dt);
          break;
        }
        case 'biscotte': {
          h.timer -= dt;
          if (h.state !== 'dash') {
            if (h.timer <= 0) {
              // Le chat se réveille et traverse la pièce en courant : grand coup de balai gratuit !
              h.state = 'dash';
              const p = this.nearestPan(W - h.x, H - h.y);
              h.tx = p.x; h.ty = p.y;
              h.broom.prev.has = false;
            }
          } else {
            const left = h.moveToward(700 * sp, dt);
            const fx = -Math.sin(h.yaw);
            const fy = -Math.cos(h.yaw);
            this.applyBroom(dt, { active: true, pressed: true, x: h.x + fx * 40, y: h.y + fy * 40, yaw: h.yaw }, h.broom, 150, 30, 1);
            if (left < 140) { h.state = 'rest'; h.timer = 25 + this.rng.next() * 25; }
          }
          break;
        }
      }
      h.x = Math.max(20, Math.min(W - 20, h.x));
      h.y = Math.max(20, Math.min(H - 20, h.y));
    }
  }

  private dustWebsAround(px: number, py: number, damage: number): void {
    const r = this.pool.ranges.web;
    for (let i = r.start; i < r.start + r.count; i++) {
      if (!this.pool.alive[i]) continue;
      if (Math.hypot(this.pool.x[i] - px, this.pool.y[i] - py) > 60) continue;
      this.pool.hp[i] -= damage;
      if (this.pool.hp[i] <= 0) this.collectDirect(i, 'web', true);
    }
  }

  private vacuumAround(px: number, py: number, R: number, dt: number): void {
    const { x, y, alive, type } = this.pool;
    let budget = Math.max(1, Math.round(12 * dt * 60 * this.team.speed));
    for (let i = 0; i < this.pool.cap && budget > 0; i++) {
      if (!alive[i]) continue;
      const dx = x[i] - px;
      const dy = y[i] - py;
      if (dx > R || dx < -R || dy > R || dy < -R || dx * dx + dy * dy > R * R) continue;
      const id = DIRT_ORDER[type[i]];
      if (DIRT_TYPES[id].fixed) continue;
      this.collectDirect(i, id, true);
      budget--;
    }
  }

  /**
   * Assistants « en résumé » (pièce lointaine) : pas de déplacement, ils ramassent
   * simplement à leur rythme moyen. Beaucoup plus léger à calculer.
   */
  abstractHelpers(dt: number): void {
    const t = this.team;
    const rate = (t.moutonnet * HELPER_RATE.moutonnet + t.roulio * HELPER_RATE.roulio + t.biscotte * HELPER_RATE.biscotte) * t.speed;
    this.helperAcc += rate * dt;
    this.webAcc += t.plumette * HELPER_RATE.plumette * t.speed * dt;
    const { alive, type } = this.pool;
    let guard = 200;
    while (this.helperAcc >= 1 && guard-- > 0) {
      const i = Math.floor(this.rng.next() * this.pool.cap);
      if (!alive[i]) { if (this.pool.weightedDirt() === 0) { this.helperAcc = 0; break; } continue; }
      const id = DIRT_ORDER[type[i]];
      if (DIRT_TYPES[id].fixed) continue;
      this.collectDirect(i, id, true);
      this.helperAcc -= 1;
    }
    while (this.webAcc >= 1) {
      this.webAcc -= 1;
      const r = this.pool.ranges.web;
      for (let i = r.start; i < r.start + r.count; i++) if (alive[i]) { this.collectDirect(i, 'web', true); break; }
    }
  }

  /** Grains par seconde que l'équipe ramasse dans une pièce (pour le hors-ligne). */
  helperRate(): number {
    const t = this.team;
    return (t.moutonnet * HELPER_RATE.moutonnet + t.roulio * HELPER_RATE.roulio + t.biscotte * HELPER_RATE.biscotte) * t.speed;
  }

  // ───────────────────────────── Autres outils ─────────────────────────────

  private toolPrev = { x: 0, y: 0, has: false };
  private toolMove = 0;

  /** Suit le déplacement de l'outil (l'éponge a besoin de savoir combien on frotte). */
  private trackTool(_dt: number, input: BroomInput): void {
    this.player.vel.x *= 0.8;
    this.player.vel.y *= 0.8;
    this.player.prev.has = false;
    if (!input.active) {
      this.toolPrev.has = false;
      this.toolMove = 0;
      return;
    }
    this.toolMove = this.toolPrev.has ? Math.hypot(input.x - this.toolPrev.x, input.y - this.toolPrev.y) : 0;
    this.toolPrev.x = input.x;
    this.toolPrev.y = input.y;
    this.toolPrev.has = true;
  }

  baseValue(id: DirtId): number {
    const def = DIRT_TYPES[id];
    if (id === 'bunny') return this.mods.bunnyValue;
    if (id === 'star') return def.value * this.mods.starValue;
    return def.value;
  }

  /** Retire directement un grain (outil, aspirateur) : il rapporte sur place, sans pelle. */
  private collectDirect(i: number, id: DirtId, byHelper = false): void {
    const coins = this.baseValue(id) * this.mods.valueMultiplier;
    const px = this.pool.x[i];
    const py = this.pool.y[i];
    this.pool.kill(i);
    this.events.push({ collector: -1, type: id, coins, x: px, y: py, byHelper, owner: byHelper ? 0 : this.toolOwner });
  }

  /** Largeur réelle de la brosse avec l'outil en main (pour l'empreinte affichée). */
  toolWidth(tool: ToolId | undefined): number {
    return tool === 'widebroom' ? this.broom.width * WIDE_BROOM.width : this.broom.width;
  }

  /** Temps avant le prochain coup de pelle à main (un par joueur). */
  private scoopTimers = new Map<number, number>();
  /** Dernier coup de pelle (pour l'animation). */
  scoopFlash = 0;

  /** Pelle à main : ramasse d'un coup les grains libres juste devant (pas besoin de les pousser). */
  private scoop(input: BroomInput): void {
    if ((this.scoopTimers.get(this.toolOwner) ?? 0) > 0) return;
    this.scoopTimers.set(this.toolOwner, HAND_PAN.every);
    const R = HAND_PAN.radius * this.mods.handpan;
    const { x, y, alive, type } = this.pool;
    // On prend les plus proches d'abord.
    const near: [number, number][] = [];
    for (let i = 0; i < this.pool.cap; i++) {
      if (!alive[i]) continue;
      const def = DIRT_TYPES[DIRT_ORDER[type[i]]];
      if (def.fixed) continue;
      const d = Math.hypot(x[i] - input.x, y[i] - input.y);
      if (d <= R + def.radius * 0.5) near.push([d, i]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const max = Math.round(HAND_PAN.max * this.mods.handpan);
    for (const [, i] of near.slice(0, max)) this.collectDirect(i, DIRT_ORDER[type[i]]);
    if (near.length) this.scoopFlash = this.time;
    this.toolActive += near.length;
  }

  private applyTool(tool: ToolId, dt: number, input: BroomInput): void {
    if (tool === 'handpan') {
      this.scoop(input);
      return;
    }
    const { x, y, vx, vy, alive, type, hp } = this.pool;
    const yaw = input.yaw ?? 0;
    const fx = -Math.sin(yaw);
    const fy = -Math.cos(yaw);
    for (let i = 0; i < this.pool.cap; i++) {
      if (!alive[i]) continue;
      const id = DIRT_ORDER[type[i]];
      const def = DIRT_TYPES[id];
      const dx = x[i] - input.x;
      const dy = y[i] - input.y;
      if (tool === 'duster' || tool === 'sponge') {
        if (def.fixed?.tool !== tool) continue;
        const reach = (tool === 'duster' ? 45 : 30) + def.radius;
        if (dx * dx + dy * dy > reach * reach) continue;
        // Plumeau : il suffit de rester dessus. Éponge : il faut frotter (la distance parcourue compte).
        hp[i] -= tool === 'duster' ? dt * this.mods.duster : this.toolMove * this.mods.sponge;
        this.toolActive++;
        if (hp[i] <= 0) this.collectDirect(i, id);
      } else if (tool === 'vacuum') {
        if (def.fixed || this.vacuumLoad >= this.mods.vacuumCap) continue;
        const d = Math.hypot(dx, dy);
        const R = 80;
        if (d > R) continue;
        if (d < 16 + def.radius * 0.5) {
          this.vacuumLoad++;
          this.collectDirect(i, id);
          continue;
        }
        // Aspiration : les grains filent vers la buse, les lourds moins vite.
        const pull = (1600 * (1 - d / R)) / Math.max(1, def.mass * 0.6);
        vx[i] += (-dx / d) * pull * dt * 8;
        vy[i] += (-dy / d) * pull * dt * 8;
        this.toolActive++;
      } else if (tool === 'whirl') {
        if (def.fixed) continue;
        const d = Math.hypot(dx, dy);
        const R = WHIRL.radius * this.mods.whirl;
        if (d > R) continue;
        if (d < WHIRL.swallow + def.radius * 0.5) {
          this.collectDirect(i, id);
          continue;
        }
        // Tourbillon : on tourne autour du centre en s'en rapprochant.
        // (l'attraction l'emporte sur la rotation, sinon les grains restent en orbite).
        const k = (1 - d / R) / Math.max(1, def.mass * 0.5);
        const inward = (700 + 1500 * k) / Math.max(1, def.mass * 0.5);
        const swirl = 650 * k;
        vx[i] += ((-dx / d) * inward + (-dy / d) * swirl) * dt * 5;
        vy[i] += ((-dy / d) * inward + (dx / d) * swirl) * dt * 5;
        this.toolActive++;
      } else if (tool === 'blower') {
        if (def.fixed) continue;
        // Cône devant soi : départ un peu derrière le point visé, 4 m de portée.
        const ox = input.x - fx * 150;
        const oy = input.y - fy * 150;
        const rx = x[i] - ox;
        const ry = y[i] - oy;
        const along = rx * fx + ry * fy;
        if (along < 0 || along > 420) continue;
        const across = Math.abs(rx * -fy + ry * fx);
        if (across > 40 + along * 0.45) continue;
        const f = (1 - along / 420) * this.mods.blower;
        const push = (1100 * f) / def.mass;
        vx[i] += (fx * push + (Math.random() - 0.5) * 120) * dt * 6;
        vy[i] += (fy * push + (Math.random() - 0.5) * 120) * dt * 6;
        this.toolActive++;
      }
    }
  }

  /**
   * Multijoueur (chez l'hôte) : le balai ou l'outil d'un invité agit sur la poussière.
   * Les grains qu'il pousse ou ramasse lui reviennent (owner).
   */
  applyRemote(dt: number, input: BroomInput, st: BroomState, owner: number, broom: { width: number; depth: number; grip: number }): void {
    st.owner = owner;
    const tool = input.tool ?? 'broom';
    if (tool === 'broom' || tool === 'widebroom') {
      const wide = tool === 'widebroom';
      this.applyBroom(dt, input, st, broom.width * (wide ? WIDE_BROOM.width : 1), broom.depth, broom.grip * (wide ? WIDE_BROOM.grip : 1));
      return;
    }
    st.prev.has = false;
    // L'aspirateur a un réservoir propre à chacun : pour un invité, il se comporte comme le balai magique (en plus petit).
    if (!input.active || !input.pressed || tool === 'vacuum') return;
    const savedMove = this.toolMove;
    this.toolMove = Math.min(40, dt * 600);
    this.toolOwner = owner;
    this.applyTool(tool, dt, input);
    this.toolOwner = 0;
    this.toolMove = savedMove;
  }

  /** Vide le réservoir de l'aspirateur (à faire près d'une pelle). */
  emptyVacuum(): number {
    const n = this.vacuumLoad;
    this.vacuumLoad = 0;
    return n;
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

      const damp = Math.exp(-def.friction * dt);
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
    const base = this.baseValue(id);
    const scoop = this.time - this.touched[i] < SCOOP_WINDOW ? 1 + this.mods.scoopBonus : 1;
    const coins = base * this.mods.valueMultiplier * scoop;
    // Le grain revient à celui qui l'a poussé (s'il l'a touché il y a peu).
    const owner = this.time - this.touched[i] < 4 ? this.ownerOf[i] : 0;
    this.pool.kill(i);
    this.events.push({ collector, type: id, coins, x: px, y: py, owner });
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

  // ───────────────────────────── Événements ─────────────────────────────

  private wind = { x: 0, y: 0, t: 0, total: 1, strength: 0 };

  /** Courant d'air : pousse toute la poussière libre dans une direction pendant quelques secondes. */
  gust(angle: number, seconds: number, strength = 260): void {
    this.wind = { x: Math.cos(angle), y: Math.sin(angle), t: seconds, total: seconds, strength };
  }

  get windActive(): boolean {
    return this.wind.t > 0;
  }

  private applyWind(dt: number): void {
    const w = this.wind;
    w.t -= dt;
    // Le vent monte, souffle, puis retombe.
    const k = Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - w.t / w.total)));
    const { vx, vy, alive, type } = this.pool;
    for (let i = 0; i < this.pool.cap; i++) {
      if (!alive[i]) continue;
      const def = DIRT_TYPES[DIRT_ORDER[type[i]]];
      if (def.fixed) continue;
      // Un peu de désordre pour que tout ne bouge pas d'un bloc.
      const jitter = 0.55 + ((i * 0.618034) % 1) * 0.9;
      const f = (w.strength * k * jitter * dt) / Math.sqrt(def.mass);
      vx[i] += w.x * f + Math.sin(this.time * 3 + i) * f * 0.3;
      vy[i] += w.y * f + Math.cos(this.time * 2.6 + i) * f * 0.3;
    }
  }

  /** Une gerbe de saleté autour d'un point (un pot renversé…). Renvoie le nombre de grains apparus. */
  burst(cx: number, cy: number, spec: Partial<Record<DirtId, number>>, spread = 90): number {
    let n = 0;
    for (const [id, count] of Object.entries(spec) as [DirtId, number][]) {
      const r = DIRT_TYPES[id].radius;
      for (let k = 0; k < count; k++) {
        if (!this.pool.canSpawn(id)) break;
        const px = cx + this.rng.gauss() * spread * 0.5;
        const py = cy + this.rng.gauss() * spread * 0.5;
        if (px < r + 4 || py < r + 4 || px > this.room.width - r - 4 || py > this.room.height - r - 4) continue;
        if (this.room.obstacles.some((o) => inside(grow(o.rect, r + 2), px, py))) continue;
        const i = this.pool.spawn(id, px, py, this.rng.range(0, Math.PI * 2));
        if (i < 0) break;
        // Les grains jaillissent un peu vers l'extérieur.
        const a = Math.atan2(py - cy, px - cx);
        const v = 40 + this.rng.next() * 90;
        this.pool.vx[i] = Math.cos(a) * v;
        this.pool.vy[i] = Math.sin(a) * v;
        n++;
      }
    }
    return n;
  }

  /** Des grains dorés qui tombent du ciel, un peu partout. */
  rainStars(count: number): number {
    let n = 0;
    for (let k = 0; k < count; k++) if (this.spawnRandom('star')) n++;
    return n;
  }

  /** Un endroit libre au hasard (loin des meubles et des pelles). */
  freeSpot(margin = 120): { x: number; y: number } {
    for (let k = 0; k < 40; k++) {
      const x = this.rng.range(margin, this.room.width - margin);
      const y = this.rng.range(margin, this.room.height - margin);
      if (this.room.obstacles.some((o) => inside(grow(o.rect, 60), x, y))) continue;
      if (this.collectorRects.some((r) => inside(grow(r, 80), x, y))) continue;
      return { x, y };
    }
    return { x: this.room.width / 2, y: this.room.height / 2 };
  }

  /** Pas léger : les pieds du joueur écartent doucement la poussière autour de lui. */
  kickFeet(px: number, py: number, radius = 38): void {
    const { x, y, vx, vy, alive, type } = this.pool;
    const r2 = radius * radius;
    for (let i = 0; i < this.pool.cap; i++) {
      if (!alive[i]) continue;
      const dx = x[i] - px;
      const dy = y[i] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const def = DIRT_TYPES[DIRT_ORDER[type[i]]];
      if (def.fixed) continue;
      const d = Math.sqrt(d2) || 1;
      const v = (70 * (1 - d / radius)) / Math.sqrt(def.mass);
      if (vx[i] * vx[i] + vy[i] * vy[i] < v * v) {
        vx[i] += (dx / d) * v;
        vy[i] += (dy / d) * v;
      }
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
      let px: number;
      let py: number;
      if (id === 'web') {
        // Les toiles d'araignée s'accrochent le long des murs.
        const W = this.room.width;
        const H = this.room.height;
        const m = r + 6 + this.rng.next() * 40;
        const side = this.rng.int(0, 3);
        px = side === 0 ? m : side === 1 ? W - m : this.rng.range(m, W - m);
        py = side === 2 ? m : side === 3 ? H - m : this.rng.range(m, H - m);
      } else {
        const p = this.pickPatch();
        px = p.x + this.rng.gauss() * p.spread * 0.5;
        py = p.y + this.rng.gauss() * p.spread * 0.5;
      }
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
