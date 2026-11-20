import type { RoomSim } from '../sim/roomSim';
import { DIRT_ORDER, DIRT_TYPES } from '../data/dirtTypes';

/**
 * Photo de la poussière d'une pièce, envoyée par l'hôte à ses invités.
 *
 * Format binaire compact :
 * - en-tête : version (u8), complète ? (u8), nombre d'emplacements (u32), nombre de grains décrits (u32) ;
 * - masque des grains vivants (1 bit par emplacement) ;
 * - pour chaque grain décrit : emplacement (u32), x, y (i16, cm), vx, vy (i16, cm/s), résistance (u8).
 *
 * Une photo « complète » décrit tous les grains vivants ; les autres seulement ceux
 * qui ont bougé depuis la photo précédente (la poussière au repos ne coûte presque rien).
 */
export const SNAPSHOT_VERSION = 1;
const ENTRY = 13;

/** Ce que l'hôte a déjà envoyé pour une pièce (pour n'envoyer que les différences). */
export interface SnapshotMemory {
  x: Float32Array;
  y: Float32Array;
  alive: Uint8Array;
}

export function newMemory(cap: number): SnapshotMemory {
  return { x: new Float32Array(cap).fill(-1e9), y: new Float32Array(cap).fill(-1e9), alive: new Uint8Array(cap) };
}

const clamp16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

export function encodeSnapshot(sim: RoomSim, full: boolean, mem: SnapshotMemory): ArrayBuffer {
  const pool = sim.pool;
  const cap = pool.cap;
  const maskBytes = (cap + 7) >> 3;
  const list: number[] = [];
  for (let i = 0; i < cap; i++) {
    if (!pool.alive[i]) continue;
    const moved =
      full ||
      !mem.alive[i] ||
      Math.abs(pool.x[i] - mem.x[i]) > 0.5 ||
      Math.abs(pool.y[i] - mem.y[i]) > 0.5 ||
      pool.vx[i] !== 0 ||
      pool.vy[i] !== 0 ||
      DIRT_TYPES[DIRT_ORDER[pool.type[i]]].fixed !== undefined;
    if (moved) list.push(i);
  }
  const buf = new ArrayBuffer(10 + maskBytes + list.length * ENTRY);
  const dv = new DataView(buf);
  dv.setUint8(0, SNAPSHOT_VERSION);
  dv.setUint8(1, full ? 1 : 0);
  dv.setUint32(2, cap, true);
  dv.setUint32(6, list.length, true);
  const mask = new Uint8Array(buf, 10, maskBytes);
  for (let i = 0; i < cap; i++) {
    if (pool.alive[i]) mask[i >> 3] |= 1 << (i & 7);
    mem.alive[i] = pool.alive[i];
  }
  let o = 10 + maskBytes;
  for (const i of list) {
    const def = DIRT_TYPES[DIRT_ORDER[pool.type[i]]];
    dv.setUint32(o, i, true);
    dv.setInt16(o + 4, clamp16(pool.x[i]), true);
    dv.setInt16(o + 6, clamp16(pool.y[i]), true);
    dv.setInt16(o + 8, clamp16(pool.vx[i]), true);
    dv.setInt16(o + 10, clamp16(pool.vy[i]), true);
    dv.setUint8(o + 12, def.fixed ? Math.max(0, Math.min(255, Math.round((pool.hp[i] / def.fixed.hp) * 255))) : 0);
    mem.x[i] = pool.x[i];
    mem.y[i] = pool.y[i];
    o += ENTRY;
  }
  return buf;
}

/** Applique une photo reçue de l'hôte. Renvoie faux si elle ne correspond pas à cette pièce. */
export function applySnapshot(sim: RoomSim, buf: ArrayBuffer): boolean {
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== SNAPSHOT_VERSION) return false;
  const pool = sim.pool;
  const cap = dv.getUint32(2, true);
  if (cap !== pool.cap) return false;
  const count = dv.getUint32(6, true);
  const maskBytes = (cap + 7) >> 3;
  const mask = new Uint8Array(buf, 10, maskBytes);
  const born = pool.setAlive(mask);
  for (const i of born) pool.age[i] = 0;
  let o = 10 + maskBytes;
  for (let k = 0; k < count; k++) {
    const i = dv.getUint32(o, true);
    if (i < cap) {
      pool.x[i] = dv.getInt16(o + 4, true);
      pool.y[i] = dv.getInt16(o + 6, true);
      pool.vx[i] = dv.getInt16(o + 8, true);
      pool.vy[i] = dv.getInt16(o + 10, true);
      const def = DIRT_TYPES[DIRT_ORDER[pool.type[i]]];
      if (def.fixed) pool.hp[i] = (dv.getUint8(o + 12) / 255) * def.fixed.hp;
    }
    o += ENTRY;
  }
  return true;
}
