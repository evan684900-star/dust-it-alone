import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game';
import { CLEAN_THRESHOLD } from '../game';
import { formatNumber } from '../core/format';
import * as store from '../state/store';
import { SkillTree } from './SkillTree';
import { STAIRS } from '../data/rooms';
import { TOOLS } from '../data/dirtTypes';
import { sfx } from '../audio/synth';
import { QUALITY_HINTS, QUALITY_LABELS, QUALITY_ORDER, type QualitySetting } from '../render/quality';

export function App({ game }: { game: Game }) {
  return (
    <>
      {store.started.value ? <Hud game={game} /> : <TitleScreen game={game} />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <Crosshair />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <DoorPrompt />}
      {store.started.value && store.dialogue.value && <DialogueBubble key={store.dialogue.value.id} line={store.dialogue.value} />}
      {store.started.value && store.mapOpen.value && <CastleMap game={game} />}
      {store.started.value && store.treeOpen.value && <SkillTree game={game} />}
      {store.started.value && store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <PauseScreen game={game} />}
      <Toasts />
      {store.debugInfo.value && <div class="debug">{store.debugInfo.value}</div>}
      {store.showFps.value && !store.debugInfo.value && <div class="fps-counter">{Math.round(store.fps.value)} FPS</div>}
      {store.settingsOpen.value && <SettingsPanel game={game} />}
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
        <SettingsButton />
        <GpuWarning />
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
      <span><kbd>clic maintenu</kbd> balayer</span>
      <span><kbd>B</kbd> arbre des souvenirs</span>
      <span><kbd>Maj</kbd> courir</span>
      <span><kbd>E</kbd> ouvrir une porte</span>
      <span><kbd>M</kbd> carte du château</span>
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
        <SettingsButton />
        <GpuWarning />
        <Controls />
      </div>
    </div>
  );
}

function SettingsButton() {
  const s = store.qualitySetting.value;
  const label = s === 'auto' ? `Auto · ${QUALITY_LABELS[store.qualityLevel.value]}` : QUALITY_LABELS[s];
  return (
    <button class="btn btn-settings" onClick={() => (store.settingsOpen.value = true)}>
      ⚙️ Graphismes : {label}
    </button>
  );
}

function GpuWarning() {
  if (!store.gpuWarning.value) return null;
  return (
    <div class="gpu-warning">
      <strong>⚠️ Ton navigateur n'utilise pas ta carte graphique</strong>
      <span>
        Le jeu est alors très lent. Dans Chrome ou Edge, ouvre les paramètres → <em>Système</em> → active
        « Utiliser l'accélération graphique », puis redémarre le navigateur. La qualité a été mise au minimum en attendant.
      </span>
    </div>
  );
}

function SettingsPanel({ game }: { game: Game }) {
  const options: QualitySetting[] = ['auto', ...QUALITY_ORDER];
  const close = () => (store.settingsOpen.value = false);
  return (
    <div class="settings-backdrop" onClick={close}>
      <div class="settings-card" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ Graphismes</h2>
        <div class="quality-list">
          {options.map((q) => (
            <button
              key={q}
              class={`quality-option ${store.qualitySetting.value === q ? 'selected' : ''}`}
              onClick={() => game.setQuality(q)}
            >
              <span class="q-name">
                {QUALITY_LABELS[q]}
                {q === 'auto' && store.qualitySetting.value === 'auto' && (
                  <small> (en ce moment : {QUALITY_LABELS[store.qualityLevel.value]})</small>
                )}
              </span>
              <span class="q-hint">{QUALITY_HINTS[q]}</span>
            </button>
          ))}
        </div>
        <label class="toggle">
          <input type="checkbox" checked={store.showFps.value} onChange={() => game.toggleFps()} />
          Afficher les FPS
        </label>
        <p class="settings-fps">
          Actuellement : <strong>{Math.round(store.fps.value)} FPS</strong>
          {store.gpuName.value && <span class="gpu-name">Carte graphique : {store.gpuName.value}</span>}
        </p>
        <button class="btn" onClick={close}>OK</button>
      </div>
    </div>
  );
}

function DoorPrompt() {
  const d = store.doorPrompt.value;
  if (!d) return null;
  return (
    <div class={`door-prompt ${d.affordable ? 'ok' : 'nope'}`}>
      <span class="lock">🔒</span>
      <div>
        <strong>{d.name}</strong>
        <span>
          {d.affordable ? (
            <>
              <kbd>E</kbd> Ouvrir pour {formatNumber(d.price)} 🪙
            </>
          ) : (
            <>Il faut {formatNumber(d.price)} 🪙 (encore {formatNumber(d.price - store.coins.value)})</>
          )}
        </span>
      </div>
    </div>
  );
}

const SHORT_NAMES: Record<string, string> = {
  attic: 'Combles', gallery: 'Galerie', library: 'Bibliothèque', bedroom: 'Chambre', hall: 'Grand Hall', kitchen: 'Cuisines',
  banquet: 'Banquets', chapel: 'Chapelle', courtyard: 'Cour', cellar: 'Caves', dungeon: 'Cachots', clocktower: 'Horloge', ramparts: 'Remparts', throne: 'Trône',
};
const LEVEL_NAMES: Record<number, string> = { 800: 'Tours', 400: 'Combles', 0: 'Étage', [-400]: 'Rez-de-chaussée', [-800]: 'Sous-sol' };

/** Carte du château vue de dessus, avec les étages en couleurs. */
function CastleMap({ game }: { game: Game }) {
  const rooms = store.castle.value;
  if (rooms.length === 0) return null;
  const pad = 200;
  const minX = Math.min(...rooms.map((r) => r.x)) - pad;
  const minZ = Math.min(...rooms.map((r) => r.z)) - pad;
  const maxX = Math.max(...rooms.map((r) => r.x + r.w)) + pad;
  const maxZ = Math.max(...rooms.map((r) => r.z + r.h)) + pad;
  const p = store.playerPos.value;
  const levelColor: Record<number, string> = { 800: '#e8c86a', 400: '#c99a5a', 0: '#9fbfa0', [-400]: '#a7a3c9', [-800]: '#8a8a9a' };
  return (
    <div class="settings-backdrop" onClick={() => game.toggleMap()}>
      <div class="settings-card map-card" onClick={(e) => e.stopPropagation()}>
        <h2>🗺️ Le château</h2>
        <svg class="castle-map" viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}>
          {/* Escaliers */}
          {STAIRS.map((st) => (
            <rect key={st.id} x={st.rect.x} y={st.rect.y} width={st.rect.w} height={st.rect.h} class="map-stair" />
          ))}
          {rooms.map((r) => (
            <g key={r.id}>
              <rect x={r.x} y={r.z} width={r.w} height={r.h} rx={40} class={`map-room ${r.unlocked ? '' : 'locked'}`} style={{ fill: r.unlocked ? levelColor[r.level] : undefined }} />
              {r.unlocked && <rect x={r.x} y={r.z + r.h - 60} width={r.w * Math.max(0, Math.min(1, r.clean))} height={60} class="map-clean" />}
              <text x={r.x + r.w / 2} y={r.z + r.h / 2 - 40} class="map-label">
                {r.unlocked ? (SHORT_NAMES[r.id] ?? r.name) : '🔒 ' + formatNumber(r.price) + ' 🪙'}
              </text>
              <text x={r.x + r.w / 2} y={r.z + r.h / 2 + 230} class="map-sub">
                {r.unlocked ? `${LEVEL_NAMES[r.level] ?? ''} · ${Math.floor(r.clean * 100)} %${r.cleaned ? ' ⭐' : ''}` : '???'}
              </text>
            </g>
          ))}
          {/* Le joueur : une flèche dans la direction du regard. */}
          <g transform={`translate(${p.x} ${p.z}) rotate(${(-p.yaw * 180) / Math.PI})`}>
            <circle r={110} class="map-me-halo" />
            <path d="M0,-130 L80,90 L0,40 L-80,90 Z" class="map-me" />
          </g>
        </svg>
        <p class="map-help">
          Les couleurs indiquent l'étage : <span class="chip" style={{ background: levelColor[400] }}>Combles</span>
          <span class="chip" style={{ background: levelColor[0] }}>Étage</span>
          <span class="chip" style={{ background: levelColor[-400] }}>Rez-de-chaussée</span>
          <span class="chip" style={{ background: levelColor[-800] }}>Sous-sol</span>
          <span class="chip" style={{ background: levelColor[800] }}>Tours</span>
        </p>
        <button class="btn" onClick={() => game.toggleMap()}>Fermer (M)</button>
      </div>
    </div>
  );
}

/**
 * Bulle de dialogue : le texte s'écrit lettre par lettre, avec un petit bip
 * synthétique par lettre (la « voix » du personnage). Clic, Espace ou Entrée
 * pour accélérer puis passer à la suite.
 */
function DialogueBubble({ line }: { line: store.DialogueLine }) {
  const [shown, setShown] = useState(0);
  const done = shown >= line.text.length;
  useEffect(() => {
    if (done) {
      const t = setTimeout(() => store.nextDialogue(), 2600 + line.text.length * 25);
      return () => clearTimeout(t);
    }
    const ch = line.text[shown];
    const pause = /[.!?…]/.test(ch) ? 260 : /[,;:]/.test(ch) ? 120 : 32;
    const t = setTimeout(() => {
      if (shown % 2 === 0) sfx.voice(line.voice, ch);
      setShown(shown + 1);
    }, pause);
    return () => clearTimeout(t);
  }, [shown, done]);
  const advance = () => (done ? store.nextDialogue() : setShown(line.text.length));
  // Espace / Entrée pendant l'écriture : on affiche tout d'un coup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !done) {
        e.stopImmediatePropagation();
        setShown(line.text.length);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [done]);
  return (
    <div class={`dialogue ${line.thought ? 'thought' : ''}`} onClick={advance}>
      <span class="dialogue-name">{line.speaker}</span>
      <p>
        {line.text.slice(0, shown)}
        <span class="dialogue-rest">{line.text.slice(shown)}</span>
      </p>
      {done && <span class="dialogue-next">▼</span>}
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



function Hud({ game }: { game: Game }) {
  const clean = store.cleanliness.value;
  const pct = Math.floor(clean * 100);
  return (
    <div class="hud">
      <div class="top-bar">
        <div class="panel coins-panel tilt-l">
          <span class="coin-icon">🪙</span>
          <Bouncy value={store.coins.value} class="coins" />
          <span class="rate">+{formatNumber(store.coinsPerSecond.value)}/s</span>
        </div>

        <div class="panel room-panel tilt-r">
          <span class="room-name">{store.placeName.value || store.roomName.value}</span>
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
          {TOOLS.map((t, k) => {
            const unlocked = store.unlockedTools.value[k];
            return (
            <div
              key={t.id}
              class={`tool ${unlocked ? (store.selectedTool.value === k ? 'active' : '') : 'locked'} ${store.toolShake.value?.index === k ? 'shake-' + (Math.floor(store.toolShake.value.at) % 2) : ''}`}
              title={unlocked ? `${t.name} : ${t.hint}` : 'À débloquer dans l’Arbre des Souvenirs'}
            >
              <span class="tool-icon">{unlocked ? t.icon : '?'}</span>
              <span class="tool-key">{k + 1}</span>
            </div>
            );
          })}
        </div>

        {store.vacuum.value && (
          <div class={`panel vacuum-gauge tilt-l ${store.vacuum.value.load >= store.vacuum.value.cap ? 'full' : ''}`}>
            <span>🌀 Réservoir</span>
            <div class="vac-bar"><div style={{ width: `${(100 * store.vacuum.value.load) / store.vacuum.value.cap}%` }} /></div>
            <small>{store.vacuum.value.load >= store.vacuum.value.cap ? 'Plein ! Va le vider à une pelle (E)' : `${store.vacuum.value.load} / ${store.vacuum.value.cap}`}</small>
          </div>
        )}
        <button class={`btn btn-shop ${store.treeBuyable.value ? 'has-buy' : ''}`} onClick={() => game.toggleTree()} title="L'Arbre des Souvenirs (B)">
          🌳 Arbre <small>touche B</small>
          {store.treeBuyable.value && <span class="buy-dot">!</span>}
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
