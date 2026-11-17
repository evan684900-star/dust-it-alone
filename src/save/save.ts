export const SAVE_KEY = 'dust-it-alone:save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: number;
  coins: number;
  totalCoins: number;
  roomCleanedOnce: boolean;
  muted: boolean;
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, savedAt: Date.now(), coins: 0, totalCoins: 0, roomCleanedOnce: false, muted: false };
}

/** Fait passer une ancienne sauvegarde au format actuel. */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    version: SAVE_VERSION,
    savedAt: num(r.savedAt, base.savedAt),
    coins: num(r.coins, 0),
    totalCoins: num(r.totalCoins, 0),
    roomCleanedOnce: r.roomCleanedOnce === true,
    muted: r.muted === true,
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
