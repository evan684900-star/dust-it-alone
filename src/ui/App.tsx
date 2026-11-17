import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game';
import { CLEAN_THRESHOLD } from '../game';
import { formatNumber } from '../core/format';
import * as store from '../state/store';

export function App({ game }: { game: Game }) {
  return (
    <>
      {store.started.value ? <Hud game={game} /> : <TitleScreen game={game} />}
      {store.started.value && !store.paused.value && <Crosshair />}
      {store.started.value && store.paused.value && <PauseScreen game={game} />}
      <Toasts />
      {store.debugInfo.value && <div class="debug">{store.debugInfo.value}</div>}
    </>
  );
}

function TitleScreen({ game }: { game: Game }) {
  const hasSave = store.totalCoins.value > 0;
  return (
    <div class="title-screen">
      <div class="title-card">
        <h1 class="logo">
          <span class="w1">Dust</span> <span class="w2">It</span> <span class="w3">Alone</span>
        </h1>
        <p class="tagline">Un vieux château. Beaucoup trop de poussière. Un seul balai.</p>
        <button class="btn btn-big" onClick={() => game.start()}>
          {hasSave ? 'On reprend le ménage !' : 'Au boulot !'}
        </button>
        {hasSave && <p class="save-info">🪙 {formatNumber(store.coins.value)} pièces en poche</p>}
        <Controls />
      </div>
    </div>
  );
}

function Controls() {
  return (
    <div class="controls">
      <span><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> se déplacer</span>
      <span>🖱️ viser et balayer</span>
      <span><kbd>clic</kbd> frotter fort</span>
      <span><kbd>Maj</kbd> courir</span>
      <span><kbd>Échap</kbd> pause</span>
    </div>
  );
}

function PauseScreen({ game }: { game: Game }) {
  return (
    <div class="title-screen">
      <div class="title-card pause-card">
        <h2 class="pause-title">Pause</h2>
        <p class="tagline">La poussière t'attend. Elle est patiente.</p>
        <button class="btn btn-big" onClick={() => game.start()}>Reprendre le ménage</button>
        <Controls />
      </div>
    </div>
  );
}

function Crosshair() {
  return <div class="crosshair" />;
}

/** Nombre qui sautille quand il augmente. */
function Bouncy({ value, class: cls }: { value: number; class?: string }) {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (Math.floor(value) > Math.floor(prev.current)) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 120);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [Math.floor(value)]);
  return <span class={`${cls ?? ''} ${bump ? 'bump' : ''}`}>{formatNumber(value)}</span>;
}

const TOOLS = [
  { id: 'broom', icon: '🧹', name: 'Balai', unlocked: true },
  { id: 'duster', icon: '🪶', name: 'Plumeau', unlocked: false },
  { id: 'sponge', icon: '🧽', name: 'Éponge', unlocked: false },
  { id: 'vacuum', icon: '🌀', name: 'Aspirateur', unlocked: false },
  { id: 'blower', icon: '💨', name: 'Souffleur', unlocked: false },
];

function Hud({ game }: { game: Game }) {
  const clean = store.cleanliness.value;
  const pct = Math.floor(clean * 100);
  const lvl = store.comboLevel.value;
  return (
    <div class="hud">
      <div class="top-bar">
        <div class="panel coins-panel tilt-l">
          <span class="coin-icon">🪙</span>
          <Bouncy value={store.coins.value} class="coins" />
          <span class="rate">+{formatNumber(store.coinsPerSecond.value)}/s</span>
        </div>

        <div class="panel room-panel tilt-r">
          <span class="room-name">{store.roomName.value}</span>
          <div class="clean-bar" title="Propreté de la pièce">
            <div class="clean-fill" style={{ width: `${clean * 100}%` }} />
            <div class="clean-star" style={{ left: `${CLEAN_THRESHOLD * 100}%` }}>
              {store.roomCleanedOnce.value ? '⭐' : '☆'}
            </div>
          </div>
          <span class="clean-pct">{pct}%</span>
        </div>

        <button class="btn btn-icon" onClick={() => game.toggleMute()} title="Son">
          {store.muted.value ? '🔇' : '🔊'}
        </button>
      </div>

      <div class="bottom-bar">
        <div class="panel tools tilt-r">
          {TOOLS.map((t, k) => (
            <div class={`tool ${t.unlocked ? 'active' : 'locked'}`} title={t.unlocked ? t.name : 'Pas encore débloqué'}>
              <span class="tool-icon">{t.unlocked ? t.icon : '?'}</span>
              <span class="tool-key">{k + 1}</span>
            </div>
          ))}
        </div>

        <div class={`panel combo tilt-l combo-lvl-${lvl}`}>
          <span class="combo-label">Combo</span>
          <span class="combo-mult">×{store.comboMultiplier.value.toString().replace('.', ',')}</span>
          <div class="combo-bar">
            <div class="combo-fill" style={{ width: `${store.comboFill.value * 100}%` }} />
          </div>
        </div>

        <button class="btn btn-shop" disabled title="Arrive à la prochaine étape !">
          🛒 Boutique <small>bientôt !</small>
        </button>
      </div>
    </div>
  );
}

function Toasts() {
  return (
    <div class="toasts">
      {store.toasts.value.map((t) => (
        <div class="toast" key={t.id}>
          <strong>{t.title}</strong>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
