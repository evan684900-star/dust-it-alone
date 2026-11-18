import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game';
import { BRANCHES, NODE_BY_ID, TREE_NODES, type TreeNode } from '../data/tree';
import { ROOMS } from '../data/rooms';
import { availability, cost, costForN, maxAffordable, revealed, level as lvlOf, type Availability } from '../economy/tree';
import { formatNumber } from '../core/format';
import { sfx } from '../audio/synth';
import * as store from '../state/store';

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

export function SkillTree({ game }: { game: Game }) {
  const levels = store.treeLevels.value;
  const coins = store.coins.value;
  const unlocked = store.unlockedRooms.value;
  const st = { levels, roomUnlocked: (id: string) => unlocked.includes(id) };
  const [selected, setSelected] = useState<string>('broom-wide-1');
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0.6 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Molette : zoom autour du curseur.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.max(0.25, Math.min(2.2, v.k * (e.deltaY > 0 ? 0.9 : 1.1))) }));
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
  const visible = new Set(
    TREE_NODES.filter((n) => {
      if ((levels[n.id] ?? 0) > 0) return true;
      const av = availability(n, st);
      return av.ok || (!av.ok && av.reason === 'fork');
    }).map((n) => n.id),
  );
  const hiddenCount = TREE_NODES.length - visible.size;
  const focusId = [hovered, selected].find((id) => id && visible.has(id)) ?? [...visible][0] ?? 'broom-wide-1';
  const focus = NODE_BY_ID.get(focusId)!;
  const rootActive = TREE_NODES.some((n) => (levels[n.id] ?? 0) > 0);

  return (
    <div class="tree-screen">
      <div class="tree-header">
        <h2>🌳 L'Arbre des Souvenirs</h2>
        <div class="tree-coins">🪙 {formatNumber(coins)} <small>+{formatNumber(store.coinsPerSecond.value)}/s</small></div>
        <button class="btn tree-close" onClick={() => game.toggleTree()}>Fermer (B)</button>
      </div>

      <svg
        ref={svgRef}
        class="tree-svg"
        viewBox="-760 -640 1520 1280"
        onPointerDown={(e) => {
          // Pas de capture de la souris ici : sinon le clic n'arriverait jamais jusqu'au nœud.
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const sc = 1520 / (svgRef.current?.clientWidth || 1520) / view.k;
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
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <circle r={1500} fill="url(#tree-glow)" />
          {/* Anneaux de profondeur : plus on s'éloigne de Plume, plus c'est cher */}
          {[2, 4, 6, 8].map((d) => <circle key={d} r={d * RING} class="tree-ring" />)}
          {/* Étiquettes des branches */}
          {(Object.keys(BRANCHES) as (keyof typeof BRANCHES)[]).filter((b) => TREE_NODES.some((n) => n.branch === b && visible.has(n.id))).map((b) => {
            const a = (BRANCHES[b].angle * Math.PI) / 180;
            const r = b === 'helpers' ? 330 : 1480;
            const ang = a;
            return (
              <text key={b} class="tree-branch-label" x={Math.sin(ang) * r} y={-Math.cos(ang) * r} fill={BRANCHES[b].color}>
                {BRANCHES[b].icon} {BRANCHES[b].name}
              </text>
            );
          })}

          {/* Liens (la « sève » coule le long des chemins achetés) */}
          {TREE_NODES.filter((n) => visible.has(n.id)).map((n) => {
            const p = POS.get(n.id)!;
            const parents = (n.parents.length ? n.parents : ['__root']).filter((pid) => pid === '__root' || visible.has(pid));
            const lvl = levels[n.id] ?? 0;
            const av = availability(n, st);
            return parents.map((pid) => {
              const q = pid === '__root' ? { x: 0, y: 0 } : POS.get(pid)!;
              const cls = lvl > 0 ? 'lit' : av.ok ? 'open' : 'dim';
              return <line key={n.id + pid} class={`tree-link ${cls} ${n.kind === 'junction' ? 'junction' : ''}`} x1={q.x} y1={q.y} x2={p.x} y2={p.y} style={{ stroke: lvl > 0 ? BRANCHES[n.branch].color : undefined }} />;
            });
          })}

          {/* Racine : Plume */}
          <g class={`tree-root ${rootActive ? 'active' : ''}`}>
            <circle r={58} />
            <text class="tree-root-icon" y={6}>🌳</text>
            <text class="tree-root-name" y={34}>Plume</text>
          </g>

          {/* Nœuds (les nouveaux arrivent en « poussant ») */}
          {TREE_NODES.filter((n) => visible.has(n.id)).map((n) => {
            const p = POS.get(n.id)!;
            const lvl = levels[n.id] ?? 0;
            const av = availability(n, st);
            const state = stateOf(n, av, lvl, coins, revealed(n, st));
            const color = BRANCHES[n.branch].color;
            const R = n.kind === 'big' ? 34 : n.kind === 'junction' ? 26 : 28;
            const isSel = n.id === selected;
            return (
              <g
                key={n.id}
                class={`tree-node ${state} ${n.kind} ${isSel ? 'selected' : ''}`}
                transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                onPointerEnter={() => {
                  setHovered(n.id);
                  sfx.hover();
                }}
                onPointerLeave={() => setHovered(null)}
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
                <text class="tree-icon" y={9}>{state === 'hidden' ? '?' : n.icon}</text>
                {state === 'maxed' && <text class="tree-flower" x={R * 0.7} y={-R * 0.7}>🌼</text>}
                {n.requires && 'soon' in n.requires && <text class="tree-soon" y={R + 26}>bientôt</text>}
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <TreeDetail game={game} node={focus} st={st} coins={coins} />

      <div class="tree-legend">
        <span><b class="lg-small" /> petit nœud (plusieurs niveaux)</span>
        <span><b class="lg-big" /> grand nœud (déblocage)</span>
        <span><b class="lg-junction" /> jonction entre deux branches</span>
        <span>🌱 {hiddenCount} souvenirs encore cachés : ils poussent quand tu achètes ce qui les précède</span>
        <span>Clic : choisir · re-clic : acheter · glisser : se déplacer · molette : zoom · Espace : recentrer</span>
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
              ×1 <small>{formatNumber(next)} 🪙</small>
            </button>
            {ten > 1 && (
              <button class={`btn tree-btn ${costForN(node, lvl, ten) <= coins ? 'ok' : ''}`} onClick={() => game.buyNode(node.id, ten)}>
                ×{ten} <small>{formatNumber(costForN(node, lvl, ten))} 🪙</small>
              </button>
            )}
            {node.maxLevel > 1 && (
              <button class={`btn tree-btn ${afford > 0 ? 'ok' : ''}`} onClick={() => game.buyNode(node.id, Infinity)}>
                Max <small>{afford > 0 ? `${afford} niv. · ${formatNumber(costForN(node, lvl, afford))} 🪙` : '—'}</small>
              </button>
            )}
          </div>
          {next > coins && <div class="td-missing">Il manque {formatNumber(next - coins)} 🪙</div>}
        </>
      )}
    </div>
  );
}
