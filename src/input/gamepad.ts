import { signal } from '@preact/signals';

/**
 * Manettes Xbox et PlayStation (et toute manette « standard ») via l'API Gamepad du navigateur.
 *
 * Chaque image, `pollGamepad()` lit la manette : les sticks et gâchettes sont lus en continu,
 * les appuis sur les boutons deviennent des événements envoyés au gestionnaire du dessus de la
 * pile (le jeu, puis par-dessus un menu ouvert, l'arbre…). Le stick gauche et la croix
 * produisent aussi des événements « nav-* » (avec répétition) pour se déplacer dans les menus.
 */

export type PadButton =
  | 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'view' | 'menu' | 'l3' | 'r3'
  | 'up' | 'down' | 'left' | 'right' | 'home';
export type PadEvent = PadButton | 'nav-up' | 'nav-down' | 'nav-left' | 'nav-right';

export interface PadState {
  /** Sticks (−1…1, zone morte retirée) et gâchettes (0…1). */
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
  held(b: PadButton): boolean;
}

export type PadKind = 'xbox' | 'ps';

/** La dernière entrée vient-elle de la manette (pour afficher ses boutons à l'écran) ? */
export const padKind = signal<PadKind | null>(null);
/** Le joueur utilise la manette en ce moment (dernière action). */
export const padActive = signal(false);

// Ordre des boutons de la disposition « standard » (W3C).
const ORDER: PadButton[] = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'menu', 'l3', 'r3', 'up', 'down', 'left', 'right', 'home'];

type Handler = (e: PadEvent, s: PadState) => boolean;
const handlers: Handler[] = [];

/** Ajoute un gestionnaire en haut de la pile (il reçoit les appuis en premier). Renvoie de quoi le retirer. */
export function pushPadHandler(h: Handler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.lastIndexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

const prev = new Map<PadButton, boolean>();
const navHeld = new Map<string, number>();
let lastIndex = -1;

function dead(v: number, z = 0.16): number {
  const a = Math.abs(v);
  if (a < z) return 0;
  return Math.sign(v) * ((a - z) / (1 - z));
}

/** Xbox, PlayStation, ou autre (on affiche alors les noms Xbox, les plus courants). */
export function kindOf(id: string): PadKind {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  if (/054c|dualsense|dualshock|playstation|ps5|ps4|wireless controller/.test(s)) return 'ps';
  return 'xbox';
}

function emit(e: PadEvent, s: PadState): void {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i](e, s)) return;
}

/** Fait vibrer la manette (si elle sait le faire). */
export function padRumble(strong: number, weak: number, ms: number): void {
  if (!padActive.value || lastIndex < 0) return;
  const gp = navigator.getGamepads?.()[lastIndex];
  const act = (gp as unknown as { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } } | null)?.vibrationActuator;
  act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => {});
}

/** Le dernier état lu (pour les écrans qui veulent les sticks en continu, comme l'arbre). */
export let lastPad: PadState | null = null;

/** À appeler une fois par image. Renvoie l'état de la manette (ou null s'il n'y en a pas). */
export function pollGamepad(dt: number): PadState | null {
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  let gp: Gamepad | null = null;
  // La manette dont on s'est servi en dernier, sinon la première branchée.
  if (lastIndex >= 0 && list[lastIndex]?.connected) gp = list[lastIndex];
  for (const g of list) {
    if (!g || !g.connected) continue;
    if (g.buttons.some((b) => b.pressed) || g.axes.some((a) => Math.abs(a) > 0.5)) {
      gp = g;
      break;
    }
  }
  if (!gp) {
    for (const g of list) if (g?.connected) gp = g;
    if (!gp) {
      lastPad = null;
      return null;
    }
  }
  lastIndex = gp.index;
  const btn = (i: number) => gp!.buttons[i];
  const value = (i: number) => btn(i)?.value ?? 0;
  const pressed = (i: number) => !!btn(i)?.pressed;
  const state: PadState = {
    lx: dead(gp.axes[0] ?? 0),
    ly: dead(gp.axes[1] ?? 0),
    rx: dead(gp.axes[2] ?? 0, 0.13),
    ry: dead(gp.axes[3] ?? 0, 0.13),
    lt: value(6),
    rt: value(7),
    held: (b) => pressed(ORDER.indexOf(b)),
  };
  lastPad = state;
  // La manette « prend la main » dès qu'on s'en sert.
  const used = gp.buttons.some((b) => b.pressed) || Math.hypot(state.lx, state.ly) > 0.3 || Math.hypot(state.rx, state.ry) > 0.3;
  if (used) {
    padActive.value = true;
    const k = kindOf(gp.id);
    if (padKind.value !== k) padKind.value = k;
  }

  for (let i = 0; i < ORDER.length; i++) {
    const b = ORDER[i];
    const now = b === 'lt' || b === 'rt' ? value(i) > 0.35 : pressed(i);
    if (now && !prev.get(b)) emit(b, state);
    prev.set(b, now);
  }
  // Directions de menu : croix ou stick gauche, avec répétition si on garde appuyé.
  const dirs: [string, boolean][] = [
    ['nav-up', pressed(12) || state.ly < -0.6],
    ['nav-down', pressed(13) || state.ly > 0.6],
    ['nav-left', pressed(14) || state.lx < -0.6],
    ['nav-right', pressed(15) || state.lx > 0.6],
  ];
  for (const [name, on] of dirs) {
    const t = navHeld.get(name);
    if (!on) {
      navHeld.delete(name);
      continue;
    }
    if (t === undefined) {
      navHeld.set(name, 0.38);
      emit(name as PadEvent, state);
    } else if (t - dt <= 0) {
      navHeld.set(name, 0.11);
      emit(name as PadEvent, state);
    } else navHeld.set(name, t - dt);
  }
  return state;
}

/** Le clavier ou la souris reprennent la main : on réaffiche les touches du clavier. */
export function watchKeyboardMouse(): void {
  const off = () => {
    if (padActive.value) padActive.value = false;
  };
  window.addEventListener('keydown', (e) => {
    if (e.isTrusted) off();
  }, true);
  window.addEventListener('mousedown', (e) => {
    if (e.isTrusted) off();
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (e.isTrusted && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) off();
  });
}

// ───────────────────────────── Navigation dans les menus ─────────────────────────────

const FOCUSABLE = 'button:not(:disabled), a[href], input:not([type=hidden]):not(:disabled), select, [data-pad]';

/** Éléments qu'on peut atteindre à la manette : visibles, et pas cachés derrière un autre panneau. */
export function focusables(root: ParentNode = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    if (top && (top === el || el.contains(top) || top.contains(el))) out.push(el);
  }
  return out;
}

let current: HTMLElement | null = null;

export function padFocus(el: HTMLElement | null): void {
  if (current && current !== el) current.classList.remove('pad-focus');
  current = el;
  if (!el) return;
  el.classList.add('pad-focus');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** L'élément choisi à la manette (s'il est encore à l'écran). */
export function focused(list: HTMLElement[]): HTMLElement | null {
  if (current && list.includes(current)) return current;
  return null;
}

/** Va vers l'élément le plus proche dans une direction. */
export function moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
  const list = focusables();
  if (!list.length) return;
  const cur = focused(list);
  if (!cur) {
    padFocus(list[0]);
    return;
  }
  // Curseur dans une barre de réglage : gauche / droite changent sa valeur.
  if (cur instanceof HTMLInputElement && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    const step = Number(cur.step) || (Number(cur.max) - Number(cur.min)) / 20 || 1;
    cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + (dir === 'right' ? step : -step))));
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    cur.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (main <= 4) continue;
    const score = main + side * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) padFocus(best);
}

/** Bouton A dans un menu : on « clique » sur l'élément choisi. */
export function activateFocus(): boolean {
  const list = focusables();
  const cur = focused(list);
  if (!cur) {
    if (list[0]) padFocus(list[0]);
    return true;
  }
  if (cur instanceof HTMLInputElement && (cur.type === 'checkbox' || cur.type === 'radio')) cur.click();
  else if (cur instanceof HTMLInputElement || cur instanceof HTMLSelectElement) cur.focus();
  else cur.click();
  return true;
}
