import { PAL } from './palette';

/** Petit tremblement « fait main » pour les lignes. */
function wobble(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, amp: number) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const steps = Math.max(2, Math.floor(len / 40));
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  g.moveTo(x0, y0);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const j = s === steps ? 0 : (Math.random() * 2 - 1) * amp;
    g.lineTo(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g };
}

/**
 * Planches de bois cartoon (sol, murs, toit).
 * `width`/`height` en unités du monde (cm), `px` = pixels par unité.
 */
export function drawPlanks(
  width: number,
  height: number,
  opts: { px?: number; plank?: number; woods?: string[]; grain?: string; ink?: string; vertical?: boolean; nails?: boolean } = {},
): HTMLCanvasElement {
  const px = opts.px ?? 1.5;
  const { c, g } = canvas(Math.round(width * px), Math.round(height * px));
  g.scale(px, px);
  const plankH = opts.plank ?? 75;
  const woods = opts.woods ?? [PAL.woodA, PAL.woodB, PAL.woodC];
  const grain = opts.grain ?? 'rgba(138,74,34,0.35)';
  const ink = opts.ink ?? PAL.inkCss;
  if (opts.vertical) {
    // On dessine à l'horizontale dans un repère tourné.
    g.translate(width, 0);
    g.rotate(Math.PI / 2);
    [width, height] = [height, width];
  }
  for (let row = 0, y = 0; y < height; row++, y += plankH) {
    let x = row % 2 === 0 ? -120 : -40 - ((row * 37) % 160);
    while (x < width) {
      const w = 260 + ((((row * 131 + x * 7) % 220) + 220) % 220);
      g.fillStyle = woods[(((row * 3 + Math.floor(x / 97)) % woods.length) + woods.length) % woods.length];
      g.fillRect(x, y, w, plankH);
      g.strokeStyle = grain;
      g.lineWidth = 2.5;
      for (let v = 0; v < 3; v++) {
        const vy = y + plankH * (0.22 + v * 0.27) + Math.random() * 6;
        g.beginPath();
        g.moveTo(x + 20, vy);
        g.bezierCurveTo(x + w * 0.3, vy - 6, x + w * 0.6, vy + 6, x + w - 20, vy);
        g.stroke();
      }
      if (Math.random() < 0.35) {
        g.fillStyle = grain;
        g.beginPath();
        g.ellipse(x + 40 + Math.random() * (w - 80), y + plankH * (0.3 + Math.random() * 0.4), 11, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (opts.nails !== false) {
        g.fillStyle = ink;
        for (const nx of [x + 14, x + w - 14]) {
          g.beginPath();
          g.arc(nx, y + plankH / 2, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.beginPath();
      wobble(g, x, y, x, y + plankH, 1.5);
      g.stroke();
      x += w;
    }
    g.strokeStyle = ink;
    g.lineWidth = 4;
    g.beginPath();
    wobble(g, 0, y, width, y, 2);
    g.stroke();
  }
  return c;
}

/** Texture ronde et douce (grains de lumière). */
export function softDot(): HTMLCanvasElement {
  const { c, g } = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,248,220,1)');
  grad.addColorStop(1, 'rgba(255,248,220,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Ombre de contact (dégradé sombre) sous les objets. */
export function blobShadow(): HTMLCanvasElement {
  const { c, g } = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  grad.addColorStop(0, 'rgba(43,26,46,0.55)');
  grad.addColorStop(1, 'rgba(43,26,46,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

/** Carton : couleur kraft + scotch + petit dessin. */
export function cardboard(label: string): HTMLCanvasElement {
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#d9a35b';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(138,74,34,0.25)';
  for (let k = 0; k < 18; k++) g.fillRect(0, k * 14 + 4, 256, 3);
  g.fillStyle = '#f2d9a0';
  g.fillRect(108, 0, 40, 256);
  g.strokeStyle = PAL.inkCss;
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 246);
  g.fillStyle = PAL.inkCss;
  g.font = '44px "Lilita One", sans-serif';
  g.textAlign = 'center';
  g.save();
  g.translate(128, 170);
  g.rotate(-0.12);
  g.fillText(label, 0, 0);
  g.restore();
  return c;
}

/** Petit générateur pseudo-aléatoire déterministe (textures identiques à chaque partie). */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Mur en blocs de pierre (taille du canevas en pixels). */
export function drawStoneWall(pxW: number, pxH: number, opts: { tones?: string[]; mortar?: string; block?: number; seed?: number } = {}): HTMLCanvasElement {
  const { c, g } = canvas(pxW, pxH);
  const rnd = seeded(opts.seed ?? 3);
  const tones = opts.tones ?? ['#a99a8a', '#9b8c7c', '#b5a796', '#8f8172', '#a39383'];
  const bh = opts.block ?? 64;
  g.fillStyle = opts.mortar ?? '#5d5148';
  g.fillRect(0, 0, pxW, pxH);
  for (let row = 0, y = 0; y < pxH; row++, y += bh) {
    let x = row % 2 ? -bh * 0.8 : 0;
    while (x < pxW) {
      const w = bh * (1.4 + rnd() * 1.2);
      g.fillStyle = tones[Math.floor(rnd() * tones.length)];
      const r = 6;
      g.beginPath();
      g.roundRect(x + 3, y + 3, w - 6, bh - 6, r);
      g.fill();
      // Relief : haut clair, bas sombre.
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + 6, y + 5, w - 12, 5);
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.fillRect(x + 6, y + bh - 10, w - 12, 5);
      // Petites taches et fissures.
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
        g.beginPath();
        g.arc(x + rnd() * w, y + rnd() * bh, 2 + rnd() * 5, 0, Math.PI * 2);
        g.fill();
      }
      x += w;
    }
  }
  return c;
}

/** Dalles de pierre au sol. */
export function drawFlagstones(pxW: number, pxH: number, seed = 5): HTMLCanvasElement {
  const { c, g } = canvas(pxW, pxH);
  const rnd = seeded(seed);
  g.fillStyle = '#4a4038';
  g.fillRect(0, 0, pxW, pxH);
  const tile = 96;
  for (let y = 0; y < pxH; y += tile) {
    for (let x = 0; x < pxW; x += tile) {
      const v = 150 + Math.floor(rnd() * 40);
      g.fillStyle = `rgb(${v},${v - 12},${v - 26})`;
      g.beginPath();
      g.roundRect(x + 3, y + 3, tile - 6, tile - 6, 8);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath();
      g.arc(x + rnd() * tile, y + rnd() * tile, 6 + rnd() * 14, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Tapis à motifs (bordure + losanges). */
export function drawCarpet(pxW: number, pxH: number, main: string, border: string, accent: string): HTMLCanvasElement {
  const { c, g } = canvas(pxW, pxH);
  g.fillStyle = border;
  g.fillRect(0, 0, pxW, pxH);
  const b = Math.min(pxW, pxH) * 0.08;
  g.fillStyle = main;
  g.fillRect(b, b, pxW - 2 * b, pxH - 2 * b);
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(b * 0.5, b * 0.5, pxW - b, pxH - b);
  g.fillStyle = accent;
  const step = Math.min(pxW, pxH) * 0.22;
  for (let y = b + step / 2; y < pxH - b; y += step) {
    for (let x = b + step / 2; x < pxW - b; x += step) {
      g.beginPath();
      g.moveTo(x, y - step * 0.25);
      g.lineTo(x + step * 0.18, y);
      g.lineTo(x, y + step * 0.25);
      g.lineTo(x - step * 0.18, y);
      g.closePath();
      g.globalAlpha = 0.55;
      g.fill();
      g.globalAlpha = 1;
    }
  }
  return c;
}

/** Portrait d'ancêtre (personnage stylisé), différent selon la graine. */
export function drawPortrait(seed: number): HTMLCanvasElement {
  const { c, g } = canvas(192, 256);
  const rnd = seeded(seed * 7 + 1);
  const bgs = ['#3c5a46', '#5a3c4a', '#3c4a6a', '#6a5a3c', '#4a3c6a'];
  const grad = g.createRadialGradient(96, 110, 10, 96, 128, 170);
  grad.addColorStop(0, bgs[seed % bgs.length]);
  grad.addColorStop(1, '#1a1210');
  g.fillStyle = grad;
  g.fillRect(0, 0, 192, 256);
  const clothes = ['#8a2a2a', '#2a4a8a', '#2a6a4a', '#6a2a6a', '#8a6a2a'];
  // Buste.
  g.fillStyle = clothes[Math.floor(rnd() * clothes.length)];
  g.beginPath();
  g.ellipse(96, 250, 80, 70, 0, Math.PI, 0);
  g.fill();
  // Fraise / col.
  g.fillStyle = '#f2ead8';
  g.beginPath();
  g.ellipse(96, 182, 34, 12, 0, 0, Math.PI * 2);
  g.fill();
  // Tête.
  const skin = ['#f0c8a0', '#d9a77c', '#b07850', '#f5d5b8'][Math.floor(rnd() * 4)];
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(96, 130, 34, 44, 0, 0, Math.PI * 2);
  g.fill();
  // Cheveux / perruque / couronne.
  const hair = ['#2a1a10', '#6a4a2a', '#d8d0c0', '#a05a20'][Math.floor(rnd() * 4)];
  g.fillStyle = hair;
  g.beginPath();
  g.ellipse(96, 104, 38, 26, 0, Math.PI, 0);
  g.fill();
  if (rnd() < 0.5) {
    g.fillRect(58, 104, 12, 50);
    g.fillRect(122, 104, 12, 50);
  }
  if (rnd() < 0.4) {
    g.fillStyle = '#e8b830';
    g.beginPath();
    g.moveTo(66, 82); g.lineTo(74, 60); g.lineTo(86, 76); g.lineTo(96, 54); g.lineTo(106, 76); g.lineTo(118, 60); g.lineTo(126, 82);
    g.closePath();
    g.fill();
  }
  // Yeux (qui « suivent du regard »…) et sourire en coin.
  g.fillStyle = '#1a1210';
  for (const ex of [82, 110]) {
    g.beginPath();
    g.arc(ex, 128, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#7a3a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(98, 150, 10, 0.2, Math.PI - 0.6);
  g.stroke();
  // Vernis craquelé.
  g.fillStyle = 'rgba(255,230,180,0.06)';
  g.fillRect(0, 0, 192, 256);
  return c;
}
