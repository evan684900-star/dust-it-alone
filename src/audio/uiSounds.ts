import { effect } from '@preact/signals';
import { sfx } from './synth';
import * as store from '../state/store';

/**
 * Branche un son synthétique sur chaque mouvement de l'interface :
 * survol et clic des boutons, panneaux qui s'ouvrent et se ferment,
 * notifications, changement de lieu, porte verrouillée…
 */
export function installUiSounds(): void {
  const interactive = '.btn, .quality-option, .tool, .toggle, .dialogue, .tree-btn';

  // Survol : un « tic » quand on arrive sur un nouvel élément cliquable.
  let hovered: Element | null = null;
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element | null)?.closest?.(interactive) ?? null;
    if (el && el !== hovered && !(el as HTMLButtonElement).disabled) sfx.hover();
    hovered = el;
  });
  // Clic : « pop », ou « bonk » si le bouton est désactivé.
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.(interactive);
    if (!el) return;
    if ((el as HTMLButtonElement).disabled || el.classList.contains('locked')) sfx.denied();
    else sfx.press();
  });
  // Les boutons désactivés ne reçoivent pas de clic : on écoute aussi l'appui.
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element | null)?.closest?.('button:disabled');
    if (el) sfx.denied();
  });

  // Panneaux : chacun a son son d'ouverture / fermeture.
  watch(() => store.settingsOpen.value, (v) => (v ? sfx.open() : sfx.close()));
  watch(() => store.mapOpen.value, (v) => {
    sfx.paper();
    if (!v) sfx.close();
  });
  watch(() => store.paused.value && store.started.value, (v) => {
    sfx.setMuffled(v);
    if (v) sfx.close();
    else sfx.open();
  });
  watch(() => store.treeOpen.value, (v) => {
    if (v) sfx.leaves();
    else sfx.close();
  });
  watch(() => store.toasts.value.length, (n, prev) => {
    if (n > prev) sfx.chime();
  });
  watch(() => store.placeName.value, (name, prev) => {
    if (name && prev && store.started.value) sfx.bell();
  });
  watch(() => store.doorPrompt.value?.name ?? '', (name) => {
    if (name) sfx.rattle();
  });
  watch(() => store.dialogue.value?.id ?? 0, (id) => {
    if (id) sfx.open();
  });
}

/** Appelle `fn` quand la valeur change (pas au premier passage). */
function watch<T>(read: () => T, fn: (value: T, previous: T) => void): void {
  let first = true;
  let prev: T;
  effect(() => {
    const v = read();
    if (first) {
      first = false;
      prev = v;
      return;
    }
    if (v !== prev) {
      const p = prev;
      prev = v;
      fn(v, p);
    }
  });
}
