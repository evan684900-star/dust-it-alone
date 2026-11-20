import { isQualitySetting, type QualitySetting } from '../render/quality';
import { NODE_BY_ID } from '../data/tree';
import { DIRT_ORDER, TOOLS, type DirtId } from '../data/dirtTypes';

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

/** Réglages du joueur. */
export interface Settings {
  /** Sensibilité de la souris (multiplicateur, 1 = normal). */
  sensitivity: number;
  /** Champ de vision (degrés). */
  fov: number;
  /** Volume général (0 à 1). */
  volume: number;
  /** Les personnages « parlent » (petits bips). */
  voices: boolean;
  /** Balancement de la tête en marchant. */
  headBob: boolean;
  /** Souris inversée (haut / bas). */
  invertY: boolean;
  /** Graphismes réalistes au lieu du style dessin (appliqué au rechargement). */
  realistic: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, fov: 72, volume: 0.8, voices: true, headBob: true, invertY: false, realistic: false };

/** Statistiques de la partie (depuis le tout début, Grands Ménages compris). */
export interface Stats {
  /** Temps de jeu (secondes). */
  playTime: number;
  /** Grains ramassés, par type. */
  grains: Partial<Record<DirtId, number>>;
  /** Portes ouvertes. */
  doors: number;
  /** Événements aléatoires vécus. */
  events: number;
  /** Pièces brillantes ramassées. */
  coinsFound: number;
  /** Niveaux achetés dans l'arbre. */
  levelsBought: number;
  /** Distance parcourue (mètres). */
  walked: number;
  /** Meilleur gain par seconde. */
  bestRate: number;
}

export function defaultStats(): Stats {
  return { playTime: 0, grains: {}, doors: 0, events: 0, coinsFound: 0, levelsBought: 0, walked: 0, bestRate: 0 };
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
  /** Histoire : souvenirs trouvés, échos vus, dialogues déjà joués, fin vue. */
  souvenirs: string[];
  echoes: string[];
  seen: string[];
  endingSeen: boolean;
  settings: Settings;
  stats: Stats;
  /** Succès débloqués. */
  achievements: string[];
  /** Bulles d'aide déjà montrées. */
  tips: string[];
  /** Barre rapide : 3 outils ("" = case vide) ; les autres attendent dans le coffre des combles. */
  hotbar: string[];
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
    souvenirs: [],
    echoes: [],
    seen: [],
    endingSeen: false,
    settings: { ...DEFAULT_SETTINGS },
    stats: defaultStats(),
    achievements: [],
    tips: [],
    hotbar: ['broom', '', ''],
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
    souvenirs: strings(r.souvenirs),
    echoes: strings(r.echoes),
    seen: strings(r.seen),
    endingSeen: r.endingSeen === true,
    settings: cleanSettings(r.settings),
    stats: cleanStats(r.stats),
    achievements: strings(r.achievements),
    tips: strings(r.tips),
    hotbar: cleanHotbar(r.hotbar),
  };
}

/** Barre rapide : exactement 3 cases, chaque outil au plus une fois. */
export const HOTBAR_SIZE = 3;
function cleanHotbar(v: unknown): string[] {
  const ids = new Set(TOOLS.map((t) => t.id as string));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(v) ? v : ['broom']) {
    const id = typeof x === 'string' && ids.has(x) && !seen.has(x) ? x : '';
    if (id) seen.add(id);
    out.push(id);
  }
  while (out.length < HOTBAR_SIZE) out.push('');
  return out.slice(0, HOTBAR_SIZE);
}

function cleanSettings(v: unknown): Settings {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const clamp = (x: unknown, lo: number, hi: number, def: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def);
  return {
    sensitivity: clamp(s.sensitivity, 0.2, 3, d.sensitivity),
    fov: clamp(s.fov, 55, 100, d.fov),
    volume: clamp(s.volume, 0, 1, d.volume),
    voices: s.voices !== false,
    headBob: s.headBob !== false,
    invertY: s.invertY === true,
    realistic: s.realistic === true,
  };
}

function cleanStats(v: unknown): Stats {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  const grains: Partial<Record<DirtId, number>> = {};
  const g = s.grains as Record<string, unknown> | undefined;
  if (g && typeof g === 'object') for (const k of DIRT_ORDER) if (n(g[k]) > 0) grains[k] = n(g[k]);
  return {
    playTime: n(s.playTime),
    grains,
    doors: n(s.doors),
    events: n(s.events),
    coinsFound: n(s.coinsFound),
    levelsBought: n(s.levelsBought),
    walked: n(s.walked),
    bestRate: n(s.bestRate),
  };
}

/** Texte à copier / fichier à télécharger pour garder sa partie ailleurs. */
export function exportSave(data: SaveData): string {
  const json = JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() });
  return 'DUST1:' + btoa(unescape(encodeURIComponent(json)));
}

/** Relit une sauvegarde exportée (code « DUST1: » ou JSON brut). Renvoie null si illisible. */
export function importSave(text: string): SaveData | null {
  const t = text.trim();
  try {
    const json = t.startsWith('DUST1:') ? decodeURIComponent(escape(atob(t.slice(6)))) : t;
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || !('coins' in raw)) return null;
    return migrate(raw);
  } catch {
    return null;
  }
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
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
