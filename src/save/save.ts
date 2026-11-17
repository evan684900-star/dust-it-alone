import { isQualitySetting, type QualitySetting } from '../render/quality';

export const SAVE_KEY = 'dust-it-alone:save';
export const SAVE_VERSION = 2;

export interface RoomSave {
  unlocked: boolean;
  cleaned: boolean;
}

export interface PlayerSave {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  coins: number;
  totalCoins: number;
  rooms: Record<string, RoomSave>;
  player: PlayerSave | null;
  muted: boolean;
  quality: QualitySetting;
  showFps: boolean;
  /** Le petit texte d'introduction a déjà été vu. */
  introSeen: boolean;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    coins: 0,
    totalCoins: 0,
    rooms: { attic: { unlocked: true, cleaned: false } },
    player: null,
    muted: false,
    quality: 'auto',
    showFps: false,
    introSeen: false,
  };
}

/** Fait passer une ancienne sauvegarde au format actuel (sans jamais planter). */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

  const rooms: Record<string, RoomSave> = { attic: { unlocked: true, cleaned: false } };
  if (r.rooms && typeof r.rooms === 'object') {
    for (const [id, v] of Object.entries(r.rooms as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const rv = v as Record<string, unknown>;
      rooms[id] = { unlocked: rv.unlocked === true, cleaned: rv.cleaned === true };
    }
  }
  rooms.attic.unlocked = true;
  // Version 1 : une seule pièce (les combles).
  if (r.roomCleanedOnce === true) rooms.attic.cleaned = true;

  let player: PlayerSave | null = null;
  const p = r.player as Record<string, unknown> | null | undefined;
  if (p && fin(p.x) && fin(p.z) && fin(p.y) && fin(p.yaw)) player = { x: p.x as number, z: p.z as number, y: p.y as number, yaw: p.yaw as number };

  return {
    version: SAVE_VERSION,
    savedAt: num(r.savedAt, base.savedAt),
    coins: num(r.coins, 0),
    totalCoins: num(r.totalCoins, 0),
    rooms,
    player,
    muted: r.muted === true,
    quality: isQualitySetting(r.quality) ? r.quality : 'auto',
    showFps: r.showFps === true,
    introSeen: r.introSeen === true,
  };
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function storage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Charge la sauvegarde (avec repli sur la copie de secours si la principale est abîmée). */
export function loadSave(store: StorageLike | null = storage()): SaveData {
  if (!store) return defaultSave();
  for (const key of [SAVE_KEY, SAVE_KEY + ':backup']) {
    try {
      const txt = store.getItem(key);
      if (txt) return migrate(JSON.parse(txt));
    } catch {
      /* on essaie la copie suivante */
    }
  }
  return defaultSave();
}

export function writeSave(data: SaveData, store: StorageLike | null = storage()): void {
  if (!store) return;
  try {
    const prev = store.getItem(SAVE_KEY);
    if (prev) store.setItem(SAVE_KEY + ':backup', prev);
    store.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
  } catch {
    /* stockage plein ou bloqué : le jeu continue sans sauvegarder */
  }
}
