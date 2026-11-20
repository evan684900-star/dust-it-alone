import { DEFAULT_SETTINGS, type Settings } from '../save/save';
import { signal } from '@preact/signals';
import type { QualityLevel, QualitySetting } from '../render/quality';

/** État partagé entre le jeu et l'interface (Preact). */
export const coins = signal(0);
export const totalCoins = signal(0);
export const coinsPerSecond = signal(0);
export const cleanliness = signal(0);
export const roomName = signal('');
export const started = signal(false);
export const muted = signal(false);
export const roomCleanedOnce = signal(false);
export const debugInfo = signal<string | null>(null);

export interface Toast { id: number; title: string; text: string }
export const toasts = signal<Toast[]>([]);
let toastId = 0;
export function pushToast(title: string, text: string, ms = 4200): void {
  const t = { id: ++toastId, title, text };
  toasts.value = [...toasts.value, t];
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== t.id);
  }, ms);
}

/** Jeu en pause (la souris n'est plus capturée). */
export const paused = signal(false);

/** Réglage choisi (Auto ou un niveau précis) et niveau réellement appliqué. */
export const qualitySetting = signal<QualitySetting>('auto');
export const qualityLevel = signal<QualityLevel>('medium');
export const showFps = signal(false);
export const fps = signal(0);
/** Panneau des réglages ouvert. */
export const settingsOpen = signal(false);
/** Nom du rendu logiciel détecté (navigateur sans accélération graphique), sinon null. */
export const gpuWarning = signal<string | null>(null);
/** Nom de la carte graphique détectée. */
export const gpuName = signal('');

/** Nom de l'endroit où l'on se trouve (pièce ou escalier). */
export const placeName = signal('');
/** Porte verrouillée devant soi : on affiche « [E] Ouvrir ». */
/** Le joueur est devant l'établi (E ouvre l'arbre). */
export const benchPrompt = signal(false);
export const doorPrompt = signal<{ name: string; price: number; affordable: boolean; need?: string } | null>(null);
/** Carte du château ouverte. */
export const mapOpen = signal(false);
export const playerPos = signal({ x: 0, z: 0, yaw: 0 });

export interface CastleRoomInfo {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  h: number;
  level: number;
  unlocked: boolean;
  cleaned: boolean;
  clean: number;
  price: number;
}
export const castle = signal<CastleRoomInfo[]>([]);

// ───────────────────────────── Dialogues ─────────────────────────────

export interface DialogueLine {
  id: number;
  /** Qui parle (affiché sur l'étiquette). */
  speaker: string;
  text: string;
  /** Hauteur de la « voix » synthétique (Hz). */
  voice: number;
  /** Pensée (en italique) plutôt que parole. */
  thought?: boolean;
}

/** Réplique affichée en ce moment, et celles qui attendent leur tour. */
export const dialogue = signal<DialogueLine | null>(null);
const dialogueQueue: DialogueLine[] = [];
let dialogueId = 0;

/** Vide la file de dialogue (cinématique de fin). */
export function clearDialogue(): void {
  dialogueQueue.length = 0;
  dialogue.value = null;
}

/** Ajoute une réplique à la file (elles s'enchaînent toutes seules). */
export function say(speaker: string, text: string, voice = 420, thought = false): void {
  const line = { id: ++dialogueId, speaker, text, voice, thought };
  if (dialogue.value) dialogueQueue.push(line);
  else dialogue.value = line;
}

/** Passe à la réplique suivante. */
export function nextDialogue(): void {
  dialogue.value = dialogueQueue.shift() ?? null;
}

/** Outil sélectionné (1 = balai ; les autres arrivent plus tard). */
export const selectedTool = signal(0);
/** Petit tremblement sur un outil verrouillé (index), pour le retour visuel. */
export const toolShake = signal<{ index: number; at: number } | null>(null);

// ───────────────────────────── Arbre des Souvenirs ─────────────────────────────

/** L'arbre de compétences est ouvert. */
export const treeOpen = signal(false);
/** Niveaux achetés (copie pour l'interface). */
export const treeLevels = signal<Record<string, number>>({});
/** Pièces ouvertes (pour les conditions des nœuds). */
export const unlockedRooms = signal<string[]>(['attic']);
/** Un nœud est achetable : pastille sur le bouton de l'arbre. */
export const treeBuyable = signal(false);

/** Outils débloqués (dans l'ordre des touches 1 à 8). */
export const unlockedTools = signal<boolean[]>([true, false, false, false, false]);
/** Petite aide sur l'outil en main. */
export const toolHint = signal('');
/** Réservoir de l'aspirateur (affiché quand on l'a en main). */
export const vacuum = signal<{ load: number; cap: number } | null>(null);

/** Gains pendant l'absence (fenêtre « Pendant ton absence… »). */
export const offlineReport = signal<{ seconds: number; counted: number; coins: number } | null>(null);

// ───────────────────────────── Grand Ménage (prestige) ─────────────────────────────

export const sparks = signal(0);
export const prestiges = signal(0);
/** Étincelles que rapporterait un Grand Ménage maintenant. */
export const prestigeGain = signal(0);
export const prestigeReady = signal(false);
/** Fenêtre de confirmation du Grand Ménage. */
export const prestigeConfirm = signal(false);

// ───────────────────────────── Histoire ─────────────────────────────

export const souvenirCount = signal(0);
/** L'album des souvenirs (touche J) est ouvert. */
export const albumOpen = signal(false);
/** Réglages (copie affichable de save.settings). */
export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
/** Carnet : statistiques et succès. */
export const journalOpen = signal(false);
/** Panneau « Crédits » (écran titre). */
export const creditsPanel = signal(false);
export const achievements = signal<string[]>([]);
/** Petite bulle d'aide contextuelle. */
export const tip = signal<{ id: string; icon: string; text: string } | null>(null);
/** Cinématique de fin en cours (bandes noires, caméra automatique). */
export const cinematic = signal(false);
/** Générique de fin affiché. */
export const credits = signal(false);
