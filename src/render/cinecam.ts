/**
 * Caméra de cinéma : elle quitte en douceur la vue du joueur, tourne lentement autour
 * d'une scène (un écho du passé, la fin…), puis revient tout aussi doucement.
 * Pur calcul (pas de three.js) : facile à tester.
 */

export interface View {
  x: number;
  z: number;
  eye: number;
  yaw: number;
  pitch: number;
}

export interface Shot {
  /** Centre de la scène (monde). */
  cx: number;
  cz: number;
  /** Hauteur du point regardé (monde). */
  lookY: number;
  /** Distance au centre et hauteur des yeux de la caméra (monde). */
  radius: number;
  eye: number;
  /** Angle de départ (radians, autour du centre) et vitesse de rotation (rad/s). */
  angle: number;
  spin: number;
  /** Rapprochement lent pendant le plan (0 = aucun, 0,2 = 20 % plus près à la fin). */
  dolly?: number;
  /** Durée prévue du plan (pour le rapprochement). */
  length?: number;
}

const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Angle le plus court de a vers b. */
function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function lerpView(a: View, b: View, t: number): View {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    eye: a.eye + (b.eye - a.eye) * t,
    yaw: angleLerp(a.yaw, b.yaw, t),
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
}

/** Vue d'un plan à l'instant t (secondes depuis le début du plan). */
export function shotView(s: Shot, t: number): View {
  const a = s.angle + s.spin * t;
  const k = s.dolly && s.length ? 1 - s.dolly * smooth(t / s.length) : 1;
  const r = s.radius * k;
  const x = s.cx + Math.sin(a) * r;
  const z = s.cz + Math.cos(a) * r;
  // Le lacet tel que l'avant (−sin, −cos) regarde le centre.
  const yaw = Math.atan2(x - s.cx, z - s.cz);
  const pitch = -Math.atan2(s.eye - s.lookY, r);
  return { x, z, eye: s.eye, yaw, pitch };
}

export class CineCam {
  private shot: Shot | null = null;
  private t = 0;
  private blendIn = 1.8;
  private blendOut = 1.4;
  /** Moment où l'on a demandé la fin (−1 = pas encore). */
  private outT = -1;
  private from: View | null = null;

  get active(): boolean {
    return this.shot !== null;
  }

  /** Temps écoulé dans le plan. */
  get time(): number {
    return this.t;
  }

  start(from: View, shot: Shot, blendIn = 1.8): void {
    this.from = { ...from };
    this.shot = shot;
    this.t = 0;
    this.outT = -1;
    this.blendIn = blendIn;
  }

  /** Change de plan en gardant la continuité (fondu depuis la vue actuelle). */
  cut(shot: Shot, current: View, blend = 2.2): void {
    this.start(current, shot, blend);
  }

  /** Revient vers le joueur (en douceur). */
  finish(blendOut = 1.4): void {
    if (this.outT < 0) {
      this.outT = this.t;
      this.blendOut = blendOut;
    }
  }

  /** Arrêt immédiat. */
  stop(): void {
    this.shot = null;
    this.outT = -1;
  }

  /** Vue de la caméra pour cette image (`player` = la vue normale du joueur). */
  update(dt: number, player: View): View {
    if (!this.shot) return player;
    this.t += dt;
    let v = shotView(this.shot, this.t);
    if (this.from && this.t < this.blendIn) v = lerpView(this.from, v, smooth(this.t / this.blendIn));
    if (this.outT >= 0) {
      const k = (this.t - this.outT) / this.blendOut;
      if (k >= 1) {
        this.stop();
        return player;
      }
      v = lerpView(v, player, smooth(k));
    }
    return v;
  }
}
