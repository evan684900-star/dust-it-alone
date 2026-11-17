import type { RoomDef } from '../data/rooms';
import { grow, inside } from '../sim/roomSim';

export const EYE_HEIGHT = 158;
const WALK = 300;
const SPRINT = 500;
const BODY = 32;
/** Distance min/max (cm) entre les pieds et la brosse du balai. */
const REACH_MIN = 55;
const REACH_MAX = 230;

/**
 * Joueur en première personne : position au sol, regard (lacet / tangage),
 * et calcul du point où la brosse touche le sol.
 */
export class Player {
  x: number;
  z: number;
  yaw = Math.PI / 2; // regarde vers la pelle de gauche
  pitch = -0.55;
  sensitivity = 0.0022;
  private keys = new Set<string>();
  private bobPhase = 0;
  private bobAmount = 0;
  sprinting = false;

  constructor(private room: RoomDef) {
    this.x = room.width / 2;
    this.z = room.height / 2;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    this.pitch = Math.max(-1.4, Math.min(0.6, this.pitch));
  }

  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearKeys(): void {
    this.keys.clear();
  }

  update(dt: number): void {
    const k = this.keys;
    // Codes physiques : ZQSD (AZERTY) et WASD (QWERTY) tombent sur les mêmes touches.
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.sprinting = k.has('ShiftLeft') || k.has('ShiftRight');
    let mx = 0;
    let mz = 0;
    if (fwd || str) {
      const len = Math.hypot(fwd, str);
      const sp = (this.sprinting ? SPRINT : WALK) / len;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      mx = (-sin * fwd + cos * str) * sp * dt;
      mz = (-cos * fwd - sin * str) * sp * dt;
    }
    // On avance axe par axe pour glisser le long des murs et des meubles.
    if (mx) this.tryMove(this.x + mx, this.z);
    if (mz) this.tryMove(this.x, this.z + mz);

    const moving = mx !== 0 || mz !== 0;
    this.bobAmount += ((moving ? (this.sprinting ? 1.6 : 1) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    if (moving) this.bobPhase += dt * (this.sprinting ? 13 : 9);
  }

  private blocked(x: number, z: number): boolean {
    const r = this.room;
    if (x < BODY + 20 || z < BODY + 30 || x > r.width - BODY - 20 || z > r.height - BODY - 30) return true;
    for (const o of r.obstacles) if (inside(grow(o.rect, BODY), x, z)) return true;
    for (const c of r.collectors) if (inside(grow(c.rect, BODY + 30), x, z)) return true;
    return false;
  }

  private tryMove(x: number, z: number): void {
    if (!this.blocked(x, z)) {
      this.x = x;
      this.z = z;
    }
  }

  /** Hauteur des yeux avec le léger balancement de la marche. */
  get eye(): number {
    return EYE_HEIGHT + Math.sin(this.bobPhase * 2) * 2.2 * this.bobAmount;
  }

  /** Point du sol visé par le balai (le centre de l'écran, à portée de bras). */
  broomPoint(): { x: number; z: number } {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    // Le regard descend vers le sol : on cherche où il le touche.
    let d = REACH_MAX;
    if (this.pitch < -0.02) d = this.eye / Math.tan(-this.pitch);
    d = Math.max(REACH_MIN, Math.min(REACH_MAX, d));
    const r = this.room;
    return {
      x: Math.max(8, Math.min(r.width - 8, this.x + fx * d)),
      z: Math.max(8, Math.min(r.height - 8, this.z + fz * d)),
    };
  }
}
