import { h, options, type VNode } from 'preact';
import { ICON_RE, iconInner, iconSvg } from './iconArt';

/** Une icône dessinée à la main (à la place d'un emoji). */
export function Icon({ e, class: cls }: { e: string; class?: string }) {
  const svg = iconSvg(e);
  if (!svg) return <span class={cls}>{e}</span>;
  return <span class={`ico ${cls ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Une icône dans un dessin SVG (l'arbre) : centrée en (x, y), de taille `size`. */
export function SvgIcon({ e, x, y, size }: { e: string; x: number; y: number; size: number }) {
  const inner = iconInner(e);
  if (!inner) {
    return (
      <text x={x} y={y + size * 0.3} font-size={size * 0.8} text-anchor="middle">
        {e}
      </text>
    );
  }
  return <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 32 32" overflow="visible" dangerouslySetInnerHTML={{ __html: inner }} />;
}

const TEST = new RegExp(ICON_RE.source, 'u');

/** Découpe un texte : les emojis deviennent des icônes. */
export function withIcons(text: string): (string | VNode)[] | string {
  if (!TEST.test(text)) return text;
  const out: (string | VNode)[] = [];
  let last = 0;
  ICON_RE.lastIndex = 0;
  for (let m = ICON_RE.exec(text); m; m = ICON_RE.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(h(Icon, { e: m[1] }) as unknown as VNode);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Retire les emojis d'un texte (infobulles : on ne peut pas y mettre d'icône). */
export function stripIcons(text: string): string {
  return TEST.test(text) ? text.replace(ICON_RE, '').replace(/\s{2,}/g, ' ').trim() : text;
}

function transform(children: unknown): unknown {
  if (typeof children === 'string') return withIcons(children);
  if (Array.isArray(children)) {
    let changed = false;
    const out: unknown[] = [];
    for (const c of children) {
      const t = transform(c);
      if (t !== c) changed = true;
      if (Array.isArray(t) && typeof c === 'string') out.push(...t);
      else out.push(t);
    }
    return changed ? out : children;
  }
  return children;
}

/** Éléments dont le texte doit rester du texte (SVG, formulaires…). */
const SKIP = new Set(['text', 'tspan', 'title', 'textarea', 'option', 'style', 'script']);

/**
 * Partout dans l'interface, les emojis sont remplacés par les icônes dessinées à la main :
 * on transforme le texte de chaque élément juste avant qu'il soit affiché.
 */
export function installIcons(): void {
  const prev = options.vnode;
  options.vnode = (vnode) => {
    const t = vnode.type;
    if (typeof t === 'string' && !SKIP.has(t)) {
      const p = vnode.props as Record<string, unknown>;
      if (p.children !== undefined && !p.dangerouslySetInnerHTML) p.children = transform(p.children);
      if (typeof p.title === 'string') p.title = stripIcons(p.title);
      if (typeof p.placeholder === 'string') p.placeholder = stripIcons(p.placeholder);
    }
    prev?.(vnode);
  };
}
