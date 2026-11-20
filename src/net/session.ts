import Peer, { type DataConnection, type PeerOptions } from 'peerjs';

/**
 * Connexion pair-à-pair (WebRTC, via PeerJS).
 *
 * Le serveur PeerJS public ne sert qu'à se trouver (échanger les « adresses ») :
 * ensuite les données passent directement d'un navigateur à l'autre.
 * L'hôte prend l'identifiant « dustitalone-CODE » ; les invités s'y connectent avec le code.
 */
export const MAX_PLAYERS = 4;
const PREFIX = 'dustitalone-';
/** Lettres et chiffres faciles à lire et à dicter (pas de O/0, I/1…). */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(len = 5): string {
  let s = '';
  for (let k = 0; k < len; k++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Options PeerJS ; « ?peer=localhost:9000 » dans l'adresse utilise un serveur local (tests). */
function peerOptions(): PeerOptions {
  const custom = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('peer') : null;
  if (custom) {
    const [host, port] = custom.split(':');
    return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 0 };
  }
  return { debug: 0 };
}

export interface SessionEvents {
  /** Un message est arrivé (de l'invité `from` chez l'hôte ; de l'hôte = 0 chez l'invité). */
  message(from: number, msg: unknown): void;
  /** Côté hôte : un invité vient de se connecter (on attend son « bonjour »). */
  connect?(slot: number): void;
  /** Quelqu'un est parti (côté invité : l'hôte, slot 0). */
  disconnect(slot: number): void;
  error(text: string): void;
}

export class NetSession {
  private peer: Peer | null = null;
  /** Côté hôte : connexion de chaque invité (slots 1 à 3). Côté invité : l'hôte en slot 0. */
  private conns = new Map<number, DataConnection>();
  closed = false;

  private constructor(readonly role: 'host' | 'guest', readonly code: string, private ev: SessionEvents) {}

  /** Crée une partie ; renvoie la session une fois prête (le code est alors réservé). */
  static host(ev: SessionEvents): Promise<NetSession> {
    return new Promise((resolve, reject) => {
      const tryCode = (attempt: number) => {
        const s = new NetSession('host', randomCode(), ev);
        const peer = new Peer(PREFIX + s.code, peerOptions());
        s.peer = peer;
        peer.on('open', () => resolve(s));
        peer.on('error', (err: { type?: string; message?: string }) => {
          // Code déjà pris : on en tire un autre.
          if (err.type === 'unavailable-id' && attempt < 4) {
            peer.destroy();
            tryCode(attempt + 1);
            return;
          }
          if (!s.closed && s.peer === peer) {
            if (s.conns.size === 0 && !peer.open) reject(new Error(describe(err)));
            else ev.error(describe(err));
          }
        });
        peer.on('connection', (conn) => s.accept(conn));
      };
      tryCode(0);
    });
  }

  /** Rejoint la partie d'un ami avec son code. */
  static join(code: string, ev: SessionEvents): Promise<NetSession> {
    return new Promise((resolve, reject) => {
      const s = new NetSession('guest', normalizeCode(code), ev);
      const peer = new Peer(peerOptions());
      s.peer = peer;
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          s.close();
          reject(new Error('Personne ne répond à ce code. Vérifie-le, ou demande à ton ami de relancer sa partie.'));
        }
      }, 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + s.code, { reliable: true });
        conn.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          s.conns.set(0, conn);
          s.wire(0, conn);
          resolve(s);
        });
      });
      peer.on('error', (err: { type?: string; message?: string }) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          s.close();
          reject(new Error(err.type === 'peer-unavailable' ? 'Aucune partie avec ce code. Vérifie-le avec ton ami !' : describe(err)));
        } else ev.error(describe(err));
      });
    });
  }

  private accept(conn: DataConnection): void {
    conn.on('open', () => {
      let slot = 0;
      for (let k = 1; k < MAX_PLAYERS; k++) if (!this.conns.has(k)) { slot = k; break; }
      if (!slot) {
        conn.send({ t: 'reject', reason: 'La partie est complète (4 joueurs au maximum).' });
        setTimeout(() => conn.close(), 500);
        return;
      }
      this.conns.set(slot, conn);
      this.wire(slot, conn);
      this.ev.connect?.(slot);
    });
  }

  private wire(slot: number, conn: DataConnection): void {
    conn.on('data', (msg) => this.ev.message(slot, msg));
    const gone = () => {
      if (this.conns.get(slot) !== conn) return;
      this.conns.delete(slot);
      if (!this.closed) this.ev.disconnect(slot);
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  send(slot: number, msg: unknown): void {
    const c = this.conns.get(slot);
    if (c?.open) c.send(msg);
  }

  /** Côté hôte : envoie à tous les invités (sauf `except`). */
  broadcast(msg: unknown, except = -1): void {
    for (const [slot, c] of this.conns) if (slot !== except && c.open) c.send(msg);
  }

  /** Débit en attente (pour ne pas saturer une connexion lente). */
  buffered(slot: number): number {
    const c = this.conns.get(slot) as (DataConnection & { dataChannel?: RTCDataChannel }) | undefined;
    return c?.dataChannel?.bufferedAmount ?? 0;
  }

  kick(slot: number, reason: string): void {
    const c = this.conns.get(slot);
    if (!c) return;
    c.send({ t: 'reject', reason });
    setTimeout(() => c.close(), 300);
  }

  get slots(): number[] {
    return [...this.conns.keys()];
  }

  close(): void {
    this.closed = true;
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

function describe(err: { type?: string; message?: string }): string {
  switch (err.type) {
    case 'browser-incompatible':
      return 'Ton navigateur ne gère pas le multijoueur (WebRTC).';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Impossible de joindre le serveur de rencontre. Vérifie ta connexion Internet.';
    case 'peer-unavailable':
      return 'Aucune partie avec ce code.';
    default:
      return err.message || 'Erreur de connexion.';
  }
}
