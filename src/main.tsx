import { render } from 'preact';
import { Game } from './game';
import { App } from './ui/App';
import './ui/styles.css';

async function boot() {
  // On attend la police cartoon pour que les textes PixiJS l'utilisent.
  try {
    await Promise.race([document.fonts.load('34px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* police indisponible : on continue avec celle du système */
  }
  const game = new Game();
  await game.mount(document.getElementById('stage')!);
  render(<App game={game} />, document.getElementById('ui')!);
}

void boot();
