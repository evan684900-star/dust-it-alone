import type { RoomDef } from '../data/rooms';
import type { Navigation } from '../world/nav';

export const EYE_HEIGHT = 158;
const WALK = 320;
const SPRINT = 540;
/** Distance min/max (cm) entre les pieds et la brosse du balai. */
const REACH_MIN = 55;
const REACH_MAX = 230;

/**
 * Joueur en première personne : position dans le château, altitude (escaliers),
 * regard (lacet / tangage) et point où la brosse touche le sol.
 */
export class Player {
  x: number;
  z: number;
  /** Altitude du sol sous les pieds. */
  y: number;
  /** Altitude affichée (lissée dans les escaliers). */
  private smoothY: number;
  yaw: number;
  pitch = -0.55;
  sensitivity = 0.0022;
  private keys = new Set<string>();
  private bobPhase = 0;
  private bobAmount = 0;
  sprinting = false;
  /** Effets de l'arbre. */
  walkMult = 1;
  sprintMult = 1;
  reachMax = REACH_MAX;
  /** Le joueur avance (pour la Marche du balayeur). */
  movingForward = false;

  constructor(private nav: Navigation, start: { x: number; z: number; y: number; yaw: number; pitch?: number }) {
    this.x = start.x;
    this.z = start.z;
    this.y = start.y;
    this.smoothY = start.y;
    this.yaw = start.yaw;
    if (start.pitch !== undefined) this.pitch = start.pitch;
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
      const sp = ((this.sprinting ? SPRINT * this.sprintMult : WALK) * this.walkMult) / len;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      mx = (-sin * fwd + cos * str) * sp * dt;
      mz = (-cos * fwd - sin * str) * sp * dt;
    }
    // On avance axe par axe pour glisser le long des murs et des meubles.
    if (mx) this.tryMove(this.x + mx, this.z);
    if (mz) this.tryMove(this.x, this.z + mz);

    this.smoothY += (this.y - this.smoothY) * Math.min(1, dt * 14);
    const moving = mx !== 0 || mz !== 0;
    this.movingForward = fwd > 0;
    this.bobAmount += ((moving ? (this.sprinting ? 1.6 : 1) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    if (moving) this.bobPhase += dt * (this.sprinting ? 13 : 9);
  }

  private tryMove(x: number, z: number): void {
    const ny = this.nav.canStand(x, z, this.y);
    if (ny !== null) {
      this.x = x;
      this.z = z;
      this.y = ny;
    }
  }

  /** Hauteur des yeux (monde) avec le léger balancement de la marche. */
  get eye(): number {
    return this.smoothY + EYE_HEIGHT + Math.sin(this.bobPhase * 2) * 2.2 * this.bobAmount;
  }

  get feet(): number {
    return this.smoothY;
  }

  /** Pièce où se trouve le joueur (null dans un escalier ou une porte). */
  room(): RoomDef | null {
    return this.nav.roomAt(this.x, this.z, this.y);
  }

  /**
   * Point du sol visé par le balai (monde). Il reste dans la pièce du joueur :
   * pas question de balayer à travers les murs.
   */
  broomPoint(): { x: number; z: number; room: RoomDef | null } {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let d = this.reachMax;
    if (this.pitch < -0.02) d = (this.eye - this.smoothY) / Math.tan(-this.pitch);
    d = Math.max(REACH_MIN, Math.min(this.reachMax, d));
    let bx = this.x + fx * d;
    let bz = this.z + fz * d;
    const r = this.room();
    if (r) {
      bx = Math.max(r.origin.x + 8, Math.min(r.origin.x + r.width - 8, bx));
      bz = Math.max(r.origin.z + 8, Math.min(r.origin.z + r.height - 8, bz));
    }
    return { x: bx, z: bz, room: r };
  }
}
