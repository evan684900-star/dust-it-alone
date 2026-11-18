import { isQualitySetting, type QualitySetting } from '../render/quality';
import { NODE_BY_ID } from '../data/tree';
import { DIRT_ORDER, type DirtId } from '../data/dirtTypes';

export const SAVE_KEY = 'dust-it-alone:save';
export const SAVE_VERSION = 3;

export interface RoomSave {
  unlocked: boolean;
  cleaned: boolean;
  /** Poussière encore au sol (nombre de grains par type). Absent = pièce pleine. */
  dirt?: Partial<Record<DirtId, number>>;
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
  /** Niveaux achetés dans l'Arbre des Souvenirs. */
  tree: Record<string, number>;
  /** Grand Ménage : Étincelles en poche, nombre de Grands Ménages, pièces gagnées depuis le dernier. */
  sparks: number;
  prestiges: number;
  runCoins: number;
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
    tree: {},
    sparks: 0,
    prestiges: 0,
    runCoins: 0,
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
      const d = rv.dirt as Record<string, unknown> | undefined;
      const cnt = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null);
      if (d && typeof d === 'object') {
        // Il faut au moins la poussière ; les types absents (anciennes sauvegardes) repartent à 0… sauf
        // s'ils n'existaient pas encore : on les laisse alors absents (la pièce les recevra pleins).
        const out: Partial<Record<DirtId, number>> = {};
        let ok = cnt(d.dust) !== null;
        for (const k of DIRT_ORDER) {
          if (!(k in d)) continue;
          const v = cnt(d[k]);
          if (v === null) ok = false;
          else out[k] = v;
        }
        if (ok) rooms[id].dirt = out;
      }
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
    tree: cleanTree(r.tree),
    sparks: Math.floor(num(r.sparks, 0)),
    prestiges: Math.floor(num(r.prestiges, 0)),
    // Anciennes sauvegardes : on part du total gagné.
    runCoins: num(r.runCoins, num(r.totalCoins, 0)),
  };
}

/** Nœuds renommés quand l'arbre est devenu gigantesque (les paliers « I » gardent les anciens niveaux). */
const RENAMED: Record<string, string> = {
  'broom-grip': 'broom-grip-1',
  'broom-push': 'broom-push-1',
  'broom-reach': 'broom-reach-1',
  'pan-pull': 'pan-pull-1',
  'star-luck': 'star-luck-1',
  'bunny-fat': 'bunny-fat-1',
  'plume-speed': 'plume-speed-1',
  'plume-sprint': 'plume-sprint-1',
};

/** Garde seulement les nœuds connus, avec un niveau entier valide. */
function cleanTree(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [rawId, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = RENAMED[rawId] ?? (/^(airflow|shine):[a-z]+$/.test(rawId) ? `${rawId}-1` : rawId);
    const node = NODE_BY_ID.get(id);
    if (!node || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const lvl = Math.max(0, Math.min(node.maxLevel, Math.floor(v)));
    if (lvl > 0) out[id] = lvl;
  }
  return out;
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
