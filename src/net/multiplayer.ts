import { NetSession, MAX_PLAYERS } from './session';
import { Lobby, type LobbyGame } from './lobby';
import { applySnapshot, encodeSnapshot, newMemory, type SnapshotMemory } from './snapshot';
import { newBroomState, type BroomInput, type BroomState, type RoomSim } from '../sim/roomSim';
import type { ToolId } from '../data/dirtTypes';
import { ROOMS, type RoomDef } from '../data/rooms';
import * as store from '../state/store';

/** Version du protocole : deux versions différentes du jeu ne peuvent pas jouer ensemble. */
export const NET_VERSION = `mp1-${ROOMS.length}-${ROOMS.map((r) => Object.values(r.capacity).reduce((a, b) => a + (b ?? 0), 0)).join('.')}`;

/** Couleurs proposées pour les joueurs. */
export const PLAYER_COLORS = ['#ff7a5c', '#7ec8ff', '#7bd651', '#ffd35a', '#c38bff', '#ff8ad8'];

/** Ce que le jeu sait de mon personnage (envoyé aux autres). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  tool: ToolId;
  pressed: boolean;
  /** Point visé par le balai (monde) et pièce où il se trouve (−1 = aucune). */
  bx: number;
  bz: number;
  by: number;
  broomRoom: number;
  /** Mon balai (avec mes améliorations). */
  width: number;
  depth: number;
  grip: number;
}

/** Argent et améliorations du monde (partagés par tous les joueurs). */
export interface Economy {
  coins: number;
  total: number;
  cps: number;
  sparks: number;
  tree: Record<string, number>;
}

export interface RemotePlayer {
  slot: number;
  name: string;
  color: string;
  pose: Pose | null;
  ping: number;
}

/** Ce que le multijoueur demande au jeu. */
export interface MpGame {
  rooms: { def: RoomDef; sim: RoomSim }[];
  localPose(): Pose;
  /** Pièces ouvertes (côté hôte). */
  unlockedIds(): string[];
  placeName(): string;
  /** Côté invité : on entre dans le château de l'hôte. */
  startVisit(hostName: string, unlocked: string[], spawn: { x: number; z: number; y: number; yaw: number }): void;
  setHostUnlocked(unlocked: string[]): void;
  /** Fin de la partie à plusieurs (le jeu recharge mon propre château). */
  endVisit(reason: string): void;
  /** Économie du monde (argent et améliorations partagés) : l'hôte l'envoie, l'invité l'affiche. */
  economy(): Economy;
  applyEconomy(e: Economy): void;
  /** Côté hôte : un invité achète, rembourse ou ouvre une porte avec l'argent du monde. */
  hostBuy(id: string, n: number, who: string): void;
  hostRefund(id: string, who: string): void;
  hostUnlock(roomId: string, who: string): void;
  toast(title: string, text: string): void;
  sound(kind: 'join' | 'leave' | 'request'): void;
}

type Msg =
  | { t: 'hello'; name: string; color: string; version: string }
  | { t: 'wait' }
  | { t: 'welcome'; slot: number; host: string; unlocked: string[]; spawn: { x: number; z: number; y: number; yaw: number } }
  | { t: 'reject'; reason: string }
  | { t: 'players'; list: { slot: number; name: string; color: string; ping: number }[] }
  | { t: 'pose'; pose: Pose }
  | { t: 'poses'; list: { slot: number; pose: Pose }[] }
  | { t: 'snap'; room: number; data: ArrayBuffer }
  | { t: 'eco'; eco: Economy }
  | { t: 'buy'; id: string; n: number }
  | { t: 'refund'; id: string }
  | { t: 'unlock'; room: string }
  | { t: 'castle'; unlocked: string[] }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  | { t: 'bye' };

const POSE_HZ = 15;
const SNAP_HZ = 6;
/** Une photo complète de chaque pièce toutes les 3 s (les autres n'envoient que ce qui bouge). */
const FULL_EVERY = 3;

/** Selon le navigateur, les données binaires arrivent en ArrayBuffer ou en vue typée (Uint8Array…). */
function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  if (data && typeof data === 'object' && 'byteLength' in data && 'slice' in data) return (data as ArrayBuffer).slice(0);
  return null;
}

export function loadProfile(): { name: string; color: string } {
  try {
    const raw = JSON.parse(localStorage.getItem('dust-it-alone:profile') ?? 'null');
    if (raw && typeof raw.name === 'string') return { name: raw.name.slice(0, 16), color: PLAYER_COLORS.includes(raw.color) ? raw.color : PLAYER_COLORS[0] };
  } catch {
    /* rien */
  }
  return { name: `Balayeur ${Math.floor(100 + Math.random() * 900)}`, color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] };
}

export function saveProfile(p: { name: string; color: string }): void {
  try {
    localStorage.setItem('dust-it-alone:profile', JSON.stringify(p));
  } catch {
    /* rien */
  }
}

export class Multiplayer {
  session: NetSession | null = null;
  lobby: Lobby | null = null;
  role: 'off' | 'host' | 'guest' = 'off';
  /** Partie visible dans la liste publique. */
  isPublic = true;
  profile = loadProfile();
  /** Joueurs distants (hôte : les invités ; invité : l'hôte en slot 0 et les autres invités). */
  players = new Map<number, RemotePlayer>();
  mySlot = 0;
  /** Côté hôte : demandes en attente. */
  private pending = new Map<number, { name: string; color: string }>();
  /** Côté hôte : balai de chaque invité, par pièce. */
  private brooms = new Map<number, BroomState>();
  private broomRoom = new Map<number, number>();
  private memories = new Map<string, { mem: SnapshotMemory; lastFull: number }>();
  private ecoTimer = 0;
  private poseTimer = 0;
  private snapTimer = 0;
  private slowTimer = 0;
  private time = 0;
  private myPing = 0;
  private lastUnlocked = '';

  constructor(private game: MpGame) {}

  // ───────────────────────────── Écran multijoueur ─────────────────────────────

  /** Ouvre la liste des parties en ligne. */
  openLobby(): void {
    if (!this.lobby) {
      this.lobby = new Lobby((games, status) => {
        store.net.value = { ...store.net.value, games, lobby: status };
      });
      this.announce();
    }
  }

  closeLobby(): void {
    // Un hôte public garde sa partie annoncée.
    if (this.role === 'host' && this.isPublic) return;
    this.lobby?.stop();
    this.lobby = null;
  }

  setProfile(p: { name: string; color: string }): void {
    this.profile = { name: p.name.trim().slice(0, 16) || this.profile.name, color: p.color };
    saveProfile(this.profile);
    this.publish();
  }

  setPublic(on: boolean): void {
    this.isPublic = on;
    if (on) this.openLobby();
    this.announce();
    this.publish();
  }

  private announce(): void {
    if (!this.lobby) return;
    const s = this.session;
    if (this.role !== 'host' || !s || !this.isPublic) {
      this.lobby.announce(null);
      return;
    }
    const g: LobbyGame = { code: s.code, host: this.profile.name, players: 1 + this.players.size, max: MAX_PLAYERS, place: this.game.placeName(), rooms: this.game.unlockedIds().length };
    this.lobby.announce(g);
  }

  // ───────────────────────────── Héberger / rejoindre ─────────────────────────────

  async host(): Promise<void> {
    if (this.role !== 'off') return;
    this.setStatus('Création de la partie…');
    try {
      this.session = await NetSession.host({
        message: (from, m) => this.onHostMessage(from, m as Msg),
        disconnect: (slot) => this.dropGuest(slot),
        error: (text) => this.setStatus(text),
      });
      this.role = 'host';
      this.mySlot = 0;
      this.lastUnlocked = this.game.unlockedIds().join(',');
      if (this.isPublic) this.openLobby();
      this.announce();
      this.setStatus('');
      this.publish();
    } catch (e) {
      this.setStatus((e as Error).message);
    }
  }

  async join(code: string): Promise<void> {
    if (this.role !== 'off') return;
    this.setStatus('Connexion…');
    try {
      const s = await NetSession.join(code, {
        message: (_from, m) => this.onGuestMessage(m as Msg),
        disconnect: () => this.leave('L’hôte a quitté la partie.'),
        error: (text) => this.setStatus(text),
      });
      this.session = s;
      this.role = 'guest';
      s.send(0, { t: 'hello', name: this.profile.name, color: this.profile.color, version: NET_VERSION } satisfies Msg);
      this.setStatus('Demande envoyée… en attente de la réponse de l’hôte.');
      this.publish();
    } catch (e) {
      this.setStatus((e as Error).message);
    }
  }

  /** Quitte la partie (et, pour un invité, revient à son château). */
  leave(reason = ''): void {
    const wasGuest = this.role === 'guest';
    const s = this.session;
    if (s) {
      s.broadcast({ t: 'bye' } satisfies Msg);
      setTimeout(() => s.close(), 200);
    }
    this.session = null;
    this.role = 'off';
    this.players.clear();
    this.pending.clear();
    this.brooms.clear();
    this.memories.clear();
    this.lobby?.announce(null);
    store.netRequests.value = [];
    this.publish();
    if (wasGuest) this.game.endVisit(reason);
    else if (reason) this.setStatus(reason);
  }

  /** Côté hôte : réponse à une demande. */
  answer(slot: number, accept: boolean): void {
    const p = this.pending.get(slot);
    const s = this.session;
    if (!p || !s) return;
    this.pending.delete(slot);
    store.netRequests.value = store.netRequests.value.filter((r) => r.slot !== slot);
    if (!accept) {
      s.kick(slot, `${this.profile.name} a refusé ta demande.`);
      return;
    }
    this.players.set(slot, { slot, name: p.name, color: p.color, pose: null, ping: 0 });
    const me = this.game.localPose();
    s.send(slot, {
      t: 'welcome',
      slot,
      host: this.profile.name,
      unlocked: this.game.unlockedIds(),
      spawn: { x: me.x + Math.cos(slot * 2) * 90, z: me.z + Math.sin(slot * 2) * 90, y: me.y, yaw: me.yaw },
    } satisfies Msg);
    s.send(slot, { t: 'eco', eco: this.game.economy() } satisfies Msg);
    this.game.toast('👥 Nouveau joueur', `${p.name} a rejoint ta partie !`);
    this.game.sound('join');
    this.sendPlayers();
    this.announce();
    this.publish();
  }

  // ───────────────────────────── Messages ─────────────────────────────

  private onHostMessage(from: number, m: Msg): void {
    if (!m || typeof m !== 'object') return;
    const s = this.session!;
    switch (m.t) {
      case 'hello': {
        if (m.version !== NET_VERSION) {
          s.kick(from, 'Vous n’avez pas la même version du jeu. Rechargez la page tous les deux (Ctrl + F5).');
          return;
        }
        const name = String(m.name).slice(0, 16) || 'Invité';
        const color = PLAYER_COLORS.includes(m.color) ? m.color : PLAYER_COLORS[from % PLAYER_COLORS.length];
        this.pending.set(from, { name, color });
        s.send(from, { t: 'wait' } satisfies Msg);
        store.netRequests.value = [...store.netRequests.value, { slot: from, name, color }];
        this.game.sound('request');
        break;
      }
      case 'pose': {
        const p = this.players.get(from);
        if (p) p.pose = m.pose;
        break;
      }
      case 'buy':
      case 'refund':
      case 'unlock': {
        const p = this.players.get(from);
        if (!p) break;
        if (m.t === 'buy') this.game.hostBuy(String(m.id), Math.max(1, Math.min(1e6, Number(m.n) || 1)), p.name);
        else if (m.t === 'refund') this.game.hostRefund(String(m.id), p.name);
        else this.game.hostUnlock(String(m.room), p.name);
        this.pushEconomy();
        break;
      }
      case 'ping':
        s.send(from, { t: 'pong', at: m.at } satisfies Msg);
        break;
      case 'pong': {
        const p = this.players.get(from);
        if (p) p.ping = Math.round(performance.now() - m.at);
        break;
      }
      case 'bye':
        this.dropGuest(from);
        break;
    }
  }

  private onGuestMessage(m: Msg): void {
    if (!m || typeof m !== 'object') return;
    const s = this.session;
    if (!s) return;
    switch (m.t) {
      case 'wait':
        this.setStatus('Demande envoyée… en attente de la réponse de l’hôte.');
        break;
      case 'reject':
        this.leaveRejected(m.reason);
        break;
      case 'welcome':
        this.mySlot = m.slot;
        this.players.set(0, { slot: 0, name: m.host, color: '#ffd35a', pose: null, ping: 0 });
        this.setStatus('');
        this.game.startVisit(m.host, m.unlocked, m.spawn);
        this.publish();
        break;
      case 'players': {
        const seen = new Set<number>();
        for (const p of m.list) {
          if (p.slot === this.mySlot) continue;
          seen.add(p.slot);
          const cur = this.players.get(p.slot);
          if (cur) Object.assign(cur, { name: p.name, color: p.color, ping: p.ping });
          else this.players.set(p.slot, { slot: p.slot, name: p.name, color: p.color, pose: null, ping: p.ping });
        }
        for (const slot of [...this.players.keys()]) if (!seen.has(slot)) this.players.delete(slot);
        this.publish();
        break;
      }
      case 'poses':
        for (const { slot, pose } of m.list) {
          const p = this.players.get(slot);
          if (p && slot !== this.mySlot) p.pose = pose;
        }
        break;
      case 'snap': {
        const r = this.game.rooms[m.room];
        const buf = toArrayBuffer(m.data);
        if (r && buf) applySnapshot(r.sim, buf);
        break;
      }
      case 'eco':
        this.game.applyEconomy(m.eco);
        break;
      case 'castle':
        this.game.setHostUnlocked(m.unlocked);
        break;
      case 'ping':
        s.send(0, { t: 'pong', at: m.at } satisfies Msg);
        break;
      case 'pong':
        this.myPing = Math.round(performance.now() - m.at);
        this.publish();
        break;
      case 'bye':
        this.leave('L’hôte a quitté la partie.');
        break;
    }
  }

  private leaveRejected(reason: string): void {
    const visiting = this.players.size > 0;
    this.session?.close();
    this.session = null;
    this.role = 'off';
    this.players.clear();
    this.publish();
    if (visiting) this.game.endVisit(reason);
    else this.setStatus(reason);
  }

  private dropGuest(slot: number): void {
    if (this.pending.delete(slot)) store.netRequests.value = store.netRequests.value.filter((r) => r.slot !== slot);
    const p = this.players.get(slot);
    if (!p) return;
    this.players.delete(slot);
    this.brooms.delete(slot);
    for (const k of [...this.memories.keys()]) if (k.startsWith(`${slot}:`)) this.memories.delete(k);
    this.game.toast('👋 Au revoir', `${p.name} a quitté la partie.`);
    this.game.sound('leave');
    this.sendPlayers();
    this.announce();
    this.publish();
  }

  // ───────────────────────────── Chaque pas de jeu ─────────────────────────────

  /** Côté hôte : pièces où se trouvent des invités (elles doivent rester simulées à pleine vitesse). */
  activeRooms(): Set<number> {
    const set = new Set<number>();
    if (this.role !== 'host') return set;
    for (const p of this.players.values()) {
      if (!p.pose) continue;
      const here = this.roomAt(p.pose.x, p.pose.z, p.pose.y);
      if (here >= 0) set.add(here);
      if (p.pose.broomRoom >= 0) set.add(p.pose.broomRoom);
    }
    return set;
  }

  /** Côté hôte, avant de simuler une pièce : les balais des invités qui sont dedans. */
  applyRemoteBrooms(roomIndex: number, sim: RoomSim, dt: number): void {
    if (this.role !== 'host') return;
    const def = this.game.rooms[roomIndex].def;
    for (const p of this.players.values()) {
      const pose = p.pose;
      // On ne s'occupe que de la pièce où se trouve le balai de ce joueur
      // (surtout ne pas « oublier » son mouvement en passant sur les autres pièces : sinon il ne pousse plus rien).
      if (!pose || pose.broomRoom !== roomIndex) continue;
      let st = this.brooms.get(p.slot);
      if (!st) this.brooms.set(p.slot, (st = newBroomState()));
      // Le balai vient de changer de pièce : on repart de zéro (pas de « saut » d'une pièce à l'autre).
      if (this.broomRoom.get(p.slot) !== roomIndex) {
        st.prev.has = false;
        this.broomRoom.set(p.slot, roomIndex);
      }
      const input: BroomInput = { active: true, x: pose.bx - def.origin.x, y: pose.bz - def.origin.z, pressed: pose.pressed, yaw: pose.yaw, tool: pose.tool };
      sim.applyRemote(dt, input, st, p.slot, { width: pose.width, depth: pose.depth, grip: pose.grip });
    }
  }

  update(dt: number): void {
    if (this.role === 'off' || !this.session) return;
    const s = this.session;
    this.time += dt;
    this.poseTimer -= dt;
    this.snapTimer -= dt;
    this.slowTimer -= dt;
    const me = this.game.localPose();

    if (this.poseTimer <= 0) {
      this.poseTimer = 1 / POSE_HZ;
      if (this.role === 'guest') s.send(0, { t: 'pose', pose: me } satisfies Msg);
      else {
        const list = [{ slot: 0, pose: me }, ...[...this.players.values()].filter((p) => p.pose).map((p) => ({ slot: p.slot, pose: p.pose! }))];
        s.broadcast({ t: 'poses', list } satisfies Msg);
      }
    }

    this.ecoTimer -= dt;
    if (this.role === 'host' && this.ecoTimer <= 0) {
      this.ecoTimer = 0.25;
      this.pushEconomy();
    }

    if (this.role === 'host' && this.snapTimer <= 0) {
      this.snapTimer = 1 / SNAP_HZ;
      this.sendSnapshots();
    }

    if (this.slowTimer <= 0) {
      this.slowTimer = 2;
      // Ping : chacun mesure l'aller-retour vers l'hôte (l'hôte vers chaque invité).
      if (this.role === 'guest') s.send(0, { t: 'ping', at: performance.now() } satisfies Msg);
      else {
        s.broadcast({ t: 'ping', at: performance.now() } satisfies Msg);
        this.sendPlayers();
        const unlocked = this.game.unlockedIds();
        const key = unlocked.join(',');
        if (key !== this.lastUnlocked) {
          this.lastUnlocked = key;
          s.broadcast({ t: 'castle', unlocked } satisfies Msg);
        }
        this.announce();
      }
      this.publish();
    }
  }

  private sendSnapshots(): void {
    const s = this.session!;
    for (const p of this.players.values()) {
      if (!p.pose) continue;
      // On ne surcharge pas une connexion lente : on saute ce tour.
      if (s.buffered(p.slot) > 512 * 1024) continue;
      const rooms = new Set<number>();
      const here = this.roomAt(p.pose.x, p.pose.z, p.pose.y);
      if (here >= 0) rooms.add(here);
      if (p.pose.broomRoom >= 0) rooms.add(p.pose.broomRoom);
      for (const ri of rooms) {
        const key = `${p.slot}:${ri}`;
        let m = this.memories.get(key);
        const sim = this.game.rooms[ri].sim;
        if (!m) this.memories.set(key, (m = { mem: newMemory(sim.pool.cap), lastFull: -99 }));
        const full = this.time - m.lastFull > FULL_EVERY;
        if (full) m.lastFull = this.time;
        s.send(p.slot, { t: 'snap', room: ri, data: encodeSnapshot(sim, full, m.mem) } satisfies Msg);
      }
    }
  }

  /** Côté hôte : envoie l'argent et les améliorations du monde à tout le monde. */
  pushEconomy(): void {
    if (this.role !== 'host' || !this.session || this.players.size === 0) return;
    this.session.broadcast({ t: 'eco', eco: this.game.economy() } satisfies Msg);
  }

  /** Côté invité : demande à l'hôte d'acheter / rembourser / ouvrir une porte avec l'argent du monde. */
  request(m: { t: 'buy'; id: string; n: number } | { t: 'refund'; id: string } | { t: 'unlock'; room: string }): void {
    if (this.role === 'guest') this.session?.send(0, m satisfies Msg);
  }

  private sendPlayers(): void {
    if (this.role !== 'host' || !this.session) return;
    const list = [{ slot: 0, name: this.profile.name, color: this.profile.color, ping: 0 }, ...[...this.players.values()].map((p) => ({ slot: p.slot, name: p.name, color: p.color, ping: p.ping }))];
    this.session.broadcast({ t: 'players', list } satisfies Msg);
  }

  private roomAt(x: number, z: number, y: number): number {
    return this.game.rooms.findIndex(({ def }) => Math.abs(def.floorY - y) < 150 && x >= def.origin.x && x <= def.origin.x + def.width && z >= def.origin.z && z <= def.origin.z + def.height);
  }

  // ───────────────────────────── Interface ─────────────────────────────

  private status = '';
  private setStatus(text: string): void {
    this.status = text;
    this.publish();
  }

  /** Met à jour l'affichage (liste des joueurs, ping, état). */
  publish(): void {
    const s = this.session;
    const me = { slot: this.mySlot, name: this.profile.name, color: this.profile.color, ping: this.role === 'guest' ? this.myPing : 0, me: true };
    const others = [...this.players.values()].map((p) => ({ slot: p.slot, name: p.name, color: p.color, ping: p.ping, me: false }));
    store.net.value = {
      ...store.net.value,
      role: this.role,
      code: s?.code ?? '',
      isPublic: this.isPublic,
      status: this.status,
      profile: { ...this.profile },
      players: this.role === 'off' ? [] : [me, ...others].sort((a, b) => a.slot - b.slot),
      visiting: this.role === 'guest' && this.players.has(0),
    };
  }
}

