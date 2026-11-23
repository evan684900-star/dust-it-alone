import { options, type VNode } from 'preact';
import { padActive, padKind, type PadButton, type PadKind } from '../input/gamepad';

/**
 * Quand on joue à la manette, les touches affichées à l'écran (<kbd>E</kbd>, <kbd>Échap</kbd>…)
 * deviennent les boutons de la manette : A / B / X / Y sur Xbox, ✕ / ○ / □ / △ sur PlayStation.
 */

/** Touche du clavier → bouton de la manette (mêmes actions). */
const KEY_TO_PAD: Record<string, PadButton | 'ls' | 'rs'> = {
  E: 'a',
  Espace: 'a',
  Entrée: 'a',
  Échap: 'b',
  R: 'b',
  T: 'x',
  B: 'y',
  M: 'up',
  J: 'down',
  K: 'left',
  P: 'right',
  O: 'view',
  'clic maintenu': 'rt',
  Maj: 'lt',
};

const LABELS: Record<PadKind, Record<string, string>> = {
  xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', up: '↑', down: '↓', left: '←', right: '→', menu: '☰', view: '⧉', l3: 'L3', r3: 'R3', ls: 'L', rs: 'R' },
  ps: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', up: '↑', down: '↓', left: '←', right: '→', menu: 'OPTIONS', view: 'CREATE', l3: 'L3', r3: 'R3', ls: 'L', rs: 'R' },
};

/** Un bouton de manette dessiné (couleur et forme selon la marque). */
export function PadGlyph({ b, kind }: { b: string; kind?: PadKind }) {
  const k = kind ?? padKind.value ?? 'xbox';
  return <kbd class={`pad-glyph ${k} pad-${b}`} data-pad-glyph="1">{LABELS[k][b] ?? b}</kbd>;
}

export function installPadGlyphs(): void {
  const prev = options.vnode;
  options.vnode = (vnode: VNode) => {
    if (vnode.type === 'kbd') {
      const p = vnode.props as Record<string, unknown>;
      // (Lire le signal ici fait redessiner le composant quand on passe du clavier à la manette.)
      if (!p['data-pad-glyph'] && padActive.value && typeof p.children === 'string') {
        const b = KEY_TO_PAD[p.children.trim()];
        if (b) {
          const k = padKind.value ?? 'xbox';
          p.children = LABELS[k][b] ?? p.children;
          p.class = `${(p.class as string) ?? ''} pad-glyph ${k} pad-${b}`;
        }
      }
    }
    prev?.(vnode);
  };
}
