import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game';
import { CLEAN_THRESHOLD } from '../game';
import { formatNumber } from '../core/format';
import * as store from '../state/store';
import { SkillTree } from './SkillTree';
import { STAIRS } from '../data/rooms';
import { TOOLS } from '../data/dirtTypes';
import { ROOM_STORY, THRONE_SOUVENIRS } from '../data/story';
import { ROOMS } from '../data/rooms';
import { sfx } from '../audio/synth';
import { QUALITY_HINTS, QUALITY_LABELS, QUALITY_ORDER, type QualitySetting } from '../render/quality';
import { ACHIEVEMENTS } from '../data/achievements';
import { DIRT_ORDER, DIRT_TYPES } from '../data/dirtTypes';

export function App({ game }: { game: Game }) {
  return (
    <>
      {store.started.value ? <Hud game={game} /> : <TitleScreen game={game} />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <Crosshair />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <DoorPrompt />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && store.benchPrompt.value && (
        <div class="door-prompt ok bench-prompt">
          <span class="lock">🛠️</span>
          <div>
            <strong>L'établi de Gustave</strong>
            <span><kbd>E</kbd> Ouvrir l'Arbre des Souvenirs</span>
          </div>
        </div>
      )}
      {store.started.value && store.dialogue.value && <DialogueBubble key={store.dialogue.value.id} line={store.dialogue.value} />}
      {store.started.value && store.mapOpen.value && <CastleMap game={game} />}
      {store.started.value && store.treeOpen.value && <SkillTree game={game} />}
      {store.prestigeConfirm.value && <PrestigeConfirm game={game} />}
      {store.albumOpen.value && <Album game={game} />}
      {store.journalOpen.value && <Journal game={game} />}
      {store.cinematic.value && <div class="letterbox"><div /><div /></div>}
      {store.credits.value && <Credits />}
      {store.started.value && store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <PauseScreen game={game} />}
      {store.started.value && store.tip.value && !store.paused.value && !store.treeOpen.value && <div class="tip" key={store.tip.value.id}><span>{store.tip.value.icon}</span><p>{store.tip.value.text}</p></div>}
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
        {store.offlineReport.value && <OfflineReport />}
        <SettingsButton />
        <GpuWarning />
        <Controls />
      </div>
    </div>
  );
}

function duration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.max(1, m)} min`;
}

/** « Pendant ton absence… » : ce que les assistants ont ramassé. */
function OfflineReport() {
  const r = store.offlineReport.value!;
  return (
    <div class="offline-report">
      <strong>💤 Pendant ton absence ({duration(r.seconds)})…</strong>
      <span>
        tes assistants ont ramassé <b>{formatNumber(r.coins)} 🪙</b>
        {r.counted < r.seconds && <em> (ils se sont arrêtés au bout de {duration(r.counted)} : améliore « Longue nuit » dans l'arbre)</em>}
      </span>
    </div>
  );
}

/** Confirmation du Grand Ménage : ce qu'on garde, ce qui repart à zéro. */
function PrestigeConfirm({ game }: { game: Game }) {
  const close = () => (store.prestigeConfirm.value = false);
  return (
    <div class="settings-backdrop" onClick={close}>
      <div class="settings-card prestige-card" onClick={(e) => e.stopPropagation()}>
        <h2>✨ Le Grand Ménage</h2>
        <p class="prestige-story">
          Les saisons passent. Le château se rendort, la poussière retombe partout… mais Plume, lui, n'oublie rien.
        </p>
        <div class="prestige-gain">
          +{formatNumber(store.prestigeGain.value)} Étincelles <small>(chacune : +1 % de valeur pour toujours)</small>
        </div>
        <div class="prestige-cols">
          <div>
            <strong>Repart de zéro</strong>
            <ul>
              <li>🪙 Pièces</li>
              <li>🌳 Nœuds payés en pièces</li>
              <li>🚪 Pièces du château (sauf les combles)</li>
              <li>🧹 La poussière revient partout</li>
            </ul>
          </div>
          <div>
            <strong>Tu gardes</strong>
            <ul>
              <li>✨ Étincelles et anneau doré</li>
              <li>⭐ Pièces impeccables</li>
              <li>📜 Souvenirs et histoire</li>
              <li>⚙️ Réglages</li>
            </ul>
          </div>
        </div>
        <div class="prestige-buttons">
          <button class="btn" onClick={close}>Pas maintenant</button>
          <button class="btn btn-prestige" onClick={() => { close(); game.grandMenage(); }}>✨ Lancer le Grand Ménage</button>
        </div>
      </div>
    </div>
  );
}

/** L'album des souvenirs (touche J) : les souvenirs trouvés, et les échos du passé à revoir. */
function Album({ game }: { game: Game }) {
  const [open, setOpen] = useState<string | null>(null);
  const found = new Set(game.foundSouvenirs());
  const echoes = new Set(game.seenEchoes());
  const all = ROOMS.map((r) => ({ room: r, story: ROOM_STORY[r.id] })).filter((x) => x.story);
  const sel = open ? all.flatMap((x) => x.story!.souvenirs).find((s) => s.id === open) : null;
  return (
    <div class="settings-backdrop" onClick={() => game.toggleAlbum()}>
      <div class="settings-card album-card" onClick={(e) => e.stopPropagation()}>
        <h2>📜 L'album des souvenirs</h2>
        <p class="album-count">
          {found.size} / {all.length * 3} souvenirs · La Salle du trône s'ouvre avec {THRONE_SOUVENIRS} souvenirs.
        </p>
        <div class="album-grid">
          {all.map(({ room, story }) => (
            <div class="album-room" key={room.id}>
              <strong>{room.name}</strong>
              <div class="album-slots">
                {story!.souvenirs.map((s) => (
                  <button key={s.id} class={`album-slot ${found.has(s.id) ? 'found' : ''}`} disabled={!found.has(s.id)} onClick={() => setOpen(s.id)} title={found.has(s.id) ? s.name : '???'}>
                    {found.has(s.id) ? s.icon : '?'}
                  </button>
                ))}
                {echoes.has(room.id) && (
                  <button class="album-echo" onClick={() => { game.toggleAlbum(); game.replayEcho(story!.echo.lines); }} title="Revoir l'écho du passé">
                    ✨
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {sel && (
          <div class="album-read">
            <strong>{sel.icon} {sel.name}</strong>
            <p>{sel.text}</p>
          </div>
        )}
        <button class="btn" onClick={() => game.toggleAlbum()}>Fermer (J)</button>
      </div>
    </div>
  );
}

/** Générique de fin. */
function Credits() {
  return (
    <div class="title-screen credits">
      <div class="title-card">
        <h1 class="logo"><span class="w1">Fin</span></h1>
        <p class="tagline">Élise est revenue. Mouton aussi. Et le château se souvient.</p>
        <p class="credits-list">
          <b>Dust It Alone</b><br />
          Une histoire de poussière, de souvenirs et d'un petit plumeau.<br /><br />
          Merci d'avoir joué ! 🧹✨
        </p>
        <button class="btn btn-big" onClick={() => (store.credits.value = false)}>Continuer à faire le ménage</button>
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
      <span><kbd>J</kbd> album des souvenirs</span>
      <span><kbd>K</kbd> carnet et succès</span>
      <span><kbd>1</kbd>…<kbd>5</kbd> changer d'outil</span>
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
        <div class="pause-row">
          <SettingsButton />
          <button class="btn btn-settings" onClick={() => game.toggleAlbum()}>📜 Album (J)</button>
          <button class="btn btn-settings" onClick={() => game.toggleJournal()}>📊 Carnet (K)</button>
        </div>
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
    <button class="btn btn-settings" onClick={() => (store.settingsOpen.value = true)} title={`Graphismes : ${label}`}>
      ⚙️ Réglages
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

type SettingsTab = 'graphics' | 'controls' | 'sound' | 'save';

function SettingsPanel({ game }: { game: Game }) {
  const [tab, setTab] = useState<SettingsTab>('graphics');
  const close = () => (store.settingsOpen.value = false);
  const tabs: [SettingsTab, string][] = [['graphics', '🖼️ Graphismes'], ['controls', '🖱️ Contrôles'], ['sound', '🔊 Son'], ['save', '💾 Sauvegarde']];
  return (
    <div class="settings-backdrop" onClick={close}>
      <div class="settings-card" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ Réglages</h2>
        <div class="settings-tabs">
          {tabs.map(([id, label]) => (
            <button key={id} class={`settings-tab ${tab === id ? 'selected' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {tab === 'graphics' && <GraphicsSettings game={game} />}
        {tab === 'controls' && <ControlSettings game={game} />}
        {tab === 'sound' && <SoundSettings game={game} />}
        {tab === 'save' && <SaveSettings game={game} />}
        <button class="btn" onClick={close}>OK</button>
      </div>
    </div>
  );
}

function GraphicsSettings({ game }: { game: Game }) {
  const options: QualitySetting[] = ['auto', ...QUALITY_ORDER];
  const s = store.settings.value;
  return (
    <>
      <div class="quality-list">
        {options.map((q) => (
          <button key={q} class={`quality-option ${store.qualitySetting.value === q ? 'selected' : ''}`} onClick={() => game.setQuality(q)}>
            <span class="q-name">
              {QUALITY_LABELS[q]}
              {q === 'auto' && store.qualitySetting.value === 'auto' && <small> (en ce moment : {QUALITY_LABELS[store.qualityLevel.value]})</small>}
            </span>
            <span class="q-hint">{QUALITY_HINTS[q]}</span>
          </button>
        ))}
      </div>
      <Slider label="Champ de vision" value={s.fov} min={55} max={100} step={1} show={(v) => `${v}°`} onInput={(v) => game.setSetting('fov', v)} />
      <Toggle label="Balancement de la tête en marchant" checked={s.headBob} onChange={(v) => game.setSetting('headBob', v)} />
      <label class="toggle">
        <input type="checkbox" checked={store.showFps.value} onChange={() => game.toggleFps()} />
        Afficher les FPS
      </label>
      <p class="settings-fps">
        Actuellement : <strong>{Math.round(store.fps.value)} FPS</strong>
        {store.gpuName.value && <span class="gpu-name">Carte graphique : {store.gpuName.value}</span>}
      </p>
    </>
  );
}

function ControlSettings({ game }: { game: Game }) {
  const s = store.settings.value;
  return (
    <>
      <Slider label="Sensibilité de la souris" value={s.sensitivity} min={0.2} max={3} step={0.05} show={(v) => `×${v.toFixed(2)}`} onInput={(v) => game.setSetting('sensitivity', v)} />
      <Toggle label="Inverser la souris (haut / bas)" checked={s.invertY} onChange={(v) => game.setSetting('invertY', v)} />
      <Controls />
    </>
  );
}

function SoundSettings({ game }: { game: Game }) {
  const s = store.settings.value;
  return (
    <>
      <Slider label="Volume général" value={s.volume} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)} %`} onInput={(v) => game.setSetting('volume', v)} />
      <Toggle label="Voix des personnages (petits bips)" checked={s.voices} onChange={(v) => game.setSetting('voices', v)} />
      <Toggle label="Couper tout le son" checked={store.muted.value} onChange={() => game.toggleMute()} />
      <p class="settings-note">🎵 La musique arrive bientôt !</p>
    </>
  );
}

function SaveSettings({ game }: { game: Game }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [wipe, setWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div class="save-panel">
      <p>Ta partie est sauvegardée automatiquement dans ce navigateur. Pour la garder ailleurs (autre PC, autre navigateur), exporte-la :</p>
      <div class="save-buttons">
        <button class="btn btn-settings" onClick={() => game.downloadSave()}>⬇️ Télécharger un fichier</button>
        <button class="btn btn-settings" onClick={() => { const c = game.exportCode(); setCode(c); navigator.clipboard?.writeText(c).then(() => setMsg('Code copié dans le presse-papiers ✔'), () => setMsg('Copie le code ci-dessous.')); }}>📋 Copier un code</button>
      </div>
      <textarea class="save-code" placeholder="Colle ici un code de sauvegarde (DUST1:…) pour le charger" value={code} onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} />
      <div class="save-buttons">
        <button class="btn btn-settings" onClick={() => { if (!game.loadCode(code)) setMsg('Ce code ne ressemble pas à une sauvegarde 😕'); }} disabled={!code.trim()}>⬆️ Charger ce code</button>
        <button class="btn btn-settings" onClick={() => fileRef.current?.click()}>📂 Charger un fichier</button>
        <input ref={fileRef} type="file" accept=".txt,.json" style={{ display: 'none' }} onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f && !game.loadCode(await f.text())) setMsg('Ce fichier ne ressemble pas à une sauvegarde 😕');
        }} />
      </div>
      {msg && <p class="settings-note">{msg}</p>}
      <div class="save-danger">
        {wipe ? (
          <>
            <strong>Tout effacer ? C'est définitif !</strong>
            <button class="btn btn-danger" onClick={() => game.wipeSave()}>Oui, recommencer à zéro</button>
            <button class="btn btn-settings" onClick={() => setWipe(false)}>Non !</button>
          </>
        ) : (
          <button class="btn btn-settings" onClick={() => setWipe(true)}>🗑️ Effacer la partie…</button>
        )}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, show, onInput }: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onInput: (v: number) => void }) {
  return (
    <label class="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))} />
      <strong>{show(value)}</strong>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      {label}
    </label>
  );
}

/** Le carnet : statistiques et succès. */
function Journal({ game }: { game: Game }) {
  const [tab, setTab] = useState<'stats' | 'achievements'>('achievements');
  const ctx = game.achievementContext();
  const st = ctx.save.stats;
  const done = new Set(store.achievements.value);
  const hours = Math.floor(st.playTime / 3600);
  const mins = Math.floor((st.playTime % 3600) / 60);
  const rows: [string, string][] = [
    ['⏱️ Temps de jeu', `${hours} h ${String(mins).padStart(2, '0')}`],
    ['🧹 Grains ramassés', formatNumber(ctx.grains)],
    ['🪙 Pièces gagnées au total', formatNumber(ctx.save.totalCoins)],
    ['📈 Meilleur gain', `${formatNumber(st.bestRate)} / s`],
    ['🚪 Pièces ouvertes', `${ctx.unlockedRooms} / ${ROOMS.length}`],
    ['✨ Pièces impeccables', `${ctx.cleanedRooms} / ${ROOMS.length}`],
    ['📜 Souvenirs', `${ctx.save.souvenirs.length}`],
    ['🌳 Niveaux achetés', formatNumber(st.levelsBought)],
    ['🥾 Distance parcourue', `${(st.walked / 1000).toFixed(2)} km`],
    ['🎲 Événements', formatNumber(st.events)],
    ['🌟 Grands Ménages', formatNumber(ctx.save.prestiges)],
  ];
  return (
    <div class="settings-backdrop" onClick={() => game.toggleJournal()}>
      <div class="settings-card journal-card" onClick={(e) => e.stopPropagation()}>
        <h2>📊 Le carnet de Plume</h2>
        <div class="settings-tabs">
          <button class={`settings-tab ${tab === 'achievements' ? 'selected' : ''}`} onClick={() => setTab('achievements')}>🏆 Succès ({done.size} / {ACHIEVEMENTS.length})</button>
          <button class={`settings-tab ${tab === 'stats' ? 'selected' : ''}`} onClick={() => setTab('stats')}>📊 Statistiques</button>
        </div>
        {tab === 'stats' ? (
          <div class="journal-stats">
            <table>
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
            <div class="journal-grains">
              {DIRT_ORDER.filter((d) => (st.grains[d] ?? 0) > 0).map((d) => (
                <span key={d}>{DIRT_TYPES[d].name} : <strong>{formatNumber(st.grains[d] ?? 0)}</strong></span>
              ))}
            </div>
          </div>
        ) : (
          <div class="achievement-grid">
            {ACHIEVEMENTS.map((a) => {
              const ok = done.has(a.id);
              const p = ok ? 1 : a.progress(ctx);
              return (
                <div key={a.id} class={`achievement ${ok ? 'done' : ''}`}>
                  <span class="ach-icon">{ok ? a.icon : '🔒'}</span>
                  <div>
                    <strong>{a.name}</strong>
                    <span>{a.text}</span>
                    {!ok && <div class="ach-bar"><div style={{ width: `${Math.round(p * 100)}%` }} /></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button class="btn" onClick={() => game.toggleJournal()}>Fermer (K)</button>
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
          {d.need ? (
            <>{d.need}</>
          ) : d.affordable ? (
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
