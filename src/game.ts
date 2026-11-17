import { ROOMS } from './data/rooms';
import { RoomSim, type BroomInput } from './sim/roomSim';
import { World3D } from './render/world3d';
import { Player } from './player/player';
import { Synth } from './audio/synth';
import { createFixedLoop } from './core/loop';
import { loadSave, writeSave, type SaveData } from './save/save';
import * as store from './state/store';
import { AUTO_START, QUALITY_LABELS, isQualitySetting, lowerQuality, type QualityLevel, type QualitySetting } from './render/quality';

/** Seuil de propreté pour « pièce impeccable ». */
export const CLEAN_THRESHOLD = 0.95;
const CLEAN_BONUS = 250;
const AUTOSAVE_MS = 15_000;

/** Chef d'orchestre : relie simulation, joueur, rendu 3D, son, interface et sauvegarde. */
export class Game {
  readonly synth = new Synth();
  private sim: RoomSim;
  private player: Player;
  private world!: World3D;
  private input: BroomInput = { active: false, x: 0, y: 0, pressed: false };
  private save: SaveData;
  private earnedWindow: number[] = new Array(5).fill(0);
  private windowStart = performance.now();
  readonly debug = new URLSearchParams(location.search).has('debug');
  private fpsAcc = { frames: 0, time: 0 };
  private last = performance.now();

  constructor() {
    this.save = loadSave();
    this.sim = new RoomSim(ROOMS[0]);
    this.sim.fill(1);
    this.player = new Player(this.sim.room);
    store.coins.value = this.save.coins;
    store.totalCoins.value = this.save.totalCoins;
    store.roomCleanedOnce.value = this.save.roomCleanedOnce;
    store.muted.value = this.save.muted;
    store.showFps.value = this.save.showFps;
    const urlQ = new URLSearchParams(location.search).get('quality');
    store.qualitySetting.value = isQualitySetting(urlQ) ? urlQ : this.save.quality;
    store.roomName.value = this.sim.room.name;
    this.synth.setMuted(this.save.muted);
  }

  mount(host: HTMLElement): void {
    this.world = new World3D(host);
    this.world.build(this.sim);
    const qs = store.qualitySetting.value;
    this.applyQuality(qs === 'auto' ? AUTO_START : qs);
    this.checkGpu();
    this.bindInput();

    const step = createFixedLoop((dt) => this.tick(dt));
    const frame = (now: number) => {
      const realDt = Math.max(0.0001, (now - this.last) / 1000);
      const dt = Math.min(0.1, realDt);
      this.last = now;
      step(dt);
      const p = this.player;
      const bp = p.broomPoint();
      this.world.render(
        this.sim,
        dt,
        { x: p.x, z: p.z, eye: p.eye, yaw: p.yaw, pitch: p.pitch },
        { visible: store.started.value, x: bp.x, z: bp.z, pressed: this.input.pressed },
      );
      this.synth.swish(Math.hypot(this.sim.broomVel.x, this.sim.broomVel.y), this.sim.broomPushed);
      this.updateHud(realDt);
      if (!store.paused.value && !document.hidden) this.autoQuality(realDt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    setInterval(() => this.persist(), AUTOSAVE_MS);
    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist();
    });
  }

  /** Lancement / reprise : on capture la souris pour la visée. */
  start(): void {
    this.synth.unlock();
    store.started.value = true;
    store.paused.value = false;
    this.lockPointer();
  }

  private lockPointer(): void {
    const c = this.world.canvas;
    try {
      const r = c.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => this.onLockFailed());
    } catch {
      this.onLockFailed();
    }
  }

  private onLockFailed(): void {
    // Sans capture de la souris (ex. tests automatiques), on joue quand même en mode debug.
    if (!this.debug) store.paused.value = true;
  }

  /** Choix du joueur dans les réglages. */
  setQuality(setting: QualitySetting): void {
    store.qualitySetting.value = setting;
    this.applyQuality(setting === 'auto' ? AUTO_START : setting);
    this.autoSamples = [];
    this.persist();
  }

  toggleFps(): void {
    store.showFps.value = !store.showFps.value;
    this.persist();
  }

  private applyQuality(level: QualityLevel): void {
    this.world.setQuality(level);
    store.qualityLevel.value = level;
    this.autoCooldown = 2.5;
  }

  /** Mode Auto : si les FPS restent bas, on descend d'un cran. */
  private autoSamples: number[] = [];
  private autoCooldown = 0;
  private autoQuality(dt: number): void {
    if (store.qualitySetting.value !== 'auto') return;
    if (this.autoCooldown > 0) {
      this.autoCooldown -= Math.min(dt, 0.5);
      return;
    }
    this.autoSamples.push(dt);
    const total = this.autoSamples.reduce((a, b) => a + b, 0);
    if (total < 2) return;
    const fps = this.autoSamples.length / total;
    this.autoSamples = [];
    if (fps < 15 && store.qualityLevel.value !== 'minimal') {
      // Vraiment très lent : on va directement au minimum.
      this.applyQuality('minimal');
      store.pushToast('Qualité ajustée', `Ça ramait beaucoup (${Math.round(fps)} FPS) : passage en qualité Minimale.`, 3500);
    } else if (fps < 45) {
      const lower = lowerQuality(store.qualityLevel.value);
      if (lower) {
        this.applyQuality(lower);
        store.pushToast('Qualité ajustée', `Ça ramait un peu (${Math.round(fps)} FPS) : passage en qualité ${QUALITY_LABELS[lower]}.`, 3500);
      }
    }
  }

  /** Repère les navigateurs qui dessinent sans la carte graphique (très lent). */
  private checkGpu(): void {
    const name = this.world.gpuName();
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) {
      if (store.qualitySetting.value === 'auto') this.applyQuality('minimal');
      store.gpuWarning.value = name;
    }
  }

  toggleMute(): void {
    store.muted.value = !store.muted.value;
    this.synth.setMuted(store.muted.value);
    this.persist();
  }

  private get playing(): boolean {
    return store.started.value && !store.paused.value;
  }

  private bindInput(): void {
    const canvas = this.world.canvas;
    let lockedAt = 0;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked) lockedAt = performance.now();
      if (!locked && store.started.value && !this.debug) {
        store.paused.value = true;
        this.input.pressed = false;
        this.player.clearKeys();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.playing) return;
      if (document.pointerLockElement !== canvas) return;
      // Chrome envoie parfois un énorme « saut » juste après la capture de la souris : on l'ignore.
      if (performance.now() - lockedAt < 150) return;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.player.look(e.movementX, e.movementY);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (store.started.value && store.paused.value) {
        this.start();
        return;
      }
      if (e.button === 0) this.input.pressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.pressed = false;
    });
    window.addEventListener('keydown', (e) => {
      if (!this.playing) return;
      this.player.setKey(e.code, true);
      if (this.debug && e.code === 'KeyG') this.earn(1000);
      if (this.debug && e.code === 'KeyC') for (let i = 0; i < this.sim.pool.cap; i++) this.sim.pool.kill(i);
    });
    window.addEventListener('keyup', (e) => this.player.setKey(e.code, false));
    window.addEventListener('blur', () => this.player.clearKeys());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (this.debug) {
      // Petites commandes pour les tests automatiques.
      (window as unknown as Record<string, unknown>).__dust = {
        look: (dx: number, dy: number) => this.player.look(dx, dy),
        key: (code: string, down: boolean) => this.player.setKey(code, down),
        press: (down: boolean) => (this.input.pressed = down),
        player: this.player,
        world: this.world,
      };
    }
  }

  private tick(dt: number): void {
    if (this.playing) this.player.update(dt);
    const bp = this.player.broomPoint();
    this.input.active = this.playing;
    this.input.x = bp.x;
    this.input.y = bp.z;
    this.sim.step(dt, this.input);
    const events = this.sim.drainEvents();
    if (events.length === 0) return;
    let gained = 0;
    const counts = { dust: 0, bunny: 0, star: 0 };
    for (const e of events) {
      gained += e.coins;
      counts[e.type]++;
      this.world.onCollect(e.collector, e.coins, e.type === 'star');
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
      this.world.celebrate();
      this.synth.fanfare();
      store.pushToast('Combles impeccables ! ✨', `Bonus de ${CLEAN_BONUS} pièces. La poussière, elle, n'a pas dit son dernier mot…`, 6000);
      this.persist();
    }

    this.fpsAcc.frames++;
    this.fpsAcc.time += dt;
    if (this.fpsAcc.time >= 0.5) {
      const fps = this.fpsAcc.frames / this.fpsAcc.time;
      this.fpsAcc.frames = 0;
      this.fpsAcc.time = 0;
      store.fps.value = fps;
      if (this.debug) {
        const p = this.sim.pool.aliveCount;
        const info = this.world.renderer.info.render;
        store.debugInfo.value = `${fps.toFixed(0)} FPS · qualité ${store.qualityLevel.value} · ${info.calls} draw calls · ${(info.triangles / 1000).toFixed(0)}k tris · poussière ${p.dust} · moutons ${p.bunny} · étoiles ${p.star} · [G] +1000 · [C] tout nettoyer`;
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
      quality: store.qualitySetting.value,
      showFps: store.showFps.value,
    };
    writeSave(this.save);
  }
}
