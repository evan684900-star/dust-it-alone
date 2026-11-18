import type { RoomDef } from '../data/rooms';
import type { RoomSim } from '../sim/roomSim';
import * as store from '../state/store';
import { formatNumber } from '../core/format';

export type EventKind = 'window' | 'cat' | 'coin' | 'starRain';

/** Délai entre deux événements (secondes). */
export const FIRST_EVENT = 240;
export const EVENT_GAP: [number, number] = [180, 360];
const COIN_LIFE = 45;
const PICKUP_DISTANCE = 150;

export interface EventContext {
  rooms: { def: RoomDef; sim: RoomSim }[];
  /** Index de la pièce où se trouve le joueur (ou −1). */
  currentRoom: () => number;
  player: { x: number; z: number; y: number };
  /** Pièces gagnées par seconde en ce moment. */
  income: () => number;
  starRain: () => boolean;
  earn: (amount: number) => void;
  world: { setBonus(b: { roomIndex: number; x: number; y: number; icon: string } | null): void };
  sound: { wind(): void; crash(): void; coin(): void; sparkle(): void };
  random?: () => number;
}

/**
 * Petits événements aléatoires qui viennent rompre la routine :
 * un courant d'air, un chat maladroit, une pièce qui brille, une pluie d'étoiles.
 */
export class EventDirector {
  private timer = FIRST_EVENT;
  private coin: { roomIndex: number; x: number; y: number; life: number } | null = null;
  private last: EventKind | null = null;
  private rnd: () => number;

  constructor(private ctx: EventContext) {
    this.rnd = ctx.random ?? Math.random;
  }

  /** Les événements possibles maintenant. */
  available(): EventKind[] {
    const list: EventKind[] = ['window', 'cat', 'coin'];
    if (this.ctx.starRain()) list.push('starRain', 'starRain');
    return list.filter((k) => k !== this.last || list.length === 1);
  }

  update(dt: number): void {
    this.updateCoin(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    const ri = this.ctx.currentRoom();
    if (ri < 0) {
      this.timer = 10;
      return;
    }
    const kinds = this.available();
    this.trigger(kinds[Math.floor(this.rnd() * kinds.length)], ri);
    this.timer = EVENT_GAP[0] + this.rnd() * (EVENT_GAP[1] - EVENT_GAP[0]);
  }

  /** Déclenche un événement dans une pièce (aussi utilisé par le mode debug). */
  trigger(kind: EventKind, ri: number): void {
    const sim = this.ctx.rooms[ri].sim;
    this.last = kind;
    switch (kind) {
      case 'window': {
        sim.gust(this.rnd() * Math.PI * 2, 14);
        this.ctx.sound.wind();
        store.pushToast('🌬️ Un courant d’air !', 'Une fenêtre s’est ouverte : le vent balaie la pièce à ta place.', 5000);
        break;
      }
      case 'cat': {
        const p = sim.freeSpot();
        sim.burst(p.x, p.y, { dust: 40, crumb: 12, leaf: 8, bunny: 3 });
        this.ctx.sound.crash();
        store.pushToast('🐈 Patatras !', 'Un chat a renversé un pot de fleurs… Encore du travail (et des pièces) !', 5000);
        break;
      }
      case 'coin': {
        const p = sim.freeSpot();
        this.coin = { roomIndex: ri, x: p.x, y: p.y, life: COIN_LIFE };
        this.ctx.world.setBonus({ roomIndex: ri, x: p.x, y: p.y, icon: '🪙' });
        this.ctx.sound.coin();
        store.pushToast('🪙 Quelque chose brille…', 'Une pièce oubliée scintille par terre. Vite, avant qu’elle ne roule sous un meuble !', 5000);
        break;
      }
      case 'starRain': {
        const n = sim.rainStars(30);
        this.ctx.sound.sparkle();
        store.pushToast('🌠 Pluie d’étoiles !', `${n} grains dorés viennent de tomber du ciel.`, 5000);
        break;
      }
    }
  }

  /** La pièce brillante vaut une minute de gains (au moins 100). */
  coinValue(): number {
    return Math.max(100, Math.round(this.ctx.income() * 60));
  }

  private updateCoin(dt: number): void {
    const c = this.coin;
    if (!c) return;
    c.life -= dt;
    const def = this.ctx.rooms[c.roomIndex].def;
    const p = this.ctx.player;
    const near = Math.abs(def.floorY - p.y) < 120 && Math.hypot(def.origin.x + c.x - p.x, def.origin.z + c.y - p.z) < PICKUP_DISTANCE;
    if (near) {
      const v = this.coinValue();
      this.ctx.earn(v);
      this.ctx.sound.coin();
      store.pushToast('🪙 Trouvée !', `+${formatNumber(v)} pièces.`, 3500);
    }
    if (near || c.life <= 0) {
      this.coin = null;
      this.ctx.world.setBonus(null);
    }
  }

  get coinActive(): boolean {
    return this.coin !== null;
  }
}
