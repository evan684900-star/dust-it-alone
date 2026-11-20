import { DIRT_ORDER, DIRT_TYPES, type DirtId } from '../data/dirtTypes';

/**
 * Stockage des particules en « structure de tableaux » : pas d'objet JS par
 * particule, donc pas de ramasse-miettes et une boucle très rapide.
 *
 * Chaque type de saleté possède sa propre plage d'emplacements (fixe),
 * ce qui permet au rendu d'attribuer une texture par emplacement une fois pour toutes.
 */
export class ParticlePool {
  readonly cap: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly rot: Float32Array;
  readonly age: Float32Array;
  /** Résistance restante des saletés fixées (toiles, taches). */
  readonly hp: Float32Array;
  readonly alive: Uint8Array;
  /** Index du type (dans DIRT_ORDER) pour chaque emplacement. */
  readonly type: Uint8Array;
  readonly ranges: Record<DirtId, { start: number; count: number }>;
  readonly aliveCount: Record<DirtId, number>;
  private readonly free: Record<DirtId, Int32Array>;
  private readonly freeTop: Record<DirtId, number>;

  constructor(capacity: Partial<Record<DirtId, number>>) {
    let total = 0;
    const ranges = {} as Record<DirtId, { start: number; count: number }>;
    for (const id of DIRT_ORDER) {
      const count = capacity[id] ?? 0;
      ranges[id] = { start: total, count };
      total += count;
    }
    this.cap = total;
    this.ranges = ranges;
    this.x = new Float32Array(total);
    this.y = new Float32Array(total);
    this.vx = new Float32Array(total);
    this.vy = new Float32Array(total);
    this.rot = new Float32Array(total);
    this.age = new Float32Array(total);
    this.hp = new Float32Array(total);
    this.alive = new Uint8Array(total);
    this.type = new Uint8Array(total);
    this.free = {} as Record<DirtId, Int32Array>;
    this.freeTop = {} as Record<DirtId, number>;
    this.aliveCount = {} as Record<DirtId, number>;
    DIRT_ORDER.forEach((id, typeIndex) => {
      const { start, count } = ranges[id];
      const stack = new Int32Array(count);
      // On empile à l'envers pour que les premiers emplacements sortent en premier.
      for (let k = 0; k < count; k++) stack[k] = start + count - 1 - k;
      this.free[id] = stack;
      this.freeTop[id] = count;
      this.aliveCount[id] = 0;
      this.type.fill(typeIndex, start, start + count);
    });
  }

  canSpawn(id: DirtId): boolean {
    return this.freeTop[id] > 0;
  }

  spawn(id: DirtId, x: number, y: number, rot = 0): number {
    if (this.freeTop[id] === 0) return -1;
    const i = this.free[id][--this.freeTop[id]];
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.rot[i] = rot;
    this.age[i] = 0;
    this.hp[i] = DIRT_TYPES[id].fixed?.hp ?? 0;
    this.alive[i] = 1;
    this.aliveCount[id]++;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    const id = DIRT_ORDER[this.type[i]];
    this.alive[i] = 0;
    this.free[id][this.freeTop[id]++] = i;
    this.aliveCount[id]--;
  }

  /**
   * Multijoueur : impose quels emplacements sont vivants (reçu de l'hôte) et
   * reconstruit les piles d'emplacements libres. Renvoie les emplacements qui viennent d'apparaître.
   */
  setAlive(mask: Uint8Array): number[] {
    const born: number[] = [];
    DIRT_ORDER.forEach((id) => {
      const { start, count } = this.ranges[id];
      let top = 0;
      let alive = 0;
      // Même ordre que le constructeur : les premiers emplacements libres sortent en premier.
      for (let k = count - 1; k >= 0; k--) {
        const i = start + k;
        const on = (mask[i >> 3] >> (i & 7)) & 1;
        if (on) {
          if (!this.alive[i]) born.push(i);
          alive++;
        } else this.free[id][top++] = i;
        this.alive[i] = on;
      }
      this.freeTop[id] = top;
      this.aliveCount[id] = alive;
    });
    return born;
  }

  typeOf(i: number): DirtId {
    return DIRT_ORDER[this.type[i]];
  }

  /** Saleté pondérée encore présente (pour le % de propreté). */
  weightedDirt(): number {
    let sum = 0;
    for (const id of DIRT_ORDER) sum += this.aliveCount[id] * DIRT_TYPES[id].dirtWeight;
    return sum;
  }
}
