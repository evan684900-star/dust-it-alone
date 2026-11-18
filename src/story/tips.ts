/** Une bulle d'aide qui n'apparaît qu'une fois, au bon moment. */
export interface Tip {
  id: string;
  icon: string;
  text: string;
  /** Le moment est venu de la montrer. */
  when: () => boolean;
  /** Le joueur a compris (la bulle disparaît tout de suite). */
  done?: () => boolean;
}

export interface TipState {
  seen: string[];
  /** Secondes de jeu depuis le lancement. */
  time: number;
}

/** Durée d'affichage max d'une bulle (secondes). */
export const TIP_SECONDS = 16;

/**
 * Choisit la bulle à montrer : la première pas encore vue dont le moment est venu.
 * Une seule à la fois, et jamais deux de suite trop vite.
 */
export class TipDirector {
  private current: Tip | null = null;
  private shownFor = 0;
  private cooldown = 6;

  constructor(private tips: Tip[], private state: TipState, private show: (t: Tip | null) => void) {}

  update(dt: number): void {
    if (this.current) {
      this.shownFor += dt;
      if (this.shownFor > TIP_SECONDS || this.current.done?.()) {
        this.current = null;
        this.show(null);
        this.cooldown = 8;
      }
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    for (const t of this.tips) {
      if (this.state.seen.includes(t.id)) continue;
      if (t.done?.()) {
        // Déjà compris tout seul : pas la peine de l'expliquer.
        this.state.seen.push(t.id);
        continue;
      }
      if (!t.when()) continue;
      this.state.seen.push(t.id);
      this.current = t;
      this.shownFor = 0;
      this.show(t);
      return;
    }
  }

  get active(): Tip | null {
    return this.current;
  }
}
