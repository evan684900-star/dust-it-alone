import { DOORS, ROOMS, START, STAIRS, roomById, type DoorDef, type RoomDef } from './data/rooms';
import { RoomSim, type BroomInput } from './sim/roomSim';
import { World3D } from './render/world3d';
import { Player } from './player/player';
import { Navigation } from './world/nav';
import { sfx } from './audio/synth';
import { TOOLS, type DirtId } from './data/dirtTypes';
import { createFixedLoop } from './core/loop';
import { formatNumber } from './core/format';
import { exportSave, importSave, loadSave, writeSave, type SaveData, type Settings } from './save/save';
import { ACHIEVEMENTS, type AchievementContext } from './data/achievements';
import * as store from './state/store';
import { computeModifiers, type Modifiers } from './economy/modifiers';
import { availability, canRefund, cost, maxAffordable, refundFork, level as treeLevel, costForN, sparksFor } from './economy/tree';
import { NODE_BY_ID, TREE_NODES } from './data/tree';
import { StoryDirector, playLines } from './story/director';
import { EventDirector, type EventKind } from './story/events';
import { TipDirector } from './story/tips';
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
      this.world.render(
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
      if (store.started.value) this.director.update(realDt, this.player.room());
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
      r.sim.setHelpers(this.mods.helpers);
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
    this.persist();
    return count;
  }

  /** Rembourse un niveau d'un nœud (on récupère exactement ce qu'il a coûté). Renvoie vrai si c'est fait. */
  refundNode(id: string): boolean {
    const node = NODE_BY_ID.get(id);
    if (!node) return false;
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
    this.synth.voices = s.voices;
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

  /** Efface toute la partie (après confirmation dans l'interface). */
  wipeSave(): void {
    this.prestiging = true;
    try {
      localStorage.removeItem('dust-it-alone:save');
      localStorage.removeItem('dust-it-alone:save:backup');
    } catch {
      /* rien */
    }
    location.reload();
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
          text: 'Un nouvel outil ! Change d’outil avec les touches 1 à 5 ou la molette. Certaines saletés ne partent qu’avec le bon outil, crois-moi.',
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
    return store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && !store.albumOpen.value && !store.journalOpen.value && this.cinematicT < 0;
  }

  // ───────────────────────────── Commandes ─────────────────────────────

  private bindInput(): void {
    const canvas = this.world.canvas;
    let lockedAt = 0;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked) lockedAt = performance.now();
      if (!locked && store.started.value && !this.debug && !store.mapOpen.value && !store.treeOpen.value && !store.albumOpen.value && !store.journalOpen.value) {
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
      if (e.code === 'KeyE' && !(TOOLS[store.selectedTool.value].id === 'vacuum' && this.tryEmptyVacuum())) this.tryUnlock();
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
  }

  // ───────────────────────────── Boucle ─────────────────────────────

  private tick(dt: number): void {
    if (this.playing) {
      const px = this.player.x;
      const pz = this.player.z;
      this.player.update(dt);
      this.events.update(dt);
      this.tips.update(dt);
      const st = this.save.stats;
      st.playTime += dt;
      const step = Math.hypot(this.player.x - px, this.player.z - pz);
      if (step < 60) st.walked += step / 100;
    }
    const bp = this.player.broomPoint();
    this.tickCount++;
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const r = this.rooms[ri];
      if (!this.isUnlocked(r.def.id)) continue;
      const here = this.playing && bp.room === r.def;
      // Les pièces loin du joueur sont simulées 6 fois moins souvent (la poussière y retombe quand même).
      const near = here || r.def === this.currentRoom || this.visibleIds.has(r.def.id);
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
      r.sim.step(stepDt, here ? this.input : { active: false, x: 0, y: 0, pressed: false });
      // Pas léger : en marchant, les pieds écartent la poussière.
      if (this.playing && this.mods.player.feet && this.player.moving && r.def === this.player.room()) r.sim.kickFeet(this.player.x - r.def.origin.x, this.player.z - r.def.origin.z);
      // Les assistants : « en vrai » près du joueur, « en résumé » ailleurs.
      if (near) r.sim.stepHelpers(stepDt);
      else r.sim.abstractHelpers(stepDt);
      const events = r.sim.drainEvents();
      if (events.length === 0) continue;
      let gained = 0;
      const counts: Partial<Record<DirtId, number>> = {};
      for (const e of events) {
        gained += e.coins;
        counts[e.type] = (counts[e.type] ?? 0) + 1;
        this.world.onCollect(ri, e.collector, e.coins, e.type === 'star', e);
      }
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
    const bench = !door && this.playing && this.nearBench();
    if (bench !== store.benchPrompt.value) store.benchPrompt.value = bench;
  }

  /** Le joueur est-il devant l'établi de Gustave (dans les combles) ? */
  private nearBench(): boolean {
    const attic = ROOMS[0];
    const b = attic.obstacles.find((o) => o.kind === 'workbench');
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
      store.coinsPerSecond.value = w.reduce((a, b) => a + b, 0) / w.length;
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

    // Pièces impeccables (une fois chacune) : bonus + confettis.
    for (let ri = 0; ri < this.rooms.length; ri++) {
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
    if (this.prestiging) return;
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
