import Peer, { type DataConnection, type PeerOptions } from 'peerjs';

/**
 * La liste des parties en ligne, sans serveur à nous.
 *
 * Un identifiant PeerJS bien connu (« dustitalone-lobby-v1 ») sert de carnet d'adresses :
 * le premier joueur qui ouvre l'écran multijoueur le prend et tient la liste ; les autres
 * s'y connectent. Les hôtes y annoncent leur partie toutes les 5 s ; une partie qui ne
 * s'annonce plus disparaît au bout de 15 s. Si celui qui tient la liste s'en va, un autre
 * joueur prend le relais (les hôtes se réannoncent tout seuls).
 */
const LOBBY_ID = 'dustitalone-lobby-v1';
const EXPIRE_MS = 15000;
export const ANNOUNCE_MS = 5000;

export interface LobbyGame {
  code: string;
  /** Pseudo de l'hôte. */
  host: string;
  players: number;
  max: number;
  /** Pièce où se trouve l'hôte (pour donner envie). */
  place: string;
  /** Avancement : nombre de pièces ouvertes. */
  rooms: number;
  updated?: number;
}

type Msg = { t: 'sub' } | { t: 'announce'; game: LobbyGame } | { t: 'unannounce'; code: string } | { t: 'games'; list: LobbyGame[] };

function peerOptions(): PeerOptions {
  const custom = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('peer') : null;
  if (custom) {
    const [host, port] = custom.split(':');
    return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 0 };
  }
  return { debug: 0 };
}

export class Lobby {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  /** Quand on tient le carnet : les abonnés et ce que chacun a annoncé. */
  private holder = false;
  private subs = new Set<DataConnection>();
  private registry = new Map<string, LobbyGame>();
  private mine: LobbyGame | null = null;
  private timers: number[] = [];
  private stopped = false;
  private retry = 0;
  status: 'connecting' | 'online' | 'offline' = 'connecting';

  constructor(private onList: (games: LobbyGame[], status: Lobby['status']) => void) {
    this.connect();
    this.timers.push(window.setInterval(() => this.tick(), 2500));
  }

  /** Annonce (ou retire, avec null) la partie que j'héberge. */
  announce(game: LobbyGame | null): void {
    const before = this.mine;
    this.mine = game;
    if (!game && before) this.send({ t: 'unannounce', code: before.code });
    if (game) this.send({ t: 'announce', game });
  }

  stop(): void {
    this.stopped = true;
    if (this.mine) this.send({ t: 'unannounce', code: this.mine.code });
    for (const t of this.timers) clearInterval(t);
    setTimeout(() => this.peer?.destroy(), 300);
  }

  private connect(): void {
    if (this.stopped) return;
    this.holder = false;
    this.peer?.destroy();
    const peer = new Peer(peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(LOBBY_ID, { reliable: true });
      conn.on('open', () => {
        this.conn = conn;
        this.retry = 0;
        this.setStatus('online');
        conn.send({ t: 'sub' });
        if (this.mine) conn.send({ t: 'announce', game: this.mine });
      });
      conn.on('data', (m) => this.onData(conn, m as Msg));
      conn.on('close', () => this.lost());
      conn.on('error', () => this.lost());
    });
    peer.on('error', (err: { type?: string }) => {
      // Personne ne tient le carnet : je le prends.
      if (err.type === 'peer-unavailable') this.becomeHolder();
      else if (!this.holder) this.lost();
    });
  }

  private lost(): void {
    if (this.stopped || this.holder) return;
    this.conn = null;
    this.setStatus('connecting');
    // On attend un peu (au hasard) pour que deux joueurs ne prennent pas le carnet en même temps.
    const wait = Math.min(8000, 800 + Math.random() * 1500 + this.retry++ * 1000);
    setTimeout(() => this.connect(), wait);
  }

  private becomeHolder(): void {
    if (this.stopped) return;
    this.peer?.destroy();
    const peer = new Peer(LOBBY_ID, peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      this.holder = true;
      this.retry = 0;
      this.setStatus('online');
      if (this.mine) this.registry.set(this.mine.code, { ...this.mine, updated: Date.now() });
      this.publish();
    });
    peer.on('connection', (conn) => {
      conn.on('data', (m) => this.onData(conn, m as Msg));
      const bye = () => this.subs.delete(conn);
      conn.on('close', bye);
      conn.on('error', bye);
    });
    peer.on('error', (err: { type?: string }) => {
      // Quelqu'un d'autre l'a pris juste avant : on s'y connecte.
      if (err.type === 'unavailable-id') this.lost();
      else if (!peer.open) {
        this.setStatus('offline');
        setTimeout(() => this.connect(), 4000);
      }
    });
  }

  private onData(conn: DataConnection, m: Msg): void {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'games' && !this.holder) {
      this.onList(m.list.filter((g) => g.code !== this.mine?.code), this.status);
      return;
    }
    if (!this.holder) return;
    if (m.t === 'sub') {
      this.subs.add(conn);
      conn.send({ t: 'games', list: this.list() });
    } else if (m.t === 'announce' && m.game?.code) {
      this.registry.set(m.game.code, { ...m.game, updated: Date.now() });
      this.publish();
    } else if (m.t === 'unannounce') {
      this.registry.delete(m.code);
      this.publish();
    }
  }

  private send(m: Msg): void {
    if (this.holder) this.onData(null as unknown as DataConnection, m);
    else if (this.conn?.open) this.conn.send(m);
  }

  private list(): LobbyGame[] {
    const now = Date.now();
    for (const [code, g] of this.registry) if (now - (g.updated ?? 0) > EXPIRE_MS) this.registry.delete(code);
    return [...this.registry.values()].sort((a, b) => b.rooms - a.rooms);
  }

  private publish(): void {
    const list = this.list();
    for (const c of this.subs) if (c.open) c.send({ t: 'games', list });
    this.onList(list.filter((g) => g.code !== this.mine?.code), this.status);
  }

  private tick(): void {
    if (this.mine && this.status === 'online') this.send({ t: 'announce', game: this.mine });
    if (this.holder) this.publish();
  }

  private setStatus(s: Lobby['status']): void {
    this.status = s;
    this.onList(this.holder ? this.list().filter((g) => g.code !== this.mine?.code) : [], s);
  }
}
