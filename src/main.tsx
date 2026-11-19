import { render } from 'preact';
import { Game } from './game';
import { App } from './ui/App';
import { installUiSounds } from './audio/uiSounds';
import './ui/styles.css';
import { REALISTIC } from './render/realistic';

/** Écran de chargement (défini dans index.html) : étape en cours et barre de progression. */
function loading(status: string, progress: number): Promise<void> {
  const root = document.getElementById('loading');
  const s = root?.querySelector('.ld-status');
  const f = root?.querySelector<HTMLElement>('.ld-fill');
  if (s) s.textContent = status;
  if (f) f.style.width = `${Math.round(progress * 100)}%`;
  // Deux images pour que le navigateur affiche l'étape avant le travail qui bloque.
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

function loadingDone(): void {
  const root = document.getElementById('loading');
  if (!root) return;
  root.classList.add('done');
  clearInterval((window as unknown as { __loadingTips?: number }).__loadingTips);
  setTimeout(() => root.remove(), 700);
}

async function boot() {
  await loading('Dépoussiérage des polices…', 0.15);
  // On attend la police cartoon pour que les textes l'utilisent.
  try {
    await Promise.race([document.fonts.load('34px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* police indisponible : on continue avec celle du système */
  }
  await loading(REALISTIC ? 'Fabrication des textures réalistes (pierre, bois, herbe)…' : 'Préparation des pinceaux…', 0.3);
  const game = new Game();
  await loading('Construction des 14 pièces du château…', 0.55);
  game.mount(document.getElementById('stage')!);
  await loading('Éparpillage de la poussière…', 0.9);
  render(<App game={game} />, document.getElementById('ui')!);
  installUiSounds();
  await loading('C’est prêt !', 1);
  loadingDone();
}

void boot();
