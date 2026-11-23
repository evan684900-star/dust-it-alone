import { ALL_SOUVENIRS, ENDING, INTRO, ROOM_STORY, SPEAKERS, THRONE_SOUVENIRS, type Line } from '../data/story';
import type { RoomDef } from '../data/rooms';
import type { RoomSim } from '../sim/roomSim';
import type { SaveData } from '../save/save';
import { grow, inside } from '../sim/roomSim';
import { createRng } from '../core/rng';
import * as store from '../state/store';

/** Propreté à partir de laquelle chacun des 3 souvenirs d'une pièce apparaît. */
export const SOUVENIR_THRESHOLDS = [0.25, 0.55, 0.85];
const PICKUP_DISTANCE = 150;

export interface DirectorContext {
  save: SaveData;
  rooms: { def: RoomDef; sim: RoomSim }[];
  isUnlocked: (id: string) => boolean;
  player: { x: number; z: number; y: number };
  world: {
    setDustMessage(roomIndex: number, text: string): void;
    setSouvenirs(list: { id: string; roomIndex: number; x: number; y: number; icon: string }[]): void;
    collectSouvenir(id: string): void;
  };
  /** Joue la cinématique de l'écho d'une pièce. */
  playEcho: (roomIndex: number) => void;
  /** Peut-on lancer une cinématique maintenant (pas déjà une en cours, jeu en marche) ? */
  canPlayCinematic: () => boolean;
  onSouvenir: () => void;
  persist: () => void;
}

/** Joue une suite de répliques (elles s'enchaînent dans la bulle de dialogue). */
export function playLines(lines: Line[]): void {
  for (const [who, text] of lines) {
    const s = SPEAKERS[who];
    store.say(s.name, text, s.voice, 'thought' in s && s.thought === true);
  }
}

/**
 * Le chef d'orchestre de l'histoire : dialogues à l'entrée des pièces, messages
 * dans la poussière, souvenirs cachés, échos du passé et fin du jeu.
 */
export class StoryDirector {
  private positions = new Map<string, { x: number; y: number }>();
  private timer = 0;

  constructor(private ctx: DirectorContext) {
    // Chaque souvenir a toujours la même cachette (tirée au sort une fois pour toutes).
    for (const r of ctx.rooms) {
      const story = ROOM_STORY[r.def.id];
      if (!story) continue;
      const rng = createRng(hash(r.def.id));
      story.souvenirs.forEach((s) => this.positions.set(s.id, this.hidingSpot(r.def, rng)));
    }
  }

  private get save() {
    return this.ctx.save;
  }

  /** À appeler une fois le monde 3D construit. */
  init(): void {
    this.ctx.rooms.forEach((r, i) => {
      const story = ROOM_STORY[r.def.id];
      if (story) this.ctx.world.setDustMessage(i, story.dustMessage);
    });
  }

  intro(): void {
    playLines(INTRO);
  }

  private hidingSpot(def: RoomDef, rng: ReturnType<typeof createRng>): { x: number; y: number } {
    for (let k = 0; k < 40; k++) {
      const p = def.patches[Math.floor(rng.next() * def.patches.length)];
      const x = Math.max(150, Math.min(def.width - 150, p.x + rng.gauss() * p.spread * 0.4));
      const y = Math.max(150, Math.min(def.height - 150, p.y + rng.gauss() * p.spread * 0.4));
      if (def.obstacles.some((o) => inside(grow(o.rect, 80), x, y))) continue;
      if (def.collectors.some((c) => inside(grow(c.rect, 120), x, y))) continue;
      return { x, y };
    }
    return { x: def.width / 2, y: def.height / 2 };
  }

  /** Nombre de souvenirs trouvés (hors Salle du trône). */
  souvenirCount(): number {
    return this.save.souvenirs.filter((id) => !id.startsWith('throne-')).length;
  }

  /** La Salle du trône ne s'ouvre qu'avec assez de souvenirs. */
  throneOpenable(): boolean {
    return this.souvenirCount() >= THRONE_SOUVENIRS;
  }

  update(dt: number, current: RoomDef | null): void {
    // Un écho attend dans cette pièce (elle est devenue impeccable pendant qu'on était ailleurs).
    if (current && this.save.seen.includes(`echo-wait:${current.id}`) && this.ctx.canPlayCinematic()) {
      this.save.seen = this.save.seen.filter((x) => x !== `echo-wait:${current.id}`);
      const ri = this.ctx.rooms.findIndex((r) => r.def === current);
      if (ri >= 0) {
        this.save.echoes.push(current.id);
        this.ctx.persist();
        this.ctx.playEcho(ri);
      }
    }

    // Première entrée dans une pièce : quelques répliques.
    if (current && !this.save.seen.includes(`enter:${current.id}`)) {
      this.save.seen.push(`enter:${current.id}`);
      const story = ROOM_STORY[current.id];
      if (story?.enter.length) setTimeout(() => playLines(story.enter), 700);
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.3;

    // Souvenirs apparus (assez de propreté) et pas encore ramassés.
    const shown: { id: string; roomIndex: number; x: number; y: number; icon: string }[] = [];
    this.ctx.rooms.forEach((r, ri) => {
      if (!this.ctx.isUnlocked(r.def.id)) return;
      const story = ROOM_STORY[r.def.id];
      if (!story) return;
      const c = r.sim.cleanliness;
      story.souvenirs.forEach((s, i) => {
        if (this.save.souvenirs.includes(s.id) || c < SOUVENIR_THRESHOLDS[i]) return;
        const pos = this.positions.get(s.id)!;
        shown.push({ id: s.id, roomIndex: ri, x: pos.x, y: pos.y, icon: s.icon });
      });
    });
    this.ctx.world.setSouvenirs(shown);

    // On ramasse un souvenir en passant à côté.
    const p = this.ctx.player;
    for (const s of shown) {
      const def = this.ctx.rooms[s.roomIndex].def;
      if (Math.abs(def.floorY - p.y) > 120) continue;
      if (Math.hypot(def.origin.x + s.x - p.x, def.origin.z + s.y - p.z) > PICKUP_DISTANCE) continue;
      this.collect(s.id);
    }
  }

  private collect(id: string): void {
    const s = ALL_SOUVENIRS.find((x) => x.id === id);
    if (!s || this.save.souvenirs.includes(id)) return;
    this.save.souvenirs.push(id);
    store.souvenirCount.value = this.save.souvenirs.length;
    this.ctx.world.collectSouvenir(id);
    // La carte du souvenir s'ouvre (comme une page d'album qu'on découvre).
    const found = this.souvenirCount();
    store.souvenirCard.value = {
      key: Date.now(),
      icon: s.icon,
      name: s.name,
      text: s.text,
      room: this.ctx.rooms.find((r) => r.def.id === s.room)?.def.name ?? '',
      count: this.save.souvenirs.length,
      total: ALL_SOUVENIRS.length,
      throneHint: !s.id.startsWith('throne-') && found < THRONE_SOUVENIRS ? `${found} / ${THRONE_SOUVENIRS} pour ouvrir la Salle du trône` : '',
    };
    this.ctx.onSouvenir();
    this.ctx.persist();
  }

  /**
   * La pièce vient d'être impeccable pour la première fois : son écho du passé.
   * Si l'on n'y est pas (les assistants ont fini le travail), l'écho attend qu'on y entre.
   */
  onRoomClean(roomIndex: number, here: boolean): void {
    const def = this.ctx.rooms[roomIndex].def;
    const story = ROOM_STORY[def.id];
    if (!story || this.save.echoes.includes(def.id) || this.save.seen.includes(`echo-wait:${def.id}`)) return;
    if (here) {
      this.save.echoes.push(def.id);
      setTimeout(() => this.ctx.playEcho(roomIndex), 2200);
    } else {
      this.save.seen.push(`echo-wait:${def.id}`);
      store.pushToast('✨ Un écho du passé t’attend', `${def.name} est impeccable. Vas-y : un souvenir va se réveiller.`, 7000);
    }
    this.ctx.persist();
  }

  /** Échos en attente (pour la carte du château). */
  waitingEchoes(): string[] {
    return this.save.seen.filter((x) => x.startsWith('echo-wait:')).map((x) => x.slice('echo-wait:'.length));
  }

  /** La fin du jeu (la Salle du trône est impeccable). */
  ending(): Line[] {
    return ENDING.lines;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
