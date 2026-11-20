import { DOORS, ROOMS, START, STAIRS, roomById, type DoorDef, type RoomDef } from './data/rooms';
import { RoomSim, type BroomInput } from './sim/roomSim';
import { World3D } from './render/world3d';
import { Player } from './player/player';
import { Navigation } from './world/nav';
import { sfx } from './audio/synth';
import { TOOLS, type DirtId } from './data/dirtTypes';
import { createFixedLoop } from './core/loop';
import { formatNumber } from './core/format';
import { createWorld, currentWorld, deleteWorld, exportSave, findSaves, importSave, listWorlds, loadSave, renameWorld, restoreAsWorld, setCurrentWorld, writeSave, type FoundSave, type SaveData, type Settings } from './save/save';
import { ACHIEVEMENTS, type AchievementContext } from './data/achievements';
import * as store from './state/store';
import { computeModifiers, type Modifiers } from './economy/modifiers';
import { availability, canRefund, cost, maxAffordable, refundFork, level as treeLevel, costForN, sparksFor } from './economy/tree';
import { NODE_BY_ID, TREE_NODES } from './data/tree';
import { StoryDirector, playLines } from './story/director';
import { EventDirector, type EventKind } from './story/events';
import { TipDirector } from './story/tips';
import { Multiplayer, type MpGame, type Pose } from './net/multiplayer';
import { NO_HELPERS } from './sim/helpers';
import { ALL_SOUVENIRS, THRONE_SOUVENIRS } from './data/story';
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
  private director!: StoryDirector;
  private events!: EventDirector;
  private tips!: TipDirector;
  /** Multijoueur (pair-à-pair). */
  net!: Multiplayer;
  /** Invité chez un ami : les pièces ouvertes de son château. */
  private hostUnlocked: Set<string> | null = null;
  private treeOpened = false;
  private albumOpened = false;
  private journalOpened = false;
  private mapOpened = false;
  /** Fin du jeu : la caméra tourne lentement autour de la Salle du trône. */
  private cinematicT = -1;
  private tickCount = 0;
  private farDt: number[] = [];
  private visibleIds = new Set<string>();
  private mods!: Modifiers;
  private visibleKey = '';

  constructor() {
    this.save = loadSave();
    this.rooms = ROOMS.map((def, i) => {
      const sim = new RoomSim(def, ((Date.now() & 0xffff) + i * 7919) >>> 0);
      // On retrouve la pièce exactement comme on l'a laissée (sinon elle est pleine de poussière).
      const saved = this.save.rooms[def.id]?.dirt;
      if (saved) sim.fillCounts(saved);
      else sim.fill(1);
      return { def, sim };
    });
    this.nav = new Navigation(ROOMS, DOORS, STAIRS, (id) => this.isUnlocked(id));
    const p = this.save.player;
    const valid = p && this.nav.canStand(p.x, p.z, p.y) !== null;
    this.player = new Player(this.nav, valid && p ? { ...p } : { x: START.x, z: START.z, y: ROOMS[0].floorY, yaw: START.yaw });
    this.mods = computeModifiers(this.save.tree, 0, this.save.sparks);
    this.applyTree();
    this.offlineGains();
    this.storeNewTools(false);

    store.coins.value = this.save.coins;
    store.sparks.value = this.save.sparks;
    store.prestiges.value = this.save.prestiges;
    store.totalCoins.value = this.save.totalCoins;
    store.muted.value = this.save.muted;
    store.showFps.value = this.save.showFps;
    const urlQ = new URLSearchParams(location.search).get('quality');
    store.qualitySetting.value = isQualitySetting(urlQ) ? urlQ : this.save.quality;
    this.synth.setMuted(this.save.muted);
    this.publishCastle();
  }

  isUnlocked(id: string): boolean {
    // En visite chez un ami, ce sont ses portes qui comptent.
    if (this.hostUnlocked) return this.hostUnlocked.has(id);
    return this.ownUnlocked(id);
  }

  /** Mes propres pièces (pour l'arbre, même quand je suis chez quelqu'un). */
  ownUnlocked(id: string): boolean {
    return this.save.rooms[id]?.unlocked === true;
  }

  get visiting(): boolean {
    return this.hostUnlocked !== null;
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
    this.director = new StoryDirector({
      save: this.save,
      rooms: this.rooms,
      isUnlocked: (id) => this.isUnlocked(id),
      player: this.player,
      world: this.world,
      onSouvenir: () => {
        this.synth.bigNode();
        this.publishCastle();
      },
      persist: () => this.persist(),
    });
    this.director.init();
    this.events = new EventDirector({
      rooms: this.rooms,
      currentRoom: () => {
        const room = this.player.room();
        return room ? this.rooms.findIndex((r) => r.def === room) : -1;
      },
      player: this.player,
      income: () => store.coinsPerSecond.value,
      starRain: () => this.mods.events.starRain,
      earn: (v) => this.earn(v),
      world: this.world,
      sound: this.synth,
      onEvent: () => this.save.stats.events++,
      onCoinFound: () => this.save.stats.coinsFound++,
    });
    this.applySettings();
    store.achievements.value = [...this.save.achievements];
    this.tips = this.makeTips();
    this.net = new Multiplayer(this.mpGame());
    this.net.publish();
    this.refreshWorlds();
    // On vient de choisir un monde sur l'écran d'accueil : on y entre directement.
    try {
      if (sessionStorage.getItem('dust-it-alone:enter')) {
        sessionStorage.removeItem('dust-it-alone:enter');
        setTimeout(() => this.start(), 300);
      }
    } catch {
      /* rien */
    }
    try {
      const why = sessionStorage.getItem('dust-it-alone:netReason');
      if (why) {
        sessionStorage.removeItem('dust-it-alone:netReason');
        setTimeout(() => store.pushToast('🏠 De retour chez toi', why, 5000), 1500);
      }
    } catch {
      /* rien */
    }
    store.souvenirCount.value = this.save.souvenirs.length;
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
      // L'arbre couvre tout l'écran : inutile de dessiner le château derrière (la simulation continue).
      if (!store.treeOpen.value) this.world.render(
        dt,
        this.cinematicT >= 0 ? this.cinematicView(dt) : { x: p.x, z: p.z, eye: p.eye, yaw: p.yaw, pitch: p.pitch },
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
      if (store.started.value && !this.visiting) this.director.update(realDt, this.player.room());
      this.net?.update(realDt);
      this.world.setRemotePlayers(this.net ? [...this.net.players.values()] : [], realDt);
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

  /**
   * Pendant ton absence, les assistants ont continué (à vitesse réduite) :
   * dans chaque pièce ouverte, ils ramassent au plus ce qui retombe.
   */
  private offlineGains(): void {
    const away = (Date.now() - this.save.savedAt) / 1000;
    if (away < 60) return;
    const { eff, hours } = this.mods.offline;
    const t = Math.min(away, hours * 3600);
    let coins = 0;
    for (const r of this.rooms) {
      if (!this.isUnlocked(r.def.id)) continue;
      const rate = r.sim.helperRate();
      if (rate <= 0) continue;
      const respawn = Object.values(r.def.respawn).reduce((a, b) => a + (b ?? 0), 0) * r.sim.mods.respawnMult;
      const grains = Math.min(rate, respawn) * t * eff;
      coins += grains * r.sim.baseValue('dust') * r.sim.mods.valueMultiplier * 1.3;
    }
    if (coins < 1) return;
    store.coins.value += coins;
    store.totalCoins.value += coins;
    store.offlineReport.value = { seconds: away, counted: t, coins };
  }

  // ───────────────────────────── Arbre des Souvenirs ─────────────────────────────

  private cleanedCount(): number {
    return Object.values(this.save.rooms).filter((r) => r.cleaned).length;
  }

  /** Recalcule et applique tous les effets de l'arbre (après un achat, une porte, une pièce impeccable…). */
  private applyTree(): void {
    this.mods = computeModifiers(this.save.tree, this.cleanedCount(), this.save.sparks);
    this.rooms.forEach((r, i) => {
      const m = this.mods.room(r.def.id, r.def.valueMult);
      r.sim.applyModifiers(m);
      // En visite, la poussière vient de l'hôte : pas de réapparition ni d'assistants chez moi.
      if (this.visiting) r.sim.mods.respawnMult = 0;
      r.sim.setHelpers(this.visiting ? NO_HELPERS : this.mods.helpers);
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
    store.treeBuyable.value = TREE_NODES.some((n) => {
      const a = availability(n, st);
      return (a.ok || (!a.ok && a.reason === 'fork')) && cost(n, treeLevel(st.levels, n.id)) <= this.wallet(n);
    });
  }

  /** Ce qu'on a en poche pour un nœud : des pièces, ou des Étincelles (anneau doré). */
  private wallet(n: { currency?: 'sparks' }): number {
    return n.currency === 'sparks' ? this.save.sparks : store.coins.value;
  }
  private pay(n: { currency?: 'sparks' }, amount: number): void {
    if (n.currency === 'sparks') {
      this.save.sparks -= amount;
      store.sparks.value = this.save.sparks;
    } else store.coins.value -= amount;
  }

  /** Étincelles que rapporterait un Grand Ménage maintenant. */
  prestigeGain(): number {
    return sparksFor(this.save.runCoins, this.mods.prestige.sparkGain);
  }

  /** Le Grand Ménage est-il possible ? (Grand Hall ouvert au moins une fois, et au moins 1 Étincelle à gagner) */
  prestigeReady(): boolean {
    return (this.isUnlocked('hall') || this.save.prestiges > 0) && this.prestigeGain() >= 1;
  }

  /**
   * Le Grand Ménage : la saison passe, le château se rendort. On garde les Étincelles,
   * l'anneau doré, les souvenirs et les réglages ; tout le reste repart de zéro.
   */
  grandMenage(): void {
    if (!this.prestigeReady()) return;
    const gain = this.prestigeGain();
    const p = this.mods.prestige;
    const keepIds = new Set(TREE_NODES.filter((n) => n.currency === 'sparks' || (p.keepHelpers && n.branch === 'helpers')).map((n) => n.id));
    const tree: Record<string, number> = {};
    for (const [id, l] of Object.entries(this.save.tree)) if (keepIds.has(id)) tree[id] = l;
    const rooms: SaveData['rooms'] = {};
    ROOMS.forEach((r, i) => {
      // Les pièces gardées restent ouvertes ; les étoiles « impeccable » sont gardées partout.
      const cleaned = this.save.rooms[r.id]?.cleaned === true;
      if (i <= p.keepRooms) rooms[r.id] = { unlocked: true, cleaned };
      else if (cleaned) rooms[r.id] = { unlocked: false, cleaned };
    });
    const next: SaveData = {
      ...this.save,
      coins: p.startCoins,
      runCoins: 0,
      tree,
      rooms,
      player: null,
      sparks: this.save.sparks + gain,
      prestiges: this.save.prestiges + 1,
      savedAt: Date.now(),
    };
    this.prestiging = true;
    writeSave(next);
    store.pushToast('✨ Grand Ménage !', `+${gain} Étincelles. Une nouvelle saison commence…`, 4000);
    this.synth.bigNode();
    setTimeout(() => location.reload(), 1600);
  }
  /** Pendant le Grand Ménage, on ne sauvegarde plus l'ancienne partie par-dessus la nouvelle. */
  private prestiging = false;

  /** Achète `n` niveaux d'un nœud (n = Infinity pour « Max »). Renvoie le nombre de niveaux achetés. */
  buyNode(id: string, n: number): number {
    const node = NODE_BY_ID.get(id);
    if (!node) return 0;
    // Monde partagé : c'est l'hôte qui achète avec l'argent du monde.
    if (this.visiting) {
      if (node.currency === 'sparks') {
        store.pushToast('L’anneau doré', 'Les Étincelles se dépensent chez l’hôte, dans son Grand Ménage.', 2500);
        return 0;
      }
      this.net.request({ t: 'buy', id, n });
      this.synth.buy(node.depth, 1);
      return 0;
    }
    const st = this.treeState();
    const a = availability(node, st);
    // Fourche : on peut changer d'avis gratuitement (l'autre choix est remboursé).
    let refund = 0;
    if (!a.ok && a.reason === 'fork') {
      const other = TREE_NODES.find((x) => x.fork === node.fork && x.id !== node.id && treeLevel(st.levels, x.id) > 0)!;
      const back = costForN(other, 0, treeLevel(st.levels, other.id));
      if (cost(node, 0) > this.wallet(node) + back) {
        this.synth.denied();
        return 0;
      }
      refund = refundFork(node, this.save.tree).refund;
      this.pay(node, -refund);
    } else if (!a.ok) {
      this.synth.denied();
      return 0;
    }
    const lvl = treeLevel(this.save.tree, id);
    const count = Math.min(n, maxAffordable(node, lvl, this.wallet(node)));
    if (count <= 0) {
      this.synth.denied();
      return 0;
    }
    const price = costForN(node, lvl, count);
    this.pay(node, price);
    const newLevel = lvl + count;
    this.save.tree[id] = newLevel;
    this.save.stats.levelsBought += count;
    if (node.kind !== 'small') this.synth.bigNode();
    else if (newLevel >= node.maxLevel) this.synth.nodeMaxed();
    else this.synth.buy(node.depth, newLevel);
    if (node.kind !== 'small') store.pushToast(`${node.icon} ${node.name}`, node.effect(1), 3500);
    if (refund > 0) store.pushToast('Fourche changée', `L'autre choix a été remboursé (${formatNumber(refund)} 🪙).`, 3000);
    this.applyTree();
    if (TOOLS.some((t) => t.node === id)) this.storeNewTools(true);
    this.persist();
    return count;
  }

  /** Rembourse un niveau d'un nœud (on récupère exactement ce qu'il a coûté). Renvoie vrai si c'est fait. */
  refundNode(id: string): boolean {
    const node = NODE_BY_ID.get(id);
    if (!node) return false;
    if (this.visiting) {
      this.net.request({ t: 'refund', id });
      return false;
    }
    const r = canRefund(node, this.save.tree);
    if (!r.ok) {
      this.synth.denied();
      if (r.reason === 'needed') store.pushToast('Impossible de rembourser', `« ${r.detail} » a besoin de ce niveau : rembourse-le d'abord.`, 3000);
      return false;
    }
    const lvl = treeLevel(this.save.tree, id) - 1;
    if (lvl > 0) this.save.tree[id] = lvl;
    else delete this.save.tree[id];
    this.pay(node, -r.amount);
    this.synth.refund();
    this.applyTree();
    this.persist();
    return true;
  }

  /** Ouvre / ferme l'Arbre des Souvenirs (la souris est libérée pendant ce temps). */
  toggleTree(): void {
    const open = !store.treeOpen.value;
    if (open) this.treeOpened = true;
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
    // Musique de fond « Poussière oubliée » (elle ne peut démarrer qu'après un clic : règle des navigateurs).
    this.synth.playMusic('/music/poussiere-oubliee.mp3');
    const firstTime = !store.started.value && !this.save.introSeen;
    store.started.value = true;
    if (firstTime) {
      this.save.introSeen = true;
      setTimeout(() => this.director.intro(), 900);
    }
    store.paused.value = false;
    store.mapOpen.value = false;
    store.treeOpen.value = false;
    this.lockPointer();
    // Monde ouvert au multijoueur : on ouvre la partie dès qu'on y entre.
    if (this.save.world.multiplayer && !this.visiting && this.net.role === 'off') {
      this.net.isPublic = this.save.world.isPublic;
      void this.net.host();
    }
  }

  // ───────────────────────────── Mondes ─────────────────────────────

  /** Rafraîchit la liste des mondes affichée sur l'écran d'accueil. */
  refreshWorlds(): void {
    store.worlds.value = listWorlds();
    store.currentWorld.value = currentWorld();
    store.world.value = { ...this.save.world };
  }

  /** Joue un monde : celui qui est chargé démarre tout de suite, un autre recharge la page. */
  playWorld(id: string): void {
    if (id === currentWorld()) {
      this.persist();
      this.start();
      return;
    }
    this.persist();
    setCurrentWorld(id);
    this.reloadInto();
  }

  /** Crée un monde et y entre. */
  newWorld(name: string, multiplayer: boolean, isPublic: boolean): void {
    // Tout premier lancement : le monde chargé est encore vierge, on le baptise simplement.
    if (listWorlds().length === 0) {
      this.save.world = { name: name.trim().slice(0, 32) || 'Mon château', multiplayer, isPublic };
      this.persist();
      this.refreshWorlds();
      this.start();
      return;
    }
    this.persist();
    createWorld(name, multiplayer, isPublic, this.save.settings);
    this.reloadInto();
  }

  /** Toutes les sauvegardes trouvées dans ce navigateur (« Récupérer une partie »). */
  foundSaves(): FoundSave[] {
    return findSaves();
  }

  /** Restaure une sauvegarde trouvée comme nouveau monde, et y entre. */
  restoreSave(key: string): void {
    this.persist();
    if (restoreAsWorld(key)) this.reloadInto();
  }

  removeWorld(id: string): void {
    const loaded = id === currentWorld();
    if (loaded) this.prestiging = true;
    deleteWorld(id);
    if (loaded) location.reload();
    else this.refreshWorlds();
  }

  renameWorldTo(id: string, name: string): void {
    if (id === currentWorld()) {
      this.save.world.name = name.trim().slice(0, 32) || this.save.world.name;
      this.persist();
    } else renameWorld(id, name);
    this.refreshWorlds();
  }

  /** Ouvre (ou ferme) ce monde au multijoueur : argent et améliorations partagés avec les invités. */
  setWorldMultiplayer(multiplayer: boolean, isPublic: boolean): void {
    if (this.visiting) return;
    this.save.world.multiplayer = multiplayer;
    this.save.world.isPublic = isPublic;
    this.persist();
    this.refreshWorlds();
    if (multiplayer) {
      this.net.setPublic(isPublic);
      if (this.net.role === 'off' && store.started.value) void this.net.host();
    } else if (this.net.role === 'host') this.net.leave('');
  }

  private reloadInto(): void {
    this.prestiging = true;
    try {
      sessionStorage.setItem('dust-it-alone:enter', '1');
    } catch {
      /* rien */
    }
    location.reload();
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

  // ───────────────────────────── Réglages ─────────────────────────────

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.save.settings[key] = value;
    this.applySettings();
    this.persistSoon();
  }

  private applySettings(): void {
    const s = this.save.settings;
    store.settings.value = { ...s };
    this.player.sensitivity = 0.0022 * s.sensitivity;
    this.player.invertY = s.invertY;
    this.player.headBob = s.headBob;
    this.world.setFov(s.fov);
    this.synth.setVolume(s.volume);
    this.synth.setMusicVolume(s.music);
    this.synth.voices = s.voices;
  }

  /** Bascule entre le style dessin et le mode réaliste : il faut recharger (toutes les textures changent). */
  setRealistic(on: boolean): void {
    this.save.settings.realistic = on;
    this.persist();
    const url = new URL(location.href);
    url.searchParams.delete('style');
    location.replace(url.toString());
  }

  private persistTimer = 0;
  private persistSoon(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.persist(), 400);
  }

  /** Code de sauvegarde à copier ailleurs. */
  exportCode(): string {
    this.persist();
    return exportSave(this.save);
  }

  /** Télécharge la sauvegarde dans un fichier. */
  downloadSave(): void {
    const blob = new Blob([this.exportCode()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = `dust-it-alone-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    store.pushToast('💾 Sauvegarde exportée', 'Garde bien ce fichier : il contient toute ta partie.', 3500);
  }

  /** Remplace la partie par une sauvegarde importée. Renvoie faux si le code est illisible. */
  loadCode(text: string): boolean {
    const data = importSave(text);
    if (!data) {
      this.synth.denied();
      return false;
    }
    this.prestiging = true;
    writeSave(data);
    location.reload();
    return true;
  }

  /** Efface ce monde (après confirmation dans l'interface). */
  wipeSave(): void {
    this.removeWorld(currentWorld());
  }

  /** Écran multijoueur (liste des parties, héberger, rejoindre). */
  toggleNet(): void {
    const open = !store.netOpen.value;
    store.netOpen.value = open;
    this.player.clearKeys();
    this.input.pressed = false;
    if (open) {
      this.net.openLobby();
      store.paused.value = false;
      document.exitPointerLock?.();
    } else {
      this.net.closeLobby();
      if (store.started.value) this.start();
    }
  }

  toggleJournal(): void {
    const open = !store.journalOpen.value;
    if (open) this.journalOpened = true;
    store.journalOpen.value = open;
    this.player.clearKeys();
    this.input.pressed = false;
    if (open) {
      store.paused.value = false;
      document.exitPointerLock?.();
    } else this.start();
  }

  // ───────────────────────────── Multijoueur ─────────────────────────────

  /** Ce que le multijoueur peut demander au jeu. */
  private mpGame(): MpGame {
    return {
      rooms: this.rooms,
      localPose: () => this.localPose(),
      unlockedIds: () => ROOMS.filter((r) => this.isUnlocked(r.id)).map((r) => r.id),
      placeName: () => this.currentRoom?.name ?? ROOMS[0].name,
      startVisit: (host, unlocked, spawn) => {
        // On met mon château de côté : il ne sera pas modifié par la visite.
        this.persist();
        this.hostUnlocked = new Set(unlocked);
        this.applyTree();
        // La poussière de l'hôte va arriver : on vide mes pièces en attendant.
        for (const r of this.rooms) for (let i = 0; i < r.sim.pool.cap; i++) r.sim.pool.kill(i);
        this.world.setDoorState((d) => this.doorOpen(d), true);
        Object.assign(this.player, { x: spawn.x, z: spawn.z, y: spawn.y, yaw: spawn.yaw });
        (this.player as unknown as { smoothY: number }).smoothY = spawn.y;
        this.visibleKey = '';
        this.updatePlace(true);
        this.publishCastle();
        store.netOpen.value = false;
        store.pushToast(`🏰 Chez ${host}`, 'Monde partagé : l’argent et les améliorations sont ceux de son monde. Tout ce que vous ramassez va dans la même cagnotte !', 6000);
        this.synth.unlockDoor();
        this.start();
      },
      setHostUnlocked: (unlocked) => {
        if (!this.hostUnlocked) return;
        this.hostUnlocked = new Set(unlocked);
        this.world.setDoorState((d) => this.doorOpen(d));
        this.visibleKey = '';
        this.publishCastle();
      },
      endVisit: (reason) => {
        this.prestiging = true;
        try {
          sessionStorage.setItem('dust-it-alone:netReason', reason || 'Tu es revenu dans ton château.');
        } catch {
          /* rien */
        }
        location.reload();
      },
      economy: () => ({ coins: store.coins.value, total: store.totalCoins.value, cps: store.coinsPerSecond.value, sparks: this.save.sparks, tree: { ...this.save.tree } }),
      applyEconomy: (e) => {
        // Invité : l'argent et l'arbre affichés sont ceux du monde de l'hôte.
        store.coins.value = e.coins;
        store.totalCoins.value = e.total;
        store.coinsPerSecond.value = e.cps;
        this.save.sparks = e.sparks;
        store.sparks.value = e.sparks;
        const key = JSON.stringify(e.tree);
        if (key !== JSON.stringify(this.save.tree)) {
          this.save.tree = { ...e.tree };
          this.applyTree();
          this.storeNewTools(true);
        }
        this.refreshBuyable();
      },
      hostBuy: (id, n, who) => {
        const node = NODE_BY_ID.get(id);
        if (node && this.buyNode(id, n) > 0) store.pushToast(`🛒 ${who}`, `a acheté « ${node.name} » avec l’argent du monde.`, 3000);
      },
      hostRefund: (id, who) => {
        const node = NODE_BY_ID.get(id);
        if (node && this.refundNode(id)) store.pushToast(`↩️ ${who}`, `a remboursé un niveau de « ${node.name} ».`, 3000);
      },
      hostUnlock: (roomId, who) => {
        const room = roomById(roomId);
        if (room && !this.isUnlocked(room.id) && this.unlockRoom(room)) store.pushToast(`🔓 ${who}`, `a ouvert ${room.name} avec l’argent du monde !`, 4000);
      },
      toast: (title, text) => store.pushToast(title, text, 4000),
      sound: (kind) => (kind === 'leave' ? this.synth.close() : kind === 'request' ? this.synth.chime() : this.synth.fanfare()),
    };
  }

  private localPose(): Pose {
    const p = this.player;
    const bp = p.broomPoint();
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      tool: TOOLS[store.selectedTool.value].id,
      pressed: this.playing && this.input.pressed,
      bx: bp.x,
      bz: bp.z,
      by: bp.room ? bp.room.floorY : p.y,
      broomRoom: bp.room ? this.rooms.findIndex((r) => r.def === bp.room) : -1,
      width: this.mods.room('attic', 1).broomWidth,
      depth: this.rooms[0].sim.broom.depth,
      grip: this.mods.room('attic', 1).broomGrip,
    };
  }

  /** Les bulles d'aide du tutoriel (chacune une seule fois). */
  private makeTips(): TipDirector {
    const grains = () => Object.values(this.save.stats.grains).reduce((a, b) => a + (b ?? 0), 0);
    const unlocked = () => Object.values(this.save.rooms).filter((r) => r.unlocked).length;
    const toolCount = () => TOOLS.filter((_, i) => this.toolUnlocked(i)).length;
    const sim = () => (this.currentRoom ? this.runtime(this.currentRoom).sim : null);
    let tools = toolCount();
    const startTime = this.save.stats.playTime;
    return new TipDirector(
      [
        { id: 'sweep', icon: '🧹', text: 'Psst ! En bas ! C’est moi, Dustuce, le grain de poussière le plus sympa du château. Je vais t’aider. Maintiens le clic gauche et avance : ta brosse pousse la poussière. Fais-la tomber dans une pelle, ça rapporte des pièces !', when: () => this.save.stats.playTime - startTime > 14, done: () => grains() >= 25 },
        { id: 'tree', icon: '🌳', text: 'Ooh, ça brille dans tes poches ! Tu as de quoi t’offrir une amélioration. Appuie sur B pour ouvrir l’Arbre des Souvenirs.', when: () => store.treeBuyable.value, done: () => this.treeOpened || this.save.stats.levelsBought > 0 },
        { id: 'door', icon: '🚪', text: 'Une porte fermée à clé… Derrière, il y a plein de poussière, des cousins à moi ! Appuie sur E quand tu as assez de pièces pour l’ouvrir.', when: () => store.doorPrompt.value !== null, done: () => unlocked() > 1 },
        { id: 'map', icon: '🗺️', text: 'Le château est immense, même pour moi. Appuie sur M pour voir la carte, comme ça on ne se perd pas.', when: () => unlocked() >= 2, done: () => this.mapOpened },
        { id: 'souvenir', icon: '✨', text: 'Tu as vu ? Quelque chose brille par terre ! Plus une pièce est propre, plus elle révèle de souvenirs. Va vite le ramasser !', when: () => (sim()?.cleanliness ?? 0) >= 0.27 && this.save.souvenirs.length === 0, done: () => this.save.souvenirs.length > 0 },
        { id: 'album', icon: '📜', text: 'Ton premier souvenir ! Ça m’émeut, j’en ai la poussière aux yeux. Appuie sur J pour le relire dans l’album.', when: () => this.save.souvenirs.length > 0, done: () => this.albumOpened },
        { id: 'airflow', icon: '🌬️', text: 'Wouah, plus un grain par terre ! Ici, la poussière ne reviendra plus toute seule… Si tu veux qu’elle retombe (et gagner encore des pièces), achète « Courants d’air » pour cette pièce dans l’Arbre.', when: () => (sim()?.cleanliness ?? 0) >= 0.92 && (sim()?.mods.respawnMult ?? 1) === 0 },
        { id: 'sprint', icon: '💨', text: 'Tu marches drôlement lentement… Maintiens Maj pour courir !', when: () => unlocked() >= 3 },
        {
          id: 'tool',
          icon: '🧰',
          text: 'Un nouvel outil ! Change d’outil avec les touches 1 à 3 ou la molette. Ta barre n’a que 3 cases : les autres outils t’attendent dans le coffre des combles (E devant le coffre). Certaines saletés ne partent qu’avec le bon outil, crois-moi.',
          when: () => {
            const n = toolCount();
            const more = n > tools;
            tools = n;
            return more || n > 1;
          },
          done: () => store.selectedTool.value > 0,
        },
        { id: 'vacuum', icon: '🫙', text: 'Ton aspirateur est plein à craquer ! J’ai failli y passer… Approche-toi d’une pelle et appuie sur E pour le vider.', when: () => !!store.vacuum.value && store.vacuum.value.load >= store.vacuum.value.cap },
        { id: 'journal', icon: '🏆', text: 'Bravo, ton premier succès ! Appuie sur K pour ouvrir ton carnet : tes succès et tes statistiques y sont.', when: () => this.save.achievements.length > 0, done: () => this.journalOpened },
      ],
      { seen: this.save.tips, time: 0 },
      (t) => (store.tip.value = t ? { id: t.id, icon: t.icon, text: t.text } : null),
    );
  }

  /** Contexte pour les succès. */
  achievementContext(): AchievementContext {
    this.save.totalCoins = store.totalCoins.value;
    this.save.coins = store.coins.value;
    const grains = Object.values(this.save.stats.grains).reduce((a, b) => a + (b ?? 0), 0);
    const rooms = Object.values(this.save.rooms);
    const h = this.mods.helpers;
    return {
      save: this.save,
      grains,
      cleanedRooms: rooms.filter((r) => r.cleaned).length,
      unlockedRooms: rooms.filter((r) => r.unlocked).length,
      helpers: h.moutonnet + h.plumette + h.roulio + h.biscotte,
    };
  }

  private checkAchievements(): void {
    const ctx = this.achievementContext();
    for (const a of ACHIEVEMENTS) {
      if (this.save.achievements.includes(a.id) || a.progress(ctx) < 1) continue;
      this.save.achievements.push(a.id);
      store.achievements.value = [...this.save.achievements];
      store.pushToast(`🏆 Succès : ${a.name}`, `${a.icon} ${a.text}`, 4500);
      this.synth.chime();
    }
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
    return store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && !store.albumOpen.value && !store.journalOpen.value && !store.netOpen.value && !store.inventoryOpen.value && this.cinematicT < 0;
  }

  // ───────────────────────────── Commandes ─────────────────────────────

  private bindInput(): void {
    const canvas = this.world.canvas;
    let lockedAt = 0;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked) lockedAt = performance.now();
      if (!locked && store.started.value && !this.debug && !store.mapOpen.value && !store.treeOpen.value && !store.albumOpen.value && !store.journalOpen.value && !store.netOpen.value && !store.inventoryOpen.value) {
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
      if (e.code === 'KeyJ' && store.started.value && !store.treeOpen.value && !store.mapOpen.value && this.cinematicT < 0) {
        this.toggleAlbum();
        return;
      }
      // Demande pour rejoindre ma partie : O = oui, N = non.
      if ((e.code === 'KeyO' || e.code === 'KeyN') && store.netRequests.value.length) {
        this.net.answer(store.netRequests.value[0].slot, e.code === 'KeyO');
        return;
      }
      if (e.code === 'KeyP' && store.started.value && !store.treeOpen.value && this.cinematicT < 0) {
        this.toggleNet();
        return;
      }
      if (e.code === 'KeyK' && store.started.value && !store.treeOpen.value && !store.mapOpen.value && !store.albumOpen.value && this.cinematicT < 0) {
        this.toggleJournal();
        return;
      }
      if (e.code === 'KeyM' && store.started.value && !store.treeOpen.value) {
        this.toggleMap();
        return;
      }
      if (e.code === 'KeyB' && store.started.value && !store.paused.value) {
        this.toggleTree();
        return;
      }
      if ((e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyI') && store.inventoryOpen.value) {
        this.toggleInventory();
        return;
      }
      if (e.code === 'Escape' && store.treeOpen.value) {
        this.toggleTree();
        return;
      }
      if (!this.playing) return;
      this.player.setKey(e.code, true);
      if (e.code === 'KeyE' && store.benchPrompt.value && !(TOOLS[store.selectedTool.value].id === 'vacuum' && this.tryEmptyVacuum())) {
        this.toggleTree();
        return;
      }
      if (e.code === 'KeyE' && store.chestPrompt.value) {
        this.toggleInventory();
        return;
      }
      if (e.code === 'KeyE' && !(TOOLS[store.selectedTool.value].id === 'vacuum' && this.tryEmptyVacuum())) this.tryUnlock();
      if (e.code === 'Space' || e.code === 'Enter') store.nextDialogue();
      const digit = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
      if (digit) this.selectSlot(Number(digit[1]) - 1);
      if (this.debug && e.code === 'KeyG') this.earn(10000);
      if (this.debug && e.code === 'KeyC') {
        const r = this.currentRoom && this.runtime(this.currentRoom);
        if (r) for (let i = 0; i < r.sim.pool.cap; i++) r.sim.pool.kill(i);
      }
    });
    window.addEventListener('keyup', (e) => this.player.setKey(e.code, false));
    window.addEventListener('wheel', (e) => {
      if (!this.playing) return;
      // Molette : case suivante (ou précédente) de la barre rapide, en sautant les cases vides.
      const bar = this.save.hotbar;
      const n = bar.length;
      let k = Math.max(0, bar.indexOf(TOOLS[store.selectedTool.value].id));
      for (let step = 0; step < n; step++) {
        k = (k + (e.deltaY > 0 ? 1 : n - 1)) % n;
        if (bar[k]) break;
      }
      this.selectSlot(k);
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
        buy: (id: string, n: number) => this.buyNode(id, n),
        refund: (id: string) => this.refundNode(id),
        giveSouvenirs: (n: number) => {
          for (const s of ALL_SOUVENIRS.slice(0, n)) if (!this.save.souvenirs.includes(s.id)) this.save.souvenirs.push(s.id);
        },
        souvenirSpots: () => [...(this.director as unknown as { positions: Map<string, { x: number; y: number }> }).positions.entries()],
        event: (kind: EventKind) => {
          const room = this.player.room();
          if (room) this.events.trigger(kind, this.rooms.findIndex((r) => r.def === room));
        },
        net: () => ({ ...store.net.value, requests: store.netRequests.value }),
        dirt: (ri: number) => ({ ...this.rooms[ri].sim.pool.aliveCount }),
        coins: () => store.coins.value,
        treeIds: () => TREE_NODES.map((n) => n.id),
        music: () => this.synth.musicState(),
        active: () => [...(this.net?.activeRooms() ?? [])],
        rooms: () => ROOMS.map((r) => ({ id: r.id, name: r.name, x: r.origin.x, z: r.origin.z, w: r.width, h: r.height, y: r.floorY })),
        unlockAll: () => {
          for (const r of ROOMS) this.save.rooms[r.id] = { ...(this.save.rooms[r.id] ?? { cleaned: false }), unlocked: true };
          this.world.setDoorState((d) => this.doorOpen(d), true);
          this.visibleKey = '';
          this.publishCastle();
          this.applyTree();
        },
        tool: (i: number) => {
          for (const t of TOOLS) if (t.node) this.save.tree[t.node] = 1;
          this.selectTool(i);
        },
        teleport: (x: number, z: number, y: number, yaw: number, pitch = -0.3) => {
          Object.assign(this.player, { x, z, y, yaw, pitch });
          (this.player as unknown as { smoothY: number }).smoothY = y;
        },
        player: this.player,
        world: this.world,
      };
    }
  }

  /** Un outil est-il débloqué (par son nœud de l'arbre) ? */
  private toolUnlocked(index: number): boolean {
    const t = TOOLS[index];
    return !!t && (!t.node || (this.save.tree[t.node] ?? 0) > 0);
  }

  /** Changer d'outil (touches 1 à 5, molette). */
  selectTool(index: number): void {
    if (!this.toolUnlocked(index)) {
      store.toolShake.value = { index, at: performance.now() };
      this.synth.denied();
      return;
    }
    if (store.selectedTool.value !== index) this.synth.tool();
    store.selectedTool.value = index;
    this.world.setTool(TOOLS[index].id);
    store.toolHint.value = TOOLS[index].hint;
  }

  // ───────────────────────────── Barre rapide et coffre ─────────────────────────────

  /** Prend l'outil de la case k de la barre rapide (1, 2 ou 3). */
  selectSlot(k: number): void {
    const id = this.save.hotbar[k];
    const index = TOOLS.findIndex((t) => t.id === id);
    if (!id || index < 0) {
      store.toolShake.value = { index: k, at: performance.now() };
      this.synth.denied();
      store.pushToast('Case vide', 'Range un outil ici depuis le coffre des combles (E devant le coffre).', 2500);
      return;
    }
    this.selectTool(index);
  }

  /** Range un outil dans une case de la barre (s'il y était déjà ailleurs, les deux cases s'échangent). */
  setHotbarSlot(slot: number, id: string): void {
    const bar = [...this.save.hotbar];
    const t = TOOLS.findIndex((x) => x.id === id);
    if (id && (t < 0 || !this.toolUnlocked(t))) return;
    const from = id ? bar.indexOf(id) : -1;
    if (from >= 0) bar[from] = bar[slot];
    bar[slot] = id;
    this.save.hotbar = bar;
    store.hotbar.value = bar;
    // L'outil en main n'est plus dans la barre : on prend le premier outil de la barre.
    if (!bar.includes(TOOLS[store.selectedTool.value].id)) {
      const first = bar.find((x) => x);
      if (first) this.selectTool(TOOLS.findIndex((x) => x.id === first));
    }
    this.synth.tool();
    this.persistSoon();
  }

  /** Un nouvel outil arrive : dans la barre s'il y a une case libre, sinon dans le coffre. */
  private storeNewTools(announce: boolean): void {
    const bar = [...this.save.hotbar];
    TOOLS.forEach((t, i) => {
      if (!this.toolUnlocked(i) || bar.includes(t.id)) return;
      const free = bar.indexOf('');
      if (free >= 0) {
        bar[free] = t.id;
        if (announce) store.pushToast(`${t.icon} ${t.name}`, `Rangé dans ta barre (touche ${free + 1}).`, 3500);
      } else if (announce && !this.save.seen.includes(`chest:${t.id}`)) {
        store.pushToast(`${t.icon} ${t.name}`, 'Ta barre est pleine : l’outil t’attend dans le coffre des combles (E devant le coffre).', 5000);
      }
      if (announce) this.save.seen.push(`chest:${t.id}`);
    });
    this.save.hotbar = bar;
    store.hotbar.value = bar;
  }

  /** Le coffre des combles : tous mes outils, à ranger dans la barre rapide. */
  toggleInventory(): void {
    const open = !store.inventoryOpen.value;
    store.inventoryOpen.value = open;
    this.player.clearKeys();
    this.input.pressed = false;
    if (open) {
      this.synth.open();
      store.inventorySlot.value = Math.max(0, this.save.hotbar.indexOf(''));
      store.paused.value = false;
      document.exitPointerLock?.();
    } else {
      this.synth.close();
      this.start();
    }
  }

  /** Vider l'aspirateur : il faut être près d'une pelle de la pièce. */
  private tryEmptyVacuum(): boolean {
    const room = this.player.room();
    if (!room) return false;
    const rt = this.runtime(room);
    if (rt.sim.vacuumLoad <= 0) return false;
    const near = room.collectors.some((c) => Math.hypot(room.origin.x + c.mouth.x - this.player.x, room.origin.z + c.mouth.y - this.player.z) < 320);
    if (!near) {
      store.pushToast('Réservoir de l’aspirateur', 'Approche-toi d’une pelle pour le vider (E).', 2200);
      return true;
    }
    rt.sim.emptyVacuum();
    this.synth.close();
    this.synth.chime();
    return true;
  }

  /** Ouvre / ferme l'album des souvenirs (touche J). */
  toggleAlbum(): void {
    const open = !store.albumOpen.value;
    store.albumOpen.value = open;
    if (open) this.albumOpened = true;
    this.player.clearKeys();
    this.input.pressed = false;
    if (open) {
      store.paused.value = false;
      document.exitPointerLock?.();
    }
    else this.start();
  }

  foundSouvenirs(): string[] {
    return [...this.save.souvenirs];
  }
  seenEchoes(): string[] {
    return [...this.save.echoes];
  }

  /** Revoir un écho du passé depuis l'album. */
  replayEcho(lines: Parameters<typeof playLines>[0]): void {
    playLines(lines);
  }

  /** La fin du jeu : la caméra fait le tour de la Salle du trône pendant les dernières répliques. */
  private startEnding(): void {
    this.save.endingSeen = true;
    this.cinematicT = 0;
    store.cinematic.value = true;
    this.input.pressed = false;
    this.player.clearKeys();
    const ri = this.rooms.findIndex((r) => r.def.id === 'throne');
    const lines = this.director.ending();
    const seconds = 4 + lines.reduce((t, [, l]) => t + 2.2 + l.length * 0.05, 0);
    this.world.playEcho(ri, ['adult', 'child', 'plush'], seconds);
    store.clearDialogue();
    setTimeout(() => playLines(lines), 1500);
    setTimeout(() => {
      store.cinematic.value = false;
      store.credits.value = true;
      this.cinematicT = -1;
    }, seconds * 1000);
    this.persist();
  }

  private cinematicView(dt: number): { x: number; z: number; eye: number; yaw: number; pitch: number } {
    this.cinematicT += dt;
    const r = roomById('throne')!;
    const cx = r.origin.x + r.width / 2;
    const cz = r.origin.z + r.height / 2;
    const a = this.cinematicT * 0.12;
    const rad = Math.min(r.width, r.height) * 0.38;
    const x = cx + Math.sin(a) * rad;
    const z = cz + Math.cos(a) * rad;
    // On regarde le centre de la salle, un peu vers le bas.
    return { x, z, eye: r.floorY + 260, yaw: Math.atan2(x - cx, z - cz), pitch: -0.32 };
  }

  /** Ouvre / ferme la carte du château (la souris est libérée pendant ce temps). */
  toggleMap(): void {
    const open = !store.mapOpen.value;
    if (open) this.mapOpened = true;
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
    if (room.id === 'throne' && !this.director.throneOpenable()) {
      store.pushToast('La porte ne bouge pas…', `Elle s'ouvrira quand le château se souviendra assez : ${this.director.souvenirCount()} / ${THRONE_SOUVENIRS} souvenirs.`, 3500);
      this.synth.denied();
      return;
    }
    if (store.coins.value < room.price) {
      store.pushToast('Pas assez de pièces 🪙', `Il manque ${formatNumber(room.price - store.coins.value)} pièces pour ouvrir ${room.name}.`, 2500);
      this.synth.denied();
      return;
    }
    // Monde partagé : l'hôte ouvre la porte avec l'argent du monde.
    if (this.visiting) {
      this.net.request({ t: 'unlock', room: room.id });
      return;
    }
    this.unlockRoom(room);
  }

  /** Ouvre une pièce (moi, ou un invité avec l'argent du monde). Renvoie vrai si c'est fait. */
  private unlockRoom(room: RoomDef): boolean {
    if (room.id === 'throne' && !this.director.throneOpenable()) return false;
    if (store.coins.value < room.price) return false;
    store.coins.value -= room.price;
    this.save.rooms[room.id] = { unlocked: true, cleaned: false };
    this.save.stats.doors++;
    this.world.setDoorState((dd) => this.doorOpen(dd));
    this.synth.unlockDoor();
    setTimeout(() => this.synth.fanfare(), 700);
    store.pushToast('Porte ouverte ! 🔓', `${room.name} est accessible. La poussière y est ${room.valueMult}× plus précieuse !`, 4500);
    this.visibleKey = '';
    this.publishCastle();
    this.applyTree();
    this.persist();
    this.net?.pushEconomy();
    return true;
  }

  // ───────────────────────────── Boucle ─────────────────────────────

  private tick(dt: number): void {
    if (this.playing) {
      const px = this.player.x;
      const pz = this.player.z;
      this.player.update(dt);
      if (!this.visiting) this.events.update(dt);
      this.tips.update(dt);
      const st = this.save.stats;
      st.playTime += dt;
      const step = Math.hypot(this.player.x - px, this.player.z - pz);
      if (step < 60) st.walked += step / 100;
    }
    const bp = this.player.broomPoint();
    this.tickCount++;
    // Arbre ouvert (plein écran) : on ne voit pas le château, tout est simulé « en résumé » (bien plus léger).
    const thrifty = store.treeOpen.value;
    // Multijoueur : les pièces où sont mes invités restent simulées à fond, même si je suis ailleurs.
    const busy = this.net?.activeRooms();
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const r = this.rooms[ri];
      if (!this.isUnlocked(r.def.id)) continue;
      const here = this.playing && bp.room === r.def;
      // Les pièces loin du joueur sont simulées 6 fois moins souvent (la poussière y retombe quand même).
      const near = here || (!thrifty && (r.def === this.currentRoom || this.visibleIds.has(r.def.id))) || (busy?.has(ri) ?? false);
      let stepDt = dt;
      if (!near) {
        this.farDt[ri] = (this.farDt[ri] ?? 0) + dt;
        if ((this.tickCount + ri) % 6 !== 0) continue;
        stepDt = this.farDt[ri];
        this.farDt[ri] = 0;
      }
      this.input.active = here;
      this.input.x = bp.x - r.def.origin.x;
      this.input.y = bp.z - r.def.origin.z;
      this.input.yaw = this.player.yaw;
      this.input.pushBonus = this.player.movingForward ? this.mods.player.marchBonus : 0;
      this.input.tool = TOOLS[store.selectedTool.value].id;
      this.net?.applyRemoteBrooms(ri, r.sim, stepDt);
      r.sim.step(stepDt, here ? this.input : { active: false, x: 0, y: 0, pressed: false });
      // Pas léger : en marchant, les pieds écartent la poussière.
      if (this.playing && this.mods.player.feet && this.player.moving && r.def === this.player.room()) r.sim.kickFeet(this.player.x - r.def.origin.x, this.player.z - r.def.origin.z);
      // Les assistants : « en vrai » près du joueur, « en résumé » ailleurs.
      if (this.visiting) {
        /* les assistants de l'hôte travaillent chez lui */
      } else if (near) r.sim.stepHelpers(stepDt);
      else r.sim.abstractHelpers(stepDt);
      const events = r.sim.drainEvents();
      if (events.length === 0) continue;
      let gained = 0;
      const counts: Partial<Record<DirtId, number>> = {};
      for (const e of events) {
        // En visite, c'est l'hôte qui ramasse pour de vrai (l'argent du monde est chez lui).
        if (this.visiting) {
          this.world.onCollect(ri, e.collector, e.coins, e.type === 'star', { ...e, byHelper: true });
          continue;
        }
        gained += e.coins;
        counts[e.type] = (counts[e.type] ?? 0) + 1;
        this.world.onCollect(ri, e.collector, e.coins, e.type === 'star', e);
      }
      if (gained === 0 && Object.keys(counts).length === 0) continue;
      this.earn(gained);
      const grains = this.save.stats.grains;
      for (const [k, n] of Object.entries(counts) as [DirtId, number][]) grains[k] = (grains[k] ?? 0) + n;
      // On n'entend que ce qui se passe dans la pièce où l'on est.
      if (r.def === this.currentRoom) {
        const lvl = 0;
        if (counts.star) this.synth.collect('star', lvl, counts.star);
        if (counts.bunny || counts.rubble) this.synth.collect('bunny', lvl, (counts.bunny ?? 0) + (counts.rubble ?? 0));
        const small = (counts.dust ?? 0) + (counts.crumb ?? 0) + (counts.leaf ?? 0) + (counts.soot ?? 0) + (counts.web ?? 0) + (counts.stain ?? 0);
        if (small) this.synth.collect('dust', lvl, small);
      }
    }
  }

  private earn(amount: number): void {
    // En visite, l'argent est celui du monde de l'hôte (il nous l'envoie).
    if (this.visiting) return;
    this.save.runCoins += amount;
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
      this.visibleIds = visible;
      this.world.setVisibleRooms(visible);
    }

    store.placeName.value = this.nav.placeName(p.x, p.z, p.y) || (this.currentRoom?.name ?? '');
    store.roomName.value = this.currentRoom?.name ?? '';
    store.playerPos.value = { x: p.x, z: p.z, yaw: p.yaw };

    const door = this.playing ? this.nav.lockedDoorNear(p.x, p.z, p.y) : null;
    if (door?.room) {
      const r = roomById(door.room)!;
      const blocked = r.id === 'throne' && !this.director.throneOpenable();
      store.doorPrompt.value = {
        name: r.name,
        price: r.price,
        affordable: !blocked && store.coins.value >= r.price,
        need: blocked ? `Il faut ${THRONE_SOUVENIRS} souvenirs (${this.director.souvenirCount()} / ${THRONE_SOUVENIRS})` : undefined,
      };
    } else if (store.doorPrompt.value) {
      store.doorPrompt.value = null;
    }
    const bench = !door && this.playing && this.nearProp('workbench');
    if (bench !== store.benchPrompt.value) store.benchPrompt.value = bench;
    const chest = !door && !bench && this.playing && this.nearProp('trunk');
    if (chest !== store.chestPrompt.value) store.chestPrompt.value = chest;
  }

  /** Le joueur est-il devant un meuble des combles (l'établi de Gustave, le coffre) ? */
  private nearProp(kind: 'workbench' | 'trunk'): boolean {
    const attic = ROOMS[0];
    const b = attic.obstacles.find((o) => o.kind === kind);
    if (!b) return false;
    const p = this.player;
    if (Math.abs(p.y - attic.floorY) > 60) return false;
    // Distance au bord de l'établi.
    const x0 = attic.origin.x + b.rect.x;
    const z0 = attic.origin.z + b.rect.y;
    const dx = Math.max(x0 - p.x, 0, p.x - (x0 + b.rect.w));
    const dz = Math.max(z0 - p.z, 0, p.z - (z0 + b.rect.h));
    return Math.hypot(dx, dz) < 240;
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
      if (!this.visiting) store.coinsPerSecond.value = w.reduce((a, b) => a + b, 0) / w.length;
      this.save.stats.bestRate = Math.max(this.save.stats.bestRate, store.coinsPerSecond.value);
      if (store.started.value) this.checkAchievements();
      w.shift();
      w.push(0);
    }
    const cur = this.currentRoom ? this.runtime(this.currentRoom) : null;
    store.unlockedTools.value = TOOLS.map((_, i) => this.toolUnlocked(i));
    if (cur && TOOLS[store.selectedTool.value].id === 'vacuum') store.vacuum.value = { load: cur.sim.vacuumLoad, cap: cur.sim.mods.vacuumCap };
    else if (store.vacuum.value) store.vacuum.value = null;
    if (cur) {
      const c = cur.sim.cleanliness;
      store.cleanliness.value = c;
      store.roomCleanedOnce.value = this.save.rooms[cur.def.id]?.cleaned === true;
    }

    // Pièces impeccables (une fois chacune) : bonus + confettis (pas chez un ami).
    for (let ri = 0; ri < this.rooms.length && !this.visiting; ri++) {
      const r = this.rooms[ri];
      const rs = this.save.rooms[r.def.id];
      if (!rs?.unlocked || rs.cleaned || r.sim.cleanliness < CLEAN_THRESHOLD) continue;
      rs.cleaned = true;
      const bonus = Math.max(250, Math.round(r.def.price * 0.5)) * this.mods.cleanBonusMult(r.def.id);
      this.earn(bonus);
      this.world.celebrate(ri);
      if (r.def.id === 'throne' && !this.save.endingSeen) setTimeout(() => this.startEnding(), 3000);
      else this.director.onRoomClean(ri);
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
      store.prestigeGain.value = this.prestigeGain();
      store.prestigeReady.value = this.prestigeReady();
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
    // En visite, rien de ce qui se passe chez l'ami ne touche à mes mondes.
    if (this.prestiging || this.visiting) return;
    const p = this.player;
    // Poussière restante de chaque pièce ouverte.
    for (const r of this.rooms) {
      const rs = this.save.rooms[r.def.id];
      if (rs?.unlocked) rs.dirt = r.sim.dirtCounts();
    }
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
