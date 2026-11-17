import type { DoorDef, Rect, RoomDef, StairDef } from '../data/rooms';
import { grow, inside } from '../sim/roomSim';

/** Rayon du corps du joueur (cm). */
export const BODY = 32;
/** Différence de hauteur max pour passer d'une zone à une autre (marche). */
const STEP = 70;

export type AreaKind = 'room' | 'door' | 'stair';

export interface Area {
  kind: AreaKind;
  id: string;
  /** Emprise au sol en coordonnées monde (x, z). */
  rect: Rect;
  /** Altitude du sol en (x, z). */
  heightAt(x: number, z: number): number;
  /** Fermée (porte verrouillée) ? */
  enabled: () => boolean;
  room?: RoomDef;
  door?: DoorDef;
  stair?: StairDef;
}

/**
 * Le plan de circulation du château : pièces, portes et escaliers.
 * Le joueur ne peut se trouver que dans une zone ouverte ; sa hauteur suit le sol
 * de cette zone (rampes pour les escaliers).
 */
export class Navigation {
  readonly areas: Area[] = [];

  constructor(rooms: RoomDef[], doors: DoorDef[], stairs: StairDef[], isUnlocked: (roomId: string) => boolean) {
    for (const r of rooms) {
      this.areas.push({
        kind: 'room',
        id: r.id,
        room: r,
        rect: { x: r.origin.x + BODY, y: r.origin.z + BODY, w: r.width - 2 * BODY, h: r.height - 2 * BODY },
        heightAt: () => r.floorY,
        enabled: () => isUnlocked(r.id),
      });
    }
    for (const d of doors) {
      const depth = 70;
      const rect: Rect =
        d.axis === 'x'
          ? { x: d.at - depth, y: d.from + BODY, w: depth * 2, h: d.to - d.from - 2 * BODY }
          : { x: d.from + BODY, y: d.at - depth, w: d.to - d.from - 2 * BODY, h: depth * 2 };
      this.areas.push({
        kind: 'door',
        id: d.id,
        door: d,
        rect,
        heightAt: () => d.floorY,
        enabled: () => d.room === null || isUnlocked(d.room),
      });
    }
    for (const s of stairs) {
      const { x, y, w, h } = s.rect;
      this.areas.push({
        kind: 'stair',
        id: s.id,
        stair: s,
        rect: { x: s.axis === 'x' ? x : x + BODY, y: s.axis === 'z' ? y : y + BODY, w: s.axis === 'x' ? w : w - 2 * BODY, h: s.axis === 'z' ? h : h - 2 * BODY },
        heightAt: (px, pz) => {
          const t = s.axis === 'x' ? (px - x) / w : (pz - y) / h;
          const c = Math.max(0, Math.min(1, t));
          return s.yAtMin + (s.yAtMax - s.yAtMin) * c;
        },
        enabled: () => true,
      });
    }
  }

  /** La zone où l'on se trouve en (x, z), à une altitude proche de `y`. */
  areaAt(x: number, z: number, y: number): Area | null {
    let best: Area | null = null;
    let bestDy = STEP;
    for (const a of this.areas) {
      if (!a.enabled() || !inside(a.rect, x, z)) continue;
      const dy = Math.abs(a.heightAt(x, z) - y);
      if (dy < bestDy) {
        best = a;
        bestDy = dy;
      }
    }
    return best;
  }

  /** Peut-on se tenir en (x, z) en venant de l'altitude y ? Renvoie la nouvelle altitude, ou null. */
  canStand(x: number, z: number, y: number): number | null {
    const a = this.areaAt(x, z, y);
    if (!a) return null;
    // Les meubles et les pelles bloquent le passage dans les pièces.
    for (const r of this.roomsNear(x, z, y)) {
      const lx = x - r.origin.x;
      const lz = z - r.origin.z;
      for (const o of r.obstacles) if (inside(grow(o.rect, BODY), lx, lz)) return null;
      for (const c of r.collectors) if (inside(grow(c.rect, BODY + 30), lx, lz)) return null;
    }
    return a.heightAt(x, z);
  }

  /** Pièce qui contient (x, z) au niveau y (bords compris), ou null. */
  roomAt(x: number, z: number, y: number): RoomDef | null {
    for (const a of this.areas) {
      const r = a.room;
      if (!r) continue;
      if (Math.abs(r.floorY - y) > STEP * 2) continue;
      if (x >= r.origin.x && z >= r.origin.z && x <= r.origin.x + r.width && z <= r.origin.z + r.height) return r;
    }
    return null;
  }

  private roomsNear(x: number, z: number, y: number): RoomDef[] {
    const out: RoomDef[] = [];
    for (const a of this.areas) {
      const r = a.room;
      if (!r || Math.abs(r.floorY - y) > STEP * 2) continue;
      if (x >= r.origin.x - BODY && z >= r.origin.z - BODY && x <= r.origin.x + r.width + BODY && z <= r.origin.z + r.height + BODY) out.push(r);
    }
    return out;
  }

  /** Porte verrouillée la plus proche (pour afficher « [E] Ouvrir »). */
  lockedDoorNear(x: number, z: number, y: number, maxDist = 190): DoorDef | null {
    let best: DoorDef | null = null;
    let bestD = maxDist;
    for (const a of this.areas) {
      const d = a.door;
      if (!d || a.enabled() || Math.abs(d.floorY - y) > STEP * 2) continue;
      const cx = d.axis === 'x' ? d.at : (d.from + d.to) / 2;
      const cz = d.axis === 'x' ? (d.from + d.to) / 2 : d.at;
      const dist = Math.hypot(cx - x, cz - z);
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** Nom de l'endroit où l'on se trouve (pièce ou escalier). */
  placeName(x: number, z: number, y: number): string {
    const a = this.areaAt(x, z, y);
    if (a?.stair) return a.stair.name;
    return this.roomAt(x, z, y)?.name ?? '';
  }
}
