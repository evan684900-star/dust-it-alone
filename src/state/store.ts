import { signal } from '@preact/signals';

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
