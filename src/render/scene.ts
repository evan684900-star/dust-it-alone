import { Application, Container, Graphics, Particle, ParticleContainer, Sprite, Text, Texture } from 'pixi.js';
import type { Collector, RoomDef } from '../data/rooms';
import { DIRT_TYPES } from '../data/dirtTypes';
import type { RoomSim } from '../sim/roomSim';
import { formatNumber } from '../core/format';
import { buildAtlas, buildAtticFloor, TEX_SCALE, type Atlas } from './textures';
import { DUST_TINTS, PAL } from './palette';

/** Marges laissées libres pour l'interface (en pixels écran). */
const HUD_TOP = 84;
const HUD_BOTTOM = 104;
const SIDE = 28;

interface FloatText { text: Text; life: number; vy: number; active: boolean }
interface Confetti { sprite: Sprite; vx: number; vy: number; vr: number; life: number }
interface Mote { sprite: Sprite; x: number; y: number; phase: number; speed: number }
interface PanView { g: Graphics; bounce: number; pending: number; timer: number; def: Collector }

/**
 * Tout l'affichage PixiJS : sol, particules, pelles, balai, effets.
 * Il lit l'état de la simulation mais ne le modifie jamais.
 */
export class Scene {
  readonly app: Application;
  readonly world = new Container();
  scale = 1;
  private atlas!: Atlas;
  private particles!: ParticleContainer;
  private sprites: Particle[] = [];
  private baseScale!: Float32Array;
  private pans: PanView[] = [];
  private broom = new Container();
  private broomRing = new Graphics();
  private broomArt = new Graphics();
  private texts: FloatText[] = [];
  private confetti: Confetti[] = [];
  private motes: Mote[] = [];
  private rays = new Graphics();
  private fxLayer = new Container();
  private shake = 0;
  private time = 0;
  private room!: RoomDef;

  constructor(app: Application) {
    this.app = app;
  }

  init(sim: RoomSim): void {
    this.room = sim.room;
    this.atlas = buildAtlas();
    const { width: W, height: H } = this.room;

    const floor = new Sprite(buildAtticFloor(W, H));
    floor.scale.set(1 / TEX_SCALE);
    this.world.addChild(floor);

    // Pelles (sous les particules qui y tombent).
    for (const def of this.room.collectors) {
      const g = new Graphics();
      drawDustpan(g, def.facing);
      g.position.set(def.mouth.x, def.mouth.y);
      this.world.addChild(g);
      this.pans.push({ g, bounce: 0, pending: 0, timer: 0, def });
    }

    // Particules : un sprite par emplacement, texture fixée une fois pour toutes.
    this.particles = new ParticleContainer({
      dynamicProperties: { position: true, rotation: true, vertex: true, color: false, uvs: false },
    });
    this.particles.boundsArea = { x: 0, y: 0, width: W, height: H } as never;
    const pool = sim.pool;
    this.baseScale = new Float32Array(pool.cap);
    for (let i = 0; i < pool.cap; i++) {
      const id = pool.typeOf(i);
      let tex: Texture;
      let tint = 0xffffff;
      let s: number;
      if (id === 'dust') {
        tex = this.atlas.grains[i % 4];
        tint = DUST_TINTS[(i * 7) % DUST_TINTS.length];
        s = ((DIRT_TYPES.dust.radius * 2) / 10 / TEX_SCALE) * 1.3 * (0.75 + ((i * 13) % 10) / 18);
      } else if (id === 'bunny') {
        tex = this.atlas.bunny;
        s = (DIRT_TYPES.bunny.radius * 2) / 46 * (0.85 + ((i * 7) % 5) / 15);
      } else {
        tex = this.atlas.star;
        s = (DIRT_TYPES.star.radius * 2) / 22;
      }
      this.baseScale[i] = s;
      const p = new Particle({ texture: tex, x: -9999, y: -9999, anchorX: 0.5, anchorY: 0.5, tint, scaleX: s, scaleY: s });
      this.sprites.push(p);
      this.particles.addParticle(p);
    }
    this.world.addChild(this.particles);

    // Rayons de lumière de la lucarne.
    this.rays.blendMode = 'add';
    this.world.addChild(this.rays);

    // Grains de lumière qui flottent.
    for (let k = 0; k < 46; k++) {
      const s = new Sprite(this.atlas.mote);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      const m = { sprite: s, x: Math.random() * W, y: Math.random() * H, phase: Math.random() * 10, speed: 6 + Math.random() * 14 };
      this.motes.push(m);
      this.world.addChild(s);
    }

    this.world.addChild(this.fxLayer);

    // Balai qui suit la souris.
    this.broom.addChild(this.broomRing, this.broomArt);
    drawBroom(this.broomArt);
    this.broom.visible = false;
    this.world.addChild(this.broom);

    this.app.stage.addChild(this.world);
    this.layout();
  }

  /** Recalcule l'échelle pour que la pièce tienne entre les barres d'interface. */
  layout(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const availW = sw - SIDE * 2;
    const availH = sh - HUD_TOP - HUD_BOTTOM;
    this.scale = Math.max(0.2, Math.min(availW / this.room.width, availH / this.room.height));
    this.world.scale.set(this.scale);
    this.baseX = (sw - this.room.width * this.scale) / 2;
    this.baseY = HUD_TOP + (availH - this.room.height * this.scale) / 2;
    this.world.position.set(this.baseX, this.baseY);
  }
  private baseX = 0;
  private baseY = 0;

  /** Convertit une position écran (pixels CSS) en position dans la pièce. */
  toWorld(sx: number, sy: number): { x: number; y: number; inside: boolean } {
    const x = (sx - this.baseX) / this.scale;
    const y = (sy - this.baseY) / this.scale;
    const m = 30;
    return { x, y, inside: x >= -m && y >= -m && x <= this.room.width + m && y <= this.room.height + m };
  }

  /** Une particule vient d'être ramassée par la pelle n° `collector`. */
  onCollect(collector: number, coins: number, isStar: boolean): void {
    const pan = this.pans[collector];
    pan.pending += coins;
    pan.bounce = Math.min(1, pan.bounce + (isStar ? 0.9 : 0.06));
    if (isStar) {
      this.shake = Math.max(this.shake, 6);
      this.burst(pan.def.mouth.x + (pan.def.facing === 'right' ? 60 : -60), pan.def.mouth.y, 24, [PAL.mustard, 0xffffff]);
    }
  }

  /** Pluie de confettis (pièce propre, etc.). */
  celebrate(): void {
    const { width: W } = this.room;
    for (let k = 0; k < 5; k++) this.burst(W * (0.15 + k * 0.175), 80, 40, [PAL.tomato, PAL.mustard, PAL.apple, PAL.sky, 0xffffff]);
    this.shake = 10;
  }

  private burst(x: number, y: number, n: number, colors: number[]): void {
    for (let k = 0; k < n; k++) {
      const s = new Sprite(this.atlas.confetti);
      s.anchor.set(0.5);
      s.tint = colors[k % colors.length];
      s.position.set(x, y);
      const a = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 500;
      this.confetti.push({ sprite: s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 300, vr: (Math.random() - 0.5) * 20, life: 1.6 + Math.random() });
      this.fxLayer.addChild(s);
    }
  }

  private spawnText(x: number, y: number, label: string, big: boolean): void {
    let ft = this.texts.find((t) => !t.active);
    if (!ft) {
      const text = new Text({
        text: '',
        style: {
          fontFamily: 'Lilita One, system-ui, sans-serif',
          fontSize: 34,
          fill: PAL.mustard,
          stroke: { color: PAL.ink, width: 8, join: 'round' },
        },
      });
      text.anchor.set(0.5);
      ft = { text, life: 0, vy: 0, active: false };
      this.texts.push(ft);
      this.fxLayer.addChild(ft.text);
    }
    ft.text.text = label;
    ft.text.style.fill = big ? 0xffffff : PAL.mustard;
    ft.text.position.set(x, y);
    ft.text.rotation = (Math.random() - 0.5) * 0.35;
    ft.text.visible = true;
    ft.life = 0;
    ft.vy = -120 - Math.random() * 40;
    ft.active = true;
  }

  /** Mise à jour de l'affichage (appelée à chaque image). */
  render(sim: RoomSim, dt: number, cursor: { x: number; y: number; visible: boolean; pressed: boolean }): void {
    this.time += dt;
    const pool = sim.pool;
    const { x, y, rot, age, alive } = pool;
    const sprites = this.sprites;
    const starStart = pool.ranges.star.start;
    for (let i = 0; i < pool.cap; i++) {
      const p = sprites[i];
      if (!alive[i]) {
        if (p.x !== -9999) { p.x = -9999; p.y = -9999; }
        continue;
      }
      p.x = x[i];
      p.y = y[i];
      p.rotation = rot[i];
      const a = age[i];
      let s = this.baseScale[i];
      if (a < 0.35) s *= popEase(a / 0.35);
      if (i >= starStart) s *= 1 + Math.sin(this.time * 6 + i) * 0.15;
      p.scaleX = s;
      p.scaleY = s;
    }

    // Pelles : rebond + regroupement des « +N ».
    for (const pan of this.pans) {
      pan.timer += dt;
      if (pan.pending > 0 && pan.timer > 0.22) {
        const dir = pan.def.facing === 'right' ? 1 : -1;
        this.spawnText(pan.def.mouth.x + dir * (95 + Math.random() * 30), pan.def.mouth.y - 50 + Math.random() * 30, '+' + formatNumber(pan.pending), pan.pending >= 100);
        pan.pending = 0;
        pan.timer = 0;
      }
      pan.bounce = Math.max(0, pan.bounce - dt * 2.5);
      const b = Math.sin(this.time * 30) * pan.bounce;
      pan.g.scale.set(1 + b * 0.12 + pan.bounce * 0.08, 1 - b * 0.1 + pan.bounce * 0.06);
    }

    for (const t of this.texts) {
      if (!t.active) continue;
      t.life += dt;
      t.text.y += t.vy * dt;
      t.vy *= Math.exp(-2.5 * dt);
      const pop = t.life < 0.15 ? popEase(t.life / 0.15) : 1;
      t.text.scale.set(pop);
      t.text.alpha = t.life > 0.7 ? Math.max(0, 1 - (t.life - 0.7) / 0.4) : 1;
      if (t.life > 1.1) { t.active = false; t.text.visible = false; }
    }

    for (let k = this.confetti.length - 1; k >= 0; k--) {
      const c = this.confetti[k];
      c.life -= dt;
      c.vy += 900 * dt;
      c.vx *= Math.exp(-1.5 * dt);
      c.sprite.x += c.vx * dt;
      c.sprite.y += c.vy * dt;
      c.sprite.rotation += c.vr * dt;
      c.sprite.scale.y = Math.sin(this.time * 12 + k);
      c.sprite.alpha = Math.min(1, c.life * 2);
      if (c.life <= 0) {
        c.sprite.destroy();
        this.confetti.splice(k, 1);
      }
    }

    // Ambiance : rayons et grains de lumière.
    this.drawRays();
    for (const m of this.motes) {
      m.y -= m.speed * dt;
      m.x += Math.sin(this.time * 0.6 + m.phase) * 8 * dt;
      if (m.y < -10) { m.y = this.room.height + 10; m.x = Math.random() * this.room.width; }
      m.sprite.position.set(m.x, m.y);
      m.sprite.alpha = 0.25 + 0.25 * Math.sin(this.time * 1.7 + m.phase);
      m.sprite.scale.set(0.35 + 0.15 * Math.sin(this.time + m.phase));
    }

    // Balai : penche et s'écrase selon la vitesse.
    this.broom.visible = cursor.visible;
    if (cursor.visible) {
      this.broom.position.set(cursor.x, cursor.y);
      const vx = sim.broomVel.x;
      const vy = sim.broomVel.y;
      const speed = Math.hypot(vx, vy);
      this.broomArt.rotation += (Math.max(-0.6, Math.min(0.6, vx / 2200)) - this.broomArt.rotation) * 0.3;
      const squash = Math.min(0.25, speed / 6000);
      this.broomArt.scale.set(1 + squash, 1 - squash);
      const R = sim.broom.radius * (cursor.pressed ? 1.12 : 1);
      this.broomRing.clear();
      this.broomRing
        .circle(0, 0, R)
        .fill({ color: 0xffffff, alpha: cursor.pressed ? 0.16 : 0.08 })
        .stroke({ color: PAL.ink, width: 4, alpha: 0.55 });
      this.broomRing.circle(0, 0, R - 5).stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
    }

    // Tremblement d'écran.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 30);
      this.world.position.set(this.baseX + (Math.random() - 0.5) * this.shake, this.baseY + (Math.random() - 0.5) * this.shake);
    } else {
      this.world.position.set(this.baseX, this.baseY);
    }
  }

  private drawRays(): void {
    const g = this.rays;
    g.clear();
    const t = this.time;
    const topX = this.room.width * 0.47;
    for (let k = 0; k < 3; k++) {
      const sway = Math.sin(t * 0.35 + k * 1.7) * 30;
      const x0 = topX + k * 70;
      const w = 50 + k * 18;
      const alpha = 0.055 + 0.03 * Math.sin(t * 0.8 + k * 2);
      g.poly([x0, 0, x0 + w, 0, x0 + 260 + w * 1.6 + sway, this.room.height * 0.72, x0 + 180 + sway, this.room.height * 0.72]).fill({ color: 0xfff1c4, alpha });
    }
  }
}

function popEase(t: number): number {
  // Petit dépassement élastique : l'objet « pop ».
  const c = 2.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function drawDustpan(g: Graphics, facing: Collector['facing']): void {
  const dir = facing === 'right' ? 1 : -1;
  // Manche qui rentre dans le mur.
  g.roundRect(dir > 0 ? -40 : 10, -14, 30, 28, 8).fill(0xc8742f).stroke({ color: PAL.ink, width: 5 });
  // Pelle : trapèze jaune, ouverture vers la pièce.
  const pts = [-10, -46, 0, -40, 0, 40, -10, 46].map((v, idx) => (idx % 2 === 0 ? v * dir : v));
  const back = [-12 * dir, -48, 66 * dir, -74, 66 * dir, 74, -12 * dir, 48];
  g.poly(back).fill(PAL.mustard).stroke({ color: PAL.ink, width: 6, join: 'round' });
  g.poly(pts).fill(0xe0a52a);
  // Lèvre de la pelle.
  g.moveTo(66 * dir, -74).lineTo(66 * dir, 74).stroke({ color: PAL.ink, width: 9, cap: 'round' });
  // Reflet.
  g.moveTo(10 * dir, -34).lineTo(48 * dir, -52).stroke({ color: 0xffffff, width: 5, alpha: 0.7, cap: 'round' });
  // Ombre intérieure.
  g.poly([0, -36, 52 * dir, -58, 52 * dir, -40, 0, -24]).fill({ color: PAL.ink, alpha: 0.12 });
}

function drawBroom(g: Graphics): void {
  // Manche qui part en haut à droite, brosse centrée sur le curseur.
  g.moveTo(6, -14).lineTo(46, -92).stroke({ color: PAL.ink, width: 13, cap: 'round' });
  g.moveTo(6, -14).lineTo(46, -92).stroke({ color: 0xff5a4e, width: 7, cap: 'round' });
  g.poly([-24, -6, 24, -22, 34, 10, -16, 26]).fill(PAL.mustard).stroke({ color: PAL.ink, width: 5, join: 'round' });
  g.poly([-14, -10, 20, -21, 23, -12, -11, -1]).fill(PAL.tomato).stroke({ color: PAL.ink, width: 3, join: 'round' });
  for (let k = 0; k < 4; k++) {
    const t = 0.2 + k * 0.2;
    g.moveTo(-16 + t * 40, 0 - t * 12).lineTo(-12 + t * 46, 22 - t * 12).stroke({ color: PAL.ink, width: 2, alpha: 0.6 });
  }
}

