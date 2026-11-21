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
import { REALISTIC } from '../render/realistic';
import { PLAYER_COLORS } from '../net/multiplayer';
import { DIRT_ORDER, DIRT_TYPES } from '../data/dirtTypes';

export function App({ game }: { game: Game }) {
  return (
    <>
      {store.started.value ? !store.treeOpen.value && <Hud game={game} /> : <TitleScreen game={game} />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <Crosshair />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <DoorPrompt />}
      {store.started.value && !store.paused.value && !store.mapOpen.value && !store.treeOpen.value && !store.inventoryOpen.value && store.chestPrompt.value && (
        <div class="door-prompt ok bench-prompt">
          <span class="lock">🧰</span>
          <div>
            <strong>Le coffre des combles</strong>
            <span><kbd>E</kbd> Ouvrir : ranger tes outils</span>
          </div>
        </div>
      )}
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
      {store.netOpen.value && <NetScreen game={game} />}
      {store.inventoryOpen.value && <Inventory game={game} />}
      {store.recoverOpen.value && <RecoverPanel game={game} />}
      {store.started.value && store.net.value.role !== 'off' && !store.netOpen.value && <NetHud />}
      {store.netRequests.value.length > 0 && <NetRequest game={game} />}
      {store.cinematic.value && <div class="letterbox"><div /><div /></div>}
      {store.credits.value && <Credits />}
      {store.started.value && store.paused.value && !store.mapOpen.value && !store.treeOpen.value && <PauseScreen game={game} />}
      {store.started.value && store.tip.value && !store.paused.value && !store.treeOpen.value && <DustuceTip key={store.tip.value.id} icon={store.tip.value.icon} text={store.tip.value.text} />}
      <Toasts />
      {store.debugInfo.value && <div class="debug">{store.debugInfo.value}</div>}
      {store.showFps.value && !store.debugInfo.value && <div class="fps-counter">{Math.round(store.fps.value)} FPS</div>}
      {store.settingsOpen.value && <SettingsPanel game={game} />}
      {store.creditsPanel.value && (
        <div class="settings-backdrop" onClick={() => (store.creditsPanel.value = false)}>
          <div class="settings-card" onClick={(e) => e.stopPropagation()}>
            <h2>🎬 Crédits</h2>
            <CreditsList />
            <button class="btn" onClick={() => (store.creditsPanel.value = false)}>Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}

function TitleScreen({ game }: { game: Game }) {
  const worlds = store.worlds.value;
  const [creating, setCreating] = useState(false);
  return (
    <div class="title-screen">
      <div class="title-card worlds-card">
        <h1 class="logo">
          <span class="w1">Dust</span> <span class="w2">It</span> <span class="w3">Alone</span>
        </h1>
        <p class="tagline">Un vieux château. Beaucoup trop de poussière. Un seul balai.</p>
        {store.offlineReport.value && <OfflineReport />}
        {worlds.length === 0 || creating ? (
          <NewWorldForm game={game} first={worlds.length === 0} onCancel={worlds.length ? () => setCreating(false) : undefined} />
        ) : (
          <>
            <h2 class="worlds-title">🏰 Tes mondes</h2>
            <ul class="worlds">
              {worlds.map((w) => (
                <WorldCard key={w.id} game={game} w={w} />
              ))}
            </ul>
            <button class="btn btn-settings new-world" onClick={() => setCreating(true)}>＋ Nouveau monde</button>
          </>
        )}
        <div class="pause-row">
          <button class="btn btn-settings" onClick={() => game.toggleNet()}>👥 Rejoindre un ami</button>
          <SettingsButton />
          <button class="btn btn-settings" onClick={() => (store.recoverOpen.value = true)}>🛟 Une partie a disparu ?</button>
          <button class="btn btn-settings" onClick={() => (store.creditsPanel.value = true)}>🎬 Crédits</button>
        </div>
        <GpuWarning />
        <Controls />
      </div>
    </div>
  );
}

function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400 * 2) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} jours`;
}

function WorldCard({ game, w }: { game: Game; w: import('../save/save').WorldMeta }) {
  const [rename, setRename] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const loaded = w.id === store.currentWorld.value;
  return (
    <li class={`world ${loaded ? 'loaded' : ''}`}>
      <div class="world-main">
        {rename !== null ? (
          <input class="world-rename" value={rename} maxLength={32} autoFocus onInput={(e) => setRename((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { game.renameWorldTo(w.id, rename); setRename(null); } if (e.key === 'Escape') setRename(null); }}
            onBlur={() => { game.renameWorldTo(w.id, rename); setRename(null); }} />
        ) : (
          <strong>{w.name}</strong>
        )}
        <span class="world-badges">
          <span class={`world-badge ${w.multiplayer ? 'mp' : ''}`}>{w.multiplayer ? (w.isPublic ? '👥 Multijoueur public' : '👥 Multijoueur privé') : '🧹 Solo'}</span>
        </span>
        <small>🪙 {formatNumber(w.coins)} · 🚪 {w.rooms}/14 pièces · 📜 {w.souvenirs} souvenirs · {ago(w.lastPlayed)}</small>
      </div>
      <div class="world-actions">
        {confirm ? (
          <>
            <span class="world-confirm">Effacer « {w.name} » ?</span>
            <button class="btn btn-danger btn-small" onClick={() => game.removeWorld(w.id)}>Oui</button>
            <button class="btn btn-settings btn-small" onClick={() => setConfirm(false)}>Non</button>
          </>
        ) : (
          <>
            <button class="btn btn-big btn-play" onClick={() => game.playWorld(w.id)}>▶ Jouer</button>
            <button class="btn btn-settings btn-small" title="Renommer" onClick={() => setRename(w.name)}>✏️</button>
            <button class="btn btn-settings btn-small" title="Effacer ce monde" onClick={() => setConfirm(true)}>🗑️</button>
          </>
        )}
      </div>
    </li>
  );
}

function NewWorldForm({ game, first, onCancel }: { game: Game; first: boolean; onCancel?: () => void }) {
  const [name, setName] = useState(first ? 'Mon château' : `Château n°${store.worlds.value.length + 1}`);
  const [mp, setMp] = useState(false);
  const [pub, setPub] = useState(true);
  return (
    <div class="new-world-form">
      <h2 class="worlds-title">{first ? '🏰 Ton premier monde' : '🏰 Nouveau monde'}</h2>
      <label class="nw-name">
        Nom du monde
        <input value={name} maxLength={32} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <label class="toggle nw-toggle">
        <input type="checkbox" checked={mp} onChange={(e) => setMp((e.target as HTMLInputElement).checked)} />
        <span>👥 Ouvrir ce monde au multijoueur <small>Tes amis peuvent venir t’aider : l’argent et les améliorations sont partagés.</small></span>
      </label>
      {mp && (
        <div class="nw-public">
          <label><input type="radio" checked={pub} onChange={() => setPub(true)} /> Public (visible dans la liste des parties)</label>
          <label><input type="radio" checked={!pub} onChange={() => setPub(false)} /> Privé (seulement avec le code)</label>
        </div>
      )}
      <p class="nw-hint">Tu pourras changer ça plus tard : Échap → Réglages → Monde.</p>
      <div class="pause-row">
        <button class="btn btn-big" onClick={() => game.newWorld(name, mp, pub)}>{first ? 'Au boulot !' : 'Créer et jouer'}</button>
        {onCancel && <button class="btn btn-settings" onClick={onCancel}>Annuler</button>}
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
        <CreditsList />
        <p class="credits-list">Merci d'avoir joué ! 🧹✨</p>
        <button class="btn btn-big" onClick={() => (store.credits.value = false)}>Continuer à faire le ménage</button>
      </div>
    </div>
  );
}

// ───────────────────────────── Récupérer une partie ─────────────────────────────

function RecoverPanel({ game }: { game: Game }) {
  const saves = game.foundSaves();
  const close = () => (store.recoverOpen.value = false);
  const date = (t: number) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div class="settings-backdrop" onClick={close}>
      <div class="settings-card recover-card" onClick={(e) => e.stopPropagation()}>
        <h2>🛟 Récupérer une partie</h2>
        <p class="chest-help">Voici toutes les sauvegardes de Dust It Alone trouvées dans ce navigateur, y compris les copies de secours. « Restaurer » en fait un <b>nouveau monde</b> : rien n’est écrasé.</p>
        {saves.length === 0 ? (
          <p class="settings-note">Aucune sauvegarde trouvée dans ce navigateur. Si tu jouais sur une autre adresse (par exemple dust-it-alone.vercel.app au lieu de dustitalone.vercel.app), un autre navigateur ou une fenêtre de navigation privée, ta partie y est peut-être encore.</p>
        ) : (
          <ul class="recover-list">
            {saves.map((s) => (
              <li key={s.key}>
                <div>
                  <strong>{s.name}</strong> <span class={`world-badge ${s.kind === 'monde' ? '' : 'mp'}`}>{s.kind}</span>
                  <small>🪙 {formatNumber(s.coins)} en poche · {formatNumber(s.totalCoins)} gagnées · 🚪 {s.rooms}/14 · 🌳 {s.levels} niveaux · 📜 {s.souvenirs}{s.prestiges ? ` · ✨ ${s.prestiges} Grand(s) Ménage(s)` : ''} · {date(s.savedAt)}</small>
                </div>
                <button class="btn btn-settings" onClick={() => game.restoreSave(s.key)}>Restaurer</button>
              </li>
            ))}
          </ul>
        )}
        <p class="chest-help">Toujours pas ta partie ? Télécharge ce fichier et envoie-le au développeur : il contient toutes les sauvegardes de ce navigateur, il pourra la reconstruire.</p>
        <div class="pause-row">
          <button class="btn btn-settings" onClick={() => game.downloadAllSaves()}>📤 Télécharger toutes mes sauvegardes</button>
          <button class="btn" onClick={close}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Coffre (inventaire) ─────────────────────────────

/** Le coffre des combles : tous les outils, et la barre rapide de 3 cases à remplir. */
function Inventory({ game }: { game: Game }) {
  const bar = store.hotbar.value;
  const slot = store.inventorySlot.value;
  const unlocked = store.unlockedTools.value;
  const [drag, setDrag] = useState<string | null>(null);
  const place = (k: number, id: string) => game.setHotbarSlot(k, id);
  return (
    <div class="settings-backdrop" onClick={() => game.toggleInventory()}>
      <div class="settings-card chest-card" onClick={(e) => e.stopPropagation()}>
        <h2>🧰 Le coffre des combles</h2>
        <p class="chest-help">Choisis une case de ta barre, puis clique sur un outil pour l’y ranger (ou fais-le glisser). Tu en portes 3 sur toi ; les autres restent bien au chaud ici.</p>
        <h3>Ta barre (touches 1 à 3)</h3>
        <div class="chest-bar">
          {bar.map((id, k) => {
            const t = TOOLS.find((x) => x.id === id);
            return (
              <button
                key={k}
                class={`chest-slot ${slot === k ? 'selected' : ''} ${t ? '' : 'empty'}`}
                onClick={() => (store.inventorySlot.value = k)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drag && place(k, drag)}
                title={t ? t.name : 'Case vide'}
              >
                <span class="tool-icon">{t?.icon ?? '＋'}</span>
                {t?.id === 'widebroom' && <span class="tool-xl">XL</span>}
                <span class="tool-key">{k + 1}</span>
                <small>{t?.name ?? 'vide'}</small>
                {t && (
                  <span class="chest-remove" title="Remettre dans le coffre" onClick={(e) => { e.stopPropagation(); place(k, ''); }}>✕</span>
                )}
              </button>
            );
          })}
        </div>
        <h3>Dans le coffre</h3>
        <div class="chest-grid">
          {TOOLS.map((t, i) => {
            const ok = unlocked[i];
            const inBar = bar.indexOf(t.id);
            return (
              <button
                key={t.id}
                class={`chest-item ${ok ? '' : 'locked'} ${inBar >= 0 ? 'in-bar' : ''}`}
                disabled={!ok}
                draggable={ok}
                onDragStart={() => setDrag(t.id)}
                onDragEnd={() => setDrag(null)}
                onClick={() => ok && place(slot, t.id)}
                title={ok ? t.hint : 'À débloquer dans l’Arbre des Souvenirs'}
              >
                <span class="tool-icon">{ok ? t.icon : '?'}</span>
                {ok && t.id === 'widebroom' && <span class="tool-xl">XL</span>}
                <strong>{ok ? t.name : '???'}</strong>
                <small>{ok ? t.hint : 'À débloquer dans l’Arbre des Souvenirs'}</small>
                {inBar >= 0 && <span class="chest-badge">case {inBar + 1}</span>}
              </button>
            );
          })}
        </div>
        <button class="btn" onClick={() => game.toggleInventory()}>Fermer (E)</button>
      </div>
    </div>
  );
}

// ───────────────────────────── Multijoueur ─────────────────────────────

function pingClass(ms: number): string {
  return ms <= 0 ? '' : ms < 80 ? 'good' : ms < 180 ? 'ok' : 'bad';
}

function Ping({ ms, host }: { ms: number; host?: boolean }) {
  if (host) return <span class="ping host">hôte</span>;
  return <span class={`ping ${pingClass(ms)}`}>{ms > 0 ? `${ms} ms` : '…'}</span>;
}

function PlayerList() {
  const n = store.net.value;
  return (
    <ul class="net-players">
      {n.players.map((p) => (
        <li key={p.slot}>
          <span class="net-dot" style={{ background: p.color }} />
          <span class="net-name">{p.name}{p.me ? ' (toi)' : ''}</span>
          <Ping ms={p.ping} host={p.slot === 0} />
        </li>
      ))}
    </ul>
  );
}

/** L'écran multijoueur : profil, parties en ligne, rejoindre avec un code, héberger. */
function NetScreen({ game }: { game: Game }) {
  const n = store.net.value;
  const [name, setName] = useState(n.profile.name);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const net = game.net;
  const saveName = () => net.setProfile({ name, color: n.profile.color });
  return (
    <div class="settings-backdrop" onClick={() => game.toggleNet()}>
      <div class="settings-card net-card" onClick={(e) => e.stopPropagation()}>
        <h2>👥 Multijoueur</h2>
        <div class="net-profile">
          <label>
            Ton pseudo
            <input value={name} maxLength={16} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
          </label>
          <div class="net-colors">
            {PLAYER_COLORS.map((c) => (
              <button key={c} class={`net-color ${n.profile.color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => net.setProfile({ name, color: c })} title="Ta couleur" />
            ))}
          </div>
        </div>

        {n.role === 'off' && (
          <>
            <section class="net-section">
              <h3>🌍 Parties en ligne <small class={`lobby-${n.lobby}`}>{n.lobby === 'online' ? '● connecté' : n.lobby === 'connecting' ? '● recherche…' : '● hors ligne'}</small></h3>
              {n.games.length === 0 ? (
                <p class="net-empty">{n.lobby === 'online' ? 'Aucune partie ouverte pour l’instant. Héberge la tienne, tes amis la verront ici !' : 'Recherche des parties…'}</p>
              ) : (
                <ul class="net-games">
                  {n.games.map((g) => (
                    <li key={g.code}>
                      <div>
                        <strong>Château de {g.host}</strong>
                        <small>{g.place} · {g.rooms} pièce{g.rooms > 1 ? 's' : ''} ouvertes</small>
                      </div>
                      <span class="net-count">{g.players}/{g.max}</span>
                      <button class="btn btn-settings" disabled={g.players >= g.max} onClick={() => { saveName(); void net.join(g.code); }}>
                        {g.players >= g.max ? 'Complet' : 'Demander à rejoindre'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section class="net-section net-row">
              <div>
                <h3>🔑 Rejoindre avec un code</h3>
                <div class="net-join">
                  <input placeholder="ABCDE" value={code} maxLength={8} onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && code && (saveName(), void net.join(code))} />
                  <button class="btn btn-settings" disabled={!code.trim()} onClick={() => { saveName(); void net.join(code); }}>Envoyer la demande</button>
                </div>
              </div>
              <div>
                <h3>🏰 Inviter des amis chez moi</h3>
                <p class="net-empty">Ouvre ton monde au multijoueur : l’argent et les améliorations y sont partagés.</p>
                {store.started.value ? (
                  <button class="btn btn-big" onClick={() => { saveName(); game.setWorldMultiplayer(true, n.isPublic); }}>Ouvrir « {store.world.value.name} »</button>
                ) : (
                  <p class="net-empty">Lance un monde « 👥 Multijoueur » depuis l’écran d’accueil (ou ouvre-le dans Échap → Réglages → Monde).</p>
                )}
              </div>
            </section>
          </>
        )}

        {n.role === 'host' && (
          <section class="net-section">
            <h3>🏰 Ta partie est ouverte</h3>
            <div class="net-code">
              <span>Code</span>
              <strong>{n.code}</strong>
              <button class="btn btn-settings" onClick={() => { navigator.clipboard?.writeText(n.code); setCopied(true); }}>{copied ? '✔ Copié' : '📋 Copier'}</button>
            </div>
            <p class="net-empty">{n.isPublic ? 'Elle apparaît dans la liste des parties en ligne.' : 'Partie privée : donne le code à tes amis.'} Tu valides chaque demande (touche O pour accepter, N pour refuser). 4 joueurs au maximum.</p>
            <label class="toggle">
              <input type="checkbox" checked={n.isPublic} onChange={(e) => game.setWorldMultiplayer(true, (e.target as HTMLInputElement).checked)} />
              Visible dans la liste des parties
            </label>
            <PlayerList />
            <button class="btn btn-settings" onClick={() => game.setWorldMultiplayer(false, n.isPublic)}>Fermer ce monde au multijoueur</button>
          </section>
        )}

        {n.role === 'guest' && (
          <section class="net-section">
            <h3>{n.visiting ? '🏰 Tu joues chez un ami' : '⏳ Demande envoyée'}</h3>
            {n.visiting && <PlayerList />}
            <button class="btn btn-settings" onClick={() => net.leave('Tu as quitté la partie.')}>{n.visiting ? 'Rentrer dans mon château' : 'Annuler la demande'}</button>
          </section>
        )}

        {n.status && <p class="net-status">{n.status}</p>}
        <p class="net-note">Connexion directe entre joueurs (pair-à-pair). Dans un monde partagé, l’argent et les améliorations sont ceux du monde de l’hôte ; tes propres mondes ne sont pas touchés.</p>
        <button class="btn" onClick={() => game.toggleNet()}>Fermer (P)</button>
      </div>
    </div>
  );
}

/** En jeu : les joueurs connectés et leur ping. */
function NetHud() {
  const n = store.net.value;
  return (
    <div class="panel net-hud">
      <div class="net-hud-title">{n.role === 'host' ? <>👥 Ta partie · code <strong>{n.code}</strong></> : '👥 Partie à plusieurs'}</div>
      <PlayerList />
    </div>
  );
}

/** Côté hôte : quelqu'un demande à rejoindre. */
function NetRequest({ game }: { game: Game }) {
  const r = store.netRequests.value[0];
  return (
    <div class="net-request">
      <span class="net-dot" style={{ background: r.color }} />
      <div>
        <strong>{r.name}</strong> veut rejoindre ta partie
        <div class="net-request-buttons">
          <button class="btn btn-settings" onClick={() => game.net.answer(r.slot, true)}>✔ Accepter (O)</button>
          <button class="btn btn-settings" onClick={() => game.net.answer(r.slot, false)}>✖ Refuser (N)</button>
        </div>
      </div>
    </div>
  );
}

/** Qui a fait quoi. */
function CreditsList() {
  return (
    <div class="credits-list">
      <p><b>Dust It Alone</b><br />Une histoire de poussière, de souvenirs et d'un petit plumeau.</p>
      <dl>
        <dt>Idée, direction et tests</dt><dd>Le créateur du jeu</dd>
        <dt>Code, 3D, histoire et sons</dt><dd>Claude (Anthropic)</dd>
        <dt>Musique</dt><dd>« Poussière oubliée », par le créateur du jeu</dd>
        <dt>Moteur 3D</dt><dd>three.js</dd>
        <dt>Interface</dt><dd>Preact et Vite</dd>
        <dt>Polices</dt><dd>Lilita One et Nunito (Google Fonts, licence OFL)</dd>
        <dt>Sons</dt><dd>Tous synthétisés en direct avec Web Audio</dd>
      </dl>
      <p>Inspiré par les jeux de ménage incrémentaux comme <i>Leaf It Alone</i>.</p>
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
      <span><kbd>P</kbd> multijoueur</span>
      <span><kbd>1</kbd>…<kbd>3</kbd> barre d'outils (le reste dans le coffre)</span>
      <span><kbd>Échap</kbd> pause</span>
    </div>
  );
}

function PauseScreen({ game }: { game: Game }) {
  return (
    <div class="title-screen">
      <div class="title-card pause-card">
        <h2 class="pause-title">Pause</h2>
        <p class="pause-world">🏰 {store.world.value.name}{store.net.value.role === 'host' ? <> · 👥 code <strong>{store.net.value.code}</strong></> : store.net.value.visiting ? ' · 👥 chez un ami' : ''}</p>
        <p class="tagline">La poussière t'attend. Elle est patiente.</p>
        <button class="btn btn-big" onClick={() => game.start()}>Reprendre le ménage</button>
        <div class="pause-row">
          <SettingsButton />
          <button class="btn btn-settings" onClick={() => game.toggleAlbum()}>📜 Album (J)</button>
          <button class="btn btn-settings" onClick={() => game.toggleJournal()}>📊 Carnet (K)</button>
          <button class="btn btn-settings" onClick={() => game.toggleNet()}>👥 Multijoueur (P)</button>
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

type SettingsTab = 'world' | 'graphics' | 'controls' | 'sound' | 'save';

function SettingsPanel({ game }: { game: Game }) {
  const [tab, setTab] = useState<SettingsTab>(store.started.value ? 'world' : 'graphics');
  const close = () => (store.settingsOpen.value = false);
  const tabs: [SettingsTab, string][] = [['world', '🌍 Monde'], ['graphics', '🖼️ Graphismes'], ['controls', '🖱️ Contrôles'], ['sound', '🔊 Son'], ['save', '💾 Sauvegarde']];
  return (
    <div class="settings-backdrop" onClick={close}>
      <div class="settings-card" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ Réglages</h2>
        <div class="settings-tabs">
          {tabs.map(([id, label]) => (
            <button key={id} class={`settings-tab ${tab === id ? 'selected' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {tab === 'world' && <WorldSettings game={game} />}
        {tab === 'graphics' && <GraphicsSettings game={game} />}
        {tab === 'controls' && <ControlSettings game={game} />}
        {tab === 'sound' && <SoundSettings game={game} />}
        {tab === 'save' && <SaveSettings game={game} />}
        <button class="btn" onClick={close}>OK</button>
      </div>
    </div>
  );
}

/** Réglages du monde : son nom et le multijoueur (argent et améliorations partagés). */
function WorldSettings({ game }: { game: Game }) {
  const w = store.world.value;
  const n = store.net.value;
  const [name, setName] = useState(w.name);
  if (n.visiting) return <p class="settings-note">Tu joues dans le monde d’un ami : seuls ses réglages comptent. Pour revenir chez toi : touche P → « Rentrer dans mon château ».</p>;
  return (
    <div class="world-settings">
      <label class="nw-name">
        Nom du monde
        <input value={name} maxLength={32} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => game.renameWorldTo(store.currentWorld.value, name)} onKeyDown={(e) => e.key === 'Enter' && game.renameWorldTo(store.currentWorld.value, name)} />
      </label>
      <label class="toggle nw-toggle">
        <input type="checkbox" checked={w.multiplayer} onChange={(e) => game.setWorldMultiplayer((e.target as HTMLInputElement).checked, w.isPublic)} />
        <span>👥 Ouvrir ce monde au multijoueur <small>Tes amis peuvent venir t’aider : l’argent et les améliorations sont partagés. Tu acceptes chaque demande (O / N).</small></span>
      </label>
      {w.multiplayer && (
        <div class="nw-public">
          <label><input type="radio" checked={w.isPublic} onChange={() => game.setWorldMultiplayer(true, true)} /> Public (visible dans la liste des parties)</label>
          <label><input type="radio" checked={!w.isPublic} onChange={() => game.setWorldMultiplayer(true, false)} /> Privé (seulement avec le code)</label>
        </div>
      )}
      {n.role === 'host' && (
        <div class="net-code">
          <span>Code</span>
          <strong>{n.code}</strong>
          <button class="btn btn-settings" onClick={() => navigator.clipboard?.writeText(n.code)}>📋 Copier</button>
        </div>
      )}
      {n.role === 'host' && <PlayerList />}
      {w.multiplayer && n.role !== 'host' && <p class="settings-note">{store.started.value ? (n.status || 'Ouverture de la partie…') : 'La partie s’ouvrira quand tu entreras dans ce monde.'}</p>}
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
      <div class="style-switch">
        <span>Style graphique</span>
        <div class="style-buttons">
          <button class={`style-option ${!REALISTIC ? 'selected' : ''}`} onClick={() => REALISTIC && game.setRealistic(false)}>
            🎨 Dessin
          </button>
          <button class={`style-option ${REALISTIC ? 'selected' : ''}`} onClick={() => !REALISTIC && game.setRealistic(true)}>
            📷 Réaliste
          </button>
        </div>
        <small>Changer de style recharge la page (ta partie est sauvegardée). Le mode réaliste est un peu plus gourmand.</small>
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
      <Slider label="Musique" value={s.music} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)} %`} onInput={(v) => game.setSetting('music', v)} />
      <p class="settings-note">🎵 Musique : « Poussière oubliée »</p>
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
        <button class="btn btn-settings" onClick={() => { if (!game.loadCode(code)) setMsg('Code refusé : ce n’est pas une sauvegarde valide (ou elle a été modifiée à la main) 😕'); }} disabled={!code.trim()}>⬆️ Charger ce code</button>
        <button class="btn btn-settings" onClick={() => fileRef.current?.click()}>📂 Charger un fichier</button>
        <input ref={fileRef} type="file" accept=".txt,.json" style={{ display: 'none' }} onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f && !game.loadCode(await f.text())) setMsg('Fichier refusé : ce n’est pas une sauvegarde valide (ou elle a été modifiée à la main) 😕');
        }} />
      </div>
      {msg && <p class="settings-note">{msg}</p>}
      <button class="btn btn-settings" onClick={() => (store.recoverOpen.value = true)}>🛟 Récupérer une partie (copies de secours)</button>
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

const LEVELS = [800, 400, 0, -400, -800];
const LEVEL_COLOR: Record<number, string> = { 800: '#e8c86a', 400: '#c99a5a', 0: '#9fbfa0', [-400]: '#a7a3c9', [-800]: '#8a8a9a' };

/** L'étage le plus proche d'une hauteur (le joueur peut être dans un escalier). */
function levelOf(y: number): number {
  return LEVELS.reduce((best, l) => (Math.abs(l - y) < Math.abs(best - y) ? l : best), LEVELS[0]);
}

/** Carte du château vue de dessus, un étage à la fois (sinon les étages se dessinaient les uns sur les autres). */
function CastleMap({ game }: { game: Game }) {
  const rooms = store.castle.value;
  const p = store.playerPos.value;
  const myLevel = levelOf(p.y);
  const [level, setLevel] = useState(myLevel);
  if (rooms.length === 0) return null;
  // Les étages qui ont au moins une pièce connue (ouverte, ou fermée mais visible derrière une porte).
  const here = rooms.filter((r) => r.level === level);
  const stairs = STAIRS.filter((st) => Math.min(st.yAtMin, st.yAtMax) === level || Math.max(st.yAtMin, st.yAtMax) === level);
  // Cadrage sur l'étage choisi.
  const pad = 400;
  const xs = [...here.map((r) => r.x), ...stairs.map((s) => s.rect.x)];
  const xe = [...here.map((r) => r.x + r.w), ...stairs.map((s) => s.rect.x + s.rect.w)];
  const zs = [...here.map((r) => r.z), ...stairs.map((s) => s.rect.y)];
  const ze = [...here.map((r) => r.z + r.h), ...stairs.map((s) => s.rect.y + s.rect.h)];
  const minX = Math.min(...xs) - pad;
  const minZ = Math.min(...zs) - pad;
  const w = Math.max(...xe) + pad - minX;
  const h = Math.max(...ze) + pad - minZ;
  // Tailles de texte et de flèche proportionnelles à la carte (lisibles quel que soit l'étage).
  const u = Math.max(w, h * 1.6) / 100;
  const meVisible = myLevel === level;
  return (
    <div class="settings-backdrop" onClick={() => game.toggleMap()}>
      <div class="settings-card map-card" onClick={(e) => e.stopPropagation()}>
        <h2>🗺️ Le château</h2>
        <div class="settings-tabs map-tabs">
          {LEVELS.map((l) => (
            <button key={l} class={`settings-tab ${level === l ? 'selected' : ''}`} style={{ background: level === l ? LEVEL_COLOR[l] : undefined }} onClick={() => setLevel(l)}>
              {LEVEL_NAMES[l]}
              {l === myLevel ? ' 📍' : ''}
            </button>
          ))}
        </div>
        <svg class="castle-map" viewBox={`${minX} ${minZ} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
          {stairs.map((st) => {
            const up = Math.min(st.yAtMin, st.yAtMax) === level;
            const cx = st.rect.x + st.rect.w / 2;
            const cz = st.rect.y + st.rect.h / 2;
            return (
              <g key={st.id}>
                <rect x={st.rect.x} y={st.rect.y} width={st.rect.w} height={st.rect.h} class="map-stair" style={{ strokeWidth: u * 0.35 }} />
                <text x={cx} y={cz + u * 1.3} class="map-stair-label" style={{ fontSize: u * 3.4 }}>
                  {up ? '▲' : '▼'}
                </text>
              </g>
            );
          })}
          {here.map((r) => (
            <g key={r.id}>
              <rect x={r.x} y={r.z} width={r.w} height={r.h} rx={u} class={`map-room ${r.unlocked ? '' : 'locked'}`} style={{ fill: r.unlocked ? LEVEL_COLOR[r.level] : undefined, strokeWidth: u * 0.5 }} />
              {r.unlocked && <rect x={r.x} y={r.z + r.h - u * 1.6} width={r.w * Math.max(0, Math.min(1, r.clean))} height={u * 1.6} class="map-clean" />}
              <text x={r.x + r.w / 2} y={r.z + r.h / 2} class="map-label" style={{ fontSize: Math.min(u * 4.2, (r.w / 7) * 1.1) }}>
                {r.unlocked ? (SHORT_NAMES[r.id] ?? r.name) : 'Fermée'}
              </text>
              <text x={r.x + r.w / 2} y={r.z + r.h / 2 + u * 4} class="map-sub" style={{ fontSize: Math.min(u * 2.8, r.w / 9) }}>
                {r.unlocked ? `${Math.floor(r.clean * 100)} %${r.cleaned ? ' · impeccable' : ''}` : `${formatNumber(r.price)} pièces`}
              </text>
            </g>
          ))}
          {meVisible && (
            <g transform={`translate(${p.x} ${p.z}) rotate(${(-p.yaw * 180) / Math.PI}) scale(${u / 40})`}>
              <circle r={160} class="map-me-halo" />
              <path d="M0,-150 L95,105 L0,50 L-95,105 Z" class="map-me" />
            </g>
          )}
        </svg>
        <p class="map-help">
          {meVisible ? 'La flèche rouge, c’est toi. ' : `Tu es à l’étage « ${LEVEL_NAMES[myLevel]} ». `}▲ escalier qui monte · ▼ escalier qui descend · la barre bleue montre la propreté de chaque pièce.
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

/** Dustuce, le grain de poussière qui donne des conseils. */
function DustuceTip({ icon, text }: { icon: string; text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= text.length) return;
    const ch = text[shown];
    const pause = /[.!?…]/.test(ch) ? 220 : /[,;:]/.test(ch) ? 100 : 26;
    const t = setTimeout(() => {
      if (shown % 2 === 0) sfx.voice(760, ch);
      setShown(shown + 1);
    }, pause);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <div class="tip">
      <div class="dustuce" aria-hidden="true">
        <span class="dustuce-eye" />
        <span class="dustuce-eye" />
        <span class="dustuce-icon">{icon}</span>
      </div>
      <div class="tip-body">
        <span class="tip-name">Dustuce</span>
        <p>
          {text.slice(0, shown)}
          <span class="dialogue-rest">{text.slice(shown)}</span>
        </p>
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
          {store.hotbar.value.map((id, k) => {
            const t = TOOLS.find((x) => x.id === id);
            const active = !!t && TOOLS[store.selectedTool.value]?.id === id;
            return (
              <div
                key={k}
                class={`tool ${t ? (active ? 'active' : '') : 'empty'} ${store.toolShake.value?.index === k ? 'shake-' + (Math.floor(store.toolShake.value.at) % 2) : ''}`}
                title={t ? `${t.name} : ${t.hint}` : 'Case vide : range un outil ici depuis le coffre des combles'}
              >
                <span class="tool-icon">{t ? t.icon : ''}</span>
                {t?.id === 'widebroom' && <span class="tool-xl">XL</span>}
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
