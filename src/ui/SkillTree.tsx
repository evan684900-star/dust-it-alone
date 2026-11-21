import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Game } from '../game';
import { BRANCHES, GOLD_RING_DEPTH, NODE_BY_ID, TREE_NODES, type TreeNode } from '../data/tree';
import { ROOMS } from '../data/rooms';
import { availability, canRefund, cost, costForN, maxAffordable, revealed, level as lvlOf, type Availability } from '../economy/tree';
import { formatNumber } from '../core/format';
import { sfx } from '../audio/synth';
import * as store from '../state/store';
import { SvgIcon } from './icons';

const RING = 150;
const SIDE = 95;

/** Position d'un nœud : angle de sa branche + distance à la racine + décalage sur le côté. */
function nodePos(n: TreeNode): { x: number; y: number } {
  const a = (((n.angle ?? BRANCHES[n.branch].angle) as number) * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const side = (n.side ?? 0) * SIDE;
  return { x: dx * n.depth * RING + Math.cos(a) * side, y: dy * n.depth * RING + Math.sin(a) * side };
}
const POS = new Map(TREE_NODES.map((n) => [n.id, nodePos(n)]));

type NodeState = 'hidden' | 'locked' | 'poor' | 'buyable' | 'partial' | 'maxed';

function stateOf(n: TreeNode, av: Availability, lvl: number, coins: number, isRevealed: boolean): NodeState {
  if (lvl >= n.maxLevel) return 'maxed';
  if (!isRevealed && lvl === 0) return 'hidden';
  const canTry = av.ok || (!av.ok && av.reason === 'fork');
  if (!canTry) return lvl > 0 ? 'partial' : 'locked';
  return cost(n, lvl) <= coins ? 'buyable' : lvl > 0 ? 'partial' : 'poor';
}

/** Arc d'anneau (segment de niveau). */
function arc(r: number, a0: number, a1: number): string {
  const p = (a: number) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

/** Pièces affichées en direct (petit composant à part : lui seul se redessine à chaque grain). */
function LiveCoins() {
  return (
    <div class="tree-coins">
      🪙 {formatNumber(store.coins.value)} <small>+{formatNumber(store.coinsPerSecond.value)}/s</small>
    </div>
  );
}

const tf = (v: { x: number; y: number; k: number }) => `translate(${v.x} ${v.y}) scale(${v.k})`;

export function SkillTree({ game }: { game: Game }) {
  const levels = store.treeLevels.value;
  const unlocked = store.unlockedRooms.value;
  // L'argent change à chaque grain : l'arbre ne se recalcule que 4 fois par seconde (sinon ça rame).
  const [coins, setCoins] = useState(store.coins.peek());
  useEffect(() => {
    const t = setInterval(() => setCoins(store.coins.peek()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setCoins(store.coins.peek()), [levels]);
  const st = useMemo(() => ({ levels, roomUnlocked: (id: string) => unlocked.includes(id) }), [levels, unlocked]);
  const [selected, setSelected] = useState<string>('broom-wide-1');
  const [hovered, setHovered] = useState<string | null>(null);
  // Vue (déplacement / zoom) : appliquée directement à l'image, sans tout redessiner.
  const view = useRef({ x: 0, y: 0, k: 0.6 });
  /** Vue réellement dessinée dans le SVG (la « vue » ci-dessus peut être en avance pendant un geste). */
  const drawn = useRef({ x: 0, y: 0, k: 0.6 });
  const commitTimer = useRef(0);
  /** Pixels par unité du dessin (mesuré une fois, puis à chaque redimensionnement : lire la taille à chaque mouvement ferait ramer). */
  const pxPerUnit = useRef(0.6);
  useEffect(() => {
    const measure = () => {
      const svg = svgRef.current;
      if (svg) pxPerUnit.current = Math.min(svg.clientWidth / 1520, svg.clientHeight / 1280) || 0.6;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const gRef = useRef<SVGGElement>(null);
  const setView = (v: { x: number; y: number; k: number } | ((v: { x: number; y: number; k: number }) => { x: number; y: number; k: number })) => {
    view.current = typeof v === 'function' ? v(view.current) : v;
    // Pendant le geste, on déplace l'image déjà dessinée (la carte graphique le fait presque gratuitement)…
    const svg = svgRef.current;
    if (svg) {
      const s = pxPerUnit.current;
      const r = view.current.k / drawn.current.k;
      const tx = s * (view.current.x - r * drawn.current.x);
      const ty = s * (view.current.y - r * drawn.current.y);
      svg.style.transform = `translate(${tx}px, ${ty}px) scale(${r})`;
    }
    // … et on ne redessine l'arbre, net, qu'une fois le geste terminé.
    clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      drawn.current = { ...view.current };
      gRef.current?.setAttribute('transform', tf(drawn.current));
      if (svgRef.current) svgRef.current.style.transform = '';
    }, 220);
  };
  void GOLD_RING_DEPTH;
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Molette : zoom.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.max(0.12, Math.min(2.2, v.k * (e.deltaY > 0 ? 0.9 : 1.1))) }));
  };
  useEffect(() => {
    const el = svgRef.current;
    el?.addEventListener('wheel', onWheel, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') setView({ x: 0, y: 0, k: 0.6 });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Seuls les nœuds achetés ou achetables maintenant sont visibles : les autres « poussent » plus tard.
  const goldOn = store.sparks.value > 0 || store.prestiges.value > 0;
  const wallet = (n: TreeNode) => (n.currency === 'sparks' ? store.sparks.value : coins);
  // Disponibilité de chaque nœud : calculée une fois par changement (pas à chaque image).
  const avs = useMemo(() => new Map(TREE_NODES.map((n) => [n.id, availability(n, st)])), [st]);
  const visible = useMemo(
    () =>
      new Set(
        TREE_NODES.filter((n) => {
          if (n.branch === 'gold') return goldOn;
          if ((levels[n.id] ?? 0) > 0) return true;
          const av = avs.get(n.id)!;
          return av.ok || (!av.ok && av.reason === 'fork');
        }).map((n) => n.id),
      ),
    [avs, levels, goldOn],
  );
  const hiddenCount = TREE_NODES.length - visible.size;
  const focusId = [hovered, selected].find((id) => id && visible.has(id)) ?? [...visible][0] ?? 'broom-wide-1';
  const focus = NODE_BY_ID.get(focusId)!;
  const rootActive = TREE_NODES.some((n) => (levels[n.id] ?? 0) > 0);

  // Le dessin de l'arbre (centaines de nœuds) n'est refait que si quelque chose a changé.
  const graph = useMemo(
    () => (
      <>
          <circle r={1500} fill="url(#tree-glow)" />
          {/* Anneaux de profondeur : plus on s'éloigne de Plume, plus c'est cher */}
          {[2, 4, 6, 8].map((d) => <circle key={d} r={d * RING} class="tree-ring" />)}
          {goldOn && <circle r={GOLD_RING_DEPTH * RING} class="tree-gold-ring" />}
          {/* Étiquettes des branches */}
          {(Object.keys(BRANCHES) as (keyof typeof BRANCHES)[]).filter((b) => TREE_NODES.some((n) => n.branch === b && visible.has(n.id))).map((b) => {
            const a = (BRANCHES[b].angle * Math.PI) / 180;
            const r = b === 'helpers' ? 330 : 1480;
            const ang = a;
            return (
              <g key={b} transform={`translate(${(Math.sin(ang) * r).toFixed(1)} ${(-Math.cos(ang) * r).toFixed(1)})`}>
                <SvgIcon e={BRANCHES[b].icon} x={0} y={-62} size={60} />
                <text class="tree-branch-label" fill={BRANCHES[b].color}>
                  {BRANCHES[b].name}
                </text>
              </g>
            );
          })}

          {/* Liens (la « sève » coule le long des chemins achetés) */}
          {TREE_NODES.filter((n) => visible.has(n.id)).map((n) => {
            const p = POS.get(n.id)!;
            const parents = (n.parents.length ? n.parents : n.branch === 'gold' ? [] : ['__root']).filter((pid) => pid === '__root' || visible.has(pid));
            const lvl = levels[n.id] ?? 0;
            const av = avs.get(n.id)!;
            return parents.map((pid) => {
              const q = pid === '__root' ? { x: 0, y: 0 } : POS.get(pid)!;
              const cls = lvl > 0 ? 'lit' : av.ok ? 'open' : 'dim';
              return <line key={n.id + pid} class={`tree-link ${cls} ${n.kind === 'junction' ? 'junction' : ''}`} x1={q.x} y1={q.y} x2={p.x} y2={p.y} style={{ stroke: lvl > 0 ? BRANCHES[n.branch].color : undefined }} />;
            });
          })}

          {/* Racine : Plume */}
          <g class={`tree-root ${rootActive ? 'active' : ''}`}>
            <circle r={58} />
            <SvgIcon e="🌳" x={0} y={-8} size={52} />
            <text class="tree-root-name" y={34}>Plume</text>
          </g>

          {/* Nœuds (les nouveaux arrivent en « poussant ») */}
          {TREE_NODES.filter((n) => visible.has(n.id)).map((n) => {
            const p = POS.get(n.id)!;
            const lvl = levels[n.id] ?? 0;
            const av = avs.get(n.id)!;
            const state = stateOf(n, av, lvl, wallet(n), revealed(n, st));
            const color = BRANCHES[n.branch].color;
            const R = n.kind === 'big' ? 34 : n.kind === 'junction' ? 26 : 28;
            const isSel = n.id === selected;
            return (
              <g
                key={n.id}
                class={`tree-node ${state} ${n.kind} ${isSel ? 'selected' : ''}`}
                transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                onPointerEnter={() => {
                  // Pendant qu'on fait glisser l'arbre, on ne réagit pas au survol (sinon ça rame).
                  if (drag.current?.moved) return;
                  setHovered(n.id);
                  sfx.hover();
                }}
                onPointerLeave={() => !drag.current?.moved && setHovered(null)}
                onContextMenu={(e) => {
                  // Clic droit : rembourser un niveau.
                  e.preventDefault();
                  setSelected(n.id);
                  game.refundNode(n.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (drag.current?.moved) return;
                  if (selected === n.id) game.buyNode(n.id, 1);
                  else setSelected(n.id);
                }}
              >
                <g class="node-pop">
                {n.kind === 'small' ? (
                  <circle r={R} class="shape" style={{ '--c': color } as never} />
                ) : (
                  <rect x={-R * 0.78} y={-R * 0.78} width={R * 1.56} height={R * 1.56} rx={8} transform="rotate(45)" class="shape" style={{ '--c': color } as never} />
                )}
                {/* Anneau des niveaux */}
                {n.maxLevel > 1 &&
                  Array.from({ length: n.maxLevel }, (_, k) => {
                    const gap = 0.12;
                    const a0 = (k / n.maxLevel) * Math.PI * 2 + gap / 2;
                    const a1 = ((k + 1) / n.maxLevel) * Math.PI * 2 - gap / 2;
                    return <path key={k} d={arc(R + 8, a0, a1)} class={`lvl-seg ${k < lvl ? 'on' : ''}`} style={{ stroke: k < lvl ? color : undefined }} />;
                  })}
                {state === 'hidden' ? (
                  <text class="tree-icon" y={9}>?</text>
                ) : (
                  <g class="tree-icon">
                    <SvgIcon e={n.icon} x={0} y={0} size={n.kind === 'big' ? R * 1.45 : R * 1.35} />
                  </g>
                )}
                {state === 'maxed' && (
                  <g class="tree-flower">
                    <SvgIcon e="🌼" x={R * 0.75} y={-R * 0.75} size={22} />
                  </g>
                )}
                {n.requires && 'soon' in n.requires && <text class="tree-soon" y={R + 26}>bientôt</text>}
                </g>
              </g>
            );
          })}
      </>
    ),
    [levels, avs, visible, coins, selected, goldOn, store.sparks.value, rootActive],
  );

  return (
    <div class="tree-screen">
      <div class="tree-header">
        <h2>🌳 L'Arbre des Souvenirs</h2>
        <LiveCoins />
        {goldOn && <div class="tree-coins sparks">✨ {formatNumber(store.sparks.value)} <small>+{store.sparks.value} % de valeur</small></div>}
        {goldOn && (
          <button class="btn tree-ring-btn" onClick={() => setView({ x: 0, y: 0, k: 0.17 })}>
            Voir l'anneau doré
          </button>
        )}
        {(store.prestigeReady.value || store.prestiges.value > 0) && (
          <button class="btn btn-prestige" disabled={!store.prestigeReady.value} onClick={() => (store.prestigeConfirm.value = true)}>
            ✨ Grand Ménage <small>+{formatNumber(store.prestigeGain.value)} Étincelles</small>
          </button>
        )}
        <button class="btn tree-close" onClick={() => game.toggleTree()}>Fermer (B)</button>
      </div>

      <svg
        ref={svgRef}
        class="tree-svg"
        viewBox="-760 -640 1520 1280"
        onPointerDown={(e) => {
          // Pas de capture de la souris ici : sinon le clic n'arriverait jamais jusqu'au nœud.
          drag.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const sc = 1 / pxPerUnit.current / view.current.k;
          const dx = (e.clientX - d.x) * sc;
          const dy = (e.clientY - d.y) * sc;
          if (!d.moved && Math.abs(dx) + Math.abs(dy) > 6) {
            // On glisse vraiment : maintenant seulement, on capture la souris pour déplacer l'arbre.
            d.moved = true;
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          }
          if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
        }}
        onPointerUp={() => {
          // Le clic du nœud passe juste après : on garde l'info « a glissé » le temps de ce clic.
          const d = drag.current;
          setTimeout(() => {
            if (drag.current === d) drag.current = null;
          }, 0);
        }}
      >
        <defs>
          <radialGradient id="tree-glow">
            <stop offset="0" stop-color="#fff3c4" stop-opacity="0.35" />
            <stop offset="1" stop-color="#fff3c4" stop-opacity="0" />
          </radialGradient>
        </defs>
        <g ref={gRef} transform={tf(drawn.current)}>
          {graph}
        </g>
      </svg>

      <TreeDetail game={game} node={focus} st={st} coins={focus.currency === 'sparks' ? store.sparks.value : coins} />

      <div class="tree-legend">
        <span><b class="lg-small" /> petit nœud (plusieurs niveaux)</span>
        <span><b class="lg-big" /> grand nœud (déblocage)</span>
        <span><b class="lg-junction" /> jonction entre deux branches</span>
        <span>🌱 {hiddenCount} souvenirs encore cachés : ils poussent quand tu achètes ce qui les précède</span>
        <span>Clic : choisir · re-clic : acheter · clic droit : rembourser · glisser : se déplacer · molette : zoom · Espace : recentrer</span>
      </div>
    </div>
  );
}

function reasonText(av: Availability): string {
  if (av.ok) return '';
  switch (av.reason) {
    case 'parents': return `Demande d'abord : ${av.detail}`;
    case 'room': return `Ouvre d'abord : ${ROOMS.find((r) => r.id === av.detail)?.name ?? av.detail}`;
    case 'soon': return 'Bientôt dans le jeu !';
    case 'fork': return `Remplace « ${av.detail} » (remboursé)`;
    case 'max': return '';
  }
}

function TreeDetail({ game, node, st, coins }: { game: Game; node: TreeNode; st: { levels: Record<string, number>; roomUnlocked: (id: string) => boolean }; coins: number }) {
  const lvl = lvlOf(st.levels, node.id);
  const av = availability(node, st);
  const canTry = av.ok || (!av.ok && av.reason === 'fork');
  const maxed = lvl >= node.maxLevel;
  const next = cost(node, lvl);
  const ten = Math.min(10, node.maxLevel - lvl);
  const afford = maxAffordable(node, lvl, coins);
  const hold = useRef<number | null>(null);
  const unit = node.currency === 'sparks' ? '✨' : '🪙';
  const refund = canRefund(node, st.levels);

  // Clic maintenu sur ×1 : achats en rafale, de plus en plus vite.
  const startHold = () => {
    let delay = 320;
    const tick = () => {
      if (game.buyNode(node.id, 1) === 0) return stopHold();
      delay = Math.max(70, delay * 0.8);
      hold.current = window.setTimeout(tick, delay);
    };
    tick();
  };
  const stopHold = () => {
    if (hold.current) window.clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(() => stopHold, [node.id]);

  return (
    <div class="tree-detail" style={{ '--c': BRANCHES[node.branch].color } as never}>
      <div class="td-title">
        <span class="td-icon">{node.icon}</span>
        <div>
          <strong>{node.name}</strong>
          <span class="td-branch">
            {BRANCHES[node.branch].icon} {BRANCHES[node.branch].name} · {node.kind === 'small' ? 'petit nœud' : node.kind === 'big' ? 'grand nœud' : 'jonction'}
          </span>
        </div>
      </div>
      <p class="td-flavor">« {node.flavor} »</p>
      <div class="td-levels">
        Niveau <b>{lvl}</b> / {node.maxLevel}
      </div>
      <div class="td-effect">
        {lvl > 0 && <div><span>Actuel</span> {node.effect(lvl)}</div>}
        {!maxed && <div class="next"><span>{lvl > 0 ? 'Prochain' : 'Effet'}</span> {node.effect(lvl + 1)}</div>}
      </div>
      {maxed ? (
        <div class="td-max">MAX 🌼</div>
      ) : !canTry ? (
        <div class="td-locked">🔒 {reasonText(av)}</div>
      ) : (
        <>
          {!av.ok && <div class="td-locked soft">🔄 {reasonText(av)}</div>}
          <div class="td-buy">
            <button class={`btn tree-btn ${next <= coins ? 'ok' : ''}`} onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold}>
              ×1 <small>{formatNumber(next)} {unit}</small>
            </button>
            {ten > 1 && (
              <button class={`btn tree-btn ${costForN(node, lvl, ten) <= coins ? 'ok' : ''}`} onClick={() => game.buyNode(node.id, ten)}>
                ×{ten} <small>{formatNumber(costForN(node, lvl, ten))} {unit}</small>
              </button>
            )}
            {node.maxLevel > 1 && (
              <button class={`btn tree-btn ${afford > 0 ? 'ok' : ''}`} onClick={() => game.buyNode(node.id, Infinity)}>
                Max <small>{afford > 0 ? `${afford} niv. · ${formatNumber(costForN(node, lvl, afford))} ${unit}` : '—'}</small>
              </button>
            )}
          </div>
          {next > coins && <div class="td-missing">Il manque {formatNumber(next - coins)} {unit}</div>}
        </>
      )}
      {lvl > 0 && (
        <div class="td-refund">
          <button class="btn tree-btn refund" disabled={!refund.ok} onClick={() => game.refundNode(node.id)}>
            ↩ Rembourser 1 niveau <small>{refund.ok ? `+${formatNumber(refund.amount)} ${unit}` : ''}</small>
          </button>
          {!refund.ok && refund.reason === 'needed' && <div class="td-refund-why">« {refund.detail} » en a besoin : rembourse-le d'abord.</div>}
        </div>
      )}
    </div>
  );
}
