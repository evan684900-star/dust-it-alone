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
  /** Le monde : son nom, et s'il est ouvert au multijoueur (argent et améliorations partagés). */
  world: { name: string; multiplayer: boolean; isPublic: boolean };
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
    world: { name: 'Mon château', multiplayer: false, isPublic: true },
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
    world: cleanWorld(r.world),
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

function cleanWorld(v: unknown): SaveData['world'] {
  const w = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    name: typeof w.name === 'string' && w.name.trim() ? w.name.trim().slice(0, 32) : 'Mon château',
    multiplayer: w.multiplayer === true,
    isPublic: w.isPublic !== false,
  };
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

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem?(k: string): void;
}

function storage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// ───────────────────────────── Mondes (plusieurs sauvegardes) ─────────────────────────────

/** Résumé d'un monde, pour la liste de l'écran d'accueil. */
export interface WorldMeta {
  id: string;
  name: string;
  created: number;
  lastPlayed: number;
  coins: number;
  totalCoins: number;
  rooms: number;
  souvenirs: number;
  multiplayer: boolean;
  isPublic: boolean;
}

const WORLDS_KEY = 'dust-it-alone:worlds';
const CURRENT_KEY = 'dust-it-alone:current';
/** Le tout premier monde garde l'ancienne clé : les anciennes sauvegardes deviennent « Mon château ». */
export const FIRST_WORLD = 'main';

export function worldKey(id: string): string {
  return id === FIRST_WORLD ? SAVE_KEY : `dust-it-alone:world:${id}`;
}

function summary(id: string, d: SaveData, prev?: WorldMeta): WorldMeta {
  return {
    id,
    name: d.world.name,
    created: prev?.created ?? Date.now(),
    lastPlayed: Date.now(),
    coins: d.coins,
    totalCoins: d.totalCoins,
    rooms: Object.values(d.rooms).filter((r) => r.unlocked).length,
    souvenirs: d.souvenirs.length,
    multiplayer: d.world.multiplayer,
    isPublic: d.world.isPublic,
  };
}

/** La liste des mondes (l'ancienne sauvegarde unique y apparaît toute seule). */
export function listWorlds(store: StorageLike | null = storage()): WorldMeta[] {
  if (!store) return [];
  let list: WorldMeta[] = [];
  try {
    const raw = JSON.parse(store.getItem(WORLDS_KEY) ?? 'null');
    if (Array.isArray(raw)) list = raw.filter((w) => w && typeof w.id === 'string' && typeof w.name === 'string');
  } catch {
    /* liste abîmée : on la reconstruit */
  }
  if (!list.some((w) => w.id === FIRST_WORLD) && store.getItem(SAVE_KEY)) {
    try {
      const d = migrate(JSON.parse(store.getItem(SAVE_KEY)!));
      list.unshift({ ...summary(FIRST_WORLD, d), lastPlayed: d.savedAt, created: d.savedAt });
    } catch {
      /* rien */
    }
  }
  return list.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

function saveIndex(list: WorldMeta[], store: StorageLike): void {
  try {
    store.setItem(WORLDS_KEY, JSON.stringify(list));
  } catch {
    /* rien */
  }
}

export function currentWorld(store: StorageLike | null = storage()): string {
  return store?.getItem(CURRENT_KEY) || FIRST_WORLD;
}

export function setCurrentWorld(id: string, store: StorageLike | null = storage()): void {
  store?.setItem(CURRENT_KEY, id);
}

/** Crée un monde tout neuf (il devient le monde en cours). */
export function createWorld(name: string, multiplayer: boolean, isPublic: boolean, settings: Settings | null, store: StorageLike | null = storage()): string {
  const list = listWorlds(store);
  // Le tout premier monde reprend l'ancienne clé s'il n'y a encore rien.
  const id = list.length === 0 && !store?.getItem(SAVE_KEY) ? FIRST_WORLD : `w${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const d = defaultSave();
  d.world = { name: name.trim().slice(0, 32) || 'Mon château', multiplayer, isPublic };
  if (settings) d.settings = { ...settings };
  if (store) {
    store.setItem(worldKey(id), JSON.stringify(d));
    saveIndex([...list.filter((w) => w.id !== id), summary(id, d)], store);
    setCurrentWorld(id, store);
  }
  return id;
}

export function deleteWorld(id: string, store: StorageLike | null = storage()): void {
  if (!store) return;
  // Un monde effacé est d'abord mis de côté : une fausse manip reste rattrapable (« Récupérer une partie »).
  try {
    const txt = store.getItem(worldKey(id));
    if (txt) store.setItem(`${RESCUE_PREFIX}${Date.now()}`, txt);
  } catch {
    /* rien */
  }
  store.removeItem?.(worldKey(id));
  store.removeItem?.(worldKey(id) + ':backup');
  const list = listWorlds(store).filter((w) => w.id !== id);
  saveIndex(list, store);
  if (currentWorld(store) === id) setCurrentWorld(list[0]?.id ?? FIRST_WORLD, store);
}

export function renameWorld(id: string, name: string, store: StorageLike | null = storage()): void {
  if (!store) return;
  const key = worldKey(id);
  try {
    const d = migrate(JSON.parse(store.getItem(key) ?? 'null'));
    d.world.name = name.trim().slice(0, 32) || d.world.name;
    writeSave(d, store, id);
  } catch {
    /* rien */
  }
}

/** Charge la sauvegarde du monde en cours (avec repli sur la copie de secours si la principale est abîmée). */
export function loadSave(store: StorageLike | null = storage(), id = currentWorld(store)): SaveData {
  if (!store) return defaultSave();
  const key = worldKey(id);
  for (const k of [key, key + ':backup']) {
    try {
      const txt = store.getItem(k);
      if (txt) return migrate(JSON.parse(txt));
    } catch {
      /* on essaie la copie suivante */
    }
  }
  return defaultSave();
}

// ───────────────────────────── Filet de sécurité et récupération ─────────────────────────────

const RESCUE_PREFIX = 'dust-it-alone:rescue:';
const RESCUE_MAX = 6;

/**
 * Avant d'écraser une sauvegarde par une autre qui a BEAUCOUP moins de progression
 * (et ce n'est pas un Grand Ménage), on met l'ancienne de côté : elle reste récupérable.
 */
function rescueIfLosing(prevText: string, next: SaveData, store: StorageLike, id: string): void {
  try {
    const prev = migrate(JSON.parse(prevText));
    const lost = prev.totalCoins > 2000 && next.totalCoins < prev.totalCoins * 0.5 && next.prestiges <= prev.prestiges;
    const fewerRooms = Object.values(prev.rooms).filter((r) => r.unlocked).length > Object.values(next.rooms).filter((r) => r.unlocked).length && next.prestiges <= prev.prestiges;
    if (!lost && !fewerRooms) return;
    store.setItem(`${RESCUE_PREFIX}${Date.now()}`, JSON.stringify({ ...prev, rescuedFrom: id }));
    // On ne garde que les plus récentes.
    const keys = allKeys(store).filter((k) => k.startsWith(RESCUE_PREFIX)).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - RESCUE_MAX))) store.removeItem?.(k);
  } catch {
    /* rien */
  }
}

function allKeys(store: StorageLike): string[] {
  const s = store as unknown as { length?: number; key?: (i: number) => string | null; m?: Map<string, string> };
  if (s.m instanceof Map) return [...s.m.keys()];
  const out: string[] = [];
  if (typeof s.length === 'number' && s.key) for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k) out.push(k);
  }
  return out;
}

/** Une sauvegarde trouvée dans le navigateur (principale, copie de secours ou mise de côté). */
export interface FoundSave {
  key: string;
  kind: 'monde' | 'secours' | 'mise de côté';
  name: string;
  savedAt: number;
  coins: number;
  totalCoins: number;
  rooms: number;
  souvenirs: number;
  prestiges: number;
}

/** Toutes les sauvegardes de Dust It Alone présentes dans ce navigateur (pour « Récupérer une partie »). */
export function findSaves(store: StorageLike | null = storage()): FoundSave[] {
  if (!store) return [];
  const out: FoundSave[] = [];
  for (const key of allKeys(store)) {
    if (!key.startsWith('dust-it-alone:') || key === WORLDS_KEY || key === CURRENT_KEY || key.startsWith('dust-it-alone:profile')) continue;
    try {
      const raw = JSON.parse(store.getItem(key) ?? 'null');
      if (!raw || typeof raw !== 'object' || !('coins' in raw)) continue;
      const d = migrate(raw);
      out.push({
        key,
        kind: key.startsWith(RESCUE_PREFIX) ? 'mise de côté' : key.endsWith(':backup') ? 'secours' : 'monde',
        name: d.world.name,
        savedAt: d.savedAt,
        coins: d.coins,
        totalCoins: d.totalCoins,
        rooms: Object.values(d.rooms).filter((r) => r.unlocked).length,
        souvenirs: d.souvenirs.length,
        prestiges: d.prestiges,
      });
    } catch {
      /* pas une sauvegarde */
    }
  }
  return out.sort((a, b) => b.totalCoins - a.totalCoins);
}

/** Restaure une sauvegarde trouvée en tant que NOUVEAU monde (rien n'est écrasé). Renvoie son identifiant. */
export function restoreAsWorld(key: string, store: StorageLike | null = storage()): string | null {
  if (!store) return null;
  try {
    const d = migrate(JSON.parse(store.getItem(key) ?? 'null'));
    const id = createWorld(`${d.world.name} (récupéré)`, d.world.multiplayer, d.world.isPublic, d.settings, store);
    d.world.name = `${d.world.name} (récupéré)`;
    store.setItem(worldKey(id), JSON.stringify(d));
    writeSave(d, store, id);
    return id;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData, store: StorageLike | null = storage(), id = currentWorld(store)): void {
  if (!store) return;
  const key = worldKey(id);
  try {
    const prev = store.getItem(key);
    if (prev) rescueIfLosing(prev, data, store, id);
    if (prev) store.setItem(key + ':backup', prev);
    store.setItem(key, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
    const list = listWorlds(store);
    const old = list.find((w) => w.id === id);
    saveIndex([...list.filter((w) => w.id !== id), summary(id, data, old)], store);
  } catch {
    /* stockage plein ou bloqué : le jeu continue sans sauvegarder */
  }
}
