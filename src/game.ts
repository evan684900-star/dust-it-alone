import { DOORS, ROOMS, START, STAIRS, roomById, type DoorDef, type RoomDef } from './data/rooms';
import { RoomSim, type BroomInput } from './sim/roomSim';
import { World3D } from './render/world3d';
import { Player } from './player/player';
import { Navigation } from './world/nav';
import { sfx } from './audio/synth';
import { createFixedLoop } from './core/loop';
import { formatNumber } from './core/format';
import { loadSave, writeSave, type SaveData } from './save/save';
import * as store from './state/store';
import { computeModifiers, type Modifiers } from './economy/modifiers';
import { availability, cost, maxAffordable, refundFork, level as treeLevel, costForN } from './economy/tree';
import { NODE_BY_ID, TREE_NODES } from './data/tree';
import { AUTO_START, QUALITY_LABELS, autoStartFor, isQualitySetting, lowerQuality, type QualityLevel, type QualitySetting } from './render/quality';

/** Seuil de propreté pour « pièce impeccable ». */
export const CLEAN_THRESHOLD = 0.95;
const AUTOSAVE_MS = 15_000;

interface RoomRuntime {
  def: RoomDef;
  sim: RoomSim;
}

/** Chef d'orchestre : relie simulation, joueur, château, rendu 3D, son, interface et sauvegarde. */
export class Game {
  readonly synth = sfx;
  private rooms: RoomRuntime[];
  private nav: Navigation;
  private player: Player;
  private world!: World3D;
  private input: BroomInput = { active: false, x: 0, y: 0, pressed: false, yaw: 0 };
  private save: SaveData;
  private earnedWindow: number[] = new Array(5).fill(0);
  private windowStart = performance.now();
  readonly debug = new URLSearchParams(location.search).has('debug');
  private fpsAcc = { frames: 0, time: 0 };
  private last = performance.now();
  private currentRoom: RoomDef | null = null;
  private mods!: Modifiers;
  private visibleKey = '';

  constructor() {
    this.save = loadSave();
    this.rooms = ROOMS.map((def, i) => {
      const sim = new RoomSim(def, ((Date.now() & 0xffff) + i * 7919) >>> 0);
      sim.fill(1);
      return { def, sim };
    });
    this.nav = new Navigation(ROOMS, DOORS, STAIRS, (id) => this.isUnlocked(id));
    const p = this.save.player;
    const valid = p && this.nav.canStand(p.x, p.z, p.y) !== null;
    this.player = new Player(this.nav, valid && p ? { ...p } : { x: START.x, z: START.z, y: ROOMS[0].floorY, yaw: START.yaw });
    this.mods = computeModifiers(this.save.tree, 0);
    this.applyTree();

    store.coins.value = this.save.coins;
    store.totalCoins.value = this.save.totalCoins;
    store.muted.value = this.save.muted;
    store.showFps.value = this.save.showFps;
    const urlQ = new URLSearchParams(location.search).get('quality');
    store.qualitySetting.value = isQualitySetting(urlQ) ? urlQ : this.save.quality;
    this.synth.setMuted(this.save.muted);
    this.publishCastle();
  }

  isUnlocked(id: string): boolean {
    return this.save.rooms[id]?.unlocked === true;
  }

  mount(host: HTMLElement): void {
    this.world = new World3D(host);
    this.world.build(this.rooms, DOORS, STAIRS);
    this.world.setDoorState((d) => this.doorOpen(d), true);
    this.applyTree();
    const qs = store.qualitySetting.value;
    this.autoStart = autoStartFor(this.world.gpuName());
    this.applyQuality(qs === 'auto' ? this.autoStart : qs);
    this.checkGpu();
    this.bindInput();
    this.updatePlace(true);

    const step = createFixedLoop((dt) => this.tick(dt));
    const frame = (now: number) => {
      const realDt = Math.max(0.0001, (now - this.last) / 1000);
      const dt = Math.min(0.1, realDt);
      this.last = now;
      step(dt);
      const p = this.player;
      const bp = p.broomPoint();
      const broomRoom = this.playing ? bp.room : null;
      this.world.render(
        dt,
        { x: p.x, z: p.z, eye: p.eye, yaw: p.yaw, pitch: p.pitch },
        { visible: store.started.value, x: bp.x, z: bp.z, y: bp.room ? bp.room.floorY : p.feet, pressed: this.input.pressed },
        broomRoom ? this.runtime(broomRoom).sim : null,
      );
      const swishSim = broomRoom ? this.runtime(broomRoom).sim : null;
      this.synth.swish(
        swishSim && this.input.pressed ? Math.hypot(swishSim.broomVel.x, swishSim.broomVel.y) + Math.abs(swishSim.broomSpin) * swishSim.broom.width * 0.5 : 0,
        swishSim ? swishSim.broomPushed : 0,
      );
      this.updatePlace(false);
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

  // ───────────────────────────── Arbre des Souvenirs ─────────────────────────────

  private cleanedCount(): number {
    return Object.values(this.save.rooms).filter((r) => r.cleaned).length;
  }

  /** Recalcule et applique tous les effets de l'arbre (après un achat, une porte, une pièce impeccable…). */
  private applyTree(): void {
    this.mods = computeModifiers(this.save.tree, this.cleanedCount());
    this.rooms.forEach((r, i) => {
      const m = this.mods.room(r.def.id, r.def.valueMult);
      r.sim.applyModifiers(m);
      this.world?.setPanScale(i, m.panScale);
    });
    const pm = this.mods.player;
    this.player.walkMult = pm.walkMult;
    this.player.sprintMult = pm.sprintMult;
    this.player.reachMax = pm.reachMax;
    store.treeLevels.value = { ...this.save.tree };
    store.unlockedRooms.value = ROOMS.filter((r) => this.isUnlocked(r.id)).map((r) => r.id);
    this.refreshBuyable();
  }

  private treeState() {
    return { levels: this.save.tree, roomUnlocked: (id: string) => this.isUnlocked(id) };
  }

  /** Y a-t-il au moins un nœud qu'on peut se payer ? (pastille sur le bouton de l'arbre) */
  private refreshBuyable(): void {
    const st = this.treeState();
    const coins = store.coins.value;
    store.treeBuyable.value = TREE_NODES.some((n) => {
      const a = availability(n, st);
      return (a.ok || (!a.ok && a.reason === 'fork')) && cost(n, treeLevel(st.levels, n.id)) <= coins;
    });
  }

  /** Achète `n` niveaux d'un nœud (n = Infinity pour « Max »). Renvoie le nombre de niveaux achetés. */
  buyNode(id: string, n: number): number {
    const node = NODE_BY_ID.get(id);
    if (!node) return 0;
    const st = this.treeState();
    const a = availability(node, st);
    // Fourche : on peut changer d'avis gratuitement (l'autre choix est remboursé).
    let refund = 0;
    if (!a.ok && a.reason === 'fork') {
      const other = TREE_NODES.find((x) => x.fork === node.fork && x.id !== node.id && treeLevel(st.levels, x.id) > 0)!;
      const back = costForN(other, 0, treeLevel(st.levels, other.id));
      if (cost(node, 0) > store.coins.value + back) {
        this.synth.denied();
        return 0;
      }
      refund = refundFork(node, this.save.tree).refund;
      store.coins.value += refund;
    } else if (!a.ok) {
      this.synth.denied();
      return 0;
    }
    const lvl = treeLevel(this.save.tree, id);
    const count = Math.min(n, maxAffordable(node, lvl, store.coins.value));
    if (count <= 0) {
      this.synth.denied();
      return 0;
    }
    const price = costForN(node, lvl, count);
    store.coins.value -= price;
    const newLevel = lvl + count;
    this.save.tree[id] = newLevel;
    if (node.kind !== 'small') this.synth.bigNode();
    else if (newLevel >= node.maxLevel) this.synth.nodeMaxed();
    else this.synth.buy(node.depth, newLevel);
    if (node.kind !== 'small') store.pushToast(`${node.icon} ${node.name}`, node.effect(1), 3500);
    if (refund > 0) store.pushToast('Fourche changée', `L'autre choix a été remboursé (${formatNumber(refund)} 🪙).`, 3000);
    this.applyTree();
    this.persist();
    return count;
  }

  /** Ouvre / ferme l'Arbre des Souvenirs (la souris est libérée pendant ce temps). */
  toggleTree(): void {
    const open = !store.treeOpen.value;
    if (open && store.mapOpen.value) store.mapOpen.value = false;
    store.treeOpen.value = open;
    this.player.clearKeys();
    this.input.pressed = false;
    if (open) {
      this.refreshBuyable();
      document.exitPointerLock?.();
    } else this.start();
  }

  private runtime(def: RoomDef): RoomRuntime {
    return this.rooms.find((r) => r.def === def)!;
  }

  private doorOpen(d: DoorDef): boolean {
    return d.room === null || this.isUnlocked(d.room);
  }

  // ───────────────────────────── Lancement, réglages ─────────────────────────────

  /** Lancement / reprise : on capture la souris pour la visée. */
  start(): void {
    this.synth.unlock();
    const firstTime = !store.started.value && !this.save.introSeen;
    store.started.value = true;
    if (firstTime) {
      this.save.introSeen = true;
      // Réplique provisoire, en attendant l'histoire complète.
      setTimeout(() => {
        store.say('Plume', '… Tant de poussière. Combien de temps ai-je dormi ?', 520, true);
        store.say('Plume', 'Le vieux balai est toujours là. Bon. Au travail ! (maintiens le clic pour balayer)', 520, true);
      }, 900);
    }
    store.paused.value = false;
    store.mapOpen.value = false;
    store.treeOpen.value = false;
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
    if (!this.debug) store.paused.value = true;
  }

  setQuality(setting: QualitySetting): void {
    store.qualitySetting.value = setting;
    this.applyQuality(setting === 'auto' ? this.autoStart : setting);
    this.autoSamples = [];
    this.persist();
  }

  toggleFps(): void {
    store.showFps.value = !store.showFps.value;
    this.persist();
  }

  toggleMute(): void {
    store.muted.value = !store.muted.value;
    this.synth.setMuted(store.muted.value);
    this.persist();
  }

  private applyQuality(level: QualityLevel): void {
    this.world.setQuality(level);
    store.qualityLevel.value = level;
    this.autoCooldown = 2.5;
  }

  private autoStart = AUTO_START;
  private autoSamples: number[] = [];
  private autoCooldown = 0;

  /** Mode Auto : si les FPS restent bas, on descend d'un cran. */
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
      this.applyQuality('minimal');
      store.pushToast('Qualité ajustée', `Ça ramait beaucoup (${Math.round(fps)} FPS) : passage en qualité Minimale.`, 3500);
    } else if (fps < 40) {
      const lower = lowerQuality(store.qualityLevel.value);
      if (lower) {
        this.applyQuality(lower);
        store.pushToast('Qualité ajustée', `Ça ramait un peu (${Math.round(fps)} FPS) : passage en qualité ${QUALITY_LABELS[lower]}.`, 3500);
      }
    }
  }

  private checkGpu(): void {
    const name = this.world.gpuName();
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) store.gpuWarning.value = name;
    store.gpuName.value = name;
  }

  private get playing(): boolean {
    return store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value;
  }

  // ───────────────────────────── Commandes ─────────────────────────────

  private bindInput(): void {
    const canvas = this.world.canvas;
    let lockedAt = 0;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked) lockedAt = performance.now();
      if (!locked && store.started.value && !this.debug && !store.mapOpen.value && !store.treeOpen.value) {
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
      if (store.started.value && (store.paused.value || store.mapOpen.value || store.treeOpen.value)) {
        this.start();
        return;
      }
      if (e.button === 0) this.input.pressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.pressed = false;
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && store.started.value && !store.treeOpen.value) {
        this.toggleMap();
        return;
      }
      if (e.code === 'KeyB' && store.started.value && !store.paused.value) {
        this.toggleTree();
        return;
      }
      if (e.code === 'Escape' && store.treeOpen.value) {
        this.toggleTree();
        return;
      }
      if (!this.playing) return;
      this.player.setKey(e.code, true);
      if (e.code === 'KeyE') this.tryUnlock();
      if (e.code === 'Space' || e.code === 'Enter') store.nextDialogue();
      const digit = /^Digit([1-5])$/.exec(e.code);
      if (digit) this.selectTool(Number(digit[1]) - 1);
      if (this.debug && e.code === 'KeyG') this.earn(10000);
      if (this.debug && e.code === 'KeyC') {
        const r = this.currentRoom && this.runtime(this.currentRoom);
        if (r) for (let i = 0; i < r.sim.pool.cap; i++) r.sim.pool.kill(i);
      }
    });
    window.addEventListener('keyup', (e) => this.player.setKey(e.code, false));
    window.addEventListener('wheel', (e) => {
      if (!this.playing) return;
      this.selectTool((store.selectedTool.value + (e.deltaY > 0 ? 1 : 4)) % 5);
    }, { passive: true });
    window.addEventListener('blur', () => this.player.clearKeys());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (this.debug) {
      (window as unknown as Record<string, unknown>).__dust = {
        look: (dx: number, dy: number) => this.player.look(dx, dy),
        key: (code: string, down: boolean) => this.player.setKey(code, down),
        press: (down: boolean) => (this.input.pressed = down),
        unlock: () => this.tryUnlock(),
        earn: (n: number) => this.earn(n),
        teleport: (x: number, z: number, y: number, yaw: number, pitch = -0.3) => {
          Object.assign(this.player, { x, z, y, yaw, pitch });
          (this.player as unknown as { smoothY: number }).smoothY = y;
        },
        player: this.player,
        world: this.world,
      };
    }
  }

  /** Changer d'outil (seul le balai existe pour l'instant). */
  selectTool(index: number): void {
    if (index === 0) {
      if (store.selectedTool.value !== 0) this.synth.tool();
      store.selectedTool.value = 0;
      return;
    }
    store.toolShake.value = { index, at: performance.now() };
    this.synth.denied();
  }

  /** Ouvre / ferme la carte du château (la souris est libérée pendant ce temps). */
  toggleMap(): void {
    const open = !store.mapOpen.value;
    store.mapOpen.value = open;
    store.treeOpen.value = false;
    this.player.clearKeys();
    this.input.pressed = false;
    if (open) document.exitPointerLock?.();
    else this.start();
  }

  /** Essaie d'ouvrir la porte verrouillée devant laquelle on se trouve. */
  private tryUnlock(): void {
    const d = this.nav.lockedDoorNear(this.player.x, this.player.z, this.player.y);
    if (!d || !d.room) return;
    const room = roomById(d.room)!;
    if (store.coins.value < room.price) {
      store.pushToast('Pas assez de pièces 🪙', `Il manque ${formatNumber(room.price - store.coins.value)} pièces pour ouvrir ${room.name}.`, 2500);
      this.synth.denied();
      return;
    }
    store.coins.value -= room.price;
    this.save.rooms[room.id] = { unlocked: true, cleaned: false };
    this.world.setDoorState((dd) => this.doorOpen(dd));
    this.synth.unlockDoor();
    setTimeout(() => this.synth.fanfare(), 700);
    store.pushToast('Porte ouverte ! 🔓', `${room.name} est accessible. La poussière y est ${room.valueMult}× plus précieuse !`, 4500);
    this.visibleKey = '';
    this.publishCastle();
    this.applyTree();
    this.persist();
  }

  // ───────────────────────────── Boucle ─────────────────────────────

  private tick(dt: number): void {
    if (this.playing) this.player.update(dt);
    const bp = this.player.broomPoint();
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const r = this.rooms[ri];
      if (!this.isUnlocked(r.def.id)) continue;
      const here = this.playing && bp.room === r.def;
      this.input.active = here;
      this.input.x = bp.x - r.def.origin.x;
      this.input.y = bp.z - r.def.origin.z;
      this.input.yaw = this.player.yaw;
      this.input.pushBonus = this.player.movingForward ? this.mods.player.marchBonus : 0;
      r.sim.step(dt, here ? this.input : { active: false, x: 0, y: 0, pressed: false });
      const events = r.sim.drainEvents();
      if (events.length === 0) continue;
      let gained = 0;
      const counts = { dust: 0, bunny: 0, star: 0 };
      for (const e of events) {
        gained += e.coins;
        counts[e.type]++;
        this.world.onCollect(ri, e.collector, e.coins, e.type === 'star');
      }
      this.earn(gained);
      // On n'entend que ce qui se passe dans la pièce où l'on est.
      if (r.def === this.currentRoom) {
        const lvl = 0;
        if (counts.star) this.synth.collect('star', lvl, counts.star);
        if (counts.bunny) this.synth.collect('bunny', lvl, counts.bunny);
        if (counts.dust) this.synth.collect('dust', lvl, counts.dust);
      }
    }
  }

  private earn(amount: number): void {
    store.coins.value += amount;
    store.totalCoins.value += amount;
    this.earnedWindow[this.earnedWindow.length - 1] += amount;
  }

  /** Pièce actuelle, pièces à afficher, nom du lieu, porte devant soi. */
  private updatePlace(force: boolean): void {
    const p = this.player;
    const room = p.room();
    if (room) this.currentRoom = room;
    this.world.setActiveRoom(this.currentRoom ?? ROOMS[0]);

    // Pièces visibles : celle du joueur, ses voisines ouvertes, et celles au bout de l'escalier.
    const visible = new Set<string>();
    const near = (r: RoomDef) => {
      const dx = Math.max(r.origin.x - p.x, 0, p.x - (r.origin.x + r.width));
      const dz = Math.max(r.origin.z - p.z, 0, p.z - (r.origin.z + r.height));
      return Math.hypot(dx, dz) < 800 && Math.abs(r.floorY - p.y) < 330;
    };
    for (const r of ROOMS) if (this.isUnlocked(r.id) && (r === room || near(r))) visible.add(r.id);
    if (this.currentRoom) visible.add(this.currentRoom.id);
    const key = [...visible].sort().join(',');
    if (force || key !== this.visibleKey) {
      this.visibleKey = key;
      this.world.setVisibleRooms(visible);
    }

    store.placeName.value = this.nav.placeName(p.x, p.z, p.y) || (this.currentRoom?.name ?? '');
    store.roomName.value = this.currentRoom?.name ?? '';
    store.playerPos.value = { x: p.x, z: p.z, yaw: p.yaw };

    const door = this.playing ? this.nav.lockedDoorNear(p.x, p.z, p.y) : null;
    if (door?.room) {
      const r = roomById(door.room)!;
      store.doorPrompt.value = { name: r.name, price: r.price, affordable: store.coins.value >= r.price };
    } else if (store.doorPrompt.value) {
      store.doorPrompt.value = null;
    }
  }

  /** Informations du château pour la carte et le HUD. */
  private publishCastle(): void {
    store.castle.value = ROOMS.map((r) => {
      const rt = this.rooms.find((x) => x.def === r);
      return {
        id: r.id,
        name: r.name,
        x: r.origin.x,
        z: r.origin.z,
        w: r.width,
        h: r.height,
        level: r.floorY,
        unlocked: this.isUnlocked(r.id),
        cleaned: this.save.rooms[r.id]?.cleaned === true,
        clean: rt ? rt.sim.cleanliness : 0,
        price: r.price,
      };
    });
  }

  private hudTimer = 0;
  private updateHud(dt: number): void {
    const now = performance.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      const w = this.earnedWindow;
      store.coinsPerSecond.value = w.reduce((a, b) => a + b, 0) / w.length;
      w.shift();
      w.push(0);
    }
    const cur = this.currentRoom ? this.runtime(this.currentRoom) : null;
    if (cur) {
      const c = cur.sim.cleanliness;
      store.cleanliness.value = c;
      store.roomCleanedOnce.value = this.save.rooms[cur.def.id]?.cleaned === true;
    }

    // Pièces impeccables (une fois chacune) : bonus + confettis.
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const r = this.rooms[ri];
      const rs = this.save.rooms[r.def.id];
      if (!rs?.unlocked || rs.cleaned || r.sim.cleanliness < CLEAN_THRESHOLD) continue;
      rs.cleaned = true;
      const bonus = Math.max(250, Math.round(r.def.price * 0.5)) * this.mods.cleanBonusMult(r.def.id);
      this.earn(bonus);
      this.world.celebrate(ri);
      this.synth.fanfare();
      store.pushToast(`${r.def.name} : impeccable ! ✨`, `Bonus de ${formatNumber(bonus)} pièces. La poussière, elle, n'a pas dit son dernier mot…`, 6000);
      this.publishCastle();
      this.applyTree();
      this.persist();
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.5;
      if (store.mapOpen.value) this.publishCastle();
      this.refreshBuyable();
    }

    this.fpsAcc.frames++;
    this.fpsAcc.time += dt;
    if (this.fpsAcc.time >= 0.5) {
      const fps = this.fpsAcc.frames / this.fpsAcc.time;
      this.fpsAcc.frames = 0;
      this.fpsAcc.time = 0;
      store.fps.value = fps;
      if (this.debug) {
        const info = this.world.renderer.info.render;
        const p = this.player;
        store.debugInfo.value = `${fps.toFixed(0)} FPS · qualité ${store.qualityLevel.value} · ${info.calls} draw calls · ${(info.triangles / 1000).toFixed(0)}k tris · pos ${p.x | 0},${p.y | 0},${p.z | 0} · [G] +10 000 · [C] nettoyer la pièce`;
      }
    }
  }

  private persist(): void {
    const p = this.player;
    this.save = {
      ...this.save,
      coins: store.coins.value,
      totalCoins: store.totalCoins.value,
      player: { x: p.x, z: p.z, y: p.y, yaw: p.yaw },
      muted: store.muted.value,
      quality: store.qualitySetting.value,
      showFps: store.showFps.value,
    };
    writeSave(this.save);
  }
}
