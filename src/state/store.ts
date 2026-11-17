import { signal } from '@preact/signals';
import type { QualityLevel, QualitySetting } from '../render/quality';

/** État partagé entre le jeu et l'interface (Preact). */
export const coins = signal(0);
export const totalCoins = signal(0);
export const coinsPerSecond = signal(0);
export const cleanliness = signal(0);
export const comboLevel = signal(0);
export const comboFill = signal(0);
export const comboMultiplier = signal(1);
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
export const doorPrompt = signal<{ name: string; price: number; affordable: boolean } | null>(null);
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
