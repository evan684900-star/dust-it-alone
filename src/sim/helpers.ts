import { newBroomState, type BroomState } from './roomSim';

export type HelperKind = 'moutonnet' | 'plumette' | 'roulio' | 'biscotte';

/** L'équipe d'assistants (achetée dans l'arbre) : combien de chaque, et leur vitesse. */
export interface HelperTeam {
  moutonnet: number;
  plumette: number;
  roulio: number;
  biscotte: number;
  /** Multiplicateur de vitesse et d'efficacité. */
  speed: number;
}

export const NO_HELPERS: HelperTeam = { moutonnet: 0, plumette: 0, roulio: 0, biscotte: 0, speed: 1 };

/** Grains ramassés par seconde par un assistant (pour les pièces lointaines et le hors-ligne). */
export const HELPER_RATE: Record<HelperKind, number> = { moutonnet: 3, plumette: 0.25, roulio: 5, biscotte: 2 };

/** Un assistant au travail dans une pièce (coordonnées locales de la pièce). */
export class Helper {
  x: number;
  y: number;
  yaw = 0;
  /** Où il va. */
  tx = 0;
  ty = 0;
  state: 'seek' | 'push' | 'rest' | 'dash' = 'seek';
  timer: number;
  readonly broom: BroomState = newBroomState();
  /** Petit balancement pour l'animation. */
  phase = Math.random() * 10;

  constructor(readonly kind: HelperKind, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.timer = kind === 'biscotte' ? 10 + Math.random() * 20 : 0;
  }

  /** Avance vers (tx, ty) ; renvoie la distance restante. */
  moveToward(speed: number, dt: number): number {
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return 0;
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    // Lacet tel que l'avant (−sin, −cos) regarde dans la direction du mouvement.
    const target = Math.atan2(-dx, -dy);
    let diff = target - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 8);
    return d - step;
  }
}
