import { Application } from 'pixi.js';
import { ROOMS } from './data/rooms';
import { RoomSim, type BroomInput } from './sim/roomSim';
import { Scene } from './render/scene';
import { Synth } from './audio/synth';
import { createFixedLoop } from './core/loop';
import { loadSave, writeSave, type SaveData } from './save/save';
import * as store from './state/store';

/** Seuil de propreté pour « pièce impeccable ». */
export const CLEAN_THRESHOLD = 0.95;
const CLEAN_BONUS = 250;
const AUTOSAVE_MS = 15_000;

/** Chef d'orchestre : relie simulation, rendu, son, interface et sauvegarde. */
export class Game {
  readonly synth = new Synth();
  private sim: RoomSim;
  private scene!: Scene;
  private input: BroomInput = { active: false, x: 0, y: 0, pressed: false };
  private save: SaveData;
  private earnedWindow: number[] = new Array(5).fill(0);
  private windowStart = performance.now();
  private debug = new URLSearchParams(location.search).has('debug');
  private fpsAcc = { frames: 0, time: 0, fps: 0 };

  constructor() {
    this.save = loadSave();
    this.sim = new RoomSim(ROOMS[0]);
    this.sim.fill(1);
    store.coins.value = this.save.coins;
    store.totalCoins.value = this.save.totalCoins;
    store.roomCleanedOnce.value = this.save.roomCleanedOnce;
    store.muted.value = this.save.muted;
    store.roomName.value = this.sim.room.name;
    this.synth.setMuted(this.save.muted);
  }

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: window,
      background: '#3a2340',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    host.appendChild(app.canvas);
    app.canvas.id = 'game-canvas';

    this.scene = new Scene(app);
    this.scene.init(this.sim);
    window.addEventListener('resize', () => requestAnimationFrame(() => this.scene.layout()));

    this.bindInput(app.canvas);

    const step = createFixedLoop((dt) => this.tick(dt));
    app.ticker.add((t) => {
      const dt = t.deltaMS / 1000;
      step(dt);
      this.scene.render(this.sim, dt, {
        x: this.input.x,
        y: this.input.y,
        visible: this.input.active && store.started.value,
        pressed: this.input.pressed,
      });
      this.synth.swish(Math.hypot(this.sim.broomVel.x, this.sim.broomVel.y), this.sim.broomPushed);
      this.updateHud(dt);
    });

    setInterval(() => this.persist(), AUTOSAVE_MS);
    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist();
    });
  }

  start(): void {
    this.synth.unlock();
    store.started.value = true;
  }

  toggleMute(): void {
    store.muted.value = !store.muted.value;
    this.synth.setMuted(store.muted.value);
    this.persist();
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const move = (e: PointerEvent) => {
      const p = this.scene.toWorld(e.clientX, e.clientY);
      this.input.x = p.x;
      this.input.y = p.y;
      this.input.active = p.inside;
      canvas.style.cursor = p.inside && store.started.value ? 'none' : 'default';
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', (e) => {
      move(e);
      this.input.pressed = true;
      this.synth.unlock();
    });
    window.addEventListener('pointerup', () => (this.input.pressed = false));
    canvas.addEventListener('pointerleave', () => {
      this.input.active = false;
      this.input.pressed = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.debug) {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'g') this.earn(1000);
        if (e.key === 'c') for (let i = 0; i < this.sim.pool.cap; i++) this.sim.pool.kill(i);
      });
    }
  }

  private tick(dt: number): void {
    const input = store.started.value ? this.input : { ...this.input, active: false };
    this.sim.step(dt, input);
    const events = this.sim.drainEvents();
    if (events.length === 0) return;
    let gained = 0;
    const counts = { dust: 0, bunny: 0, star: 0 };
    for (const e of events) {
      gained += e.coins;
      counts[e.type]++;
      this.scene.onCollect(e.collector, e.coins, e.type === 'star');
    }
    this.earn(gained);
    const lvl = this.sim.combo.level;
    if (counts.star) this.synth.collect('star', lvl, counts.star);
    if (counts.bunny) this.synth.collect('bunny', lvl, counts.bunny);
    if (counts.dust) this.synth.collect('dust', lvl, counts.dust);
  }

  private earn(amount: number): void {
    store.coins.value += amount;
    store.totalCoins.value += amount;
    this.earnedWindow[this.earnedWindow.length - 1] += amount;
  }

  private updateHud(dt: number): void {
    const now = performance.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      const w = this.earnedWindow;
      store.coinsPerSecond.value = w.reduce((a, b) => a + b, 0) / w.length;
      w.shift();
      w.push(0);
    }
    const c = this.sim.cleanliness;
    store.cleanliness.value = c;
    store.comboLevel.value = this.sim.combo.level;
    store.comboFill.value = this.sim.combo.fill;
    store.comboMultiplier.value = this.sim.combo.multiplier;

    if (c >= CLEAN_THRESHOLD && !store.roomCleanedOnce.value) {
      store.roomCleanedOnce.value = true;
      this.earn(CLEAN_BONUS);
      this.scene.celebrate();
      this.synth.fanfare();
      store.pushToast('Grenier impeccable ! ✨', `Bonus de ${CLEAN_BONUS} pièces. La poussière, elle, n'a pas dit son dernier mot…`, 6000);
      this.persist();
    }

    if (this.debug) {
      this.fpsAcc.frames++;
      this.fpsAcc.time += dt;
      if (this.fpsAcc.time >= 0.5) {
        this.fpsAcc.fps = this.fpsAcc.frames / this.fpsAcc.time;
        this.fpsAcc.frames = 0;
        this.fpsAcc.time = 0;
        const p = this.sim.pool.aliveCount;
        store.debugInfo.value = `${this.fpsAcc.fps.toFixed(0)} FPS · poussière ${p.dust} · moutons ${p.bunny} · étoiles ${p.star} · [G] +1000 · [C] tout nettoyer`;
      }
    }
  }

  private persist(): void {
    this.save = {
      ...this.save,
      coins: store.coins.value,
      totalCoins: store.totalCoins.value,
      roomCleanedOnce: store.roomCleanedOnce.value,
      muted: store.muted.value,
    };
    writeSave(this.save);
  }
}
