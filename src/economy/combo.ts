/**
 * Jauge de combo : ramasser beaucoup en peu de temps fait monter la chaleur,
 * qui retombe doucement quand on arrête.
 */
export class Combo {
  heat = 0;
  private idle = 0;
  readonly maxHeat = 4;
  /** Points de chaleur par particule ramassée (multiplié par sa valeur de base). */
  gainPerValue = 0.006;
  graceSeconds = 0.8;
  decayPerSecond = 0.6;

  add(baseValue: number): void {
    this.heat = Math.min(this.maxHeat, this.heat + this.gainPerValue * Math.sqrt(baseValue));
    this.idle = 0;
  }

  update(dt: number): void {
    this.idle += dt;
    if (this.idle > this.graceSeconds) this.heat = Math.max(0, this.heat - this.decayPerSecond * dt);
  }

  /** ×1 → ×1,5 → ×2 → ×2,5 → ×3 */
  get multiplier(): number {
    return 1 + Math.floor(this.heat) * 0.5;
  }

  get level(): number {
    return Math.floor(this.heat);
  }

  /** Remplissage du palier en cours (0 → 1). */
  get fill(): number {
    return this.heat >= this.maxHeat ? 1 : this.heat - Math.floor(this.heat);
  }
}
